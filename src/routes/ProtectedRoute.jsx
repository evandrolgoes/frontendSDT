import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { AdminLayout } from "../layouts/AdminLayout";
import { hasModuleAccess, hasUserTypeAccess } from "../constants/accessModules";
import { getAccessibleRoutePath, getRouteDefinition } from "./routes";

export function ProtectedRoute() {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="login-page muted">Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const routeDefinition = getRouteDefinition(location.pathname);
  const blockedByRole = routeDefinition?.superuserOnly && !user?.is_superuser;
  const blockedByModule = routeDefinition && !hasModuleAccess(user, routeDefinition.module);
  const blockedByUserType = routeDefinition && !hasUserTypeAccess(user, routeDefinition.allowedUserTypes);
  if (blockedByRole || blockedByModule || blockedByUserType) {
    const fallbackPath = getAccessibleRoutePath(user);
    if (fallbackPath && fallbackPath !== location.pathname) {
      return <Navigate to={fallbackPath} replace />;
    }

    return (
      <AdminLayout>
        <div key={location.pathname} className="route-content">
          <div className="login-page muted">Seu usuario nao possui modulos habilitados para acessar esta area.</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div key={location.pathname} className="route-content">
        <Outlet />
      </div>
    </AdminLayout>
  );
}
