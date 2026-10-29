// Grants COORDINATOR_ROLE / LAB_INCHARGE_ROLE / DEAN_ROLE / BACKEND_ROLE to the
// wallet addresses configured in .env. Run this once after deploy.js, using
// the same admin account that deployed the contract.
//
// Only works when GatePass's admin is a plain EOA (i.e. deploy.js ran without
// ADMIN_SIGNERS). If deploy.js deployed an AdminMultiSig, use
// scripts/proposeAdminAction.js + scripts/confirmAdminAction.js instead.
//
// Required env vars: CONTRACT_ADDRESS (or deployments/<network>.json is used),
// COORDINATOR_ADDRESS, LAB_INCHARGE_ADDRESS, DEAN_ADDRESS, BACKEND_RELAYER_ADDRESS.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment() {
  if (process.env.CONTRACT_ADDRESS) return { address: process.env.CONTRACT_ADDRESS, multisig: null };

  const deploymentFile = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (fs.existsSync(deploymentFile)) {
    return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  }

  throw new Error("No CONTRACT_ADDRESS set and no deployments/<network>.json found. Run scripts/deploy.js first.");
}

async function main() {
  const { address, multisig } = loadDeployment();
  if (multisig) {
    throw new Error(
      `GatePass's admin is AdminMultiSig (${multisig}), not a plain EOA — this script can't grant roles directly. ` +
        "Use scripts/proposeAdminAction.js and scripts/confirmAdminAction.js instead."
    );
  }
  const [admin] = await hre.ethers.getSigners();
  const gatePass = await hre.ethers.getContractAt("GatePass", address, admin);

  const roleAssignments = [
    { envVar: "COORDINATOR_ADDRESS", role: "COORDINATOR_ROLE" },
    { envVar: "LAB_INCHARGE_ADDRESS", role: "LAB_INCHARGE_ROLE" },
    { envVar: "DEAN_ADDRESS", role: "DEAN_ROLE" },
    { envVar: "BACKEND_RELAYER_ADDRESS", role: "BACKEND_ROLE" },
  ];

  for (const { envVar, role } of roleAssignments) {
    const target = process.env[envVar];
    if (!target) {
      console.log(`Skipping ${role}: ${envVar} not set in .env`);
      continue;
    }

    const roleHash = await gatePass[role]();
    const alreadyHas = await gatePass.hasRole(roleHash, target);
    if (alreadyHas) {
      console.log(`${target} already has ${role}`);
      continue;
    }

    const tx = await gatePass.grantRole(roleHash, target);
    await tx.wait();
    console.log(`Granted ${role} to ${target} (tx: ${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
