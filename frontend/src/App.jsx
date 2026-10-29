import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import RegisterStudent from "./pages/RegisterStudent";
import NewRequest from "./pages/student/NewRequest";
import MyPasses from "./pages/student/MyPasses";
import PassDetail from "./pages/student/PassDetail";
import PendingQueue from "./pages/approver/PendingQueue";
import ApproverPassDetail from "./pages/approver/ApproverPassDetail";
import Scanner from "./pages/guard/Scanner";
import RecentScans from "./pages/guard/RecentScans";
import Users from "./pages/admin/Users";
import PassList from "./pages/admin/PassList";
import AuditLog from "./pages/admin/AuditLog";

const HOME_BY_ROLE = {
  student: "/student/new",
  coordinator: "/approver",
  lab_incharge: "/approver",
  dean: "/approver",
  guard: "/guard",
  admin: "/admin/users",
};

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role] || "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterStudent />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />

        <Route
          path="/student/new"
          element={
            <ProtectedRoute roles={["student"]}>
              <NewRequest />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/passes"
          element={
            <ProtectedRoute roles={["student"]}>
              <MyPasses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/passes/:id"
          element={
            <ProtectedRoute roles={["student"]}>
              <PassDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/approver"
          element={
            <ProtectedRoute roles={["coordinator", "lab_incharge", "dean"]}>
              <PendingQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approver/passes/:id"
          element={
            <ProtectedRoute roles={["coordinator", "lab_incharge", "dean"]}>
              <ApproverPassDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/guard"
          element={
            <ProtectedRoute roles={["guard", "admin"]}>
              <Scanner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guard/recent"
          element={
            <ProtectedRoute roles={["guard", "admin"]}>
              <RecentScans />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={["admin"]}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/passes"
          element={
            <ProtectedRoute roles={["admin"]}>
              <PassList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit/:onChainId"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
