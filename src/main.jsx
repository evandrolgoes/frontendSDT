import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardFilterProvider } from "./contexts/DashboardFilterContext";
import "./app/styles.css";

const RootMode = import.meta.env.DEV ? React.Fragment : React.StrictMode;

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootMode>
    <BrowserRouter>
      <AuthProvider>
        <DashboardFilterProvider>
          <App />
        </DashboardFilterProvider>
      </AuthProvider>
    </BrowserRouter>
  </RootMode>,
);
