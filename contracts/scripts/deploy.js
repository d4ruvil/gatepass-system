const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // ADMIN_SIGNERS=0xabc...,0xdef...,0x123...  ADMIN_THRESHOLD=2
  // If set, admin power over GatePass is held by an N-of-M AdminMultiSig
  // instead of a single EOA, so no one signer can grant/revoke roles alone.
  // If unset, the deployer's own EOA is the admin (fine for quick local testing).
  const signersEnv = (process.env.ADMIN_SIGNERS || "").trim();
  let adminAddress = deployer.address;
  let multisigAddress = null;

  if (signersEnv) {
    const owners = signersEnv.split(",").map((s) => s.trim());
    const required = parseInt(process.env.ADMIN_THRESHOLD || "2", 10);
    console.log(`Deploying AdminMultiSig with owners [${owners.join(", ")}], threshold ${required}-of-${owners.length}`);

    const AdminMultiSig = await hre.ethers.getContractFactory("AdminMultiSig");
    const multisig = await AdminMultiSig.deploy(owners, required);
    await multisig.waitForDeployment();
    multisigAddress = await multisig.getAddress();
    adminAddress = multisigAddress;
    console.log("AdminMultiSig deployed to:", multisigAddress);
  } else {
    console.log("ADMIN_SIGNERS not set — using deployer EOA as admin:", adminAddress);
  }

  console.log("Deploying GatePass with admin:", adminAddress);

  const GatePass = await hre.ethers.getContractFactory("GatePass");
  const gatePass = await GatePass.deploy(adminAddress);
  await gatePass.waitForDeployment();

  const address = await gatePass.getAddress();
  console.log("GatePass deployed to:", address);

  const deployTx = gatePass.deploymentTransaction();
  const deployedAtBlock = deployTx ? (await deployTx.wait()).blockNumber : await hre.ethers.provider.getBlockNumber();

  const network = hre.network.name;
  const artifact = await hre.artifacts.readArtifact("GatePass");

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const deploymentInfo = {
    network,
    address,
    admin: adminAddress,
    multisig: multisigAddress,
    deployer: deployer.address,
    abi: artifact.abi,
    deployedAtBlock,
    deployedAt: new Date().toISOString(),
  };

  const outFile = path.join(outDir, `${network}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info written to:", outFile);
  if (multisigAddress) {
    console.log(
      "\nNext step: copy the GatePass address into contracts/.env (and backend/.env), then grant roles via " +
        "scripts/proposeAdminAction.js (one owner proposes) and scripts/confirmAdminAction.js (other owners confirm) " +
        "— a single admin EOA can no longer call grantRole directly, since ADMIN_ROLE now belongs to the multisig."
    );
  } else {
    console.log(
      "\nNext step: copy the address above into contracts/.env (and backend/.env) then run scripts/grantRoles.js."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
