import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { getGatePassContract } from "../../web3";
import StatusBadge from "../../components/StatusBadge";

const APPROVE_METHOD_BY_ROLE = {
  coordinator: "approveAsCoordinator",
  lab_incharge: "approveAsLabIncharge",
  dean: "approveAsDean",
};

export default function ApproverPassDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pass, setPass] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  function load() {
    api
      .get(`/passes/${id}`)
      .then(({ data }) => setPass(data.pass))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, [id]);

  async function runOnChainAction(methodName, args, confirmEndpoint, confirmExtra = {}) {
    setError("");
    setBusy(true);
    try {
      setStep("Opening MetaMask — please confirm the transaction...");
      const contract = await getGatePassContract();
      const tx = await contract[methodName](...args);

      setStep("Waiting for the transaction to be confirmed on the blockchain...");
      await tx.wait();

      setStep("Syncing status...");
      const { data } = await api.post(`/passes/${id}/${confirmEndpoint}`, { txHash: tx.hash, ...confirmExtra });
      setPass(data.pass);
      setStep("");
    } catch (err) {
      setError(err.shortMessage || err.message || apiErrorMessage(err));
      setStep("");
    } finally {
      setBusy(false);
    }
  }

  if (error && !pass) return <div className="error-banner">{error}</div>;
  if (!pass) return <p className="muted">Loading...</p>;

  const canApprove = pass.cachedStatus === queueStatusForRole(user.role);
  const canRevoke = user.role === "dean" && pass.cachedStatus === "approved";

  return (
    <div className="card">
      <h1>{pass.studentName}</h1>
      <StatusBadge status={pass.cachedStatus} />

      <div style={{ marginTop: 20 }}>
        <div className="field">
          <strong>Enrollment:</strong> {pass.enrollmentNo} · {pass.programme}, {pass.discipline}, Sem {pass.semester}
        </div>
        <div className="field">
          <strong>Purpose:</strong> {pass.purpose}
        </div>
        <div className="field">
          <strong>Dates:</strong> {new Date(pass.validFrom).toLocaleDateString()} –{" "}
          {new Date(pass.validTo).toLocaleDateString()}
        </div>
        <div className="field">
          <strong>Timing:</strong> {minutesToTime(pass.timeFromMinutes)} – {minutesToTime(pass.timeToMinutes)}
        </div>
        <div className="field">
          <strong>Declaration accepted:</strong> {new Date(pass.declarationAcceptedAt).toLocaleString()} (signed as
          "{pass.signatureData}")
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {step && <p className="muted">{step}</p>}

      {canApprove && !showReject && (
        <div className="row" style={{ marginTop: 20 }}>
          <button
            className="btn btn-green"
            disabled={busy}
            onClick={() => runOnChainAction(APPROVE_METHOD_BY_ROLE[user.role], [pass.onChainId], "approve")}
          >
            Approve (sign with MetaMask)
          </button>
          <button className="btn btn-red" disabled={busy} onClick={() => setShowReject(true)}>
            Reject
          </button>
        </div>
      )}

      {canApprove && showReject && (
        <div style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="reason">Reason for rejection</label>
            <textarea
              id="reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="row">
            <button
              className="btn btn-red"
              disabled={busy || !rejectReason.trim()}
              onClick={() => runOnChainAction("rejectPass", [pass.onChainId, rejectReason], "reject")}
            >
              Confirm Rejection (sign with MetaMask)
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setShowReject(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {canRevoke && (
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-red"
            disabled={busy}
            onClick={() => runOnChainAction("revokePass", [pass.onChainId], "revoke")}
          >
            Revoke This Pass (sign with MetaMask)
          </button>
        </div>
      )}

      {!canApprove && !canRevoke && (
        <p className="muted" style={{ marginTop: 20 }}>
          No action needed from you on this pass right now.
        </p>
      )}

      <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

function queueStatusForRole(role) {
  return { coordinator: "pending", lab_incharge: "coordinator_approved", dean: "lab_approved" }[role];
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
