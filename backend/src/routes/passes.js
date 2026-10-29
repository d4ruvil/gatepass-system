const express = require("express");
const { z } = require("zod");
const QRCode = require("qrcode");
const PassRequest = require("../models/PassRequest");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getWriteContract, getReadContract, getProvider } = require("../blockchain/contract");
const { computeDataHash } = require("../blockchain/hash");

const router = express.Router();

const MAX_VALIDITY_DAYS = 15;

const submitSchema = z.object({
  studentName: z.string().min(1),
  enrollmentNo: z.string().min(1),
  programme: z.string().min(1),
  discipline: z.string().min(1),
  semester: z.string().min(1),
  studentMobile: z.string().min(5),
  parentMobile: z.string().min(5),
  purpose: z.string().min(1),
  declarationAccepted: z.literal(true),
  signatureData: z.string().min(1),
  validFrom: z.string(), // ISO date
  validTo: z.string(),
  timeFromMinutes: z.number().int().min(0).max(1439),
  timeToMinutes: z.number().int().min(0).max(1439),
});

// Student submits a new request. The backend (BACKEND_ROLE relayer) pays gas
// and calls submitPass on their behalf — students never touch a wallet.
router.post("/", requireAuth, requireRole("student"), async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;

  const validFrom = new Date(data.validFrom);
  const validTo = new Date(data.validTo);
  const now = new Date();

  if (validFrom < now) return res.status(400).json({ error: "Date From cannot be in the past" });
  if (validTo <= validFrom) return res.status(400).json({ error: "Date To must be after Date From" });
  const days = (validTo - validFrom) / (1000 * 60 * 60 * 24);
  if (days > MAX_VALIDITY_DAYS) return res.status(400).json({ error: `Stay cannot exceed ${MAX_VALIDITY_DAYS} days` });
  if (data.timeFromMinutes >= data.timeToMinutes) {
    return res.status(400).json({ error: "Timing From must be earlier than Timing To" });
  }

  const validFromUnix = Math.floor(validFrom.getTime() / 1000);
  const validToUnix = Math.floor(validTo.getTime() / 1000);
  const dataHash = computeDataHash({
    studentName: data.studentName,
    enrollmentNo: data.enrollmentNo,
    validFromUnix,
    validToUnix,
  });

  const pass = await PassRequest.create({
    student: req.user.id,
    ...data,
    declarationAcceptedAt: new Date(),
    validFrom,
    validTo,
    dataHash,
    cachedStatus: "pending",
  });

  try {
    const contract = getWriteContract();
    const tx = await contract.submitPass(dataHash, validFromUnix, validToUnix, data.timeFromMinutes, data.timeToMinutes);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "PassSubmitted");

    pass.onChainId = Number(event.args.passId);
    pass.submitTxHash = tx.hash;
    await pass.save();
  } catch (err) {
    await PassRequest.findByIdAndDelete(pass._id);
    return res.status(502).json({ error: `Blockchain submission failed: ${err.message}` });
  }

  res.status(201).json({ pass });
});

router.get("/student/:studentId", requireAuth, async (req, res) => {
  if (req.user.role !== "admin" && req.user.id !== req.params.studentId) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const passes = await PassRequest.find({ student: req.params.studentId }).sort({ createdAt: -1 });
  res.json({ passes });
});

const QUEUE_STATUS_BY_ROLE = {
  coordinator: "pending",
  lab_incharge: "coordinator_approved",
  dean: "lab_approved",
};

router.get("/pending/:role", requireAuth, async (req, res) => {
  const status = QUEUE_STATUS_BY_ROLE[req.params.role];
  if (!status) return res.status(400).json({ error: "Unknown approver role" });
  if (req.user.role !== req.params.role && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }

  const passes = await PassRequest.find({ cachedStatus: status }).populate("student", "name enrollmentNo").sort({
    createdAt: 1,
  });
  res.json({ passes });
});

router.get("/:id", requireAuth, async (req, res) => {
  const pass = await PassRequest.findById(req.params.id).populate("student", "name enrollmentNo email");
  if (!pass) return res.status(404).json({ error: "Pass not found" });
  res.json({ pass });
});

// QR encodes a link to the guard page carrying just the on-chain pass id — nothing
// personally identifiable. Opening it verifies via GET /api/verify/:passId (live chain read).
router.get("/:id/qrcode", requireAuth, async (req, res) => {
  const pass = await PassRequest.findById(req.params.id);
  if (!pass) return res.status(404).json({ error: "Pass not found" });
  if (!pass.onChainId) return res.status(409).json({ error: "Pass has not been submitted on-chain yet" });

  const dataUrl = await QRCode.toDataURL(
    `${process.env.FRONTEND_URL || req.get("origin") || "http://localhost:5174"}/guard?pass=${pass.onChainId}`,
    { width: 320, margin: 2 }
  );
  res.json({ qrCodeDataUrl: dataUrl, onChainId: pass.onChainId });
});

// The frontend has the approver sign approveAsX/rejectPass/revokePass directly
// with MetaMask. These endpoints just wait for that transaction to confirm and
// update the cache immediately, instead of waiting on the event listener's
// own polling cadence — the on-chain event listener (src/blockchain/eventSync.js)
// is still the authoritative fallback if this confirmation step is ever skipped.
async function confirmAndSync(req, res, expectedEventName, statusByEvent) {
  const { txHash } = req.body;
  if (!txHash) return res.status(400).json({ error: "txHash is required" });

  const provider = getProvider();
  const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
  if (!receipt || receipt.status !== 1) return res.status(400).json({ error: "Transaction failed or not found" });

  const contract = getReadContract();
  const event = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === expectedEventName);

  if (!event) return res.status(400).json({ error: `Transaction did not emit ${expectedEventName}` });

  const pass = await PassRequest.findOneAndUpdate(
    { onChainId: Number(event.args.passId) },
    statusByEvent(event),
    { new: true }
  );
  res.json({ pass });
}

router.post("/:id/approve", requireAuth, requireRole("coordinator", "lab_incharge", "dean"), async (req, res) => {
  const eventByRole = {
    coordinator: ["PassApprovedByCoordinator", () => ({ cachedStatus: "coordinator_approved" })],
    lab_incharge: ["PassApprovedByLabIncharge", () => ({ cachedStatus: "lab_approved" })],
    dean: ["PassApprovedByDean", () => ({ cachedStatus: "approved" })],
  };
  const [eventName, statusFn] = eventByRole[req.user.role];
  await confirmAndSync(req, res, eventName, statusFn);
});

router.post("/:id/reject", requireAuth, requireRole("coordinator", "lab_incharge", "dean"), async (req, res) => {
  await confirmAndSync(req, res, "PassRejected", (event) => ({
    cachedStatus: "rejected",
    rejectReason: event.args.reason,
  }));
});

router.post("/:id/revoke", requireAuth, requireRole("dean", "admin"), async (req, res) => {
  await confirmAndSync(req, res, "PassRevoked", () => ({ cachedStatus: "revoked" }));
});

module.exports = router;
