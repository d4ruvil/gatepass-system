const express = require("express");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const PassRequest = require("../models/PassRequest");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getReadContract } = require("../blockchain/contract");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// Reads contracts/deployments/<network>.json (NETWORK_NAME env var, default "amoy")
// to find the block the contract was deployed at, so audit queries don't need
// to scan from genesis. Returns null if the file isn't found — callers fall
// back to scanning from block 0 (slower, but still correct thanks to chunking).
function loadDeployment() {
  const network = process.env.NETWORK_NAME || "amoy";
  const deploymentFile = path.join(__dirname, "..", "..", "..", "contracts", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  } catch {
    return null;
  }
}

router.get("/users", async (req, res) => {
  const users = await User.find().select("-passwordHash").sort({ createdAt: -1 });
  res.json({ users });
});

// Updates the app's own record of a user's role (for routing/display). This
// does NOT grant the on-chain role — that requires the AdminMultiSig owners
// to propose + confirm via contracts/scripts/proposeAdminAction.js, since no
// single admin (not even this one) can grant on-chain roles alone.
router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!User.ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

router.get("/passes", async (req, res) => {
  const { status, from, to, q } = req.query;
  const filter = {};
  if (status) filter.cachedStatus = status;
  if (from || to) {
    filter.validFrom = {};
    if (from) filter.validFrom.$gte = new Date(from);
    if (to) filter.validFrom.$lte = new Date(to);
  }
  if (q) {
    filter.$or = [
      { studentName: new RegExp(q, "i") },
      { enrollmentNo: new RegExp(q, "i") },
    ];
  }

  const passes = await PassRequest.find(filter).populate("student", "name email").sort({ createdAt: -1 });
  res.json({ passes });
});

const MAX_BLOCK_RANGE = 10_000; // public RPC nodes commonly cap eth_getLogs to this

// Queries a filter across [fromBlock, toBlock] in chunks, since many free RPC
// providers reject eth_getLogs requests spanning more than ~10k blocks.
async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
  const results = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, toBlock);
    const logs = await contract.queryFilter(filter, start, end);
    results.push(...logs);
  }
  return results;
}

// Pulls the full on-chain event history for one pass — the audit trail.
router.get("/audit/:onChainId", async (req, res) => {
  const onChainId = Number(req.params.onChainId);
  const contract = getReadContract();

  const deployment = loadDeployment();
  const fromBlock = deployment?.deployedAtBlock || 0;
  const toBlock = await contract.runner.provider.getBlockNumber();

  const eventNames = [
    "PassSubmitted",
    "PassApprovedByCoordinator",
    "PassApprovedByLabIncharge",
    "PassApprovedByDean",
    "PassRejected",
    "PassRevoked",
  ];

  const allEvents = [];
  for (const name of eventNames) {
    const filter = contract.filters[name](onChainId);
    const logs = await queryFilterChunked(contract, filter, fromBlock, toBlock);
    for (const log of logs) {
      const block = await log.getBlock();
      const rawArgs = Object.entries(log.args.toObject ? log.args.toObject() : log.args).filter(([k]) =>
        Number.isNaN(Number(k))
      );
      allEvents.push({
        event: name,
        args: Object.fromEntries(rawArgs.map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
        txHash: log.transactionHash,
        blockTimestamp: new Date(block.timestamp * 1000),
      });
    }
  }

  allEvents.sort((a, b) => a.blockTimestamp - b.blockTimestamp);
  res.json({ onChainId, events: allEvents });
});

module.exports = router;
