# Project Build Prompt: Tamper-Proof Student Gate Pass System (Cloud + Blockchain)

Use this entire document as the working spec. Build the project step by step, module by module, confirming each part works before moving to the next. Ask me clarifying questions only if something below is genuinely ambiguous — otherwise make reasonable assumptions and note them.

---

## 1. Project Summary

Build a web-based student gate pass system for a college. Students request permission to stay on campus after college hours. The request must be approved in strict order by three roles: **Program Coordinator → Lab Incharge → Dean**. Once approved, the pass details (dates, timings, approvals) are locked immutably on a blockchain so no one can alter them later. A security guard verifies a physical/QR pass by scanning it, which checks the live blockchain record rather than trusting a printed paper.

**Core problem being solved:** students currently get a paper pass signed by hand, then alter the written dates after all signatures are collected, extending their stay illegally. This system makes the approved dates and timings unforgeable and instantly verifiable.

**Zero cost constraint:** the entire project must run on free-tier cloud services and a blockchain testnet. No paid services, no mainnet transactions, no real cryptocurrency anywhere.

---

## 2. Roles and Users

| Role | Access | Wallet needed? |
|---|---|---|
| Student | Web portal — submit request, track status, view/download QR pass | No |
| Program Coordinator | Approval dashboard — first approver | Yes (MetaMask) |
| Lab Incharge | Approval dashboard — second approver | Yes (MetaMask) |
| Dean | Approval dashboard — final approver, can revoke | Yes (MetaMask) |
| Security Guard | Scanner page — scan QR, verify pass, log entry/exit | No |
| Admin | Admin panel — manage users, assign roles, view all passes and logs | No (or optional wallet for role management on-chain) |

Students do NOT need a crypto wallet. The backend submits their requests to the blockchain on their behalf (using a backend-controlled relayer wallet or meta-transaction pattern) — students should never be asked to install MetaMask or hold test tokens.

Approvers (Coordinator, Lab Incharge, Dean) DO sign their own approval transactions with MetaMask, since their digital signature is the entire point of tamper-proofing.

---

## 3. Data Fields (from the actual paper form — keep exact structure)

Every gate pass request must capture:

1. Student full name
2. Enrollment number
3. Programme (e.g. M.Sc. CS)
4. Discipline (e.g. Cyber)
5. Semester
6. Student mobile number
7. Parent's mobile number
8. Purpose / location (e.g. "Cyber Lab - 211")
9. Date From
10. Date To
11. Timing From (e.g. 9:00 AM)
12. Timing To (e.g. 9:00 PM)
13. Declaration checkbox ("I will follow discipline and be responsible for any incident/damage")
14. Student signature (typed name + timestamp is acceptable, or an uploaded signature image — your choice, keep it simple)

**Validation rules (enforced both in the UI and in the smart contract):**
- `Date To - Date From` must not exceed **15 days**. Reject at submission if it does.
- `Date From` cannot be in the past.
- All fields are required before submission.
- Timing From must be earlier than Timing To.

---

## 4. Data Split: What Goes Where

This is important — do not put personal data on-chain.

**Cloud database (MongoDB Atlas free tier) stores:**
- Name, enrollment number, programme, discipline, semester
- Student mobile, parent mobile
- Purpose/location text
- Declaration acceptance + timestamp
- Student signature (image or typed record)
- User accounts and roles
- Guard entry/exit logs
- A cached copy of pass status for fast dashboard loading (source of truth is still the chain)

**Blockchain (Polygon Amoy testnet) stores:**
- Pass ID (unique identifier)
- A SHA-256 hash of the sensitive off-chain data (name + enrollment + dates, concatenated in a fixed format) — used to detect tampering
- Date From, Date To (as Unix timestamps)
- Timing From, Timing To (as minutes-since-midnight or similar)
- Approval status and the wallet address + timestamp of each approver's signature
- Revocation status + timestamp + revoker address, if revoked
- Nothing personally identifiable (no names, no phone numbers, no enrollment numbers in plaintext)

**QR code contains:** just the Pass ID (a UUID or on-chain uint) and, optionally, the data hash. Nothing else. Scanning it triggers a lookup against the chain + cloud DB.

---

## 5. Smart Contract Specification (Solidity)

Build this first, and test it thoroughly with Hardhat before touching the frontend.

### Contract: `GatePass.sol`

**Roles (use OpenZeppelin `AccessControl`):**
- `ADMIN_ROLE`
- `COORDINATOR_ROLE`
- `LAB_INCHARGE_ROLE`
- `DEAN_ROLE`
- `BACKEND_ROLE` (the relayer wallet that submits requests on behalf of students)

**Struct: `Pass`**
```solidity
struct Pass {
    uint256 id;
    bytes32 dataHash;       // hash of off-chain student data + dates
    uint64 validFrom;       // unix timestamp
    uint64 validTo;         // unix timestamp
    uint16 timeFromMinutes; // minutes since midnight
    uint16 timeToMinutes;
    address coordinator;
    address labIncharge;
    address dean;
    uint64 coordinatorApprovedAt;
    uint64 labInchargeApprovedAt;
    uint64 deanApprovedAt;
    PassStatus status;      // Pending, CoordinatorApproved, LabApproved, Approved, Rejected, Revoked
}
```

**Core functions:**
- `submitPass(bytes32 dataHash, uint64 validFrom, uint64 validTo, uint16 timeFrom, uint16 timeTo) → uint256 passId`
  - Only callable by `BACKEND_ROLE`
  - Reverts if `validTo - validFrom > 15 days`
  - Reverts if `validFrom < block.timestamp`
  - Sets status to `Pending`
- `approveAsCoordinator(uint256 passId)` — only `COORDINATOR_ROLE`, only if status is `Pending`
- `approveAsLabIncharge(uint256 passId)` — only `LAB_INCHARGE_ROLE`, only if status is `CoordinatorApproved`
- `approveAsDean(uint256 passId)` — only `DEAN_ROLE`, only if status is `LabApproved`; sets status to `Approved` and locks the pass
- `rejectPass(uint256 passId, string reason)` — callable by whichever approver's turn it currently is
- `revokePass(uint256 passId)` — only `DEAN_ROLE` or `ADMIN_ROLE`, only if status is `Approved`; sets status to `Revoked`
- `verifyPass(uint256 passId) view returns (PassStatus effectiveStatus, Pass memory pass)`
  - Computes effective status dynamically: if status is `Approved` but `block.timestamp > validTo`, return `Expired` even though stored status still says `Approved`
  - Also checks current time against `timeFromMinutes`/`timeToMinutes` for a same-day-only check on the frontend (contract can just return the stored pass; time-of-day logic can live in the backend/frontend to keep gas low)

**Events:** emit an event on every state change (`PassSubmitted`, `PassApprovedByCoordinator`, `PassApprovedByLabIncharge`, `PassApprovedByDean`, `PassRejected`, `PassRevoked`) — these give you a free, permanent audit log queryable from the frontend without needing extra storage reads.

**Access control setup:** admin deploys the contract and grants roles to the three approvers' wallet addresses and the backend relayer's wallet address.

### Testing (Hardhat + Chai)
Write tests covering:
- Happy path: submit → coordinator approves → lab approves → dean approves → status is Approved
- Reject a >15-day request
- Reject an out-of-order approval (e.g. Lab Incharge tries to approve before Coordinator)
- Reject an approval from a wallet without the right role
- Confirm expired passes report `Expired` via `verifyPass` after `validTo` has passed
- Confirm revoked passes report `Revoked` and cannot be un-revoked
- Confirm rejected passes cannot later be approved

### Deployment
Deploy to **Polygon Amoy testnet**. Use a `.env` file for the private key and RPC URL (never commit this). Get free test MATIC from the Polygon Amoy faucet. Document the deployed contract address and ABI output location clearly so the backend can consume it.

---

## 6. Backend API (Node.js + Express)

### Responsibilities
- User authentication and role management
- CRUD for pass requests (off-chain data)
- Relaying `submitPass` transactions to the blockchain on behalf of students (backend holds the relayer wallet)
- Listening for/reading on-chain events to sync pass status into MongoDB (for fast dashboard queries)
- Generating QR codes
- Handling guard scan/verify requests (reads chain + DB, returns combined result)
- Logging guard entry/exit events

### Suggested REST endpoints
```
POST   /api/auth/login
POST   /api/auth/register        (admin only, for creating approver/guard accounts)

POST   /api/passes               (student submits a new request)
GET    /api/passes/:id           (get full pass detail)
GET    /api/passes/student/:studentId   (student's own pass history)
GET    /api/passes/pending/:role        (approver's pending queue, e.g. /pending/coordinator)

POST   /api/passes/:id/approve   (approver triggers MetaMask signing from frontend, backend just confirms/syncs after tx confirms)
POST   /api/passes/:id/reject
POST   /api/passes/:id/revoke

GET    /api/verify/:passId       (guard scans QR → this endpoint returns live chain status + student photo/name/dates)
POST   /api/logs/entry           (guard logs a student's entry time)
POST   /api/logs/exit            (guard logs a student's exit time)
GET    /api/logs/:passId         (view entry/exit history for a pass)

GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id/role
```

### Database Schema (MongoDB, Mongoose)
- `User`: name, email, passwordHash, role, walletAddress (for approvers), phone
- `PassRequest`: onChainId, studentId (ref User), enrollmentNo, programme, discipline, semester, studentMobile, parentMobile, purpose, validFrom, validTo, timeFrom, timeTo, declarationAccepted, signatureData, dataHash, cachedStatus, createdAt
- `EntryExitLog`: passId, guardId, type (entry/exit), timestamp

### Blockchain integration
Use `ethers.js` to:
- Connect to Polygon Amoy via a free RPC (Alchemy or Infura free tier, or the public Amoy RPC)
- Call contract functions
- Listen to contract events and update MongoDB's `cachedStatus` field whenever an event fires, so dashboards don't need to hit the chain on every page load

---

## 7. Frontend (React, deployed on Vercel)

Build as a single React app with role-based routing. Make it a PWA so it can be "installed" to a phone home screen (important for the guard's page).

### Pages

**Student**
- Login/Register
- New Pass Request form (matches the paper form fields exactly, with live 15-day validation)
- My Passes (list with status badges: Pending / Approved / Rejected / Expired / Revoked)
- Pass Detail page showing the QR code (downloadable/printable)

**Approver (Coordinator / Lab Incharge / Dean — same layout, different queue)**
- Login (connect MetaMask)
- Pending Approvals queue (only shows passes where it's their turn)
- Pass Detail view with an "Approve" / "Reject" button that triggers a MetaMask transaction
- Dean's view additionally has a "Revoke" button on already-approved passes
- History of passes they've approved

**Guard**
- Scanner page: opens phone camera (use `html5-qrcode`), scans the QR
- Result screen: big clear VALID (green) / EXPIRED (orange) / REVOKED (red) / INVALID (red) banner, with student name, photo (if available), purpose, and the approved date/time range
- Entry/Exit buttons to log the student's movement, only enabled when status is VALID
- Recent scans list

**Admin**
- User management (create approver/guard accounts, assign roles and wallet addresses)
- Full pass list with filters (status, date range, student)
- Audit log viewer (pulls from blockchain events)

### UI notes
- Keep it clean and functional — this will likely be demoed live to a mentor and possibly college administration, so clarity matters more than decoration.
- Status badges should use consistent colors throughout (green = valid/approved, yellow = pending, red = rejected/revoked/expired).
- Show a clear "why rejected" reason wherever applicable.

---

## 8. Tech Stack Summary (all free tier)

| Layer | Choice |
|---|---|
| Frontend | React + Vite, deployed on Vercel |
| Backend | Node.js + Express, deployed on Render |
| Database | MongoDB Atlas (M0 free cluster) |
| Blockchain | Solidity + Hardhat, deployed to Polygon Amoy testnet |
| Blockchain library | ethers.js |
| Wallet | MetaMask (approvers only) |
| RPC provider | Alchemy or Infura free tier, or public Amoy RPC |
| QR generation | `qrcode` npm package |
| QR scanning | `html5-qrcode` npm package |
| Auth | JWT-based sessions |
| File storage (if needed for photos/signatures) | Cloudinary free tier or base64 in MongoDB for small images |

---

## 9. Build Order (please follow this sequence)

1. **Smart contract** — write `GatePass.sol`, write full Hardhat test suite, get all tests passing locally before deploying anywhere.
2. **Deploy to Polygon Amoy testnet** — deploy contract, grant roles to test wallet addresses, verify on PolygonScan (Amoy) if possible.
3. **Backend skeleton** — Express server, MongoDB models, auth (register/login/JWT), basic CRUD for pass requests (off-chain only first).
4. **Backend blockchain integration** — connect ethers.js to the deployed contract, implement the relayer submit flow, implement event listeners to sync status.
5. **Student frontend** — request form with validation, my-passes list, QR display.
6. **Approver frontend** — MetaMask connection, pending queue, approve/reject/revoke with real transactions.
7. **Guard frontend** — QR scanner, verify page, entry/exit logging.
8. **Admin frontend** — user management, full pass list, audit log view.
9. **End-to-end test** — walk through the full flow: student submits → coordinator approves → lab incharge approves → dean approves → QR generated → guard scans and sees VALID → log entry → simulate expiry or revoke → guard scans again and sees the changed status.
10. **Polish** — error handling, loading states, mobile responsiveness for the guard scanner especially.

At each step, show me the working code and a short explanation of what was built and how to test it, before moving to the next step.

---

## 10. Explicit Constraints — Do Not Violate

- No paid services, no real cryptoc(only testnet MATIC), no mainnet deployment.
- Students must never be required to install MetaMask or hold any crypto.
- No personally identifiable information (name, enrollment number, phone numbers) should ever be written on-chain, even hashed data should not be reversible to reveal them without the off-chain DB.
- The 15-day maximum validity must be enforced in the smart contract itself, not just in frontend validation (frontend validation alone can be bypassed).
- Approval order (Coordinator → Lab Incharge → Dean) must be enforced by the contract, not just by UI logic.
- Keep secrets (private keys, RPC URLs, DB connection strings) in `.env` files, never hardcoded or committed.

---

## 11. Deliverables Expected

- `/contracts` — Solidity source + Hardhat config + tests + deployment script
- `/backend` — Express API + MongoDB models + blockchain integration
- `/frontend` — React app with all four role-based views
- A root `README.md` explaining setup steps: installing dependencies, setting up `.env` files, running Hardhat tests, deploying the contract, running backend and frontend locally, and how to get free testnet MATIC from the faucet
- A short `ARCHITECTURE.md` explaining the data flow between cloud and blockchain, useful for my mentor presentation

---

Build this incrementally, confirm each module works, and explain key decisions (especially around the relayer/meta-transaction pattern for students, and how event syncing keeps the cloud DB in sync with the chain) as you go, since I'll need to explain these choices during my project defense.
