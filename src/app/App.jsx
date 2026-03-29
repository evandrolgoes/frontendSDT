import { Suspense, cloneElement, isValidElement, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import { appRoutes, getNavigationSections, getRouteDefinition } from "../routes/routes";
import { MentoriaLandingPage } from "../pages/MentoriaLandingPage";
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
  const { isAuthenticated, user } = useAuth();
  const currentRoute = useMemo(() => getRouteDefinition(location.pathname), [location.pathname]);
  const postSummaryWarmupStartedRef = useRef(false);

  useEffect(() => {
    currentRoute?.preload?.();
    currentRoute?.warmup?.();
  }, [currentRoute]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = 0;
    let idleId = 0;

    const handleSummaryReady = () => {
      if (postSummaryWarmupStartedRef.current) {
        return;
      }
      postSummaryWarmupStartedRef.current = true;

      const accessiblePaths = new Set(
        getNavigationSections(user)
          .flatMap((section) => section.items)
          .map((item) => item.path),
      );

      const routesToWarm = appRoutes.filter(
        (route) => route.path !== currentRoute?.path && accessiblePaths.has(route.path),
      );

      const warmSequentially = () => {
        let index = 0;

        const runNext = () => {
          if (cancelled || index >= routesToWarm.length) {
            return;
          }
          const route = routesToWarm[index];
          index += 1;
          route.preload?.();
          route.warmup?.();
          timeoutId = window.setTimeout(runNext, 250);
        };

        runNext();
      };

      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(warmSequentially, { timeout: 1500 });
      } else {
        timeoutId = window.setTimeout(warmSequentially, 600);
      }
    };

    window.addEventListener("sdt:summary-ready", handleSummaryReady);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if ("cancelIdleCallback" in window && idleId) {
        window.cancelIdleCallback(idleId);
      }
      window.removeEventListener("sdt:summary-ready", handleSummaryReady);
    };
  }, [currentRoute?.path, isAuthenticated, user]);

  return (
    <>
      <DocumentTitleManager />
      <ScrollManager />
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
