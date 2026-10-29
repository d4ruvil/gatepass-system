import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useSearchParams } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";

export default function Scanner() {
  const scannerRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [logging, setLogging] = useState(false);
  const [manualId, setManualId] = useState("");
  const [params, setParams] = useSearchParams();

  // QR holds a link (?pass=<id>) or, for older QRs, a bare id; take the trailing number.
  const idFrom = (text) => text.match(/(\d+)\s*$/)?.[1] ?? text;

  useEffect(() => {
    const id = params.get("pass");
    if (id) {
      setParams({}, { replace: true });
      verify(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) return; // don't run the camera while showing a result

    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 }, false);
    scannerRef.current = scanner;

    scanner.render(
      async (decodedText) => {
        await scanner.clear();
        await verify(idFrom(decodedText.trim()));
      },
      () => {} // ignore per-frame scan failures (expected while aiming)
    );

    return () => {
      scanner.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  async function verify(passId) {
    setError("");
    try {
      const { data } = await api.get(`/verify/${passId}`);
      setResult(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (manualId.trim()) verify(manualId.trim());
  }

  async function logMovement(type) {
    setLogging(true);
    try {
      await api.post(`/logs/${type}`, { passId: result.passId });
      alert(`${type === "entry" ? "Entry" : "Exit"} logged for ${result.studentName}.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLogging(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <div className={`big-banner ${result.displayStatus.toLowerCase()}`}>{result.displayStatus}</div>
        {result.reason && <p className="center muted">{result.reason}</p>}
        {result.studentName && (
          <div style={{ marginTop: 10 }}>
            <div className="field">
              <strong>Student:</strong> {result.studentName}
            </div>
            <div className="field">
              <strong>Purpose:</strong> {result.purpose}
            </div>
            <div className="field">
              <strong>Valid:</strong> {new Date(result.validFrom).toLocaleDateString()} –{" "}
              {new Date(result.validTo).toLocaleDateString()}
            </div>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="row" style={{ marginTop: 20 }}>
          <button
            className="btn btn-green"
            disabled={result.displayStatus !== "VALID" || logging}
            onClick={() => logMovement("entry")}
          >
            Log Entry
          </button>
          <button
            className="btn btn-green"
            disabled={result.displayStatus !== "VALID" || logging}
            onClick={() => logMovement("exit")}
          >
            Log Exit
          </button>
        </div>

        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setResult(null)}>
          Scan Next Pass
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Scan Gate Pass</h1>
      <p className="muted">Point the camera at the student's QR code.</p>
      {error && <div className="error-banner">{error}</div>}
      <div id="qr-reader" />

      <div style={{ marginTop: 20, borderTop: "1px solid var(--color-border)", paddingTop: 20 }}>
        <p className="muted">Camera not working? Type the pass number printed below the QR code.</p>
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="Pass number"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            style={{ flex: 1, padding: "12px 14px", border: "2px solid var(--color-border)", borderRadius: 8 }}
          />
          <button className="btn" type="submit">
            Check
          </button>
        </form>
      </div>
    </div>
  );
}
