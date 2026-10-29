import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../../api";

export default function RecentScans() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/logs")
      .then(({ data }) => setLogs(data.logs))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  return (
    <div className="card">
      <h1>Recent Scans</h1>
      {error && <div className="error-banner">{error}</div>}
      {!logs && !error && <p className="muted">Loading...</p>}
      {logs && logs.length === 0 && <p className="muted">No entries or exits logged yet.</p>}
      {logs &&
        logs.map((log) => (
          <div className="list-item" key={log._id}>
            <div>
              <strong>{log.pass?.studentName}</strong> · {log.pass?.purpose}
              <div className="muted">by {log.guard?.name}</div>
            </div>
            <div>
              <span className={`badge ${log.type === "entry" ? "badge-green" : "badge-yellow"}`}>
                {log.type === "entry" ? "Entry" : "Exit"}
              </span>
              <div className="muted">{new Date(log.timestamp).toLocaleString()}</div>
            </div>
          </div>
        ))}
    </div>
  );
}
