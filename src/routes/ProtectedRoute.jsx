import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { AdminLayout } from "../layouts/AdminLayout";

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="login-page muted">Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AdminLayout>
      <div key={location.pathname} className="route-content">
        <Outlet />
      </div>
    </AdminLayout>
  );
}
