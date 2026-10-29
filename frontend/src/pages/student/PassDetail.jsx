import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import StatusBadge from "../../components/StatusBadge";

export default function PassDetail() {
  const { id } = useParams();
  const [pass, setPass] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/passes/${id}`)
      .then(({ data }) => setPass(data.pass))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  useEffect(() => {
    if (!pass?.onChainId) return;
    api
      .get(`/passes/${id}/qrcode`)
      .then(({ data }) => setQr(data.qrCodeDataUrl))
      .catch(() => {});
  }, [pass, id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!pass) return <p className="muted">Loading...</p>;

  return (
    <div className="card">
      <h1>{pass.purpose}</h1>
      <StatusBadge status={pass.cachedStatus} />
      {pass.cachedStatus === "rejected" && pass.rejectReason && (
        <p style={{ color: "var(--color-red)", marginTop: 10 }}>Reason: {pass.rejectReason}</p>
      )}

      <div className="field" style={{ marginTop: 20 }}>
        <strong>Dates:</strong> {new Date(pass.validFrom).toLocaleDateString()} –{" "}
        {new Date(pass.validTo).toLocaleDateString()}
      </div>
      <div className="field">
        <strong>Timing:</strong> {minutesToTime(pass.timeFromMinutes)} – {minutesToTime(pass.timeToMinutes)}
      </div>

      {qr ? (
        <div className="center" style={{ marginTop: 24 }}>
          <img src={qr} alt="Gate pass QR code" style={{ maxWidth: 280 }} />
          <p style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: 1 }}>Pass #{pass.onChainId}</p>
          <p className="muted">Show this to the security guard at the gate.</p>
          <a href={qr} download={`gatepass-${pass.onChainId}.png`} className="btn btn-secondary">
            Download QR
          </a>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 20 }}>
          Your QR code will appear here once your request is recorded on the blockchain.
        </p>
      )}
    </div>
  );
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
