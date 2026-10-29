import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../../api";
import { useAuth } from "../../context/AuthContext";
import StatusBadge from "../../components/StatusBadge";

export default function MyPasses() {
  const { user } = useAuth();
  const [passes, setPasses] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/passes/student/${user.id}`)
      .then(({ data }) => setPasses(data.passes))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [user.id]);

  return (
    <div className="card">
      <h1>My Passes</h1>
      {error && <div className="error-banner">{error}</div>}
      {!passes && !error && <p className="muted">Loading...</p>}
      {passes && passes.length === 0 && <p className="muted">You haven't submitted any gate pass requests yet.</p>}
      {passes &&
        passes.map((pass) => (
          <div className="list-item" key={pass._id}>
            <div>
              <strong>{pass.purpose}</strong>
              <div className="muted">
                {new Date(pass.validFrom).toLocaleDateString()} – {new Date(pass.validTo).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <StatusBadge status={pass.cachedStatus} />
              <Link to={`/student/passes/${pass._id}`} className="btn btn-secondary">
                View
              </Link>
            </div>
          </div>
        ))}
    </div>
  );
}
