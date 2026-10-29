# Architecture

## 1. Why blockchain here, specifically

The problem being solved: students collect three handwritten signatures on a paper pass, then
alter the written dates afterward to extend their stay. The fix isn't "put data in a database" —
a database is just as editable after the fact. The fix is a record that becomes **impossible to
edit once all three people have signed it**, and where anyone (not just the college office) can
check it's genuine. That's what a smart contract gives you that a database can't.

## 2. Data split: cloud vs. chain

| | MongoDB (cloud) | Polygon Amoy (chain) |
|---|---|---|
| Stores | Name, enrollment no., phone numbers, programme, declaration, signature | Pass ID, a hash of (name+enrollment+dates), the validity window, approver addresses + timestamps |
| Why | PII shouldn't live on a public, permanent, globally-readable ledger | This is the part that must be tamper-proof and independently verifiable |
| Source of truth | No — it's a fast-loading **cache** of chain state | **Yes** — always re-checked live on verify |

The guard's scanner, and `GET /api/verify/:passId`, never trust the cached MongoDB status alone —
they call `GatePass.verifyPass()` on-chain every time. MongoDB only exists so dashboards don't
have to make a slow RPC call on every page load.

## 3. The relayer / meta-transaction pattern (why students don't need MetaMask)

Students are the one role explicitly required to never touch a wallet (see the project spec,
section 2). But every write to `GatePass.sol` needs a signed transaction from *somewhere*. The
solution: the backend holds its own wallet (`BACKEND_ROLE`) and submits `submitPass()` on the
student's behalf — this is a standard "relayer" pattern (the lightweight end of what people call
meta-transactions). The backend pays gas; the student just fills out a web form.

This does **not** weaken tamper-proofing: the relayer can only create a pass in `Pending` status.
It cannot approve anything — that still requires three independent signatures from the
Coordinator, Lab Incharge, and Dean's own wallets, each enforced in order by the contract itself
(`approveAsCoordinator` → `approveAsLabIncharge` → `approveAsDean`, each gated by `require` on the
current status). A compromised relayer could spam fake *pending* requests, but could never forge
an *approved* one.

## 4. Event syncing (why MongoDB stays in sync without polling)

Every state change (`submitPass`, each approval, reject, revoke) emits a Solidity event. The
backend (`backend/src/blockchain/eventSync.js`) subscribes to these once at startup and updates
`PassRequest.cachedStatus` whenever one fires — no cron job, no polling loop. This is also why the
approve/reject/revoke API routes (`backend/src/routes/passes.js`) additionally wait for the
specific transaction's receipt and update the cache immediately: event-listener sync can lag by a
block or two, and a dean who just clicked "Approve" shouldn't have to refresh twice to see it take
effect. The event listener remains the authoritative fallback for anything the confirm step missed
(e.g. a dropped connection mid-request).

## 5. Core blockchain properties, concretely

**Immutability.** Look at `GatePass.sol`: there is no `editPass`, no `setValidFrom`, nothing that
rewrites a pass's dates, hash, or approver addresses once set. `status` only ever moves forward
through a fixed sequence (`Pending → CoordinatorApproved → LabApproved → Approved`, or branches to
`Rejected`/`Revoked`) — never backward, never arbitrarily. The 15-day cap and approval order are
`require` statements in the contract itself (`submitPass`, `approveAsCoordinator`, etc.), not just
frontend form validation, so they hold even if someone calls the contract directly, bypassing our
UI entirely.

**Transparency.** Every state change emits an event, which is how `backend/src/routes/admin.js`'s
`/api/admin/audit/:onChainId` builds a full audit trail straight from chain history — nothing in
MongoDB is needed to reconstruct it. `verifyPass()` is a public `view` function: anyone, including
someone with no account on this system at all, can call it directly against a public Amoy RPC node
and get the real status. The guard's scan result isn't "trust our server" — it's "here's what the
chain itself says right now."

**Decentralization.** Two separate mechanisms:

1. **The approval itself.** No single party can approve a pass — it requires three independent
   wallets (Coordinator, Lab Incharge, Dean) to each sign their own transaction, in order. One
   compromised or corrupt approver cannot forge the others' sign-off.
2. **Admin power over the system.** `GatePass`'s `ADMIN_ROLE` — which can grant or revoke who
   holds Coordinator/Lab Incharge/Dean/Backend roles — is held by `AdminMultiSig.sol`, a small
   N-of-M multisig contract (`contracts/contracts/AdminMultiSig.sol`), not a single wallet. Any
   owner can *propose* a role change; it only executes once a threshold (e.g. 2-of-3) of distinct
   owners confirm it. In practice this means no single staff member — not even "the admin" — can
   unilaterally add themselves as an approver or remove someone else's access. `GatePass.sol`
   itself needed zero changes to support this: `AccessControl`'s admin was always just an address,
   and a multisig contract address works exactly like an EOA's.

   We evaluated using Safe (formerly Gnosis Safe) for this instead of writing our own multisig, but
   Safe's officially supported network list doesn't confirm Polygon Amoy support, so we built a
   minimal, self-contained, fully-tested (`contracts/test/AdminMultiSig.test.js`) alternative
   instead of depending on unverified third-party infrastructure for a testnet deployment.

## 6. Component diagram

```
Student (browser, no wallet)
   │  fills form
   ▼
Backend API ──relayer tx (submitPass)──► GatePass.sol ◄──approve/reject/revoke tx── Approver (MetaMask)
   │  caches status                           │  emits events
   ▼                                           ▼
MongoDB Atlas                          Event listener (backend) ──► updates MongoDB cache

Guard (browser) ──GET /api/verify/:id──► Backend ──live verifyPass() call──► GatePass.sol
```

## 7. What would change for a real production deployment

Worth stating explicitly for the defense: this is built for a free testnet, zero-cost constraint.
A real deployment would move to Polygon mainnet (real MATIC for gas), use a paid RPC provider with
higher rate limits, and likely increase the multisig's owner count and threshold for the admin
role. None of the contract logic would need to change — only deployment configuration.
