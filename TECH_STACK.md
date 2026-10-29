# Tech Stack: what each technology is used for and why

The overall goal: once a gate pass is approved, nobody can change its dates or timings, and
anyone can check it is genuine. The project also had to cost nothing to run (free tiers and a
testnet only). Each choice below follows from those two goals. For how the parts work together,
see `ARCHITECTURE.md`.

## Summary

| Layer | Technology | Why, in one line |
|---|---|---|
| Blockchain network | Polygon Amoy testnet | Free, EVM-compatible, fast blocks, public explorer |
| Smart contracts | Solidity 0.8.24 | Standard EVM language; built-in overflow checks |
| Contract library | OpenZeppelin `AccessControl` | Audited role system instead of hand-written permissions |
| Contract tooling | Hardhat + hardhat-toolbox | Compile, test, local chain and deploy in one tool |
| Blockchain client | ethers.js v6 | One library for the backend relayer and frontend MetaMask signing |
| Wallet | MetaMask | Approvers sign their own approvals; no wallet code to write |
| Backend | Node.js 20 + Express 5 | Same language as the contracts tooling and frontend; small API |
| Database | MongoDB Atlas + Mongoose | Free M0 cluster; stores private data that must stay off-chain |
| Auth | JWT + bcryptjs | Stateless logins; passwords never stored in plain text |
| Validation | zod | One schema checks request shape and rules before anything hits the chain |
| QR generation | `qrcode` (backend) | Server builds the QR so the encoded link can't be edited by the client |
| QR scanning | `html5-qrcode` (frontend) | Guard scans with a phone camera in the browser; no app install |
| Frontend | React 19 + Vite | Component UI for 4 role dashboards; fast dev server and build |
| Routing | React Router 7 | Role-based pages and protected routes |
| HTTP client | axios | JWT header and error handling set up once |
| Config | dotenv | Keys and URLs stay in `.env`, out of the code |
| Linting | oxlint | Fast linter with near-zero setup |

## Blockchain layer

**Polygon Amoy testnet**: where the approval record lives.
- Free: test MATIC comes from a faucet, which meets the zero-cost requirement.
- EVM-compatible, so standard Solidity, Hardhat, ethers.js and MetaMask all work unchanged.
- Fast, cheap blocks, so approvals confirm in seconds instead of minutes.
- Amoy is Polygon's current testnet (Mumbai was retired), and Amoy PolygonScan lets anyone look
  up a pass's transactions without trusting our server.
- Moving to production only means switching to Polygon mainnet; the contract code stays the same.

**Solidity 0.8.24**: the language for `GatePass.sol` and `AdminMultiSig.sol`.
- The standard language for EVM chains, with the most tooling and documentation.
- 0.8.x checks for integer overflow by default, so date arithmetic (the 15-day cap) can't wrap around.
- The rules that matter (approval order, 15-day maximum, no editing after approval) are `require`
  statements in the contract. They hold even if someone skips our UI and calls the contract directly.

**OpenZeppelin Contracts (`AccessControl`)**: roles for Coordinator, Lab Incharge, Dean, Backend and Admin.
- Widely audited code. Writing our own permission system would be the easiest place to add a security bug.
- The admin is just an address, so it could be handed to our `AdminMultiSig` contract without
  changing `GatePass.sol`.
- We wrote our own small multisig instead of using Safe because Safe's official network list
  doesn't confirm Amoy support (see `ARCHITECTURE.md` §5).

**Hardhat (+ hardhat-toolbox)**: the development environment for the contracts.
- One tool for compiling, testing (Mocha + Chai, 27 tests), running a local chain (`npx hardhat node`)
  and deploying to Amoy.
- The local chain gives 20 funded test accounts, so the whole app can run without faucet MATIC.
- The toolbox includes contract verification for publishing source on PolygonScan.

**ethers.js v6**: talks to the chain from both backend and frontend.
- Backend: `JsonRpcProvider` + a wallet for the relayer (submits passes for students), live
  `verifyPass()` reads for the guard, `contract.on(...)` event listeners that keep MongoDB in sync,
  and `keccak256` to hash student data before putting it on-chain.
- Frontend: `BrowserProvider` wraps MetaMask so approvers sign transactions themselves.
- Using one library on both sides means the ABI and types are handled the same way everywhere.

**MetaMask**: wallet for approvers only.
- The approver's own signature is what makes the pass tamper-proof, so approvers sign with their
  own keys, which the server never sees.
- Students never need it: the backend relayer submits their requests (see `ARCHITECTURE.md` §3).

## Backend

**Node.js 20 + Express 5**: the REST API (`backend/src`).
- JavaScript everywhere: contracts tooling, backend and frontend share one language and ethers.js.
- Express is small and well known, which suits a handful of routes (auth, passes, verify, logs, admin).
- Express 5 forwards errors from `async` route handlers automatically, so no try/catch wrapper is
  needed on every route.
- Node 20+ has `node --watch` built in, so `npm run dev` needs no nodemon.

**MongoDB Atlas + Mongoose**: off-chain storage (`User`, `PassRequest`, `EntryExitLog` models).
- Personal data (names, phone numbers, enrollment numbers) must **not** go on a public, permanent
  blockchain. It goes here; only a hash goes on-chain.
- It also caches each pass's status so dashboards load fast without an RPC call on every page.
  The chain is still the source of truth: verification always reads the contract live.
- Atlas M0 is free. Documents map directly to the JSON the API already uses.
- Mongoose adds schemas and validation on top of the raw driver.

**JWT (`jsonwebtoken`) + `bcryptjs`**: login and sessions.
- JWTs are stateless: the token carries the user id and role, so no session store is needed, and
  the role check in `middleware/auth.js` is a single verify call.
- bcrypt hashes passwords with a salt (cost 10). `bcryptjs` is pure JavaScript, so it installs
  anywhere without native build tools.

**zod**: request validation (`routes/auth.js`, `routes/passes.js`).
- Bad input is rejected before it costs gas or reaches the database.
- The same rules (15-day cap, dates not in the past, start time before end time) are enforced
  again in the contract, so the backend check is for clear error messages, not for security.

**`qrcode`**: makes each pass's QR image.
- Built on the server so the QR holds only a link with the on-chain pass ID (no personal data) and
  the client can't change what it points to.
- Returned as a data URL, so no file storage or image hosting is needed.

**`cors`, `dotenv`**: plumbing.
- `cors`: the frontend (port 5173) and API (port 4000) run on different origins.
- `dotenv`: private keys, RPC URLs and the JWT secret live in `.env` files that are never committed.

## Frontend

**React 19 + Vite**: the web app for Students, Approvers, Guards and Admins.
- Four role dashboards share components (`Layout`, `StatusBadge`, `ProtectedRoute`), which a
  component library handles well.
- Vite gives near-instant dev reloads and a static build that can be hosted for free (Vercel was
  the planned host).

**React Router 7**: page routing.
- `ProtectedRoute` limits each page to the right role, e.g. only guards can open the scanner.
- A QR link like `/guard?pass=<id>` opens straight to the scanner with the pass loaded.

**axios**: API calls (`src/api.js`).
- One shared instance attaches the JWT to every request, and `apiErrorMessage` turns server errors
  into readable text.

**`html5-qrcode`**: the guard's scanner (`pages/guard/Scanner.jsx`).
- Uses the phone or laptop camera inside the browser, so guards need no native app.
- Manual pass-ID entry is the fallback when no camera is available.

**oxlint**: linting.
- Very fast and works with almost no configuration (`.oxlintrc.json`).

## Planned free-tier hosting (from the project spec)

| Part | Host |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | MongoDB Atlas M0 |
| Chain RPC | Public Amoy RPC, or the Alchemy / Infura free tier |
