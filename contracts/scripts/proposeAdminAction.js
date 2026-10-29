// Proposes a grantRole/revokeRole call on GatePass through the AdminMultiSig
// that owns ADMIN_ROLE. The proposer's confirmation is cast automatically;
// other owners then run scripts/confirmAdminAction.js until the threshold is
// met, at which point the call executes.
//
// Usage: ROLE=COORDINATOR_ROLE TARGET=0xabc... ACTION=grant npx hardhat run scripts/proposeAdminAction.js --network amoy
// ROLE is one of COORDINATOR_ROLE, LAB_INCHARGE_ROLE, DEAN_ROLE, BACKEND_ROLE, ADMIN_ROLE.
// ACTION is "grant" or "revoke" (default: grant).
// Signer running this must be one of the multisig's owners.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment() {
  const deploymentFile = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployments/${hre.network.name}.json found. Run scripts/deploy.js first.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

async function main() {
  const { address: gatePassAddress, multisig: multisigAddress } = loadDeployment();
  if (!multisigAddress) {
    throw new Error("This deployment has no AdminMultiSig — grantRoles.js already works directly, use that instead.");
  }

  const role = process.env.ROLE;
  const target = process.env.TARGET;
  const action = (process.env.ACTION || "grant").toLowerCase();
  if (!role || !target) throw new Error("Set ROLE and TARGET env vars.");
  if (!["grant", "revoke"].includes(action)) throw new Error('ACTION must be "grant" or "revoke".');

  const [proposer] = await hre.ethers.getSigners();
  const gatePass = await hre.ethers.getContractAt("GatePass", gatePassAddress);
  const multisig = await hre.ethers.getContractAt("AdminMultiSig", multisigAddress, proposer);

  const roleHash = await gatePass[role]();
  const functionName = action === "grant" ? "grantRole" : "revokeRole";
  const data = gatePass.interface.encodeFunctionData(functionName, [roleHash, target]);

  const tx = await multisig.propose(gatePassAddress, data);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return multisig.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "ProposalCreated");

  const required = await multisig.required();
  console.log(`Proposed "${functionName}(${role}, ${target})" as proposal #${event.args.id} (tx: ${tx.hash})`);
  console.log(`Your confirmation was counted automatically. Needs ${required} total confirmations to execute.`);
  console.log(
    `Other owners: PROPOSAL_ID=${event.args.id} npx hardhat run scripts/confirmAdminAction.js --network ${hre.network.name}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
