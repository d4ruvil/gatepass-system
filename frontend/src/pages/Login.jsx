import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { apiErrorMessage, getServerUrl, setServerUrl } from "../api";
import { useAuth } from "../context/AuthContext";

const HOME_BY_ROLE = {
  student: "/student/new",
  coordinator: "/approver",
  lab_incharge: "/approver",
  dean: "/approver",
  guard: "/guard",
  admin: "/admin/users",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [server, setServer] = useState(getServerUrl());
  const [serverSaved, setServerSaved] = useState(false);

  function saveServer() {
    setServerUrl(server);
    setServer(getServerUrl());
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2000);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.user, data.token);
      navigate(HOME_BY_ROLE[data.user.role] || "/");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="card login-card">
        <h1>Gate Pass Login</h1>
        <p className="muted">Sign in with the email and password your college gave you.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 18 }}>
          A student? <Link to="/register">Create an account</Link>
        </p>
        <details style={{ marginTop: 18 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>Server address</summary>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="server">Backend URL (set your college server here)</label>
            <input
              id="server"
              type="text"
              value={server}
              placeholder="http://10.0.0.5:4000/api"
              onChange={(e) => setServer(e.target.value)}
            />
          </div>
          <button type="button" className="btn" onClick={saveServer} style={{ width: "100%" }}>
            {serverSaved ? "Saved ✓" : "Save server address"}
          </button>
        </details>
      </div>
    </div>
  );
}
