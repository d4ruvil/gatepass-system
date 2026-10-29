import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_LINKS = {
  student: [
    ["/student/new", "New Request"],
    ["/student/passes", "My Passes"],
  ],
  coordinator: [["/approver", "Pending Approvals"]],
  lab_incharge: [["/approver", "Pending Approvals"]],
  dean: [["/approver", "Pending Approvals"]],
  guard: [
    ["/guard", "Scan Pass"],
    ["/guard/recent", "Recent Scans"],
  ],
  admin: [
    ["/admin/users", "Users"],
    ["/admin/passes", "All Passes"],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const links = user ? NAV_LINKS[user.role] || [] : [];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <span className="brand">Gate Pass</span>
        <nav>
          {links.map(([to, label]) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
          {user && (
            <>
              <span>{user.name}</span>
              <button className="linklike" onClick={handleLogout}>
                Log out
              </button>
            </>
          )}
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
