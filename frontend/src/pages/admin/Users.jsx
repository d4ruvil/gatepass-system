import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../../api";

const ROLES = ["coordinator", "lab_incharge", "dean", "guard", "admin"];
const ROLE_LABELS = {
  coordinator: "Program Coordinator",
  lab_incharge: "Lab Incharge",
  dean: "Dean",
  guard: "Security Guard",
  admin: "Admin",
  student: "Student",
};

export default function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ role: "guard" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  function load() {
    api
      .get("/admin/users")
      .then(({ data }) => setUsers(data.users))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setCreating(true);
    try {
      await api.post("/auth/register", form);
      setForm({ role: "guard" });
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const needsWallet = ["coordinator", "lab_incharge", "dean"].includes(form.role);

  return (
    <>
      <div className="card">
        <h1>Create Staff Account</h1>
        <p className="muted">
          Coordinator, Lab Incharge and Dean accounts need the wallet address they'll approve with in MetaMask.
          Granting their on-chain role still requires the AdminMultiSig owners to confirm separately — this only
          creates their login.
        </p>
        {formError && <div className="error-banner">{formError}</div>}
        <form onSubmit={handleCreate}>
          <div className="row">
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => update("role", e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Full Name</label>
              <input required value={form.name || ""} onChange={(e) => update("name", e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Email</label>
              <input type="email" required value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="field">
              <label>Temporary Password</label>
              <input
                type="text"
                required
                minLength={6}
                value={form.password || ""}
                onChange={(e) => update("password", e.target.value)}
              />
            </div>
          </div>
          {needsWallet && (
            <div className="field">
              <label>Wallet Address (MetaMask, 0x...)</label>
              <input
                required
                placeholder="0x..."
                value={form.walletAddress || ""}
                onChange={(e) => update("walletAddress", e.target.value)}
              />
            </div>
          )}
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>All Users</h2>
        {error && <div className="error-banner">{error}</div>}
        {!users && !error && <p className="muted">Loading...</p>}
        {users &&
          users.map((u) => (
            <div className="list-item" key={u._id}>
              <div>
                <strong>{u.name}</strong> · {u.email}
                {u.walletAddress && <div className="muted">{u.walletAddress}</div>}
              </div>
              <span className="badge badge-grey">{ROLE_LABELS[u.role] || u.role}</span>
            </div>
          ))}
      </div>
    </>
  );
}
