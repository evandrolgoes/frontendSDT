import { cloneElement, isValidElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../routes/ProtectedRoute";
import { appRoutes } from "../routes/routes";
import { AgroLandingPage } from "../pages/AgroLandingPage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";

export default function App() {
  return (
    <Routes>
      <Route path="/landing/traders-do-agro" element={<AgroLandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        {appRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={isValidElement(route.element) ? cloneElement(route.element, { key: route.path }) : route.element}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
