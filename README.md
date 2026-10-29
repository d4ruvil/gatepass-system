# Tamper-Proof Student Gate Pass System

A college gate pass system where every approval (Program Coordinator → Lab Incharge → Dean) is
signed on the Polygon Amoy testnet, so once a pass is approved its dates and timings cannot be
altered by anyone — not even an admin acting alone. See `ARCHITECTURE.md` for how the pieces fit
together and why they're designed this way.

## Project layout

```
contracts/   Solidity smart contracts (GatePass.sol, AdminMultiSig.sol), Hardhat tests, deploy scripts
backend/     Express API — auth, off-chain student data, blockchain relayer, event sync
frontend/    React app — Student / Approver / Guard / Admin screens
```

## 1. Prerequisites

- Node.js 20+
- A MetaMask wallet (for admins/approvers only — students never need a wallet)
- Free MongoDB Atlas account: https://www.mongodb.com/cloud/atlas/register
- Free test MATIC from the Polygon Amoy faucet: https://faucet.polygon.technology

## 2. Smart contracts

```bash
cd contracts
npm install
cp .env.example .env     # fill in PRIVATE_KEY, AMOY_RPC_URL (see .env.example comments)
npx hardhat test         # should show 27 passing
```

### Deploying

Decide your admin signers first — the contract's admin power (granting/revoking Coordinator, Lab
Incharge, Dean, Backend roles) is held by a 2-of-3 (or similar) multisig, not one wallet. See
`ARCHITECTURE.md` → "Why a multisig admin" for why.

```bash
# in contracts/.env, set:
# ADMIN_SIGNERS=0xAddr1,0xAddr2,0xAddr3
# ADMIN_THRESHOLD=2

npx hardhat run scripts/deploy.js --network amoy
```

This writes `contracts/deployments/amoy.json` with the deployed address + ABI. Then grant roles:

```bash
# With a multisig admin, one owner proposes, others confirm:
ROLE=COORDINATOR_ROLE TARGET=0xCoordinatorWallet ACTION=grant \
  npx hardhat run scripts/proposeAdminAction.js --network amoy
PROPOSAL_ID=0 npx hardhat run scripts/confirmAdminAction.js --network amoy   # run by a second owner

# Repeat for LAB_INCHARGE_ROLE, DEAN_ROLE, and BACKEND_ROLE (grant BACKEND_ROLE to your
# backend's relayer wallet — see backend/.env's RELAYER_PRIVATE_KEY below).
```

(If you deployed without `ADMIN_SIGNERS`, a single EOA is admin and `scripts/grantRoles.js` works
directly instead — faster for solo local testing, not recommended for the real deployment.)

### Local development without touching Amoy at all

```bash
npx hardhat node                                    # keep running in its own terminal
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/grantRoles.js --network localhost   # with COORDINATOR_ADDRESS etc. in .env
```

The node prints 20 funded test accounts with known private keys — use these for backend/frontend
`.env` files while developing, then switch to real Amoy values when you're ready to demo.

## 3. Backend

```bash
cd backend
npm install
cp .env.example .env   # MONGODB_URI, JWT_SECRET, RPC_URL, CONTRACT_ADDRESS, RELAYER_PRIVATE_KEY
npm run dev
```

- `MONGODB_URI`: from MongoDB Atlas → Database → Connect → Drivers.
- `RPC_URL` / `CONTRACT_ADDRESS`: `http://127.0.0.1:8545` + the localhost deployment while
  developing, or the Amoy RPC URL + `deployments/amoy.json`'s address when demoing for real.
- `RELAYER_PRIVATE_KEY`: the wallet holding `BACKEND_ROLE` (needs test MATIC for gas on Amoy).

## 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL, VITE_CONTRACT_ADDRESS, VITE_CHAIN_ID
npm run dev
```

Open http://localhost:5173. The first account you'll want is an admin — create one directly in
MongoDB (there's no public admin signup, by design), then use the Admin → Users screen to create
Coordinator/Lab Incharge/Dean/Guard accounts.

## 5. Typical demo flow

1. Register a student account (self-service, `/register`).
2. Submit a gate pass request — the backend relayer submits it on-chain, no wallet needed.
3. Log in as Coordinator → approve (signs with MetaMask) → Lab Incharge → Dean, in order.
4. Student's "My Passes" page now shows a downloadable QR code.
5. Log in as Guard → scan the QR (or type the pass ID manually if no camera) → see VALID.
6. As Dean, revoke the pass → scan again → see REVOKED.
7. As Admin → Audit Log for that pass shows every on-chain event with timestamps.
