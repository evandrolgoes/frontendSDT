import { Suspense, cloneElement, isValidElement, useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ProtectedRoute } from "../routes/ProtectedRoute";
import { appRoutes, publicAppRoutes } from "../routes/routes";
import { MentoriaLandingPage } from "../pages/MentoriaLandingPage";
import { MentoriaPlansLandingPage } from "../pages/MentoriaPlansLandingPage";
import { InvitationSignupPage } from "../pages/InvitationSignupPage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { DocumentTitleManager } from "./DocumentTitleManager";

function ScrollManager() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) {
      return undefined;
    }
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  const location = useLocation();

  return (
    <>
      <DocumentTitleManager />
      <ScrollManager />
      <Suspense fallback={<div className="resource-page" />}>
        <Routes>
          <Route path="/landing/landing-page-mentoria" element={<MentoriaLandingPage />} />
          <Route path="/landing/mentoria-planos" element={<MentoriaPlansLandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/abrir-conta/:token" element={<InvitationSignupPage />} />
          <Route element={<ProtectedRoute />}>
            {[...publicAppRoutes, ...appRoutes].map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={isValidElement(route.element) ? cloneElement(route.element, { key: route.path }) : route.element}
              />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/resumo" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
