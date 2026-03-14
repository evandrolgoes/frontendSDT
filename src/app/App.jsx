import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../routes/ProtectedRoute";
import { appRoutes } from "../routes/routes";
import { LoginPage } from "../pages/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
