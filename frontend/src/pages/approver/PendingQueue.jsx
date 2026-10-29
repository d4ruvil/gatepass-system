import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import { useAuth } from "../../context/AuthContext";

export default function PendingQueue() {
  const { user } = useAuth();
  const [passes, setPasses] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/passes/pending/${user.role}`)
      .then(({ data }) => setPasses(data.passes))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [user.role]);

  return (
    <div className="card">
      <h1>Pending Approvals</h1>
      <p className="muted">Requests waiting for your decision, oldest first.</p>
      {error && <div className="error-banner">{error}</div>}
      {!passes && !error && <p className="muted">Loading...</p>}
      {passes && passes.length === 0 && <p className="muted">Nothing waiting on you right now.</p>}
      {passes &&
        passes.map((pass) => (
          <div className="list-item" key={pass._id}>
            <div>
              <strong>{pass.studentName}</strong> ({pass.student?.enrollmentNo})
              <div className="muted">
                {pass.purpose} · {new Date(pass.validFrom).toLocaleDateString()} –{" "}
                {new Date(pass.validTo).toLocaleDateString()}
              </div>
            </div>
            <Link to={`/approver/passes/${pass._id}`} className="btn">
              Review
            </Link>
          </div>
        ))}
    </div>
  );
}
