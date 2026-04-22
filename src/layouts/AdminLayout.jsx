import { Chart } from "chart.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { DashboardDebugProvider, useDashboardDebug } from "../contexts/DashboardDebugContext";
import { filterSubgroupsByGroups, useDashboardFilter } from "../contexts/DashboardFilterContext";
import { useBackgroundPrefetch } from "../hooks/useBackgroundPrefetch";
import { getNavigationSections } from "../routes/routes";

const EMPTY_FILTER = { grupo: [], subgrupo: [], cultura: [], safra: [] };

const normalizeValues = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item != null && item !== "").map((item) => String(item));
  }
  if (value == null || value === "") {
    return [];
  }
  return [String(value)];
};

const normalizeFilterDraft = (value) => ({
  grupo: normalizeValues(value?.grupo),
  subgrupo: normalizeValues(value?.subgrupo),
  cultura: normalizeValues(value?.cultura),
  safra: normalizeValues(value?.safra),
});

const DASHBOARD_DEBUG_SELECTOR = [
  "[data-dashboard-debug-region]",
  ".price-comp-pair-card",
  ".price-comp-summary-card",
  ".price-comp-toolbar",
  ".price-comp-pane",
  ".simulation-topbar",
  ".simulation-summary",
  ".simulation-grid-shell",
  ".currency-hedge-chart",
  ".cashflow-chart-card",
  ".chart-card",
  ".stat-card",
  ".resource-filter-panel",
  ".panel",
].join(", ");

const sanitizeDebugText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[↗↘]/g, "")
    .trim();

const collectUniqueTexts = (nodes, limit = 40) => {
  const values = [];
  nodes.forEach((node) => {
    const text = sanitizeDebugText(node?.textContent || "");
    if (!text || values.includes(text)) {
      return;
    }
    values.push(text);
  });
  return values.slice(0, limit);
};

const extractRegionTitle = (region) => {
  const explicitTitle = sanitizeDebugText(region?.dataset?.dashboardDebugLabel || "");
  if (explicitTitle) {
    return explicitTitle;
  }
  const titleNode = region?.querySelector(
    ".page-header-title, .price-comp-pane-title span, .price-comp-summary-header div, .simulation-topbar-title, .chart-card-title, .card h3, .card h2, .card h1, strong, legend",
  );
  return sanitizeDebugText(titleNode?.textContent || "") || "Debug dashboard";
};

const extractTables = (region) =>
  Array.from(region.querySelectorAll("table"))
    .map((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => sanitizeDebugText(cell.textContent));
      const rows = Array.from(table.querySelectorAll("tbody tr"))
        .map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => sanitizeDebugText(cell.textContent)).filter(Boolean))
        .filter((cells) => cells.length);
      if (!headers.length && !rows.length) {
        return null;
      }
      return { headers, rows };
    })
    .filter(Boolean);

const extractControls = (region) =>
  Array.from(region.querySelectorAll("label"))
    .map((label) => {
      const title = sanitizeDebugText(label.querySelector("span")?.textContent || label.textContent || "");
      const field = label.querySelector("select, input");
      if (!title || !field) {
        return null;
      }
      const value = field.tagName === "SELECT" ? field.options[field.selectedIndex]?.text || field.value : field.value || String(field.checked);
      return {
        label: title,
        value: sanitizeDebugText(value),
      };
    })
    .filter(Boolean);

const extractChartJsData = (region) =>
  Array.from(region.querySelectorAll("canvas"))
    .map((canvas) => {
      const instance = Chart.getChart(canvas);
      if (!instance) {
        return null;
      }
      return {
        type: instance.config?.type || null,
        labels: instance.data?.labels || [],
        datasets: (instance.data?.datasets || []).map((dataset) => ({
          label: dataset.label || "",
          data: Array.isArray(dataset.data) ? dataset.data : [],
        })),
      };
    })
    .filter(Boolean);

const extractSvgTexts = (region) => {
  const svgTexts = collectUniqueTexts(region.querySelectorAll("svg text"), 60);
  const priceCompTotals = Array.from(region.querySelectorAll(".price-comp-column-total, .price-comp-column-label, .price-comp-h-total, .price-comp-h-label")).map((node) =>
    sanitizeDebugText(node.textContent),
  );
  return [...new Set([...svgTexts, ...priceCompTotals].filter(Boolean))].slice(0, 80);
};

const buildGenericDebugPayload = (region, pathname) => ({
  source: "dom",
  route: pathname,
  title: extractRegionTitle(region),
  controls: extractControls(region),
  keyNumbers: collectUniqueTexts(region.querySelectorAll("strong, .price-comp-column-total, .price-comp-h-total, .price-comp-tooltip-total"), 24),
  tableData: extractTables(region),
  chartJs: extractChartJsData(region),
  svgTexts: extractSvgTexts(region),
  textPreview: collectUniqueTexts(region.querySelectorAll("span, p, small, div"), 30),
});

const POPUP_COLORS = ["#ea580c","#2563eb","#16a34a","#9333ea","#d97706","#0891b2","#dc2626","#4338ca","#0f766e","#b45309"];

function PopupChipGroup({ title, items, selectedValues, labelKey, onToggle, onClear }) {
  const selectedCount = selectedValues.length;

  return (
    <div className="pf-group">
      <div className="pf-group-header">
        <span className="pf-group-label">{title}</span>
        {selectedCount > 0 && (
          <button type="button" className="pf-clear" onClick={onClear}>Limpar</button>
        )}
      </div>
      {items.length ? (
        <div className="pf-seg-group">
          {items.map((item, i) => {
            const itemId = String(item.id);
            const isActive = selectedValues.includes(itemId);
            const color = POPUP_COLORS[i % POPUP_COLORS.length];
            return (
              <button
                key={`${title}-${itemId}`}
                type="button"
                className={`pf-seg-btn${isActive ? " is-active" : ""}`}
                style={{ "--pf-color": color }}
                onClick={() => onToggle(itemId)}
              >
                {item[labelKey]}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="pf-empty">Nenhuma opção disponível.</p>
      )}
    </div>
  );
}

function AdminLayoutShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { filter, hasActiveFilter, options, panelOpen, setPanelOpen, saveFilter, isSaving } = useDashboardFilter();
  const { enabled: dashboardDebugEnabled, setEnabled: setDashboardDebugEnabled, activeEntry, showDebugEntry, clearDebugEntry, isSuperuser } = useDashboardDebug();
  const isCashflowDashboard = ["/dashboard/fluxo-caixa", "/dashboard/fluxo-caixa-diario"].includes(location.pathname);
  const isDashboardRoute = location.pathname.startsWith("/dashboard/");
  const hideFilterButton = ["/agenda", "/agenda-clientes", "/agenda-google", "/agenda-config", "/dashboard/ranking-clientes"].some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );
  const navigationSections = useMemo(() => getNavigationSections(user), [user]);
  const mainAreaRef = useRef(null);
  const [isMobileSidebar, setIsMobileSidebar] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(navigationSections.map((section) => [section.label, false])),
  );
  const [openItems, setOpenItems] = useState({});
  const [draftFilter, setDraftFilter] = useState(() => normalizeFilterDraft(filter));

  const filterSummary = useMemo(() => {
    const summarize = (values, source, labelKey, prefix, { fallback = null } = {}) => {
      if (!values.length) return null;
      const names = source
        .filter((item) => values.includes(String(item.id)))
        .map((item) => item[labelKey])
        .filter(Boolean);
      if (!names.length) return fallback;
      return `${prefix}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? " +" + (names.length - 2) : ""}`;
    };

    const parts = [
      summarize(filter.grupo, options.groups, "grupo", "Grupo"),
      summarize(filter.subgrupo, options.subgroups, "subgrupo", "Subgrupo"),
      !isCashflowDashboard ? summarize(filter.cultura, options.crops, "ativo", "Ativo") : null,
      !isCashflowDashboard ? summarize(filter.safra, options.seasons, "safra", "Safra") : null,
    ].filter(Boolean);

    return parts.length ? parts : ["Aplique um Filtro"];
  }, [filter, isCashflowDashboard, options]);

  const floatingFilterMessage = useMemo(() => {
    const resolveNames = (values, source, labelKey) =>
      source
        .filter((item) => values.includes(String(item.id)))
        .map((item) => item[labelKey])
        .filter(Boolean);

    const compactNames = (items) => {
      if (!items.length) return "";
      return items.length > 2 ? `${items.slice(0, 2).join(", ")} +${items.length - 2}` : items.join(", ");
    };

    const groupNames = compactNames(resolveNames(filter.grupo, options.groups, "grupo"));
    const subgroupNames = compactNames(resolveNames(filter.subgrupo, options.subgroups, "subgrupo"));
    const cropNames = compactNames(resolveNames(filter.cultura, options.crops, "ativo"));
    const seasonNames = compactNames(resolveNames(filter.safra, options.seasons, "safra"));

    const primaryLine = [groupNames, subgroupNames].filter(Boolean).join(" / ") || "Grupos: todos";
    const secondaryLine = [cropNames, seasonNames].filter(Boolean).join(" ") || "Culturas e safras: todas";

    return [primaryLine, secondaryLine];
  }, [filter, options.crops, options.groups, options.seasons, options.subgroups]);

  const visibleDraftSubgroups = useMemo(
    () => filterSubgroupsByGroups(options.subgroups, draftFilter.grupo),
    [draftFilter.grupo, options.subgroups],
  );

  useEffect(() => {
    if (!panelOpen) return;
    setDraftFilter(normalizeFilterDraft(filter));
  }, [filter, panelOpen]);

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

  const toggleDraftFilterValue = (field, value) => {
    const normalizedValue = String(value ?? "");
    setDraftFilter((current) => {
      const currentValues = normalizeValues(current?.[field]);
      const nextValues = currentValues.includes(normalizedValue)
        ? currentValues.filter((item) => item !== normalizedValue)
        : [...currentValues, normalizedValue];

      const next = { ...current, [field]: nextValues };

      // Ao mudar grupos, remove subgrupos que não pertencem aos grupos selecionados
      if (field === "grupo") {
        const validSubgroups = filterSubgroupsByGroups(options.subgroups, nextValues);
        const validSubgroupIds = validSubgroups.map((s) => String(s.id));
        next.subgrupo = normalizeValues(current.subgrupo).filter((id) => validSubgroupIds.includes(id));
      }

      return next;
    });
  };

  const updateDraftFilter = (field, value) => {
    setDraftFilter((current) => ({ ...current, [field]: normalizeValues(value) }));
  };

  const applyDraftFilter = async () => {
    const nextFilter = normalizeFilterDraft(draftFilter);
    await saveFilter(nextFilter);
    setPanelOpen(false);
  };

  const handlePanelToggle = () => {
    setPanelOpen((current) => {
      const nextOpen = !current;
      if (!current) {
        setDraftFilter(normalizeFilterDraft(filter));
      }
      return nextOpen;
    });
  };

  useEffect(() => {
    setOpenSections((current) => {
      const next = Object.fromEntries(navigationSections.map((section) => [section.label, current[section.label] ?? false]));
      return next;
    });
  }, [navigationSections]);

  useEffect(() => {
    clearDebugEntry();
  }, [clearDebugEntry, location.pathname]);

  const isNavItemActive = (path) => {
    const [pathname, search = ""] = String(path || "").split("?");
    if (pathname === "/mercado/blog") {
      const blogPathActive = location.pathname === pathname || location.pathname.startsWith("/mercado/blog/");
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
      return pathname === "/mercado/blog" ? !currentSearch : true;
    }
    return currentSearch === search;
  };

  const handleDashboardDebugClick = (event) => {
    if (!dashboardDebugEnabled || !isSuperuser) {
      return;
    }
    const region = event.target instanceof Element ? event.target.closest(DASHBOARD_DEBUG_SELECTOR) : null;
    if (!region || !mainAreaRef.current?.contains(region)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    showDebugEntry({
      title: extractRegionTitle(region),
      payload: buildGenericDebugPayload(region, location.pathname),
    });
  };

  return (
    <div
      className={`app-shell${!isMobileSidebar && sidebarCollapsed ? " sidebar-collapsed" : ""}${isMobileSidebar ? " mobile-shell" : ""}${
        mobileSidebarOpen ? " mobile-sidebar-open" : ""
      }${hideFilterButton ? " fullscreen-page" : ""}`}
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
                <button type="button" className="sidebar-filter-clear top" onClick={() => setDraftFilter(EMPTY_FILTER)} disabled={isSaving}>
                  Limpar tudo
                </button>
                <button type="button" className="sidebar-filter-save" onClick={() => void applyDraftFilter()} disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Salvar e fechar"}
                </button>
              </div>
            </div>
            <div className="sidebar-filter-panel modal pf-grid">
              <PopupChipGroup title="Grupos" items={options.groups} selectedValues={draftFilter.grupo} labelKey="grupo" onToggle={(value) => toggleDraftFilterValue("grupo", value)} onClear={() => updateDraftFilter("grupo", [])} />
              <PopupChipGroup title="Subgrupos" items={visibleDraftSubgroups} selectedValues={draftFilter.subgrupo} labelKey="subgrupo" onToggle={(value) => toggleDraftFilterValue("subgrupo", value)} onClear={() => updateDraftFilter("subgrupo", [])} />
              {!isCashflowDashboard ? (
                <PopupChipGroup title="Ativos" items={options.cropBoardCrops || []} selectedValues={draftFilter.cultura} labelKey="ativo" onToggle={(value) => toggleDraftFilterValue("cultura", value)} onClear={() => updateDraftFilter("cultura", [])} />
              ) : null}
              {!isCashflowDashboard ? (
                <PopupChipGroup title="Safras" items={options.cropBoardSeasons || []} selectedValues={draftFilter.safra} labelKey="safra" onToggle={(value) => toggleDraftFilterValue("safra", value)} onClear={() => updateDraftFilter("safra", [])} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <main className={`main-area${hideFilterButton ? " no-padding" : ""}`} ref={mainAreaRef} onClickCapture={handleDashboardDebugClick}>
        <div className="dashboard-floating-actions">
          {!hideFilterButton && <button
            type="button"
            className={`dashboard-floating-filter-trigger${hasActiveFilter ? "" : " is-empty"}`}
            onClick={handlePanelToggle}
            aria-label={`Abrir filtros dos dashboards. ${filterSummary.join(" | ")}`}
            title={filterSummary.join(" | ")}
          >
            <span className="dashboard-floating-filter-copy">
              <span className="dashboard-floating-filter-text">{floatingFilterMessage[0]}</span>
              <span className="dashboard-floating-filter-text secondary">{floatingFilterMessage[1]}</span>
            </span>
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
          </button>}
          {isSuperuser && isDashboardRoute ? (
            <button
              type="button"
              className={`dashboard-floating-debug-trigger${dashboardDebugEnabled ? " active" : ""}`}
              onClick={() => {
                setDashboardDebugEnabled((current) => {
                  const next = !current;
                  if (!next) {
                    clearDebugEntry();
                  }
                  return next;
                });
              }}
              aria-label={dashboardDebugEnabled ? "Desativar debug dos dashboards" : "Ativar debug dos dashboards"}
              title={dashboardDebugEnabled ? "Desativar debug dos dashboards" : "Ativar debug dos dashboards"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6m-8 4h10m-9 0v2a4 4 0 0 0 8 0V7m-9 7h10l2 4H5l2-4Zm4 0v-2m0 8v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        {children}
        {dashboardDebugEnabled && activeEntry ? (
          <div className="component-popup-backdrop" onClick={() => clearDebugEntry()}>
            <div className="component-popup dashboard-debug-modal" onClick={(event) => event.stopPropagation()} aria-live="polite">
              <button type="button" className="component-popup-close" onClick={() => clearDebugEntry()}>
                ×
              </button>
              <div className="component-popup-header dashboard-debug-modal-header">
                <div>
                  <strong>{activeEntry.title || "Debug dashboard"}</strong>
                  <p className="muted">JSON bruto do elemento selecionado.</p>
                </div>
              </div>
              <pre>{JSON.stringify(activeEntry.payload, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function AdminLayout({ children }) {
  const { user } = useAuth();
  useBackgroundPrefetch();

  return (
    <DashboardDebugProvider isSuperuser={Boolean(user?.is_superuser)}>
      <AdminLayoutShell>{children}</AdminLayoutShell>
    </DashboardDebugProvider>
  );
}
