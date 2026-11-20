const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

let provider;
let relayerWallet;
let abi;

function loadAbi() {
  if (abi) return abi;
  // Committed ABI next to this file keeps the backend self-contained for cloud
  // deploys (no Hardhat artifacts folder on the host). Overridable via env, and
  // falls back to the Hardhat artifact for a full local checkout.
  const artifactPath =
    process.env.GATEPASS_ARTIFACT_PATH ||
    (fs.existsSync(path.join(__dirname, "GatePass.abi.json"))
      ? path.join(__dirname, "GatePass.abi.json")
      : path.join(__dirname, "..", "..", "..", "contracts", "artifacts", "contracts", "GatePass.sol", "GatePass.json"));
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  abi = artifact.abi;
  return abi;
}

function getProvider() {
  if (!provider) {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error("RPC_URL not set in .env");
    provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return provider;
}

function getRelayerWallet() {
  if (!relayerWallet) {
    const key = process.env.RELAYER_PRIVATE_KEY;
    if (!key) throw new Error("RELAYER_PRIVATE_KEY not set in .env");
    relayerWallet = new ethers.Wallet(key, getProvider());
  }
  return relayerWallet;
}

/// Contract instance that can send transactions, signed by the backend's relayer wallet.
function getWriteContract() {
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) throw new Error("CONTRACT_ADDRESS not set in .env");
  return new ethers.Contract(address, loadAbi(), getRelayerWallet());
}

/// Read-only contract instance — any route that only calls view functions should use this.
function getReadContract() {
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) throw new Error("CONTRACT_ADDRESS not set in .env");
  return new ethers.Contract(address, loadAbi(), getProvider());
}

module.exports = { getProvider, getRelayerWallet, getWriteContract, getReadContract, loadAbi };
