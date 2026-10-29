import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";

const EVENT_LABELS = {
  PassSubmitted: "Request submitted",
  PassApprovedByCoordinator: "Approved by Coordinator",
  PassApprovedByLabIncharge: "Approved by Lab Incharge",
  PassApprovedByDean: "Approved by Dean",
  PassRejected: "Rejected",
  PassRevoked: "Revoked",
};

export default function AuditLog() {
  const { onChainId } = useParams();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/admin/audit/${onChainId}`)
      .then(({ data }) => setEvents(data.events))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [onChainId]);

  return (
    <div className="card">
      <h1>Audit Log — Pass #{onChainId}</h1>
      <p className="muted">Pulled directly from the blockchain's event history — this cannot be altered.</p>
      {error && <div className="error-banner">{error}</div>}
      {!events && !error && <p className="muted">Loading...</p>}
      {events &&
        events.map((e, i) => (
          <div className="list-item" key={i}>
            <div>
              <strong>{EVENT_LABELS[e.event] || e.event}</strong>
              {e.args.reason && <div className="muted">Reason: {e.args.reason}</div>}
              {(e.args.coordinator || e.args.labIncharge || e.args.dean || e.args.revokedBy || e.args.rejectedBy) && (
                <div className="muted">
                  By: {e.args.coordinator || e.args.labIncharge || e.args.dean || e.args.revokedBy || e.args.rejectedBy}
                </div>
              )}
            </div>
            <div className="muted">{new Date(e.blockTimestamp).toLocaleString()}</div>
          </div>
        ))}
    </div>
  );
}
