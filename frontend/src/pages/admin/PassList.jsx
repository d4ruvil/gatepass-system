import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import StatusBadge from "../../components/StatusBadge";

const STATUSES = ["", "pending", "coordinator_approved", "lab_approved", "approved", "rejected", "revoked", "expired"];

export default function PassList() {
  const [passes, setPasses] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  function load() {
    const params = {};
    if (status) params.status = status;
    if (q) params.q = q;
    api
      .get("/admin/passes", { params })
      .then(({ data }) => setPasses(data.passes))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <h1>All Passes</h1>
      <div className="row">
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Search (name or enrollment)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
            <button className="btn btn-secondary" onClick={load} type="button">
              Search
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!passes && !error && <p className="muted">Loading...</p>}
      {passes && passes.length === 0 && <p className="muted">No passes match these filters.</p>}
      {passes &&
        passes.map((pass) => (
          <div className="list-item" key={pass._id}>
            <div>
              <strong>{pass.studentName}</strong> ({pass.enrollmentNo})
              <div className="muted">
                {pass.purpose} · {new Date(pass.validFrom).toLocaleDateString()} –{" "}
                {new Date(pass.validTo).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <StatusBadge status={pass.cachedStatus} />
              {pass.onChainId && (
                <Link to={`/admin/audit/${pass.onChainId}`} className="btn btn-secondary">
                  Audit Log
                </Link>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
