import { useEffect, useState } from "react";
import { Navigate, useLocation, useOutlet } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { AdminLayout } from "../layouts/AdminLayout";
import { hasModuleAccess, hasUserTypeAccess } from "../constants/accessModules";
import { getAccessibleRoutePath, getRouteDefinition } from "./routes";

function KeepAliveOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const cacheKey = `${location.pathname}${location.search}`;
  const [cachedOutlets, setCachedOutlets] = useState(() => [{ key: cacheKey, element: outlet }]);

  useEffect(() => {
    setCachedOutlets((current) => {
      if (current.some((entry) => entry.key === cacheKey)) {
        return current;
      }

      return [...current, { key: cacheKey, element: outlet }];
    });
  }, [cacheKey, outlet]);

  const renderedOutlets = cachedOutlets.some((entry) => entry.key === cacheKey)
    ? cachedOutlets
    : [...cachedOutlets, { key: cacheKey, element: outlet }];

  return renderedOutlets.map((entry) => {
    const isActive = entry.key === cacheKey;

    return (
      <div
        key={entry.key}
        className="route-content"
        style={{ display: isActive ? "block" : "none" }}
        aria-hidden={isActive ? undefined : "true"}
      >
        {entry.element}
      </div>
    );
  });
}

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
        <div className="route-content">
          <div className="login-page muted">Seu usuario nao possui modulos habilitados para acessar esta area.</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <KeepAliveOutlet />
    </AdminLayout>
  );
}
