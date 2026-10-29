# Quickstart: run the project locally

Uses a local Hardhat chain, so you don't need Amoy test MATIC or MetaMask funds to try it.
(`README.md` has the full guide, including Amoy deployment.)

## 1. Requirements
See `requirements.txt`: Node 20+, a MongoDB URI (Atlas free tier or local), MetaMask for approvers.

## 2. Install
```bash
./setup.sh
```
Installs all dependencies, creates the `.env` files, and runs the contract tests.

## 3. Start a local chain and deploy (Terminal 1 + 2)
```bash
cd contracts
npx hardhat node                                              # Terminal 1, leave running
npx hardhat run scripts/deploy.js --network localhost         # Terminal 2
```
Note the deployed address (also saved in `contracts/deployments/localhost.json`).
Grant roles with `npx hardhat run scripts/grantRoles.js --network localhost`
(set `COORDINATOR_ADDRESS`, `LAB_INCHARGE_ADDRESS`, `DEAN_ADDRESS`, `BACKEND_RELAYER_ADDRESS`
in `contracts/.env` first; use the test accounts the node prints).

## 4. Configure the `.env` files
| File | Set |
|------|-----|
| `backend/.env` | `MONGODB_URI`, `JWT_SECRET`, `RPC_URL=http://127.0.0.1:8545`, `CONTRACT_ADDRESS`, `RELAYER_PRIVATE_KEY` (the account with `BACKEND_ROLE`) |
| `frontend/.env` | `VITE_API_URL=http://localhost:4000/api`, `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID=31337` |

## 5. Run
`./run.sh` starts the backend and frontend together (Ctrl+C stops both). Or run them separately:
```bash
cd backend  && npm run dev     # API on http://localhost:4000
cd frontend && npm run dev     # app on http://localhost:5173
```

## 6. First login
There is no public admin signup. Create one admin user directly in MongoDB, log in, then add
Coordinator / Lab Incharge / Dean / Guard accounts from Admin -> Users. Students register at `/register`.

For MetaMask, add the network `http://127.0.0.1:8545` (chain ID 31337) and import a test account
private key printed by `hardhat node`.

## Troubleshooting
- Backend can't connect: check `MONGODB_URI` and that your IP is allowed in Atlas.
- Contract calls fail: restarting `hardhat node` wipes the chain, so redeploy and update `CONTRACT_ADDRESS` in both `.env` files.
- Wrong network in MetaMask: `VITE_CHAIN_ID` must match (31337 local, 80002 Amoy).
