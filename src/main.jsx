import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardFilterProvider } from "./contexts/DashboardFilterContext";
import "./app/styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DashboardFilterProvider>
          <App />
        </DashboardFilterProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
