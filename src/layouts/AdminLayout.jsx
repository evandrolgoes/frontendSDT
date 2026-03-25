import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { getNavigationSections } from "../routes/routes";
import { resourceService } from "../services/resourceService";

function PopupChipGroup({ title, items, selectedValues, labelKey, onToggle, onClear }) {
  return (
    <section className="dashboard-chip-group dashboard-chip-group-popup">
      <div className="dashboard-chip-group-header">
        <strong>{title}</strong>
        {selectedValues.length ? (
          <button type="button" className="dashboard-chip-clear" onClick={onClear}>
            Limpar
          </button>
        ) : null}
      </div>
      <div className="dashboard-chip-list">
        {items.map((item) => (
          <button
            key={`${title}-${item.id}`}
            type="button"
            className={`dashboard-chip${selectedValues.includes(String(item.id)) ? " active" : ""}`}
            onClick={() => onToggle(String(item.id))}
          >
            {item[labelKey]}
          </button>
        ))}
      </div>
    </section>
  );
}

export function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { filter, options, panelOpen, setPanelOpen, toggleFilterValue, updateFilter, clearFilter } = useDashboardFilter();
  const navigationSections = useMemo(() => getNavigationSections(user), [user]);
  const [marketNewsCategories, setMarketNewsCategories] = useState([]);
  const [isMobileSidebar, setIsMobileSidebar] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(navigationSections.map((section) => [section.label, false])),
  );
  const [openItems, setOpenItems] = useState({});
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
      summarize(filter.cultura, options.crops, "ativo", "Ativo"),
      summarize(filter.safra, options.seasons, "safra", "Safra"),
      summarize(filter.localidade, options.localities, "label", "Localidade"),
    ].filter(Boolean);

    return parts.length ? parts : ["Consolidado geral"];
  }, [filter, options]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncViewport = () => {
      const nextIsMobile = window.innerWidth <= 768;
      setIsMobileSidebar(nextIsMobile);
      if (!nextIsMobile) {
        setMobileSidebarOpen(false);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const handleSidebarToggle = () => {
    if (isMobileSidebar) {
      setMobileSidebarOpen((current) => !current);
      return;
    }
    setSidebarCollapsed((current) => {
      const next = !current;
      if (next) {
        setPanelOpen(false);
      }
      return next;
    });
  };

  const closeSidebarForMobile = () => {
    if (isMobileSidebar) {
      setMobileSidebarOpen(false);
    }
  };

  useEffect(() => {
    setOpenSections((current) => {
      const next = Object.fromEntries(navigationSections.map((section) => [section.label, current[section.label] ?? false]));
      return next;
    });
  }, [navigationSections]);

  useEffect(() => {
    const hasBlogAccess = navigationSections.some((section) =>
      section.items.some((item) => item.path === "/mercado/blog-news"),
    );
    if (!hasBlogAccess) {
      setMarketNewsCategories([]);
      return undefined;
    }

    let active = true;
    const loadCategories = async (force = false) => {
      try {
        const items = await resourceService.listMarketNewsCategories({ force });
        if (active) {
          setMarketNewsCategories(Array.isArray(items) ? items : []);
        }
      } catch {
        if (active) {
          setMarketNewsCategories([]);
        }
      }
    };

    loadCategories();
    const handleCategoriesChanged = () => loadCategories(true);
    window.addEventListener("market-news-categories-changed", handleCategoriesChanged);
    return () => {
      active = false;
      window.removeEventListener("market-news-categories-changed", handleCategoriesChanged);
    };
  }, [navigationSections]);

  const navigationWithChildren = useMemo(
    () =>
      navigationSections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.path === "/mercado/blog-news"
            ? {
                ...item,
                children: marketNewsCategories.map((category) => ({
                  path: `/mercado/blog-news?categoria=${encodeURIComponent(category)}`,
                  label: category,
                })),
              }
            : item,
        ),
      })),
    [marketNewsCategories, navigationSections],
  );

  const isNavItemActive = (path) => {
    const [pathname, search = ""] = String(path || "").split("?");
    if (pathname === "/mercado/blog-news") {
      const blogPathActive = location.pathname === pathname || location.pathname.startsWith("/mercado/blog-news/");
      if (!blogPathActive) {
        return false;
      }
      const currentSearch = location.search.startsWith("?") ? location.search.slice(1) : location.search;
      return search ? currentSearch === search : true;
    }
    if (location.pathname !== pathname) {
      return false;
    }
    const currentSearch = location.search.startsWith("?") ? location.search.slice(1) : location.search;
    if (!search) {
      return pathname === "/mercado/blog-news" ? !currentSearch : true;
    }
    return currentSearch === search;
  };

  return (
    <div
      className={`app-shell${!isMobileSidebar && sidebarCollapsed ? " sidebar-collapsed" : ""}${isMobileSidebar ? " mobile-shell" : ""}${
        mobileSidebarOpen ? " mobile-sidebar-open" : ""
      }`}
    >
      <button
        type="button"
        className={`sidebar-collapse-fab${!isMobileSidebar && sidebarCollapsed ? " collapsed" : ""}`}
        onClick={handleSidebarToggle}
        aria-label={isMobileSidebar ? (mobileSidebarOpen ? "Fechar menu" : "Abrir menu") : sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
      >
        {isMobileSidebar ? (mobileSidebarOpen ? "×" : "☰") : sidebarCollapsed ? "›" : "‹"}
      </button>
      {isMobileSidebar && mobileSidebarOpen ? <button type="button" className="sidebar-mobile-backdrop" onClick={closeSidebarForMobile} aria-label="Fechar menu" /> : null}
      <aside className="sidebar">
        <div className="sidebar-content">
          <div className="brand">
            <h1>Hedge Position</h1>
          </div>
          <nav className="sidebar-sections">
            {navigationWithChildren.map((section) => (
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
                      <div className="nav-item-group" key={item.path}>
                        {Array.isArray(item.children) && item.children.length ? (
                          <>
                            <div className={`nav-item nav-item-expandable${isNavItemActive(item.path) ? " active" : ""}`}>
                              <NavLink
                                to={item.path}
                                className={() => "nav-item-link"}
                                onClick={() => {
                                  setOpenItems((current) => ({
                                    ...current,
                                    [item.path]: !current[item.path],
                                  }));
                                  closeSidebarForMobile();
                                }}
                              >
                                {item.label}
                              </NavLink>
                              <button
                                type="button"
                                className="nav-item-expand-toggle"
                                onClick={() =>
                                  setOpenItems((current) => ({
                                    ...current,
                                    [item.path]: !current[item.path],
                                  }))
                                }
                              >
                                {openItems[item.path] ? "−" : "+"}
                              </button>
                            </div>
                            {openItems[item.path] ? (
                              <div className="nav-sublist">
                                {item.children.map((child) => (
                                  <NavLink
                                    key={child.path}
                                    to={child.path}
                                    onClick={closeSidebarForMobile}
                                    className={() => `nav-item nav-item-subitem${isNavItemActive(child.path) ? " active" : ""}`}
                                  >
                                    {child.label}
                                  </NavLink>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <NavLink to={item.path} onClick={closeSidebarForMobile} className={() => `nav-item${isNavItemActive(item.path) ? " active" : ""}`}>
                            {item.label}
                          </NavLink>
                        )}
                      </div>
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
      {panelOpen ? (
        <div className="sidebar-filter-modal-backdrop" onClick={() => setPanelOpen(false)}>
          <div className="sidebar-filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-filter-modal-header">
              <strong>Filtro dashboards</strong>
              <div className="sidebar-filter-modal-header-actions">
                <button type="button" className="sidebar-filter-clear top" onClick={clearFilter}>
                  Limpar tudo
                </button>
                <button type="button" className="sidebar-filter-close" onClick={() => setPanelOpen(false)} aria-label="Fechar filtro">
                  ×
                </button>
              </div>
            </div>
            <div className="sidebar-filter-panel modal dashboard-filter-popup-grid">
              <PopupChipGroup title="Grupos" items={options.groups} selectedValues={filter.grupo} labelKey="grupo" onToggle={(value) => toggleFilterValue("grupo", value)} onClear={() => updateFilter("grupo", [])} />
              <PopupChipGroup title="Subgrupos" items={options.subgroups} selectedValues={filter.subgrupo} labelKey="subgrupo" onToggle={(value) => toggleFilterValue("subgrupo", value)} onClear={() => updateFilter("subgrupo", [])} />
              <PopupChipGroup title="Ativos" items={options.cropBoardCrops || []} selectedValues={filter.cultura} labelKey="ativo" onToggle={(value) => toggleFilterValue("cultura", value)} onClear={() => updateFilter("cultura", [])} />
              <PopupChipGroup title="Safras" items={options.cropBoardSeasons || []} selectedValues={filter.safra} labelKey="safra" onToggle={(value) => toggleFilterValue("safra", value)} onClear={() => updateFilter("safra", [])} />
              <PopupChipGroup title="Localidade de Referência" items={options.localities} selectedValues={filter.localidade} labelKey="label" onToggle={(value) => toggleFilterValue("localidade", value)} onClear={() => updateFilter("localidade", [])} />
            </div>
          </div>
        </div>
      ) : null}
      <main className="main-area">
        <button
          type="button"
          className="dashboard-floating-filter-trigger"
          onClick={() => setPanelOpen((current) => !current)}
          aria-label="Abrir filtros dos dashboards"
          title={filterSummary.join(" | ")}
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
        {children}
      </main>
    </div>
  );
}
