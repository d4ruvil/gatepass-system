import axios from "axios";

const DEFAULT_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Backend address is set at runtime (Login screen) so one build works on any
// network — college, home, etc. — without rebuilding. Falls back to the
// build-time default.
export function getServerUrl() {
  return localStorage.getItem("gatepass_server") || DEFAULT_URL;
}

export function setServerUrl(url) {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem("gatepass_server", clean);
  else localStorage.removeItem("gatepass_server");
}

const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getServerUrl();
  const token = localStorage.getItem("gatepass_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err) {
  return err?.response?.data?.error || err.message || "Something went wrong";
}

export default api;
