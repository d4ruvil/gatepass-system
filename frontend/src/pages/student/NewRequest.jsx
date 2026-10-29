import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import { useAuth } from "../../context/AuthContext";

const MAX_DAYS = 15;

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export default function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [purpose, setPurpose] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("21:00");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const days =
    validFrom && validTo ? (new Date(validTo) - new Date(validFrom)) / (1000 * 60 * 60 * 24) : null;
  const overLimit = days !== null && days > MAX_DAYS;
  const badOrder = days !== null && days <= 0;
  const badTime = toMinutes(timeFrom) >= toMinutes(timeTo);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (overLimit) return setError(`Your stay cannot be longer than ${MAX_DAYS} days.`);
    if (badOrder) return setError("Date To must be after Date From.");
    if (badTime) return setError("Timing From must be earlier than Timing To.");
    if (!declarationAccepted) return setError("You must accept the declaration to submit.");

    setSubmitting(true);
    try {
      const { data } = await api.post("/passes", {
        studentName: user.name,
        enrollmentNo: user.enrollmentNo,
        programme: user.programme,
        discipline: user.discipline,
        semester: user.semester,
        studentMobile: user.phone,
        parentMobile: user.parentMobile,
        purpose,
        declarationAccepted,
        signatureData: signatureData || user.name,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo).toISOString(),
        timeFromMinutes: toMinutes(timeFrom),
        timeToMinutes: toMinutes(timeTo),
      });
      setSuccess(data.pass);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card">
        <h2>Request Submitted</h2>
        <p>
          Your gate pass request has been recorded on the blockchain and sent to your Program Coordinator for
          approval. You'll see live status updates on the My Passes page.
        </p>
        <button className="btn" onClick={() => navigate("/student/passes")}>
          Go to My Passes
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>New Gate Pass Request</h1>
      <p className="muted">
        {user.name} · Enrollment {user.enrollmentNo} · {user.programme}, {user.discipline}, Semester {user.semester}
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="purpose">Purpose / Location</label>
          <input
            id="purpose"
            required
            placeholder="e.g. Cyber Lab - 211"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="validFrom">Date From</label>
            <input
              id="validFrom"
              type="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="validTo">Date To</label>
            <input id="validTo" type="date" required value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            {days !== null && (
              <div className={`hint ${overLimit ? "" : ""}`} style={{ color: overLimit ? "var(--color-red)" : undefined }}>
                {overLimit
                  ? `That's ${Math.ceil(days)} days — maximum allowed is ${MAX_DAYS}.`
                  : badOrder
                  ? "Date To must be after Date From."
                  : `${Math.ceil(days)} day(s)`}
              </div>
            )}
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="timeFrom">Timing From</label>
            <input id="timeFrom" type="time" required value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="timeTo">Timing To</label>
            <input id="timeTo" type="time" required value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            {badTime && <div className="hint" style={{ color: "var(--color-red)" }}>Timing From must be earlier than Timing To.</div>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="signature">Your Signature (type your full name)</label>
          <input
            id="signature"
            required
            placeholder={user.name}
            value={signatureData}
            onChange={(e) => setSignatureData(e.target.value)}
          />
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontWeight: 400 }}>
            <input
              type="checkbox"
              style={{ width: "auto", marginTop: 4 }}
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
            />
            I will follow discipline and be responsible for any incident/damage.
          </label>
        </div>

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting to blockchain..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
