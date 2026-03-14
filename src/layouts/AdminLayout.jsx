import { NavLink } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { navigationItems } from "../routes/routes";

export function AdminLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>SDT Position</h1>
          <p>Risco, hedge e exposicao multi-tenant</p>
        </div>
        <nav className="nav-list">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-area">
        <div className="topbar">
          <div>
            <div className="mono muted">Tenant</div>
            <strong>{user?.tenant_name || user?.tenant_slug || user?.tenant || "Tenant atual"}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <strong>{user?.full_name || user?.username}</strong>
              <div className="muted">{user?.email}</div>
            </div>
            <button className="btn btn-secondary" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
