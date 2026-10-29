import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "../api";
import { useAuth } from "../context/AuthContext";

const FIELDS = [
  ["name", "Full Name", "text"],
  ["email", "Email", "email"],
  ["password", "Password", "password"],
  ["phone", "Your Mobile Number", "tel"],
  ["parentMobile", "Parent's Mobile Number", "tel"],
  ["enrollmentNo", "Enrollment Number", "text"],
  ["programme", "Programme (e.g. M.Sc. CS)", "text"],
  ["discipline", "Discipline (e.g. Cyber)", "text"],
  ["semester", "Semester", "text"],
];

export default function RegisterStudent() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/register-student", form);
      login(data.user, data.token);
      navigate("/student/new");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="card login-card">
        <h1>Create Student Account</h1>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          {FIELDS.map(([key, label, type]) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                type={type}
                required
                value={form[key] || ""}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}
          <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creating account..." : "Create Account"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 18 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
