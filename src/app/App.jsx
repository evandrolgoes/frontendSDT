import { Suspense, cloneElement, isValidElement, useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ProtectedRoute } from "../routes/ProtectedRoute";
import { appRoutes, getRouteDefinition } from "../routes/routes";
import { MentoriaLandingPage } from "../pages/MentoriaLandingPage";
import { InvitationSignupPage } from "../pages/InvitationSignupPage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { DocumentTitleManager } from "./DocumentTitleManager";

export default function App() {
  const location = useLocation();
  const currentRoute = useMemo(() => getRouteDefinition(location.pathname), [location.pathname]);

  useEffect(() => {
    currentRoute?.preload?.();
    currentRoute?.warmup?.();
  }, [currentRoute]);

  return (
    <>
      <DocumentTitleManager />
      <Suspense fallback={<div className="resource-page" />}>
        <Routes>
          <Route path="/landing/landing-page-mentoria" element={<MentoriaLandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/abrir-conta/:token" element={<InvitationSignupPage />} />
          <Route element={<ProtectedRoute />}>
            {appRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={isValidElement(route.element) ? cloneElement(route.element, { key: route.path }) : route.element}
              />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/dashboard/kpis-risco-comercial" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
