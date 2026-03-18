import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { getNavigationSections } from "../routes/routes";

function MultiFilterField({ label, value, options, optionLabelKey, onChange }) {
  return (
    <label>
      {label}
      <select
        multiple
        value={value}
        onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item[optionLabelKey]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { filter, options, panelOpen, setPanelOpen, updateFilter, clearFilter } = useDashboardFilter();
  const navigationSections = useMemo(() => getNavigationSections(user), [user]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(navigationSections.map((section) => [section.label, false])),
  );
  const filterSummary = useMemo(() => {
    const summarize = (values, source, labelKey, prefix) => {
      if (!values.length) return null;
      const names = source
        .filter((item) => values.includes(String(item.id)))
        .map((item) => item[labelKey])
        .filter(Boolean);
      if (!names.length) return null;
      return `${prefix}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? " +" + (names.length - 2) : ""}`;
    };

    const parts = [
      summarize(filter.grupo, options.groups, "grupo", "Grupo"),
      summarize(filter.subgrupo, options.subgroups, "subgrupo", "Subgrupo"),
      summarize(filter.cultura, options.crops, "cultura", "Cultura"),
      summarize(filter.safra, options.seasons, "safra", "Safra"),
      summarize(filter.localidade, options.localities, "label", "Localidade"),
    ].filter(Boolean);

    return parts.length ? parts : ["Consolidado geral"];
  }, [filter, options]);

  const handleSidebarToggle = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      if (next) {
        setPanelOpen(false);
      }
      return next;
    });
  };

  useEffect(() => {
    setOpenSections((current) => {
      const next = Object.fromEntries(navigationSections.map((section) => [section.label, current[section.label] ?? false]));
      return next;
    });
  }, [navigationSections]);

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <button
        type="button"
        className={`sidebar-collapse-fab${sidebarCollapsed ? " collapsed" : ""}`}
        onClick={handleSidebarToggle}
        aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
      >
        {sidebarCollapsed ? "›" : "‹"}
      </button>
      <aside className="sidebar">
        <div className="sidebar-content">
          <div className="brand">
            <h1>SDT Position</h1>
            <p>Risco, hedge e exposicao multi-tenant</p>
          </div>
          <div className="sidebar-dashboard-filter">
            <button
              type="button"
              className="sidebar-filter-trigger"
              onClick={() => setPanelOpen((current) => !current)}
              aria-label="Abrir filtros dos dashboards"
              title="Filtros dos dashboards"
            >
              <span className="sidebar-filter-toggle">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M3 6h18l-7 8v4l-4 2v-6L3 6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="sidebar-filter-summary">
                {filterSummary.map((item) => (
                  <span key={item} className="sidebar-filter-summary-line">
                    {item}
                  </span>
                ))}
              </span>
            </button>
          </div>
          <nav className="sidebar-sections">
            {navigationSections.map((section) => (
              <div className="nav-section" key={section.label}>
                <button
                  type="button"
                  className={`nav-section-toggle${openSections[section.label] ? " open" : ""}`}
                  onClick={() =>
                    setOpenSections((current) => ({
                      ...current,
                      [section.label]: !current[section.label],
                    }))
                  }
                >
                  <span className="nav-section-label">{section.label}</span>
                  <span className="nav-section-icon">{openSections[section.label] ? "−" : "+"}</span>
                </button>
                {openSections[section.label] ? (
                  <div className="nav-list">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-meta">
            <strong>{user?.full_name || user?.username}</strong>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button className="btn btn-secondary sidebar-logout" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      {sidebarCollapsed ? (
        <div className="sidebar-filter-floating">
          <button
            type="button"
            className="sidebar-filter-toggle floating"
            onClick={() => setPanelOpen((current) => !current)}
            aria-label="Abrir filtros dos dashboards"
            title="Filtros dos dashboards"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 6h18l-7 8v4l-4 2v-6L3 6z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : null}
      {panelOpen ? (
        <div className="sidebar-filter-modal-backdrop" onClick={() => setPanelOpen(false)}>
          <div className="sidebar-filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-filter-modal-header">
              <strong>Filtro dashboards</strong>
              <button type="button" className="sidebar-filter-close" onClick={() => setPanelOpen(false)} aria-label="Fechar filtro">
                ×
              </button>
            </div>
            <div className="sidebar-filter-panel modal">
              <MultiFilterField label="Grupo" value={filter.grupo} options={options.groups} optionLabelKey="grupo" onChange={(value) => updateFilter("grupo", value)} />
              <MultiFilterField label="Subgrupo" value={filter.subgrupo} options={options.subgroups} optionLabelKey="subgrupo" onChange={(value) => updateFilter("subgrupo", value)} />
              <MultiFilterField label="Cultura" value={filter.cultura} options={options.crops} optionLabelKey="cultura" onChange={(value) => updateFilter("cultura", value)} />
              <MultiFilterField label="Safra" value={filter.safra} options={options.seasons} optionLabelKey="safra" onChange={(value) => updateFilter("safra", value)} />
              <MultiFilterField label="Localidade" value={filter.localidade} options={options.localities} optionLabelKey="label" onChange={(value) => updateFilter("localidade", value)} />
              <div className="sidebar-filter-actions">
                <button type="button" className="sidebar-filter-clear" onClick={clearFilter}>
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <main className="main-area">
        {children}
      </main>
    </div>
  );
}
