import { BrowserProvider, Contract } from "ethers";

// Only the functions/events the approver UI actually calls — not the full ABI.
const GATE_PASS_ABI = [
  "function approveAsCoordinator(uint256 passId)",
  "function approveAsLabIncharge(uint256 passId)",
  "function approveAsDean(uint256 passId)",
  "function rejectPass(uint256 passId, string reason)",
  "function revokePass(uint256 passId)",
];

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Please install the MetaMask browser extension.");
  }
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();

  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || 80002);
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(
      `Wrong network in MetaMask. Please switch to chain ID ${expectedChainId} (Polygon Amoy) and try again.`
    );
  }

  return { provider, address: accounts[0] };
}

export async function getGatePassContract() {
  const { provider } = await connectWallet();
  const signer = await provider.getSigner();
  const address = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!address) throw new Error("VITE_CONTRACT_ADDRESS is not configured.");
  return new Contract(address, GATE_PASS_ABI, signer);
}
