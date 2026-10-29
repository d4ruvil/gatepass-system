// Confirms a pending AdminMultiSig proposal (e.g. one created by
// scripts/proposeAdminAction.js). Once enough distinct owners have confirmed,
// the proposed call executes automatically in this same transaction.
//
// Usage: PROPOSAL_ID=0 npx hardhat run scripts/confirmAdminAction.js --network amoy

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
  const { multisig: multisigAddress } = loadDeployment();
  if (!multisigAddress) throw new Error("This deployment has no AdminMultiSig.");

  const proposalId = process.env.PROPOSAL_ID;
  if (proposalId === undefined) throw new Error("Set PROPOSAL_ID env var.");

  const [owner] = await hre.ethers.getSigners();
  const multisig = await hre.ethers.getContractAt("AdminMultiSig", multisigAddress, owner);

  const before = await multisig.getProposal(proposalId);
  if (before.executed) {
    console.log(`Proposal #${proposalId} already executed.`);
    return;
  }

  const tx = await multisig.confirm(proposalId);
  const receipt = await tx.wait();
  const executed = receipt.logs.some((log) => {
    try {
      return multisig.interface.parseLog(log)?.name === "ProposalExecuted";
    } catch {
      return false;
    }
  });

  const after = await multisig.getProposal(proposalId);
  console.log(`Confirmed proposal #${proposalId} (tx: ${tx.hash}). Confirmations: ${after.confirmations}/${await multisig.required()}.`);
  console.log(executed ? "Threshold reached — proposed call executed." : "Still waiting on more confirmations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
