import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DatePickerField } from "../components/DatePickerField";
import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { InfoPopup } from "../components/InfoPopup";
import { PageHeader } from "../components/PageHeader";
import { ResourceTable } from "../components/ResourceTable";
import { ResourceForm } from "../components/ResourceForm";
import { useAuth } from "../contexts/AuthContext";
import { filterSubgroupsByGroups, rowMatchesDashboardFilter, useDashboardFilter } from "../contexts/DashboardFilterContext";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate } from "../utils/date";

const LazyReactECharts = lazy(() => import("echarts-for-react"));

function ReactECharts(props) {
  return (
    <Suspense fallback={<div className="dashboard-chart-lazy-placeholder" style={props.style} aria-hidden="true" />}>
      <LazyReactECharts {...props} />
    </Suspense>
  );
}

const formatNumber = (value, suffix = "") => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`;
const COMMERCIAL_RISK_DERIVATIVE_COLORS = ["#0f766e", "#2563eb", "#ea580c", "#7c3aed", "#dc2626", "#0891b2", "#65a30d", "#d97706"];
const CHART_BAR_RADIUS = 2;
const CASHFLOW_DEFAULT_PAST_DAYS = 30;
const CASHFLOW_DEFAULT_FUTURE_DAYS = 365;
const CASHFLOW_DAILY_DEFAULT_FUTURE_DAYS = 90;
const CASHFLOW_DAILY_SLIDER_MIN = -365;
const CASHFLOW_DAILY_SLIDER_MAX = 730;
const EMPTY_DASHBOARD_FILTER_ARRAY = [];
const DEFAULT_COMMERCIAL_RISK_SUMMARY_DATA = {
  productionSummary: {
    productionTotal: 0,
    totalArea: 0,
    physicalPaymentVolume: 0,
    netProductionVolume: 0,
  },
  marketQuotes: [],
  marketNewsPosts: [],
  upcomingMaturityRows: [],
  formCompletionRows: [],
  formCompletionSummary: {
    totalForms: 0,
    filledForms: 0,
    pendingForms: 0,
    totalRecords: 0,
  },
};
const commercialRiskDashboardCache = new Map();
const dashboardPageStateCache = new Map();

// Persists between React Router navigations; resets only on hard page refresh
const cashflowDataCache = { data: null };

const normalizeCommercialRiskFilter = (filter = {}) =>
  ["grupo", "subgrupo", "cultura", "safra"].reduce((acc, key) => {
    acc[key] = [...(filter?.[key] || [])].map(String).sort();
    return acc;
  }, {});

const resolveCommercialRiskTenantKey = (user) => {
  if (user?.tenant_id != null) return user.tenant_id;
  if (user?.tenant?.id != null) return user.tenant.id;
  if (typeof user?.tenant === "string" || typeof user?.tenant === "number") return user.tenant;
  return "tenant";
};

const buildCommercialRiskDashboardCacheKey = (filter, user) =>
  JSON.stringify({
    user: user?.id ?? user?.email ?? user?.username ?? "anon",
    tenant: resolveCommercialRiskTenantKey(user),
    filter: normalizeCommercialRiskFilter(filter),
  });

const getCommercialRiskDashboardCache = (cacheKey) => commercialRiskDashboardCache.get(cacheKey) || null;

const setCommercialRiskDashboardCache = (cacheKey, patch) => {
  if (!cacheKey) return;
  const current = commercialRiskDashboardCache.get(cacheKey) || {};
  commercialRiskDashboardCache.set(cacheKey, { ...current, ...patch, savedAt: Date.now() });
};

const buildDashboardPageCacheKey = (scope, filter, user) =>
  JSON.stringify({
    scope,
    user: user?.id ?? user?.email ?? user?.username ?? "anon",
    tenant: resolveCommercialRiskTenantKey(user),
    filter: normalizeCommercialRiskFilter(filter),
  });

const getDashboardPageCache = (cacheKey) => dashboardPageStateCache.get(cacheKey) || null;

const setDashboardPageCache = (cacheKey, patch) => {
  if (!cacheKey) return;
  const current = dashboardPageStateCache.get(cacheKey) || {};
  dashboardPageStateCache.set(cacheKey, { ...current, ...patch, savedAt: Date.now() });
};

const shiftDateByDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const shiftDateByYears = (value, years) => {
  const date = new Date(value);
  date.setFullYear(date.getFullYear() + years);
  return date;
};

const formatIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatShortBrazilianDate = (value) => {
  const date = parseDashboardDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
};

const formatCashflowDailyTableDate = (value) => {
  const date = parseDashboardDate(value);
  if (!date) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "")
    .toLowerCase();
  return `${day}/${month}/${year} (${weekday})`;
};

const formatCashflowMonthYear = (value) => {
  const date = parseDashboardDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  })
    .format(date)
    .replace(".", "")
    .toLowerCase();
};

const buildCashflowDefaultDateRange = (today = new Date()) => ({
  fromBrazilian: formatBrazilianDate(shiftDateByDays(today, -CASHFLOW_DEFAULT_PAST_DAYS)),
  toBrazilian: formatBrazilianDate(shiftDateByDays(today, CASHFLOW_DEFAULT_FUTURE_DAYS)),
  startIso: formatIsoDate(shiftDateByDays(today, -CASHFLOW_DEFAULT_PAST_DAYS)),
  endIso: formatIsoDate(shiftDateByDays(today, CASHFLOW_DEFAULT_FUTURE_DAYS)),
});

const buildCashflowDailyDefaultDateRange = (today = new Date()) => ({
  startIso: formatIsoDate(shiftDateByDays(today, -7)),
  endIso: formatIsoDate(shiftDateByDays(today, CASHFLOW_DAILY_DEFAULT_FUTURE_DAYS)),
});

const buildComponentSalesDefaultDateRange = (today = new Date()) => ({
  fromBrazilian: formatBrazilianDate(shiftDateByDays(today, -30)),
  toBrazilian: formatBrazilianDate(shiftDateByYears(today, 1)),
  startIso: formatIsoDate(shiftDateByDays(today, -30)),
  endIso: formatIsoDate(shiftDateByYears(today, 1)),
});

const formatCompactPostDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildCompactExcerpt = (value, maxLength = 96) => {
  const excerpt = stripHtml(value);
  if (!excerpt) return "Sem conteúdo publicado ainda.";
  return excerpt.length > maxLength ? `${excerpt.slice(0, maxLength - 3)}...` : excerpt;
};

const formatQuoteNumber = (value, digits = 2) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatSignedQuoteNumber = (value, digits = 2) => {
  const parsed = Number(value || 0);
  const signal = parsed > 0 ? "+" : parsed < 0 ? "-" : "";
  return `${signal}${Math.abs(parsed).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const parseLocalizedNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  else if (hasComma) normalized = raw.replace(/,/g, ".");
  else if (hasDot) normalized = raw.split(".").length === 2 ? raw : raw.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const useViewportMatch = (query) => {
  const getMatches = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => {
      setMatches(event.matches);
    };

    setMatches(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [query]);

  return matches;
};

function SummaryInsightButton({ title = "Insight do card", message, className = "" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`summary-insight-button${className ? ` ${className}` : ""}`}
        aria-label={`Abrir explicação do card ${title}`}
        title="Ver explicação do card"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5 13.7 8l4.8 1.8-4.8 1.7L12 16l-1.7-4.5L5.5 9.8 10.3 8 12 3.5Z" fill="currentColor" />
          <path d="M18.5 13.5 19.4 16l2.6.9-2.6.9-.9 2.5-.9-2.5-2.6-.9 2.6-.9.9-2.5Z" fill="currentColor" opacity="0.82" />
          <path d="M6.5 14.5 7.2 16.3 9 17l-1.8.7-.7 1.8-.7-1.8L4 17l1.8-.7.7-1.8Z" fill="currentColor" opacity="0.82" />
        </svg>
      </button>
      <InfoPopup open={open} title={title} message={message} onClose={() => setOpen(false)} />
    </>
  );
}

function SummaryInsightCopy({ paragraphs = [] }) {
  return (
    <div className="summary-insight-copy">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>
      ))}
    </div>
  );
}

const HEDGE_CULTURE_SERIES_COLORS = ["#0f766e", "#2563eb", "#ea580c", "#9333ea", "#0891b2", "#d97706"];

const parseSeason = (badge) => {
  if (!badge) return 0;
  const match = String(badge).match(/(\d{2})[\/\-](\d{2})/);
  return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
};

function HedgeByCultureChart({ rows, insightTitle, insightMessage }) {
  const cultures = useMemo(() => [...new Set(rows.map((r) => r.label))], [rows]);
  const seasons = useMemo(
    () => {
      const seasonItems = [...new Set(rows.map((r) => r.badge).filter(Boolean))].sort((a, b) => parseSeason(a) - parseSeason(b));
      return seasonItems.length ? seasonItems : ["Hedge"];
    },
    [rows],
  );

  const [expanded, setExpanded] = useState(false);
  const findCultureRow = useCallback(
    (culture, season) => rows.find((r) => r.label === culture && (r.badge === season || (!r.badge && season === "Hedge"))),
    [rows],
  );
  const renderChart = (large = false) => (
    <div className={`hedge-culture-list${large ? " is-large" : ""}`}>
      {seasons.map((season) => (
        <div key={season} className="hedge-culture-group">
          <div className="hedge-culture-group-season">{season}</div>
          <div className="hedge-culture-group-bars">
            {cultures.map((culture, cultureIndex) => {
              const row = findCultureRow(culture, season);
              if (!row) return null;
              const value = Math.max(0, Math.min(Number(row.progress || 0), 100));
              const color = HEDGE_CULTURE_SERIES_COLORS[cultureIndex % HEDGE_CULTURE_SERIES_COLORS.length];
              const Tag = row.onClick ? "button" : "div";
              return (
                <Tag
                  key={`${season}-${culture}`}
                  type={Tag === "button" ? "button" : undefined}
                  className={`hedge-culture-row${row.isActive ? " is-active" : ""}${row.onClick ? " is-clickable" : ""}`}
                  title={`${culture} · ${season}: ${Math.round(value)}%`}
                  onClick={row.onClick}
                >
                  <span className="hedge-culture-row-label">{culture}</span>
                  <span className="hedge-culture-row-inner">
                    <span className="hedge-culture-row-track">
                      <span className="hedge-culture-row-bar" style={{ width: `${value}%`, background: color }} />
                    </span>
                    <span className="hedge-culture-row-value">{Math.round(value)}%</span>
                  </span>
                </Tag>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <article className="chart-card risk-kpi-executive-card risk-kpi-executive-card--neutral summary-insight-card hedge-culture-chart-card">
        {insightMessage ? <SummaryInsightButton title={insightTitle} message={insightMessage} /> : null}
        <div className="risk-kpi-executive-card-head">
          <div><h3>Hedge por cultura <span className="hedge-culture-filter-hint">clique para filtrar</span></h3></div>
        </div>
        <button type="button" className="hedge-culture-expand-btn" onClick={() => setExpanded(true)} title="Maximizar gráfico" aria-label="Maximizar gráfico">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
        {rows.length ? (
          <div className="hedge-culture-chart-wrap">
            {renderChart(false)}
          </div>
        ) : (
          <p className="hedge-culture-chart-empty">Carregando... Aguarde.</p>
        )}
      </article>
      {expanded ? (
        <div className="hedge-culture-modal-backdrop" onClick={() => setExpanded(false)}>
          <div className="hedge-culture-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hedge-culture-modal-header">
              <h2>Hedge por cultura</h2>
              <button type="button" className="hedge-culture-modal-close" onClick={() => setExpanded(false)} aria-label="Fechar">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="hedge-culture-modal-body">
              {renderChart(true)}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CommercialRiskExecutiveCard({
  title,
  subtitle = "",
  emphasis = "—",
  tone = "neutral",
  rows = [],
  insightTitle,
  insightMessage,
}) {
  return (
    <article className={`chart-card risk-kpi-executive-card risk-kpi-executive-card--${tone} summary-insight-card`}>
      {insightMessage ? <SummaryInsightButton title={insightTitle || title} message={insightMessage} /> : null}
      <div className="risk-kpi-executive-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {emphasis != null ? <strong>{emphasis}</strong> : null}
      </div>
      <div className="risk-kpi-executive-table">
        {rows.map((row) => {
          const RowTag = typeof row.onClick === "function" ? "button" : "div";
          const hasProgress = Number.isFinite(row.progress);
          return (
            <RowTag
              key={`${title}-${row.label}-${row.badge || ""}`}
              type={RowTag === "button" ? "button" : undefined}
              className={`risk-kpi-executive-row${row.onClick ? " risk-kpi-executive-row-button" : ""}${row.isActive ? " is-active" : ""}${hasProgress ? " has-progress" : ""}`}
              onClick={row.onClick}
            >
              <div>
                <span className="risk-kpi-executive-row-title">
                  <span>{row.label}</span>
                  {row.badge ? <em>{row.badge}</em> : null}
                </span>
                {row.note ? <small>{row.note}</small> : null}
              </div>
              <b>{row.value}</b>
              {hasProgress ? (
                <span className="risk-kpi-executive-progress" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(Number(row.progress || 0), 100))}%` }} />
                </span>
              ) : null}
            </RowTag>
          );
        })}
      </div>
    </article>
  );
}

function CommercialRiskQuotesSummaryCard({ rows, onOpen }) {
  const marqueeRepeatCount = 7;
  const marqueeCenterSequenceIndex = Math.floor(marqueeRepeatCount / 2);
  const marqueeRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const marqueeSequenceRef = useRef(null);
  const marqueeDragStateRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });
  const [isMarqueeInteracting, setIsMarqueeInteracting] = useState(false);
  const carouselRows = useMemo(() => {
    const sectionStats = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const label = String(row?.section_name || "Sem secao").trim() || "Sem secao";
      const normalizedLabel = label.toLowerCase();
      if (!row?.ticker || row?.price === null || row?.price === undefined) {
        return acc;
      }
      if (!normalizedLabel || ["indices", "índices", "soja b3", "sem secao"].includes(normalizedLabel)) {
        return acc;
      }
      if (!acc[label]) {
        acc[label] = { label, firstRow: row };
        return acc;
      }
      const currentFirstOrder = Number(acc[label].firstRow?.sort_order || Number.MAX_SAFE_INTEGER);
      const nextOrder = Number(row?.sort_order || Number.MAX_SAFE_INTEGER);
      if (nextOrder < currentFirstOrder) {
        acc[label].firstRow = row;
      }
      return acc;
    }, {});

    return Object.values(sectionStats).map((item) => ({
      key: item.label,
      label: item.label,
      search: item.label,
      firstRow: item.firstRow,
    }));
  }, [rows]);
  const marqueeRows = useMemo(
    () => (carouselRows.length > 1 ? Array.from({ length: marqueeRepeatCount }, () => carouselRows) : [carouselRows]),
    [carouselRows, marqueeRepeatCount],
  );

  const getMarqueeLoopWidth = () => {
    const track = marqueeTrackRef.current;
    const sequence = marqueeSequenceRef.current;
    if (!track || !sequence || typeof window === "undefined") {
      return 0;
    }

    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    return sequence.offsetWidth + gap;
  };

  const normalizeMarqueeScroll = () => {
    const container = marqueeRef.current;
    const loopWidth = getMarqueeLoopWidth();
    if (!container || !loopWidth) {
      return;
    }

    const minScroll = loopWidth;
    const maxScroll = Math.max(loopWidth * (marqueeRows.length - 2), minScroll);

    while (container.scrollLeft >= maxScroll) {
      container.scrollLeft -= loopWidth;
    }

    while (container.scrollLeft < minScroll) {
      container.scrollLeft += loopWidth;
    }
  };

  const beginMarqueeInteraction = (clientX, scrollLeft) => {
    marqueeDragStateRef.current = {
      active: true,
      moved: false,
      startX: clientX,
      startScrollLeft: scrollLeft,
    };
  };

  const handleMarqueeMouseDown = (event) => {
    const container = marqueeRef.current;
    if (!container || carouselRows.length <= 1 || event.button !== 0) {
      return;
    }
    beginMarqueeInteraction(event.clientX, container.scrollLeft);
  };

  const handleMarqueeMouseMove = (event) => {
    const container = marqueeRef.current;
    const drag = marqueeDragStateRef.current;
    if (!container || !drag.active) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }
    if (!drag.moved) {
      marqueeDragStateRef.current = { ...drag, moved: true };
      setIsMarqueeInteracting(true);
    }
    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  const stopMarqueeInteraction = () => {
    marqueeDragStateRef.current = {
      active: false,
      moved: false,
      startX: 0,
      startScrollLeft: marqueeRef.current?.scrollLeft || 0,
    };
    setIsMarqueeInteracting(false);
  };

  const handleMarqueeMouseLeave = () => {
    stopMarqueeInteraction();
  };

  const handleMarqueeTouchStart = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    if (!container || !touch || carouselRows.length <= 1) {
      return;
    }
    beginMarqueeInteraction(touch.clientX, container.scrollLeft);
  };

  const handleMarqueeTouchMove = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    const drag = marqueeDragStateRef.current;
    if (!container || !touch || !drag.active) {
      return;
    }
    const deltaX = touch.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }
    if (!drag.moved) {
      marqueeDragStateRef.current = { ...drag, moved: true };
      setIsMarqueeInteracting(true);
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  const handleMarqueeTouchEnd = () => {
    stopMarqueeInteraction();
  };

  useEffect(() => {
    if (carouselRows.length <= 1) {
      const container = marqueeRef.current;
      if (container) {
        container.scrollLeft = 0;
      }
      return undefined;
    }

    const container = marqueeRef.current;
    if (!container || typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      normalizeMarqueeScroll();
    };

    const loopWidth = getMarqueeLoopWidth();
    const startingScroll = loopWidth * marqueeCenterSequenceIndex;
    if (loopWidth && container.scrollLeft < loopWidth) {
      container.scrollLeft = startingScroll;
    }
    normalizeMarqueeScroll();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [carouselRows.length, marqueeCenterSequenceIndex, marqueeRows.length]);

  useEffect(() => {
    if (carouselRows.length <= 1 || isMarqueeInteracting) {
      return undefined;
    }
    const container = marqueeRef.current;
    if (!container || typeof window === "undefined") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden" || marqueeDragStateRef.current.active) {
        return;
      }
      container.scrollLeft += 1.8;
      normalizeMarqueeScroll();
    }, 32);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [carouselRows.length, isMarqueeInteracting, marqueeRows.length]);

  return (
    <section className="resource-filter-panel risk-kpi-quotes-strip summary-insight-card">
      <SummaryInsightButton
        title="Cotações rápidas"
        message={
          <SummaryInsightCopy
            paragraphs={[
              "Em cada mini card, o número central representa o preço atual da referência de mercado daquele grupo.",
              "A linha de baixo mostra a variação do dia ou do período da fonte, primeiro em valor absoluto e depois em percentual entre parênteses. Ao clicar no card, você segue para a página completa de cotações.",
            ]}
          />
        }
      />
      {carouselRows.length ? (
        <div
          ref={marqueeRef}
          className={`resource-filter-marquee risk-kpi-quotes-strip-marquee${isMarqueeInteracting ? " is-interacting" : ""}`}
          onMouseDown={handleMarqueeMouseDown}
          onMouseMove={handleMarqueeMouseMove}
          onMouseUp={stopMarqueeInteraction}
          onMouseLeave={handleMarqueeMouseLeave}
          onTouchStart={handleMarqueeTouchStart}
          onTouchMove={handleMarqueeTouchMove}
          onTouchEnd={handleMarqueeTouchEnd}
          onTouchCancel={handleMarqueeTouchEnd}
          onScroll={normalizeMarqueeScroll}
        >
          <div ref={marqueeTrackRef} className="resource-filter-track">
            {marqueeRows.map((sequence, sequenceIndex) => (
              <div
                key={`risk-kpi-quotes-sequence-${sequenceIndex}`}
                ref={sequenceIndex === 0 ? marqueeSequenceRef : undefined}
                className="resource-filter-sequence"
                aria-hidden={sequenceIndex > 0 ? "true" : undefined}
              >
                {sequence.map((item) => {
                  const changeValue = parseLocaleNumber(item.firstRow?.change_value);
                  const toneClass = changeValue > 0 ? " is-positive" : changeValue < 0 ? " is-negative" : "";
                  return (
                    <button
                      type="button"
                      className="resource-filter-card risk-kpi-quotes-strip-card"
                      key={`${item.key || item.label}-${sequenceIndex}`}
                      onClick={onOpen}
                    >
                      <span className="resource-filter-card-label">{item.label}</span>
                      <strong>{item.firstRow?.price !== null && item.firstRow?.price !== undefined ? formatQuoteNumber(item.firstRow.price, 2) : "—"}</strong>
                      <span className={`resource-filter-card-variation${toneClass}`}>
                        {item.firstRow?.change_value !== null && item.firstRow?.change_value !== undefined
                          ? `${formatSignedQuoteNumber(item.firstRow.change_value, 2)} (${formatSignedQuoteNumber(item.firstRow.change_percent, 2)}%)`
                          : "Sem variacao"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="risk-kpi-link-card-empty">Nenhuma cotação disponível no momento.</div>
      )}
    </section>
  );
}

function CommercialRiskNewsSummaryCard({ rows, onOpen, onOpenPost }) {
  const latestPosts = useMemo(() => {
    const published = (Array.isArray(rows) ? rows : []).filter((item) => item?.status_artigo !== "draft");
    const source = published.length ? published : (Array.isArray(rows) ? rows : []);
    return [...source]
      .sort((left, right) => new Date(right?.data_publicacao || right?.created_at || 0) - new Date(left?.data_publicacao || left?.created_at || 0))
      .slice(0, 12);
  }, [rows]);

  return (
    <div className="card stat-card risk-kpi-news-stat-card summary-insight-card">
      <SummaryInsightButton
        title="Blog"
        message={
          <SummaryInsightCopy
            paragraphs={[
              "Este card não traz valores financeiros; aqui os números são datas abreviadas de publicação para mostrar a recência de cada análise.",
              "Ele serve como ponte entre os indicadores do resumo e a leitura qualitativa do mercado. Ao clicar em um item, você abre a prévia do conteúdo; ao clicar no título, vai para a área completa do blog.",
            ]}
          />
        }
      />
      <button type="button" className="stat-card-primary-title risk-kpi-card-title risk-kpi-news-stat-title" onClick={onOpen}>
        Blog
      </button>
      <div className="risk-kpi-news-stat-list">
        {latestPosts.length ? (
          latestPosts.map((post) => (
            <button type="button" className="risk-kpi-news-stat-item" key={post.id} onClick={() => onOpenPost?.(post)}>
              <div className="risk-kpi-news-date">{formatCompactPostDate(post.data_publicacao || post.created_at) || "Sem data"}</div>
              <div className="risk-kpi-news-stat-content">
                <strong>{post.titulo || "Sem título"}</strong>
              </div>
            </button>
          ))
        ) : (
          <div className="risk-kpi-link-card-empty">Nenhum post disponível no momento.</div>
        )}
      </div>
    </div>
  );
}

const navigateFromSummary = (navigate, path, destinationLabel = "") => {
  if (!path) return;
  if (typeof window !== "undefined") {
    const destination = destinationLabel || "destino";
    const shouldNavigate = window.confirm(`Deseja ir para a página de ${destination}?`);
    if (!shouldNavigate) {
      return;
    }
  }
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  navigate(path);
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }
};

const formatMarketNewsPostDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getMarketNewsAttachmentUrl = (attachment) => attachment?.file_url || attachment?.file || "";

const isMarketNewsImageAttachment = (attachment) => {
  const mimeType = String(attachment?.stored_content_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(`${attachment?.original_name || ""} ${getMarketNewsAttachmentUrl(attachment)}`);
};

function MarketNewsPreviewModal({ post, attachments, attachmentsLoading, onClose }) {
  const [audioRate, setAudioRate] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    setAudioRate(1);
  }, [post?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioRate;
    }
  }, [audioRate, post?.id]);

  useEffect(() => {
    if (!post) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, post]);

  if (!post) return null;

  return (
    <div className="risk-kpi-news-preview-backdrop" onClick={onClose}>
      <div className="risk-kpi-news-preview-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="risk-kpi-news-preview-close" onClick={onClose} aria-label="Fechar artigo">
          ×
        </button>
        <article className="market-news-detail risk-kpi-news-preview-article">
          <header className="risk-kpi-news-preview-header">
            <h2>{post.titulo || "News"}</h2>
            <div className="market-news-detail-meta">
              <div className="market-news-detail-badges">
                {(Array.isArray(post.categorias) ? post.categorias : []).map((category) => (
                  <span className="market-news-badge" key={category}>
                    {category}
                  </span>
                ))}
              </div>
              <div className="market-news-detail-submeta">
                <span>Por: {post.published_by_name || post.created_by_name || "Equipe"}</span>
                <span>Publicado em: {formatMarketNewsPostDate(post.data_publicacao || post.created_at)}</span>
              </div>
            </div>
          </header>

          {attachmentsLoading ? <div className="market-news-empty">Carregando anexos...</div> : null}
          {!attachmentsLoading && attachments.length ? (
            <div className="market-news-attachments-card">
              <strong>Anexos</strong>
              <div className="market-news-attachments-list">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="market-news-attachment-item">
                    {isMarketNewsImageAttachment(attachment) ? (
                      <img className="market-news-attachment-preview" src={getMarketNewsAttachmentUrl(attachment)} alt={attachment.original_name} />
                    ) : null}
                    <a href={getMarketNewsAttachmentUrl(attachment)} target="_blank" rel="noreferrer" className="market-news-attachment-link">
                      {attachment.original_name}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {post.audio ? (
            <div className="market-news-audio-card">
              <div className="market-news-audio-header">
                <strong>Audio do post</strong>
                <div className="market-news-audio-rates">
                  {[1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      className={`market-news-audio-rate${audioRate === rate ? " is-active" : ""}`}
                      onClick={() => setAudioRate(rate)}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
              <audio ref={audioRef} controls src={post.audio} className="market-news-audio-player" />
            </div>
          ) : null}

          <div className="market-news-content" dangerouslySetInnerHTML={{ __html: post.conteudo_html || "" }} />
          {!stripHtml(post.conteudo_html || "").length ? <div className="market-news-empty">Este post ainda não possui conteúdo.</div> : null}
        </article>
      </div>
    </div>
  );
}

const MATURITY_APP_COLORS = {
  "Derivativos": "#2563eb",
  "Vendas Fisico": "#0f766e",
  "Empréstimos": "#dc2626",
  "Pgtos Fisico": "#ea580c",
};

// Parse Brazilian-formatted value label back to number:
// "+ U$ 6.125,00" → 6125 | "- R$ 3.000,00" → -3000 | "R$ 9.000.000,00" → 9000000
const parseMaturityValueLabel = (label = "") => {
  if (!label || label === "—") return 0;
  const hasMinus = label.trimStart().startsWith("-");
  const numStr = label
    .replace(/[+\-]/g, "")
    .replace(/[^0-9,.]/g, "")
    .trim();
  if (!numStr) return 0;
  const normalized = numStr.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? (hasMinus ? -n : n) : 0;
};

function UpcomingMaturitiesCard({ rows, onOpenItem, usdBrlRate = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoveredItemKey, setHoveredItemKey] = useState(null);
  const [currencyMode, setCurrencyMode] = useState("original"); // "original" | "brl"
  const echartsRef = useRef(null);

  const dates = useMemo(
    () => [...new Set(rows.map((r) => r.dateText))].sort((a, b) => {
      const parse = (d) => d.split("/").reverse().join("-");
      return parse(a) < parse(b) ? -1 : 1;
    }),
    [rows],
  );

  const apps = useMemo(() => [...new Set(rows.map((r) => r.app))], [rows]);

  // Converte valor numérico de uma row para a moeda selecionada
  const resolveChartValue = useCallback((rawValue, valueLabel) => {
    if (currencyMode === "brl") {
      const isUsd = String(valueLabel || "").includes("U$");
      return isUsd && usdBrlRate > 0 ? rawValue * usdBrlRate : rawValue;
    }
    return rawValue;
  }, [currencyMode, usdBrlRate]);

  const fmtChartValue = useCallback((v) => {
    const n = Number(v || 0);
    const abs = Math.abs(n);
    const sign = n < 0 ? "−" : "+";
    const symbol = currencyMode === "brl" ? "R$" : "";
    if (abs >= 1_000_000) return `${sign} ${symbol} ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`.trim();
    if (abs >= 1_000) return `${sign} ${symbol} ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`.trim();
    if (abs > 0) return `${sign} ${symbol} ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`.trim();
    return `${symbol} 0`.trim();
  }, [currencyMode]);

  const chartOption = useMemo(() => {
    if (!expanded || !rows.length) return null;

    const appColorFallbacks = Object.values(MATURITY_APP_COLORS);
    const yAxisLabel = currencyMode === "brl" ? "R$" : "";

    return {
      animationDuration: 220,
      grid: { left: 8, right: 8, top: 36, bottom: 48, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "transparent",
        padding: [10, 14],
        textStyle: { color: "#f1f5f9", fontSize: 13 },
        formatter: (params) => {
          const row = rows.find((r) => r.dateText === params.name && r.app === params.seriesName);
          const displayVal = currencyMode === "brl"
            ? fmtChartValue(params.value)
            : (row?.valueLabel || fmtChartValue(params.value));
          const name = row?.summaryLabel || row?.title || "";
          return [
            `${params.marker} <b>${params.seriesName}</b>`,
            `<span style="color:#94a3b8;font-size:11px">${params.name}</span>`,
            name ? `<span style="color:#cbd5e1">${name}</span>` : "",
            `<b style="font-size:14px">${displayVal}</b>`,
          ].filter(Boolean).join("<br/>");
        },
      },
      legend: {
        show: true,
        top: 6,
        left: "center",
        itemWidth: 14,
        itemHeight: 10,
        itemGap: 20,
        textStyle: { color: "#334155", fontSize: 12, fontWeight: 700 },
      },
      xAxis: {
        type: "category",
        data: dates,
        axisTick: { show: false },
        axisLabel: {
          color: "#64748b",
          fontWeight: 600,
          fontSize: 11,
          rotate: dates.length > 8 ? 35 : 0,
          interval: 0,
          margin: 12,
        },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#94a3b8",
          fontSize: 11,
          fontWeight: 600,
          formatter: (v) => {
            const abs = Math.abs(v);
            const sign = v < 0 ? "−" : "";
            const sym = yAxisLabel ? `${yAxisLabel} ` : "";
            if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)} mi`;
            if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(0)} mil`;
            return v === 0 ? `${sym}0` : `${sign}${sym}${Math.abs(v).toFixed(0)}`;
          },
        },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)", type: "dashed" } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: apps.map((app, i) => {
        const color = MATURITY_APP_COLORS[app] || appColorFallbacks[i % appColorFallbacks.length];
        return {
          name: app,
          type: "bar",
          barMaxWidth: 40,
          barGap: "10%",
          barCategoryGap: "38%",
          itemStyle: { color, borderRadius: [4, 4, 0, 0] },
          emphasis: { itemStyle: { opacity: 0.8, shadowBlur: 8, shadowColor: `${color}55` } },
          label: { show: false },
          data: dates.map((date) => {
            const item = rows.find((r) => r.dateText === date && r.app === app);
            if (!item) return 0;
            const raw = parseMaturityValueLabel(item.valueLabel);
            return resolveChartValue(raw, item.valueLabel);
          }),
        };
      }),
    };
  }, [expanded, rows, dates, apps, currencyMode, usdBrlRate, fmtChartValue, resolveChartValue]);

  const chartEvents = useMemo(() => ({
    mouseover: (params) => {
      if (params.componentType === "series") {
        setHoveredDate(params.name);
        setHoveredItemKey(null); // hover vem do gráfico, destaca por data na lista
      }
    },
    mouseout: () => { setHoveredDate(null); setHoveredItemKey(null); },
    globalout: () => { setHoveredDate(null); setHoveredItemKey(null); },
  }), []);

  const handleListMouseEnter = useCallback((dateText, app, itemKey) => {
    setHoveredDate(dateText);
    setHoveredItemKey(itemKey);
    const instance = echartsRef.current?.getEchartsInstance?.();
    if (!instance) return;
    const seriesIndex = apps.indexOf(app);
    const dataIndex = dates.indexOf(dateText);
    if (seriesIndex >= 0 && dataIndex >= 0) {
      instance.dispatchAction({ type: "showTip", seriesIndex, dataIndex });
    }
  }, [apps, dates]);

  const handleListMouseLeave = useCallback(() => {
    setHoveredDate(null);
    setHoveredItemKey(null);
    echartsRef.current?.getEchartsInstance?.()?.dispatchAction({ type: "hideTip" });
  }, []);

  // Card list (compact, shown inside the card)
  const maturityList = (
    <div className="risk-kpi-maturity-list">
      {rows.length ? (
        rows.map((item, index) => (
          <article
            className="risk-kpi-maturity-item"
            key={`${item.app}-${item.dateKey}-${index}`}
            role="button"
            tabIndex={0}
            onClick={() => { if (item.recordId && onOpenItem) onOpenItem(item); }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && item.recordId && onOpenItem) {
                event.preventDefault();
                onOpenItem(item);
              }
            }}
          >
            <div className="risk-kpi-maturity-topline">
              <strong>{item.dateText} - {item.app}</strong>
            </div>
            <div className="risk-kpi-maturity-bottomline">
              <span>{item.summaryLabel || item.title}</span>
              <b className={item.valueColor === "positive" ? "maturity-value--positive" : item.valueColor === "negative" ? "maturity-value--negative" : undefined}>{item.valueLabel}</b>
            </div>
          </article>
        ))
      ) : (
        <div className="risk-kpi-link-card-empty">Nenhum vencimento futuro encontrado.</div>
      )}
    </div>
  );

  return (
    <>
      <article className="card stat-card risk-kpi-maturity-card summary-insight-card">
        <SummaryInsightButton
          title="Próximos vencimentos"
          message={
            <SummaryInsightCopy
              paragraphs={[
                "Cada linha mostra a data do vencimento, o tipo de operação ou formulário relacionado e o valor principal daquele compromisso.",
                "O número em destaque no fim da linha representa o volume, valor financeiro ou indicador-chave do item que vence primeiro dentro do recorte filtrado. Ao clicar em uma linha, o sistema abre o registro correspondente para consulta ou edição.",
              ]}
            />
          }
        />
        <button type="button" className="hedge-culture-expand-btn" onClick={() => setExpanded(true)} title="Maximizar" aria-label="Maximizar">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
        <h2 className="stat-card-primary-title risk-kpi-card-title">Próximos vencimentos</h2>
        {maturityList}
      </article>

      {expanded ? (
        <div className="hedge-culture-modal-backdrop" onClick={() => setExpanded(false)}>
          <div className="hedge-culture-modal maturity-expanded-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hedge-culture-modal-header">
              <div className="maturity-expanded-modal-title">
                <h2>Próximos vencimentos</h2>
                <span className="maturity-expanded-modal-badge">{rows.length} item{rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="maturity-expanded-modal-controls">
                <select
                  className="maturity-currency-select"
                  value={currencyMode}
                  onChange={(e) => setCurrencyMode(e.target.value)}
                >
                  <option value="original">Moeda original</option>
                  <option value="brl">Converter tudo para R${usdBrlRate > 0 ? ` (USDBRL ${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })})` : ""}</option>
                </select>
              </div>
              <button type="button" className="hedge-culture-modal-close" onClick={() => setExpanded(false)} aria-label="Fechar">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="maturity-expanded-body">
              {/* Chart panel */}
              <div className="maturity-expanded-chart-panel">
                <div className="maturity-expanded-chart-head">
                  <div>
                    <h3>Valor por data de vencimento</h3>
                    <p>Barras por tipo · passe o mouse para destacar na lista</p>
                  </div>
                </div>
                {chartOption ? (
                  <div className="maturity-expanded-chart-wrap">
                    <ReactECharts
                      ref={echartsRef}
                      option={chartOption}
                      style={{ height: "100%", width: "100%" }}
                      opts={{ renderer: "svg" }}
                      onEvents={chartEvents}
                    />
                  </div>
                ) : null}
              </div>

              {/* List panel */}
              <div className="maturity-expanded-list-panel">
                <div className="maturity-expanded-list-head">
                  <span>Detalhes</span>
                  <span>{rows.length} vencimento{rows.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="maturity-expanded-list">
                  {rows.map((item, index) => {
                    const appColor = MATURITY_APP_COLORS[item.app] || "#94a3b8";
                    const itemKey = `${item.app}-${item.dateKey}-${index}`;
                    // hover da lista → só o item exato; hover do gráfico → todos da mesma data
                    const isHl = hoveredItemKey ? hoveredItemKey === itemKey : hoveredDate === item.dateText;
                    return (
                      <div
                        key={itemKey}
                        className={`maturity-expanded-item${isHl ? " is-highlighted" : ""}`}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => handleListMouseEnter(item.dateText, item.app, itemKey)}
                        onMouseLeave={handleListMouseLeave}
                        onClick={() => { if (item.recordId && onOpenItem) onOpenItem(item); }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && item.recordId && onOpenItem) {
                            e.preventDefault(); onOpenItem(item);
                          }
                        }}
                      >
                        <div className="maturity-expanded-item-accent" style={{ background: appColor }} />
                        <div className="maturity-expanded-item-body">
                          <div className="maturity-expanded-item-top">
                            <span className="maturity-expanded-item-date">{item.dateText}</span>
                            <span className="maturity-expanded-item-app" style={{ color: appColor }}>{item.app}</span>
                          </div>
                          <div className="maturity-expanded-item-name">{item.summaryLabel || item.title}</div>
                        </div>
                        <b className={`maturity-expanded-item-value${item.valueColor === "positive" ? " is-positive" : item.valueColor === "negative" ? " is-negative" : ""}`}>
                          {currencyMode === "brl" && String(item.valueLabel || "").includes("U$") && usdBrlRate > 0
                            ? fmtChartValue(resolveChartValue(parseMaturityValueLabel(item.valueLabel), item.valueLabel))
                            : item.valueLabel}
                        </b>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MiniLegend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <div key={item.label} className="chart-legend-item">
          <span className="chart-legend-dot" style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function AreaTrendChart({ data, color = "#ea580c" }) {
  const option = useMemo(() => ({
    animationDuration: 250,
    grid: { top: 20, right: 18, bottom: 28, left: 18, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "line" } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: data.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.35)" } },
      axisLabel: { color: "#475569", fontWeight: 700, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: 0,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        data: data.map((item) => item.value),
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { color, width: 4 },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}66` },
              { offset: 1, color: `${color}08` },
            ],
          },
        },
      },
    ],
  }), [color, data]);

  return (
    <div className="chart-card chart-card-large">
      <div className="chart-card-header">
        <div>
          <h3>Tendencia principal</h3>
          <p className="muted">Leitura rapida da curva mais importante do painel.</p>
        </div>
      </div>
      <ReactECharts option={option} style={{ height: 220 }} opts={{ renderer: "svg" }} />
    </div>
  );
}

function StackedBarsChart({ data }) {
  const legendItems = data[0]?.parts?.map((part) => ({ label: part.label, color: part.color })) || [];
  const option = useMemo(() => ({
    animationDuration: 250,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { show: false },
    grid: { top: 12, right: 18, bottom: 30, left: 18, containLabel: true },
    xAxis: {
      type: "category",
      data: data.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.35)" } },
      axisLabel: { color: "#475569", fontWeight: 700, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    series: legendItems.map((item) => ({
      name: item.label,
      type: "bar",
      stack: "total",
      barMaxWidth: 56,
      itemStyle: { color: item.color, borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
      label: {
        show: true,
        position: "inside",
        color: "#fff",
        fontWeight: 800,
        fontSize: 11,
        formatter: ({ value }) => (Number(value || 0) >= 8 ? formatNumber0(value) : ""),
      },
      emphasis: { focus: "series" },
      data: data.map((entry) => entry.parts.find((part) => part.label === item.label)?.value || 0),
    })),
  }), [data, legendItems]);

  return (
    <div className="chart-card chart-card-large">
      <div className="chart-card-header">
        <div>
          <h3>Composicao por bloco</h3>
          <p className="muted">Comparacao visual entre componentes relevantes.</p>
        </div>
        <MiniLegend items={legendItems} />
      </div>
      <ReactECharts option={option} style={{ height: 220 }} opts={{ renderer: "svg" }} />
    </div>
  );
}

function DonutChart({ slices, centerLabel, centerValue, onSliceClick, insightTitle = "", insightMessage = null }) {
  const option = useMemo(() => ({
    animationDuration: 250,
    tooltip: { trigger: "item" },
    legend: { show: false },
    series: [
      {
        type: "pie",
        radius: ["58%", "78%"],
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: { borderColor: "#fff", borderWidth: 4 },
        data: slices.map((slice) => ({ name: slice.label, value: slice.value, itemStyle: { color: slice.color } })),
      },
    ],
    graphic: [
      { type: "text", left: "center", top: "42%", style: { text: centerLabel, fill: "#64748b", fontSize: 12, fontWeight: 700 } },
      { type: "text", left: "center", top: "51%", style: { text: centerValue, fill: "#0f172a", fontSize: 18, fontWeight: 800 } },
    ],
  }), [centerLabel, centerValue, slices]);

  const chartEvents = useMemo(() => {
    if (!onSliceClick) return undefined;
    return {
      click: (params) => {
        const sliceLabel = params?.name;
        if (!sliceLabel) return;
        onSliceClick(sliceLabel, params);
      },
    };
  }, [onSliceClick]);

  return (
    <div className="chart-card summary-insight-card">
      {insightMessage ? <SummaryInsightButton title={insightTitle || centerLabel || "Distribuição"} message={insightMessage} /> : null}
      <div className="chart-card-header">
        <div>
          <h3>Distribuicao</h3>
          <p className="muted">Participacao relativa dos principais grupos.</p>
        </div>
      </div>
      <div className="donut-wrap">
        <ReactECharts
          option={option}
          style={{ height: 220, width: 220, cursor: onSliceClick ? "pointer" : "default" }}
          opts={{ renderer: "svg" }}
          onEvents={chartEvents}
        />
        <MiniLegend items={slices} />
      </div>
    </div>
  );
}

function ComponentPopupEyeButton({ onClick, title = "Abrir operacao", disabled = false }) {
  return (
    <button
      type="button"
      className="component-popup-eye-button"
      onClick={onClick}
      aria-label={title}
      title={title}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M1.5 12s3.8-6 10.5-6 10.5 6 10.5 6-3.8 6-10.5 6S1.5 12 1.5 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}

function DashboardResourceTableModal({ title, definition, rows, onClose, onEdit }) {
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    setSearchValue("");
  }, [definition?.resource, rows, title]);

  if (!definition) return null;

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup dashboard-resource-table-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>
          ×
        </button>
        <div className="component-popup-header dashboard-resource-table-header">
          <div>
            <strong>{title}</strong>
            <p className="muted">{rows.length} registro(s) no recorte selecionado.</p>
          </div>
        </div>
        <ResourceTable
          definition={definition}
          rows={rows}
          searchValue={searchValue}
          searchPlaceholder={definition.searchPlaceholder || "Buscar..."}
          onSearchChange={setSearchValue}
          onClear={() => setSearchValue("")}
          onEdit={onEdit}
          tableHeight="100%"
        />
      </div>
    </div>
  );
}

function buildHedgeExplanation(periodSummary, currencyConfig) {
  if (!periodSummary || !currencyConfig) return null;
  const currency = currencyConfig.label || currencyConfig.key;
  const isBrl = currencyConfig.key === "BRL";

  const find = (key) => periodSummary.totals?.find((t) => t.label?.toLowerCase().includes(key.toLowerCase()));
  const saldo = periodSummary.saldo ?? 0;

  if (isBrl) {
    const fmt = (v) => Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const lines = [];
    if (saldo < 0) {
      lines.push(`O saldo de ${fmt(saldo)} indica saída líquida de caixa em ${currency} neste período.`);
      lines.push("Verifique se há recebimentos pendentes ou possibilidade de antecipar vendas para cobrir esse deficit.");
    } else if (saldo > 0) {
      lines.push(`O saldo de +${fmt(saldo)} indica entrada líquida de caixa em ${currency} neste período.`);
    } else {
      lines.push(`O fluxo em ${currency} está equilibrado neste período.`);
    }
    return lines;
  }

  const fmt = (v) => Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const paymentsEntry = find("pagamento");
  const purchaseEntry = find("NDF") || find("comprado");
  const salesEntry = find("venda");
  const otherOutflowEntry = find("saída");

  const totalPayments = Math.abs(paymentsEntry?.value ?? 0) + Math.abs(otherOutflowEntry?.value ?? 0);
  const hedged = Math.abs(purchaseEntry?.value ?? 0);
  const salesOffset = Math.abs(salesEntry?.value ?? 0);
  const totalOffset = hedged + salesOffset;
  const hedgePct = totalPayments > 0 ? Math.round((totalOffset / totalPayments) * 100) : 0;

  const lines = [];

  if (totalPayments > 0) {
    lines.push(`Neste período, há ${fmt(totalPayments)} ${currency} em obrigações de pagamento.`);
    if (totalOffset > 0) {
      const parts = [];
      if (hedged > 0) parts.push(`${fmt(hedged)} ${currency} via NDF/Call`);
      if (salesOffset > 0) parts.push(`${fmt(salesOffset)} ${currency} em vendas`);
      lines.push(`${parts.join(" e ")} cobrem parte desses pagamentos (${hedgePct}% do total).`);
    }
  } else if (totalOffset > 0) {
    lines.push(`Há ${fmt(totalOffset)} ${currency} em cobertura (NDF/Call/Vendas) sem pagamentos correspondentes neste período.`);
  }

  if (saldo < 0) {
    lines.push(`A exposição líquida de ${fmt(saldo)} ${currency} representa o valor ainda descoberto. Se o ${currency} se valorizar, o custo em R$ aumenta proporcionalmente.`);
    lines.push(`Para reduzir essa exposição: venda commodities (soja, milho etc.) indexadas ao ${currency}, ou compre NDF/Call para proteger o valor em aberto.`);
  } else if (saldo > 0) {
    lines.push(`O saldo positivo de +${fmt(saldo)} ${currency} indica posição comprada — mais cobertura do que pagamentos em aberto.`);
  } else if (totalPayments > 0) {
    lines.push(`Saldo zerado: as coberturas (NDF/Call/Vendas) compensam exatamente os pagamentos em aberto. Exposição cambial nula.`);
  }

  return lines;
}

function CashflowMultiTableModal({ period, tables, periodSummary, currencyConfig, onClose, onEdit }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [showAi, setShowAi] = useState(true);
  const safeIndex = Math.min(activeIndex, tables.length - 1);
  const activeTable = tables[safeIndex];

  useEffect(() => { setSearchValue(""); }, [safeIndex]);

  const aiLines = useMemo(
    () => buildHedgeExplanation(periodSummary, currencyConfig),
    [periodSummary, currencyConfig],
  );

  return (
    <div className="cashflow-multi-table-backdrop" onClick={onClose}>
      <div className="cashflow-multi-table-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>×</button>
        <div className="cashflow-multi-table-header">
          <div className="cashflow-multi-table-title-row">
            <strong className="cashflow-multi-table-period">{period}</strong>
            {aiLines?.length ? (
              <button
                type="button"
                className={`cashflow-ai-btn${showAi ? " active" : ""}`}
                title="Explicação de hedge"
                onClick={() => setShowAi((v) => !v)}
              >
                ✦ Análise
              </button>
            ) : null}
          </div>
          {showAi && aiLines?.length ? (
            <div className="cashflow-ai-panel">
              {aiLines.map((line, i) => <p key={i}>{line}</p>)}
            </div>
          ) : null}
          <div className="cashflow-multi-table-tabs">
            {tables.map((table, index) => (
              <button
                key={table.key}
                type="button"
                className={`cashflow-multi-table-tab${safeIndex === index ? " active" : ""}`}
                onClick={() => setActiveIndex(index)}
              >
                {table.label}
                <span className="cashflow-multi-table-tab-count">{table.rows.length}</span>
              </button>
            ))}
          </div>
        </div>
        {activeTable ? (
          <div className="cashflow-multi-table-body">
            <ResourceTable
              definition={activeTable.definition}
              rows={activeTable.rows}
              searchValue={searchValue}
              searchPlaceholder={activeTable.definition?.searchPlaceholder || "Buscar..."}
              onSearchChange={setSearchValue}
              onClear={() => setSearchValue("")}
              onEdit={(row) => onEdit(row, activeTable.definition?.resource)}
              tableHeight="100%"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CashflowDailyLaunchList({ entries, statusSavingByEntry, statusErrorByEntry, onStatusChange, onEdit }) {
  if (!entries.length) {
    return <div className="cashflow-daily-empty">Nenhum lançamento neste recorte.</div>;
  }

  return (
    <div className="cashflow-daily-launch-list">
      {entries.map((entry) => (
        <article key={entry.id} className="cashflow-daily-launch-card">
          <div className="cashflow-daily-launch-main">
            <div className="cashflow-daily-launch-head">
              <span className={`cashflow-daily-launch-type cashflow-daily-launch-type--${entry.type}`}>
                {entry.typeLabel}
              </span>
              <strong>{entry.title}</strong>
              <span className="cashflow-daily-launch-currency">{entry.currency || "R$"}</span>
            </div>
            {entry.date ? <p>{formatCashflowDailyTableDate(entry.date)}</p> : null}
            {entry.subtitle ? <p>{entry.subtitle}</p> : null}
            {entry.statusField && entry.statusOptions?.length ? (
              <div>
                <select
                  value={entry.statusValue || ""}
                  onChange={(event) => void onStatusChange(entry, event.target.value)}
                  disabled={Boolean(statusSavingByEntry[entry.id])}
                >
                  {entry.statusOptions.map((option) => (
                    <option key={`${entry.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {entry.meta ? <small>{entry.meta}</small> : null}
            {statusErrorByEntry[entry.id] ? <small>{statusErrorByEntry[entry.id]}</small> : null}
            {entry.description ? <small>{entry.description}</small> : null}
          </div>
          <div className="cashflow-daily-launch-side">
            <strong className={entry.amount >= 0 ? "is-positive" : "is-negative"}>
              {formatCashflowDailyCurrency(Math.abs(entry.amount))}
            </strong>
            {statusSavingByEntry[entry.id] ? <small>Salvando status...</small> : null}
            <button
              type="button"
              className="chart-period-btn"
              onClick={() => onEdit(entry)}
            >
              Editar
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CashflowDailyEntriesModal({ open, title, entries, totalAmount, statusSavingByEntry, statusErrorByEntry, onStatusChange, onEdit, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup cashflow-daily-summary-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>
          ×
        </button>
        <div className="component-popup-header">
          <div>
            <strong>{title}</strong>
            <p className="muted">
              {entries.length} operação(ões) somando {formatCashflowDailyCurrency(totalAmount)}.
            </p>
          </div>
        </div>
        <CashflowDailyLaunchList
          entries={entries}
          statusSavingByEntry={statusSavingByEntry}
          statusErrorByEntry={statusErrorByEntry}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

function useDashboardOperationEditor({
  sales = [],
  setSales,
  derivatives = [],
  setDerivatives,
  physicalPayments = [],
  setPhysicalPayments,
  cashPayments = [],
  setCashPayments,
  otherCashOutflows = [],
  setOtherCashOutflows,
  otherEntries = [],
  setOtherEntries,
}) {
  const [editingOperationItem, setEditingOperationItem] = useState(null);
  const [operationAttachments, setOperationAttachments] = useState([]);
  const [operationFormError, setOperationFormError] = useState("");

  const operationFormDefinition = useMemo(() => {
    if (!editingOperationItem?.resourceKey) return null;
    if (editingOperationItem.resourceKey === "derivative-operations") return resourceDefinitions.derivativeOperations;
    if (editingOperationItem.resourceKey === "physical-sales") return resourceDefinitions.physicalSales;
    if (editingOperationItem.resourceKey === "physical-payments") return resourceDefinitions.physicalPayments;
    if (editingOperationItem.resourceKey === "cash-payments") return resourceDefinitions.cashPayments;
    if (editingOperationItem.resourceKey === "other-cash-outflows") return resourceDefinitions.otherCashOutflows;
    if (editingOperationItem.resourceKey === "other-entries") return resourceDefinitions.otherEntries;
    return null;
  }, [editingOperationItem?.resourceKey]);

  const operationFormFields = useMemo(() => {
    if (!operationFormDefinition) return [];
    return editingOperationItem
      ? operationFormDefinition.editFields || operationFormDefinition.fields || []
      : operationFormDefinition.fields || [];
  }, [editingOperationItem, operationFormDefinition]);

  const closeOperationForm = useCallback(() => {
    setEditingOperationItem(null);
    setOperationAttachments([]);
    setOperationFormError("");
  }, []);

  useEffect(() => {
    let isMounted = true;
    const attachmentField = operationFormFields.find((field) => field.type === "file-multi") || operationFormDefinition?.attachmentField;

    if (!editingOperationItem?.id || !operationFormDefinition?.resource || !attachmentField) {
      setOperationAttachments([]);
      return () => {
        isMounted = false;
      };
    }

    resourceService.listAttachments(operationFormDefinition.resource, editingOperationItem.id).then((items) => {
      if (isMounted) setOperationAttachments(items);
    }).catch(() => {
      if (isMounted) setOperationAttachments([]);
    });

    return () => {
      isMounted = false;
    };
  }, [editingOperationItem?.id, operationFormDefinition?.resource, operationFormFields]);

  const openOperationForm = useCallback((item) => {
    if (!item?.recordId || !item?.resourceKey) return;

    if (item.resourceKey === "derivative-operations") {
      const current = derivatives.find((row) => String(row.id) === String(item.recordId));
      if (!current) return;
      setEditingOperationItem({
        ...current,
        resourceKey: item.resourceKey,
        siblingRows: derivatives
          .filter((candidate) => candidate.cod_operacao_mae === current.cod_operacao_mae)
          .sort((left, right) => (left.ordem || 0) - (right.ordem || 0) || left.id - right.id),
      });
      setOperationFormError("");
      return;
    }

    const sourceRows =
      item.resourceKey === "physical-sales"
        ? sales
        : item.resourceKey === "physical-payments"
          ? physicalPayments
          : item.resourceKey === "cash-payments"
            ? cashPayments
            : item.resourceKey === "other-cash-outflows"
              ? otherCashOutflows
            : otherEntries;
    const current = sourceRows.find((row) => String(row.id) === String(item.recordId));
    if (!current) return;
    setEditingOperationItem({ ...current, resourceKey: item.resourceKey });
    setOperationFormError("");
  }, [cashPayments, derivatives, otherCashOutflows, otherEntries, physicalPayments, sales]);

  const replaceRowById = useCallback((items, updated) => items.map((row) => (String(row.id) === String(updated.id) ? updated : row)), []);

  const editorNode = (
    <>
      {editingOperationItem && operationFormDefinition?.customForm === "derivative-operation" ? (
        <DerivativeOperationForm
          title={`Editar ${operationFormDefinition.title}`}
          initialValues={editingOperationItem}
          existingAttachments={operationAttachments}
          error={operationFormError}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (editingOperationItem?.id) {
              const items = await resourceService.listAttachments(operationFormDefinition.resource, editingOperationItem.id);
              setOperationAttachments(items);
            }
          }}
          onClose={closeOperationForm}
          onSubmit={async (payload, rawValues) => {
            try {
              const files = Array.isArray(rawValues.attachments) ? rawValues.attachments : [];
              const siblingRows = Array.isArray(editingOperationItem?.siblingRows) ? editingOperationItem.siblingRows : [];
              const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "attachments" && key !== "itens"));
              const itemPayloads = Array.isArray(payload.itens) ? payload.itens : [];
              let primaryRecord = null;
              const savedRows = [];
              const removedIds = [];
              const existingRows = siblingRows.length ? siblingRows : derivatives.filter((row) => row.cod_operacao_mae === editingOperationItem.cod_operacao_mae);
              const keepIds = [];

              for (let index = 0; index < itemPayloads.length; index += 1) {
                const itemPayload = itemPayloads[index];
                const existingRow = existingRows[index];
                const rowPayload = {
                  ...cleanPayload,
                  grupo_montagem: itemPayload.grupo_montagem || "",
                  tipo_derivativo: itemPayload.tipo_derivativo || "",
                  numero_lotes: itemPayload.numero_lotes,
                  strike_montagem: itemPayload.strike_montagem,
                  custo_total_montagem_brl: itemPayload.custo_total_montagem_brl,
                  strike_liquidacao: itemPayload.strike_liquidacao,
                  ajustes_totais_brl: itemPayload.ajustes_totais_brl,
                  ajustes_totais_usd: itemPayload.ajustes_totais_usd,
                  ordem: index + 1,
                  volume: itemPayload.volume,
                  volume_financeiro_valor_moeda_original: itemPayload.volume_financeiro_valor_moeda_original,
                };

                if (existingRow?.id) {
                  const updated = await resourceService.update(operationFormDefinition.resource, existingRow.id, rowPayload);
                  savedRows.push(updated);
                  keepIds.push(updated.id);
                  if (!primaryRecord || String(updated.id) === String(editingOperationItem.id)) primaryRecord = updated;
                } else {
                  const created = await resourceService.create(operationFormDefinition.resource, rowPayload);
                  savedRows.push(created);
                  keepIds.push(created.id);
                  if (!primaryRecord) primaryRecord = created;
                }
              }

              const removableRows = existingRows.filter((row) => !keepIds.includes(row.id));
              for (const removableRow of removableRows) {
                await resourceService.remove(operationFormDefinition.resource, removableRow.id);
                removedIds.push(removableRow.id);
              }

              if (savedRows.length && setDerivatives) {
                setDerivatives((currentRows) => {
                  const survivors = currentRows.filter((row) => !removedIds.includes(row.id));
                  const nextRows = [...survivors];
                  savedRows.forEach((savedRow) => {
                    const index = nextRows.findIndex((row) => String(row.id) === String(savedRow.id));
                    if (index >= 0) nextRows[index] = savedRow;
                    else nextRows.push(savedRow);
                  });
                  return nextRows;
                });
              }

              if (primaryRecord && files.length) {
                await resourceService.uploadAttachments(operationFormDefinition.resource, primaryRecord.id, files);
              }

              closeOperationForm();
            } catch (requestError) {
              setOperationFormError(requestError?.response?.data?.detail || "Nao foi possivel salvar o derivativo.");
            }
          }}
        />
      ) : null}

      {editingOperationItem && operationFormDefinition && operationFormDefinition.customForm !== "derivative-operation" ? (
        <ResourceForm
          title={`Editar ${operationFormDefinition.title}`}
          fields={operationFormFields}
          initialValues={editingOperationItem}
          submitLabel={operationFormDefinition.submitLabel || "Salvar"}
          existingAttachments={operationAttachments}
          error={operationFormError}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (editingOperationItem?.id) {
              const items = await resourceService.listAttachments(operationFormDefinition.resource, editingOperationItem.id);
              setOperationAttachments(items);
            }
          }}
          onClose={closeOperationForm}
          onSubmit={async (payload, rawValues) => {
            try {
              const attachmentField = operationFormFields.find((field) => field.type === "file-multi");
              const files = attachmentField && Array.isArray(rawValues[attachmentField.name]) ? rawValues[attachmentField.name] : [];
              let cleanPayload = attachmentField
                ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== attachmentField.name))
                : payload;

              if (operationFormDefinition.resource === "physical-sales" && cleanPayload.cultura_produto) {
                const crops = await resourceService.listAll("crops");
                const selectedCrop = crops.find((item) => (item.ativo || item.cultura) === cleanPayload.cultura_produto);
                if (selectedCrop) {
                  cleanPayload = {
                    ...cleanPayload,
                    cultura: selectedCrop.id,
                  };
                }
              }

              const saved = await resourceService.update(operationFormDefinition.resource, editingOperationItem.id, cleanPayload);

              if (files.length) {
                await resourceService.uploadAttachments(operationFormDefinition.resource, saved.id, files);
              }

              if (operationFormDefinition.resource === "physical-sales" && setSales) {
                setSales((currentRows) => replaceRowById(currentRows, saved));
              } else if (operationFormDefinition.resource === "physical-payments" && setPhysicalPayments) {
                setPhysicalPayments((currentRows) => replaceRowById(currentRows, saved));
              } else if (operationFormDefinition.resource === "cash-payments" && setCashPayments) {
                setCashPayments((currentRows) => replaceRowById(currentRows, saved));
              } else if (operationFormDefinition.resource === "other-cash-outflows" && setOtherCashOutflows) {
                setOtherCashOutflows((currentRows) => replaceRowById(currentRows, saved));
              } else if (operationFormDefinition.resource === "other-entries" && setOtherEntries) {
                setOtherEntries((currentRows) => replaceRowById(currentRows, saved));
              }

              closeOperationForm();
            } catch (requestError) {
              setOperationFormError(requestError?.response?.data?.detail || "Nao foi possivel salvar o registro.");
            }
          }}
        />
      ) : null}
    </>
  );

  return { openOperationForm, editorNode };
}

function ScenarioBars({ data, insightTitle = "", insightMessage = null }) {
  return (
    <div className="chart-card summary-insight-card">
      {insightMessage ? <SummaryInsightButton title={insightTitle || "Cenários comparados"} message={insightMessage} /> : null}
      <div className="chart-card-header">
        <div>
          <h3>Cenarios comparados</h3>
          <p className="muted">Leitura rapida entre base, otimismo e estresse.</p>
        </div>
      </div>
      <div className="scenario-list">
        {data.map((item, index) => (
          <div key={`${index}-${item.label}`} className="scenario-row">
            <div className="scenario-head">
              <span>{item.label}</span>
              <strong>{item.formatted}</strong>
            </div>
            <div className="scenario-track">
              <ReactECharts
                option={{
                  animationDuration: 180,
                  grid: { top: 0, right: 0, bottom: 0, left: 0 },
                  xAxis: { type: "value", show: false, max: Math.max(...data.map((entry) => entry.value), 1) },
                  yAxis: { type: "category", data: [item.label], show: false },
                  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
                  series: [
                    {
                      type: "bar",
                      data: [{ value: item.value, itemStyle: { color: item.color } }],
                      barMaxWidth: 18,
                      showBackground: true,
                      backgroundStyle: { color: "rgba(148, 163, 184, 0.12)", borderRadius: CHART_BAR_RADIUS },
                      itemStyle: { borderRadius: CHART_BAR_RADIUS },
                      label: {
                        show: true,
                        position: "insideRight",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 10,
                        formatter: ({ value }) => {
                          const maxValue = Math.max(...data.map((entry) => entry.value), 1);
                          return Number(value || 0) / maxValue >= 0.18 ? item.formatted : "";
                        },
                      },
                    },
                  ],
                }}
                style={{ height: 20, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChipGroup({ title, items, selectedValues, labelKey, onToggle, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedItems = items.filter((item) => selectedValues.includes(String(item.id)));
  const summaryLabel = selectedItems.length
    ? selectedItems.length === 1
      ? selectedItems[0][labelKey]
      : `${selectedItems[0][labelKey]} +${selectedItems.length - 1}`
    : "Todos";

  return (
    <section className="dashboard-chip-group">
      <button
        type="button"
        className="dashboard-chip-group-toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <div className="dashboard-chip-group-header">
          <strong>{title}</strong>
          <span className={`dashboard-chip-group-arrow${isOpen ? " open" : ""}`}>▾</span>
        </div>
        <span className={`dashboard-chip dashboard-chip-summary${selectedItems.length ? " active" : ""}`}>{summaryLabel}</span>
      </button>
      {isOpen ? (
        <>
          <div className="dashboard-chip-list">
            {items.map((item) => {
              const itemId = String(item.id);
              const isActive = selectedValues.includes(itemId);
              return (
                <button
                  key={`${title}-${itemId}`}
                  type="button"
                  className={`dashboard-chip${isActive ? " active" : ""}`}
                  onClick={() => onToggle(itemId)}
                >
                  {item[labelKey]}
                </button>
              );
            })}
          </div>
          {selectedValues.length ? (
            <button
              type="button"
              className="dashboard-chip-clear"
              onClick={onClear}
            >
              Limpar
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function DashboardQuickFilters() {
  const { filter, options, updateFilter, toggleFilterValue } = useDashboardFilter();
  const visibleSubgroups = useMemo(() => filterSubgroupsByGroups(options.subgroups, filter.grupo), [options.subgroups, filter.grupo]);

  return (
    <section className="dashboard-quick-filters">
      <FilterChipGroup
        title="Grupos"
        items={options.groups}
        selectedValues={filter.grupo}
        labelKey="grupo"
        onToggle={(value) => toggleFilterValue("grupo", value)}
        onClear={() => updateFilter("grupo", [])}
      />
      <FilterChipGroup
        title="Subgrupos"
        items={visibleSubgroups}
        selectedValues={filter.subgrupo}
        labelKey="subgrupo"
        onToggle={(value) => toggleFilterValue("subgrupo", value)}
        onClear={() => updateFilter("subgrupo", [])}
      />
      <FilterChipGroup
        title="Ativos"
        items={options.cropBoardCrops || []}
        selectedValues={filter.cultura}
        labelKey="cultura"
        onToggle={(value) => toggleFilterValue("cultura", value)}
        onClear={() => updateFilter("cultura", [])}
      />
      <FilterChipGroup
        title="Safras"
        items={options.cropBoardSeasons || []}
        selectedValues={filter.safra}
        labelKey="safra"
        onToggle={(value) => toggleFilterValue("safra", value)}
        onClear={() => updateFilter("safra", [])}
      />
    </section>
  );
}

function CommercialRiskLongShortChart({
  rows,
  seasonTitle = "",
  referenceDate = null,
  onOpenDetailTable,
}) {
  const orderedSeries = [
    { key: "nadaFeito", label: "Nada feito", color: "#ff6a2a", clickable: false },
    { key: "derivatives", label: "Vendas via Derivativos", color: "#b8efb7", clickable: true },
    { key: "physical", label: "Vendas via Físico (a termo)", color: "#48bf3b", clickable: true },
    { key: "physicalPayments", label: "Pgtos Físico", color: "#16361f", clickable: true },
  ];

  const seriesByName = new Map(orderedSeries.map((item) => [item.label, item]));

  const chartEvents = useMemo(
    () => ({
      click: (params) => {
        const row = rows[params?.dataIndex];
        const series = seriesByName.get(params?.seriesName);
        if (!row || !series?.clickable || !(Number(row[series.key] || 0) > 0)) return;
        onOpenDetailTable?.({
          rowLabel: row.label,
          series,
          rows: row.detailRows?.[series.key] || [],
          referenceDate,
        });
      },
    }),
    [onOpenDetailTable, referenceDate, rows, seriesByName],
  );

  if (!rows.length) {
    return (
      <article className="chart-card chart-card-large risk-kpi-long-short-card summary-insight-card">
        <SummaryInsightButton
          title="Long & Short por cultura"
          message={
            <SummaryInsightCopy
              paragraphs={[
                "Neste gráfico, cada barra representa o volume total de uma cultura em sacas, dividido entre o que já está coberto e o que ainda está livre.",
                "Os segmentos mostram separadamente vendas via derivativos, vendas via físico, pagamentos físicos e a parte classificada como 'Nada feito', que representa a exposição ainda sem cobertura.",
                "Este card considera apenas os filtros de grupo, subgrupo e safra; o filtro de cultura não reduz as barras exibidas.",
              ]}
            />
          }
        />
        <div className="chart-card-header">
          <div>
            <h3>Long &amp; Short por cultura{seasonTitle ? ` - ${seasonTitle}` : ""}</h3>
            <p className="muted">Leitura direta do volume coberto e do volume ainda livre por cultura.</p>
          </div>
        </div>
        <p className="muted">Sem dados suficientes para montar o Long &amp; Short com o filtro atual.</p>
      </article>
    );
  }

  const option = {
    animationDuration: 250,
    grid: { top: 18, right: 36, bottom: 28, left: 36, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const parts = params
          .filter((item) => Number(item.value || 0) > 0)
          .map((item) => `${item.marker}${item.seriesName}: ${formatNumber0(item.value)}`);
        return parts.join("<br/>");
      },
    },
    legend: { show: false },
    xAxis: {
      type: "value",
      min: 0,
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.35)" } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
      axisLabel: {
        color: "#475569",
        fontWeight: 700,
        formatter: (value) => {
          if (!value) return "0";
          if (value >= 1000) return `${Math.round(value / 1000)} mil`;
          return formatNumber0(value);
        },
      },
    },
    yAxis: {
      type: "category",
      data: rows.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: "#334155",
        fontWeight: 800,
        fontSize: 13,
        margin: 36,
      },
    },
    series: orderedSeries.map((series) => ({
      name: series.label,
      type: "bar",
      stack: "long-short",
      barMaxWidth: 56,
      itemStyle: { color: series.color },
      label: {
        show: true,
        color: "#0f172a",
        fontWeight: 900,
        fontSize: 13,
        formatter: ({ value, dataIndex }) => {
          const numericValue = Number(value || 0);
          if (!numericValue) return "";
          const baseValue = rows[dataIndex]?.totalForShare || 0;
          const percent = baseValue > 0 ? Math.round((numericValue / baseValue) * 100) : 0;
          if (percent < 6 && numericValue < 5000) return "";
          return `${formatNumber0(numericValue)} (${percent}%)`;
        },
      },
      labelLayout: {
        hideOverlap: true,
        moveOverlap: "shiftY",
      },
      emphasis: { focus: "series" },
      data: rows.map((item) => {
        const value = Number(item[series.key] || 0);
        if (!(value > 0)) return null;

        const rowTotal = Math.max(Number(item.production || 0), Number(item.covered || 0), 0);
        const shouldPlaceOutside = rowTotal > 0 && value / rowTotal < 0.12;

        return {
          value,
          label: {
            position: shouldPlaceOutside ? "right" : "inside",
            distance: shouldPlaceOutside ? 26 : 0,
            padding: shouldPlaceOutside ? [2, 4] : 0,
            backgroundColor: shouldPlaceOutside ? "rgba(255,255,255,0.92)" : "transparent",
            borderColor: shouldPlaceOutside ? "rgba(148, 163, 184, 0.45)" : "transparent",
            borderWidth: shouldPlaceOutside ? 1 : 0,
            borderRadius: shouldPlaceOutside ? 4 : 0,
          },
        };
      }),
    })),
  };

  return (
    <article className="chart-card chart-card-large risk-kpi-long-short-card summary-insight-card">
      <SummaryInsightButton
        title="Long & Short por cultura"
        message={
          <SummaryInsightCopy
            paragraphs={[
              "Neste gráfico, cada barra representa o volume total de uma cultura em sacas, dividido entre o que já está coberto e o que ainda está livre.",
              "Os segmentos mostram separadamente vendas via derivativos, vendas via físico, pagamentos físicos e a parte classificada como 'Nada feito', que representa a exposição ainda sem cobertura.",
              "Este card considera apenas os filtros de grupo, subgrupo e safra; o filtro de cultura não reduz as barras exibidas.",
            ]}
          />
        }
      />
      <div className="chart-card-header">
        <div>
          <h3>Long &amp; Short por cultura{seasonTitle ? ` - ${seasonTitle}` : ""}</h3>
          <p className="muted">Leitura direta do volume coberto e do volume ainda livre por cultura.</p>
        </div>
      </div>
      <ReactECharts
        option={option}
        onEvents={chartEvents}
        style={{ height: Math.max(280, rows.length * 62 + 84) }}
        opts={{ renderer: "svg" }}
      />
    </article>
  );
}

function CommercialRiskGaugePanel({
  totalPercent,
  totalScPerHa,
  derivativePercent,
  derivativeScPerHa,
  physicalPercent,
  physicalScPerHa,
  policyMinPercent = null,
  policyMaxPercent = null,
  productionBase = 0,
  totalArea = 0,
  physicalRows = [],
  derivativeRows = [],
  policies = [],
  derivativeVolumeGetter = getDerivativeVolumeValue,
  hidePolicyChart = false,
  activeIndex: controlledActiveIndex = null,
  onActiveIndexChange = null,
  onOpenHedgePolicy,
  chartState = null,
}) {
  const summaryChartState = useMemo(
    () => chartState || buildHedgePolicyChartState({
      unit: "SC",
      frequency: "monthly",
      baseValue: productionBase,
      physicalRows,
      derivativeRows,
      policies,
      physicalValueGetter: getPhysicalVolumeValue,
      derivativeValueGetter: derivativeVolumeGetter,
    }),
    [chartState, derivativeRows, derivativeVolumeGetter, physicalRows, policies, productionBase],
  );
  const summaryTodayIndex = useMemo(() => getHedgeTodayIndex(summaryChartState.points), [summaryChartState.points]);
  const [internalActiveSummaryIndex, setInternalActiveSummaryIndex] = useState(summaryTodayIndex);
  const activeSummaryIndex = controlledActiveIndex != null ? controlledActiveIndex : internalActiveSummaryIndex;

  const updateActiveSummaryIndex = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(Number(nextIndex || 0), Math.max(summaryChartState.points.length - 1, 0)));
    if (controlledActiveIndex == null) {
      setInternalActiveSummaryIndex(safeIndex);
    }
    if (typeof onActiveIndexChange === "function") {
      onActiveIndexChange(safeIndex);
    }
  };

  useEffect(() => {
    updateActiveSummaryIndex(summaryTodayIndex);
  }, [summaryTodayIndex]);

  const activeSummaryPoint =
    summaryChartState.points[activeSummaryIndex] || summaryChartState.points[summaryTodayIndex] || summaryChartState.points.at(-1) || null;

  const activeTotalPercent = activeSummaryPoint?.totalPct != null ? activeSummaryPoint.totalPct * 100 : totalPercent;
  const activeTotalVolume = activeSummaryPoint?.total || 0;
  const activePhysicalVolume = activeSummaryPoint?.physicalRaw || 0;
  const activeDerivativeVolume = activeSummaryPoint?.derivativeRaw || 0;
  const activeTotalScPerHa = totalArea > 0 ? activeTotalVolume / totalArea : totalScPerHa;
  const activePhysicalScPerHa = totalArea > 0 ? activePhysicalVolume / totalArea : physicalScPerHa;
  const activeDerivativeScPerHa = totalArea > 0 ? activeDerivativeVolume / totalArea : derivativeScPerHa;
  const activePolicyMinPercent = activeSummaryPoint?.minPct != null ? activeSummaryPoint.minPct * 100 : policyMinPercent;
  const activePolicyMaxPercent = activeSummaryPoint?.maxPct != null ? activeSummaryPoint.maxPct * 100 : policyMaxPercent;

  return (
    <section className={`risk-kpi-gauge-grid${hidePolicyChart ? " risk-kpi-gauge-grid--compact" : ""}`}>
      {!hidePolicyChart ? (
        <div className="risk-kpi-policy-slot">
          <HedgePolicyChart
            title="Hedge produção liquida (sc)"
            unit="SC"
            frequency="monthly"
            baseValue={productionBase}
            areaBase={totalArea}
            activeIndex={activeSummaryIndex}
            onActiveIndexChange={updateActiveSummaryIndex}
            physicalRows={physicalRows}
            derivativeRows={derivativeRows}
            policies={policies}
            physicalValueGetter={getPhysicalVolumeValue}
            derivativeValueGetter={derivativeVolumeGetter}
            onFocusToggle={onOpenHedgePolicy || (() => {})}
            showFloatingCard={false}
            precomputedChartState={summaryChartState}
          />
        </div>
      ) : null}

      <HedgeSummaryGaugeCards
        totalPercent={activeTotalPercent}
        totalMetricValue={activeTotalVolume}
        totalMetricLabel={totalArea > 0 ? `${formatNumber2(activeTotalScPerHa)} scs/ha` : null}
        physicalPercent={activeTotalVolume > 0 ? (activePhysicalVolume / activeTotalVolume) * 100 : physicalPercent}
        physicalMetricValue={activePhysicalVolume}
        physicalMetricLabel={totalArea > 0 ? `${formatNumber2(activePhysicalScPerHa)} scs/ha` : `${formatNumber0(activePhysicalVolume)} sc`}
        derivativePercent={activeTotalVolume > 0 ? (activeDerivativeVolume / activeTotalVolume) * 100 : derivativePercent}
        derivativeMetricValue={activeDerivativeVolume}
        derivativeMetricLabel={totalArea > 0 ? `${formatNumber2(activeDerivativeScPerHa)} scs/ha` : `${formatNumber0(activeDerivativeVolume)} sc`}
        policyMinPercent={activePolicyMinPercent}
        policyMaxPercent={activePolicyMaxPercent}
      />
    </section>
  );
}

function HedgeSummaryGaugeCards({
  totalPercent,
  totalMetricValue = 0,
  totalMetricLabel = null,
  physicalPercent,
  physicalMetricValue = 0,
  physicalMetricLabel = null,
  physicalDetailLines = [],
  derivativePercent,
  derivativeMetricValue = 0,
  derivativeMetricLabel = null,
  derivativeDetailLines = [],
  policyMinPercent = null,
  policyMaxPercent = null,
}) {
  const safeValue = (value) => Math.max(0, Math.min(Number(value || 0), 100));
  const rawTotalValue = Number(totalPercent || 0);
  const totalValue = safeValue(rawTotalValue);
  const derivativeValue = safeValue(derivativePercent);
  const physicalValue = safeValue(physicalPercent);
  const hasPolicyBand = Number.isFinite(policyMinPercent) && Number.isFinite(policyMaxPercent);
  const minBand = hasPolicyBand ? safeValue(Math.min(policyMinPercent, policyMaxPercent)) : null;
  const maxBand = hasPolicyBand ? safeValue(Math.max(policyMinPercent, policyMaxPercent)) : null;
  const warnLowBand = hasPolicyBand ? safeValue(Math.max(minBand - 10, 0)) : null;
  const warnHighBand = hasPolicyBand ? safeValue(Math.min(maxBand + 10, 100)) : null;
  const distributionSlices = [
    {
      label: "Derivativos",
      value: Number(derivativeValue || 0),
      metricValue: derivativeMetricValue,
      metricLabel: derivativeMetricLabel,
      color: "rgba(251, 146, 60, 0.85)",
    },
    {
      label: "Físico",
      value: Number(physicalValue || 0),
      metricValue: physicalMetricValue,
      metricLabel: physicalMetricLabel,
      color: "rgba(250, 204, 21, 0.75)",
    },
  ];
  const gaugeSegments = hasPolicyBand
    ? [
        { from: 0, to: warnLowBand, color: "#ff1a1a" },
        { from: warnLowBand, to: minBand, color: "#f5b82e" },
        { from: minBand, to: maxBand, color: "#16a34a" },
        { from: maxBand, to: warnHighBand, color: "#f5b82e" },
        { from: warnHighBand, to: 100, color: "#ff1a1a" },
      ]
    : [
        { from: 0, to: 20, color: "#ff1a1a" },
        { from: 20, to: 40, color: "#f5b82e" },
        { from: 40, to: 70, color: "#16a34a" },
        { from: 70, to: 85, color: "#f5b82e" },
        { from: 85, to: 100, color: "#ff1a1a" },
      ];

  const gaugeCenterX = 150;
  const gaugeCenterY = 108;
  const gaugeArcRadius = 74;
  const gaugeOuterTickRadius = 84;
  const gaugeLabelRadius = 95;
  const polarToCartesian = (cx, cy, radius, angleDeg) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad),
    };
  };

  const describeArc = (cx, cy, radius, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  };

  const gaugeStartAngle = -135;
  const gaugeSweep = 270;
  const gaugeAngleForValue = (value) => gaugeStartAngle + (safeValue(value) / 100) * gaugeSweep;
  const valueToGaugePoint = (value, radius) => polarToCartesian(gaugeCenterX, gaugeCenterY, radius, gaugeAngleForValue(value));
  const gaugePointerEnd = valueToGaugePoint(totalValue, 56);
  const gaugeNeedleLeft = polarToCartesian(gaugeCenterX, gaugeCenterY, 9, gaugeAngleForValue(totalValue) - 90);
  const gaugeNeedleRight = polarToCartesian(gaugeCenterX, gaugeCenterY, 9, gaugeAngleForValue(totalValue) + 90);
  const gaugeTicks = Array.from({ length: 11 }, (_, index) => {
    const value = index * 10;
    const angle = gaugeAngleForValue(value);
    const outer = polarToCartesian(gaugeCenterX, gaugeCenterY, gaugeOuterTickRadius, angle);
    const inner = polarToCartesian(gaugeCenterX, gaugeCenterY, value % 20 === 0 ? 66 : 72, angle);
    const label = polarToCartesian(gaugeCenterX, gaugeCenterY, gaugeLabelRadius, angle);
    return { value, outer, inner, label };
  });
  const donutCircumference = 2 * Math.PI * 70;
  const physicalArc = (physicalValue / 100) * donutCircumference;
  const derivativeArc = (derivativeValue / 100) * donutCircumference;
  const donutGapOffset = physicalArc > 0 && derivativeArc > 0 ? 6 : 0;
  const [derivativeRow, physicalRow] = distributionSlices;
  const getDistributionUnitKey = (line) => {
    const normalized = String(line || "").trim();
    if (!normalized) return "";
    const parts = normalized.split("|");
    return (parts[parts.length - 1] || normalized).trim().toLowerCase();
  };

  return (
    <>
      <article className="chart-card risk-kpi-gauge-card summary-insight-card">
        <SummaryInsightButton
          title="Hedge Realizado"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `O valor de ${formatNumber0(totalMetricValue)} sc mostra o volume total atualmente protegido ou comercializado, enquanto ${totalMetricLabel || "o subtítulo"} traduz esse mesmo número para a métrica complementar do card.`,
                `O número maior no mostrador representa o percentual total de hedge realizado sobre a produção líquida. O ponteiro compara esse percentual com a faixa da política para indicar se a posição está abaixo, dentro ou acima do alvo.`,
              ]}
            />
          }
        />
        <div className="risk-kpi-chart-card-head risk-kpi-chart-card-head--centered">
          <h2 className="risk-kpi-chart-card-title risk-kpi-card-title">Hedge Realizado</h2>
          <div className="risk-kpi-chart-card-volume">{formatNumber0(totalMetricValue)} sc</div>
          <div className="risk-kpi-chart-card-subtitle">{totalMetricLabel || " "}</div>
        </div>
        <div className="risk-kpi-sales-gauge-shell">
          <svg viewBox="0 0 300 180" className="risk-kpi-sales-gauge-svg" aria-hidden="true">
            {gaugeSegments.map((segment) => (
              <path
                key={`${segment.from}-${segment.to}-${segment.color}`}
                d={describeArc(gaugeCenterX, gaugeCenterY, gaugeArcRadius, gaugeAngleForValue(segment.from), gaugeAngleForValue(segment.to))}
                fill="none"
                stroke={segment.color}
                strokeWidth="20"
                strokeLinecap="butt"
              />
            ))}
            {gaugeTicks.map((tick) => (
              <g key={`tick-${tick.value}`}>
                <line
                  x1={tick.outer.x}
                  y1={tick.outer.y}
                  x2={tick.inner.x}
                  y2={tick.inner.y}
                  stroke="#0f172a"
                  strokeWidth={tick.value % 20 === 0 ? 2.8 : 1.2}
                  strokeLinecap="round"
                />
                <text
                  x={tick.label.x}
                  y={tick.label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="risk-kpi-sales-gauge-tick"
                >
                  {tick.value}
                </text>
              </g>
            ))}
            <path
              d={`M ${gaugeNeedleLeft.x} ${gaugeNeedleLeft.y} L ${gaugeNeedleRight.x} ${gaugeNeedleRight.y} L ${gaugePointerEnd.x} ${gaugePointerEnd.y} Z`}
              fill="#0f172a"
            />
            <circle cx={gaugeCenterX} cy={gaugeCenterY} r="11" fill="#fff" stroke="#0f172a" strokeWidth="4" />
            <text x={gaugeCenterX} y="166" textAnchor="middle" className="risk-kpi-sales-gauge-value">
              {`${rawTotalValue.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
            </text>
          </svg>
        </div>
      </article>

      <article className="chart-card risk-kpi-mini-gauge-card risk-kpi-distribution-card summary-insight-card">
        <SummaryInsightButton
          title="Distribuição do hedge"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `Este card divide o hedge total entre duas frentes: físico e derivativos. O percentual no centro resume o mix total exibido neste momento.`,
                `Os números de cada lado mostram quanto do hedge vem de cada frente, em percentual e também na unidade complementar exibida logo abaixo de cada rótulo.`,
              ]}
            />
          }
        />
        <div className="risk-kpi-chart-card-head risk-kpi-chart-card-head--centered">
          <h2 className="risk-kpi-chart-card-title risk-kpi-card-title">Distribuição</h2>
        </div>
        <div className="risk-kpi-distribution-shell">
          <div className="risk-kpi-distribution-meta risk-kpi-distribution-meta--left">
            <strong>{physicalRow?.label || "Físico"}</strong>
            <span>{physicalRow?.metricLabel || "—"}</span>
            {physicalDetailLines.map((line, index) => (
              <small
                key={`physical-detail-${index}`}
                className={index > 0 && getDistributionUnitKey(line) !== getDistributionUnitKey(physicalDetailLines[index - 1]) ? "risk-kpi-distribution-detail-break" : ""}
              >
                {line}
              </small>
            ))}
          </div>
          <div className="risk-kpi-distribution-donut-wrap">
            <svg viewBox="0 0 220 220" className="risk-kpi-distribution-svg" aria-hidden="true">
              <circle cx="110" cy="110" r="70" fill="none" stroke="rgba(226, 232, 240, 0.85)" strokeWidth="20" />
              <circle
                cx="110"
                cy="110"
                r="70"
                fill="none"
                stroke={physicalRow?.color || "rgba(250, 204, 21, 0.75)"}
                strokeWidth="20"
                strokeDasharray={`${physicalArc} ${donutCircumference}`}
                strokeDashoffset="0"
                transform="rotate(-90 110 110)"
              />
              <circle
                cx="110"
                cy="110"
                r="70"
                fill="none"
                stroke={derivativeRow?.color || "rgba(251, 146, 60, 0.85)"}
                strokeWidth="20"
                strokeDasharray={`${derivativeArc} ${donutCircumference}`}
                strokeDashoffset={-physicalArc - donutGapOffset}
                transform="rotate(-90 110 110)"
              />
              <text x="110" y="104" textAnchor="middle" className="risk-kpi-distribution-mix-label">Mix</text>
              <text x="110" y="136" textAnchor="middle" className="risk-kpi-distribution-mix-value">
                {`${rawTotalValue.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
              </text>
            </svg>
          </div>
          <div className="risk-kpi-distribution-meta risk-kpi-distribution-meta--right">
            <strong>{derivativeRow?.label || "Derivativos"}</strong>
            <span>{derivativeRow?.metricLabel || "—"}</span>
            {derivativeDetailLines.map((line, index) => (
              <small
                key={`derivative-detail-${index}`}
                className={index > 0 && getDistributionUnitKey(line) !== getDistributionUnitKey(derivativeDetailLines[index - 1]) ? "risk-kpi-distribution-detail-break" : ""}
              >
                {line}
              </small>
            ))}
          </div>
        </div>
      </article>
    </>
  );
}

function HedgeStatusSummaryCard({
  title = "Resumo Hedge",
  tone = "ok",
  summaryLine = "—",
  summaryLines = null,
  rows = [],
  insightMessage = null,
}) {
  const resolvedSummaryLines = Array.isArray(summaryLines) && summaryLines.length ? summaryLines : [summaryLine];
  return (
    <article className={`chart-card risk-kpi-hedge-summary-card is-${tone} summary-insight-card`}>
      {insightMessage ? <SummaryInsightButton title={title} message={insightMessage} /> : null}
      <div className="risk-kpi-chart-card-head risk-kpi-chart-card-head--centered risk-kpi-chart-card-head--summary">
        <h2 className="risk-kpi-chart-card-title risk-kpi-card-title">{title}</h2>
      </div>
      <div className="risk-kpi-hedge-summary-lines">
        {resolvedSummaryLines.map((line, index) => (
          <div
            key={`${title}-summary-${index}`}
            className={`risk-kpi-hedge-summary-total ${tone}${index > 0 ? " risk-kpi-hedge-summary-total-secondary" : ""}`}
          >
            {line}
          </div>
        ))}
        {rows.map((row) => (
          <div key={row.label} className="hedge-floating-line risk-kpi-hedge-summary-line">
            <span className="hedge-strong">{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

const COMPONENT_COLORS = {
  "Venda Fisico em U$": "#1b8a3b",
  "Bolsa (Futuros)": "#f59e0b",
  Dolar: "#0d40f7",
};

const formatCurrency0 = (value) =>
  `U$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatNumber0 = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatDateToPeriod = (date, interval) => {
  if (interval === "geral") return "Total Consolidado";
  if (interval === "monthly") {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }
  if (interval === "weekly") {
    const monday = new Date(date);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${formatBrazilianDate(monday)} a ${formatBrazilianDate(sunday)}`;
  }
  return formatBrazilianDate(date);
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const SHEETY_QUOTES_URL = "https://api.sheety.co/90083751cf0794f44c9730c96a94cedf/apiCotacoesSpotGetBubble/planilha1";

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const COMPONENT_DATASETS = [
  { key: "Venda Físico em U$", baseKey: "Venda Físico em U$", color: "#1B8A3B", stack: "stack_fisico_bolsa" },
  { key: "Bolsa (Futuros) · Compra Put", baseKey: "Bolsa (Futuros)", color: "#F8AE31", stack: "stack_fisico_bolsa" },
  { key: "Bolsa (Futuros) · Venda NDF", baseKey: "Bolsa (Futuros)", color: "#F59E0B", stack: "stack_fisico_bolsa" },
  { key: "Dólar · Compra Put", baseKey: "Dólar", color: "#4A6CFF", stack: "stack_dolar" },
  { key: "Dólar · Venda NDF", baseKey: "Dólar", color: "#0D40F7", stack: "stack_dolar" },
];

const COMPONENT_CATEGORY_GROUPS = [
  { label: "Venda Físico em U$", keys: ["Venda Físico em U$"], color: "#1B8A3B" },
  { label: "Bolsa (Futuros)", keys: ["Bolsa (Futuros) · Compra Put", "Bolsa (Futuros) · Venda NDF"], color: "#F59E0B" },
  { label: "Dólar", keys: ["Dólar · Compra Put", "Dólar · Venda NDF"], color: "#0D40F7" },
];

const COMPONENT_STACK_LABEL = "Venda + Bolsa";

const formatCurrency2 = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roundCurrencyDisplayValue = (value) => Number(Number(value || 0).toFixed(2));

const parseLocalizedInputNumber = (value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) return undefined;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = raw.replace(/,/g, ".");
  } else if (hasDot) {
    const parts = raw.split(".");
    const looksLikeThousands =
      /^\d{1,3}(\.\d{3})+$/.test(raw) ||
      (parts.length > 2 && parts.slice(1).every((part) => part.length === 3)) ||
      (parts.length === 2 && parts[1]?.length === 3 && parts[0]?.length <= 3);
    normalized = looksLikeThousands ? raw.replace(/\./g, "") : raw;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDashboardDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (text.includes("/")) {
    const [day, month, year] = text.split("/").map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDashboardDay = (value) => {
  const date = parseDashboardDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const startOfDashboardMonth = (value) => {
  const date = parseDashboardDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const startOfDashboardWeek = (value) => {
  const date = startOfDashboardDay(value);
  if (!date) return null;
  const weekStart = new Date(date);
  const day = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - day + 1);
  return weekStart;
};

const endOfDashboardWeek = (value) => {
  const start = startOfDashboardWeek(value);
  if (!start) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
};

const dashboardDateKey = (value) => {
  const date = startOfDashboardDay(value);
  return date ? toIsoDate(date) : "";
};

const normalizePolicyRatio = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
};

const formatHedgeAxisValue = (value, unit) => {
  if (unit === "BRL") {
    return `R$ ${Number(value || 0).toLocaleString("pt-BR")}`;
  }
  return Number(value || 0).toLocaleString("pt-BR");
};

const formatHedgeTooltipValue = (value, unit) => {
  if (unit === "BRL") {
    return `R$ ${Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${Number(value || 0).toLocaleString("pt-BR")} sc`;
};

const formatHedgeScPerHaValue = (value, unit, areaBase) => {
  if (unit !== "SC" || !(Number(areaBase || 0) > 0)) return null;
  return `${(Number(value || 0) / Number(areaBase || 1)).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} sc/ha`;
};

const formatHedgeTooltipLine = (label, value, unit, baseValue, areaBase) => {
  const parts = [formatHedgePercentValue(value, baseValue), formatHedgeTooltipValue(value, unit)];
  const scPerHa = formatHedgeScPerHaValue(value, unit, areaBase);
  if (scPerHa) {
    parts.push(scPerHa);
  }
  return `${label}: ${parts.join(" — ")}`;
};

const formatHedgeSummaryPercentValue = (value, baseValue) =>
  `${((baseValue > 0 ? Number(value || 0) / baseValue : 0) * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  })}%`;

const formatHedgeSummaryValue = (value, unit) => {
  if (unit === "BRL") {
    return `R$ ${Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
  return `${Number(value || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  })} sc`;
};

const formatHedgeSummaryScPerHaValue = (value, unit, areaBase) => {
  if (unit !== "SC" || !(Number(areaBase || 0) > 0)) return null;
  return `${(Number(value || 0) / Number(areaBase || 1)).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} sc/ha`;
};

const formatHedgeSummaryLine = (label, value, unit, baseValue, areaBase) => {
  const parts = [formatHedgeSummaryPercentValue(value, baseValue), formatHedgeSummaryValue(value, unit)];
  const scPerHa = formatHedgeSummaryScPerHaValue(value, unit, areaBase);
  if (scPerHa) {
    parts.push(scPerHa);
  }
  return `${label}: ${parts.join(" — ")}`;
};

const formatHedgeSummaryHeadline = (statusText, value, unit, areaBase) =>
  `você está ${statusText} — ${formatHedgeSummaryValue(value, unit)}${
    formatHedgeSummaryScPerHaValue(value, unit, areaBase) ? ` — ${formatHedgeSummaryScPerHaValue(value, unit, areaBase)}` : ""
  }`;

const formatHedgeSummaryPolicyDeviationValue = (value, unit) => {
  const formattedValue = formatHedgeSummaryValue(value, unit);
  return unit === "SC" ? formattedValue.replace(/ sc$/, " scs") : formattedValue;
};

const formatHedgeSummaryPolicyHeadline = (value, baseValue, minValue, maxValue, unit = "SC") => {
  if (Number.isFinite(maxValue) && value > maxValue) {
    const deviation = value - maxValue;
    return `você está ${formatHedgeSummaryPercentValue(deviation, baseValue)} (${formatHedgeSummaryPolicyDeviationValue(deviation, unit)}) acima da Política`;
  }
  if (Number.isFinite(minValue) && value < minValue) {
    const deviation = minValue - value;
    return `você está ${formatHedgeSummaryPercentValue(deviation, baseValue)} (${formatHedgeSummaryPolicyDeviationValue(deviation, unit)}) abaixo da Política`;
  }
  return "você está dentro da Política";
};

const getHedgeBandTone = (totalPercent, policyMinPercent = null, policyMaxPercent = null) => {
  const safeValue = (value) => Math.max(0, Math.min(Number(value || 0), 100));
  const safeTotal = safeValue(totalPercent);
  const hasPolicyBand = Number.isFinite(policyMinPercent) && Number.isFinite(policyMaxPercent);

  if (hasPolicyBand) {
    const minBand = safeValue(Math.min(policyMinPercent, policyMaxPercent));
    const maxBand = safeValue(Math.max(policyMinPercent, policyMaxPercent));
    const warnLowBand = safeValue(Math.max(minBand - 10, 0));
    const warnHighBand = safeValue(Math.min(maxBand + 10, 100));

    if (safeTotal < warnLowBand || safeTotal > warnHighBand) return "bad";
    if (safeTotal < minBand || safeTotal > maxBand) return "warn";
    return "ok";
  }

  if (safeTotal < 20 || safeTotal > 85) return "bad";
  if (safeTotal < 40 || safeTotal > 70) return "warn";
  return "ok";
};

const formatHedgePercentValue = (value, baseValue) =>
  `${((baseValue > 0 ? Number(value || 0) / baseValue : 0) * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;

const DERIVATIVE_CULTURE_KEYS = ["ativo", "cultura", "culturas", "destino_cultura"];

const getDerivativeCultureValue = (item) =>
  item?.ativo || item?.cultura || item?.culturas || item?.destino_cultura || item?.cultura_texto || null;

const getHedgeTodayIndex = (points = []) => {
  if (!points.length) return 0;
  const today = startOfDashboardDay(new Date());
  const todayIndex = points.findIndex((point) => {
    const pointDate = startOfDashboardDay(point?.date);
    return pointDate && today <= pointDate;
  });
  return todayIndex >= 0 ? todayIndex : points.length - 1;
};

const formatHedgeShortDate = (value, frequency) => {
  const date = parseDashboardDate(value);
  if (!date) return "—";
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  })
    .format(date)
    .replace(".", "")
    .toLowerCase();
  return label;
};

const formatHedgeTitleDate = (value) => formatBrazilianDate(parseDashboardDate(value), "—");

const hasDashboardFilterSelection = (filter = {}) =>
  ["grupo", "subgrupo", "cultura", "safra"].some((key) => {
    const value = filter?.[key];
    if (Array.isArray(value)) {
      return value.some((item) => item != null && item !== "");
    }
    return value != null && value !== "";
  });

const getAverageDashboardDate = (rows = [], fieldName) => {
  const timestamps = rows
    .map((item) => startOfDashboardDay(item?.[fieldName])?.getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  const averageTimestamp = timestamps.reduce((sum, value) => sum + value, 0) / timestamps.length;
  const averageDate = new Date(averageTimestamp);
  if (averageDate.getHours() >= 12) {
    averageDate.setDate(averageDate.getDate() + 1);
  }
  return startOfDashboardDay(averageDate);
};

const buildCropBoardDateMarkers = (cropBoardRows = []) =>
  [
    { key: "plantio", label: "plantio", date: getAverageDashboardDate(cropBoardRows, "data_plantio"), color: "#1d4ed8" },
    { key: "colheita", label: "colheita", date: getAverageDashboardDate(cropBoardRows, "data_colheita"), color: "#1d4ed8" },
  ].filter((item) => item.date);

const formatMi3 = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const formatInputInt = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatInput4 = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const buildHedgeBuckets = (startDate, endDate, frequency) => {
  const start = startOfDashboardDay(startDate);
  const end = startOfDashboardDay(endDate);
  if (!start || !end) return [];

  const buckets = [];
  if (frequency === "daily") {
    const cursor = new Date(start);
    while (cursor <= end) {
      buckets.push({
        key: dashboardDateKey(cursor),
        label: formatHedgeShortDate(cursor, frequency),
        date: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  if (frequency === "weekly") {
    const cursor = startOfDashboardWeek(start);
    while (cursor <= end) {
      const bucketDate = endOfDashboardWeek(cursor);
      buckets.push({
        key: dashboardDateKey(cursor),
        label: formatHedgeShortDate(cursor, frequency),
        date: bucketDate > end ? new Date(end) : bucketDate,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  const cursor = startOfDashboardMonth(start);
  while (cursor <= end) {
    const bucketDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: formatHedgeShortDate(cursor, frequency),
      date: bucketDate > end ? new Date(end) : bucketDate,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
};

const getDerivativeCostValue = (item, usdBrlRate) => {
  const original = Math.abs(Number(item.volume_financeiro_valor_moeda_original ?? item.volume_financeiro_valor ?? 0));
  if (!original) return 0;
  return convertValueToBrl(
    original,
    item.volume_financeiro_moeda || item.moeda_unidade || "",
    usdBrlRate,
  );
};

const readDashboardLabel = (value) => {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return readDashboardLabel(value[0]);
  if (typeof value === "object") {
    return value.ativo || value.cultura || value.nome || value.label || value.descricao || value.id || "";
  }
  return String(value);
};

const getDerivativeVolumeValue = (item) =>
  Math.abs(
    Number(
      item.volume_fisico_valor ||
        item.volume_fisico ||
        item.volume ||
        item.numero_lotes ||
        item.quantidade_derivativos ||
        0,
    ),
  );

const getDerivativeExchangeFactor = (item, exchanges = [], resolveCultureLabel = readDashboardLabel) => {
  const normalizedExchangeKeys = [
    item?.bolsa_ref,
    item?.ctrbolsa,
    item?.bolsa?.nome,
    item?.bolsa,
    item?.instituicao,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (!normalizedExchangeKeys.length || !Array.isArray(exchanges) || !exchanges.length) {
    return 1;
  }

  const derivativeCulture = normalizeText(
    resolveCultureLabel(getDerivativeCultureValue(item)),
  );
  const sameExchangeRows = exchanges.filter((exchange) => normalizedExchangeKeys.includes(normalizeText(exchange?.nome)));
  const matchedExchange =
    sameExchangeRows.find((exchange) => {
      const exchangeCulture = normalizeText(resolveCultureLabel(exchange?.ativo || exchange?.cultura));
      return derivativeCulture && exchangeCulture === derivativeCulture;
    }) ||
    sameExchangeRows[0];
  const factor = Number(matchedExchange?.fator_conversao_unidade_padrao_cultura || 0);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

const getDerivativeVolumeInStandardUnit = (item, exchanges = [], resolveCultureLabel = readDashboardLabel) => {
  const physicalVolume = getDerivativeVolumeValue(item);
  if (!physicalVolume) return 0;
  return physicalVolume / getDerivativeExchangeFactor(item, exchanges, resolveCultureLabel);
};

const getNetProductionValue = (productionRows = [], physicalPaymentRows = [], productionGetter, paymentGetter) =>
  Math.max(
    (productionRows || []).reduce((sum, item) => sum + Math.abs(Number(productionGetter(item) || 0)), 0) -
      (physicalPaymentRows || []).reduce((sum, item) => sum + Math.abs(Number(paymentGetter(item) || 0)), 0),
    0,
  );

const isUsdCurrency = (value) => {
  const moeda = normalizeText(value);
  return moeda.includes("u$") || moeda.includes("usd") || moeda.includes("us$");
};

const isEuroCurrency = (value) => {
  const moeda = normalizeText(value);
  return moeda.includes("€") || moeda.includes("eur") || moeda.includes("euro");
};

const isBrlCurrency = (value) => {
  const moeda = normalizeText(value);
  return moeda.includes("r$") || moeda.includes("brl") || moeda.includes("real");
};

const getPriceCompositionDerivativeKind = (item) => {
  if (item?.moeda_ou_cmdtye !== "Moeda") return "Bolsa";
  if (normalizeText(item?.destino_texto) === "swap de pagamento moeda estrangeira") return null;
  return "Cambio";
};

const getPriceCompositionDerivativeStatus = (item) =>
  normalizeText(item?.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";

const resolvePriceCompositionDerivativeVolume = (item) => {
  if (normalizeText(item?.moeda_ou_cmdtye) === "moeda") {
    return parseLocalizedNumber(item?.volume_financeiro_valor_moeda_original ?? item?.volume_financeiro_valor);
  }

  return parseLocalizedNumber(item?.volume ?? item?.volume_fisico_valor ?? item?.volume_fisico);
};

const calculatePriceCompositionDerivativeMtm = (item, strikeMtm, openUsdBrlQuote = 0) => {
  const isMoedaOperation = normalizeText(item?.moeda_ou_cmdtye) === "moeda";
  const status = normalizeText(item?.status_operacao);
  if (status !== "em aberto") {
    const usd = parseLocalizedNumber(item?.ajustes_totais_usd);
    return {
      usd,
      brl: isMoedaOperation ? usd : parseLocalizedNumber(item?.ajustes_totais_brl),
    };
  }

  const operationName = normalizeText(item?.nome_da_operacao || `${item?.posicao || ""} ${item?.tipo_derivativo || ""}`.trim());
  const volume = resolvePriceCompositionDerivativeVolume(item);
  const strikeUnit = normalizeText(item?.moeda_unidade ?? item?.strike_moeda_unidade);
  const strikeFactor = strikeUnit.startsWith("c") ? 0.01 : 1;
  const strikeMontagem = parseLocalizedNumber(item?.strike_montagem) * strikeFactor;
  const strikeMercado = parseLocalizedNumber(strikeMtm) * strikeFactor;
  let usd = 0;

  if (operationName.includes("venda ndf")) usd = (strikeMontagem - strikeMercado) * volume;
  else if (operationName.includes("compra ndf")) usd = (strikeMercado - strikeMontagem) * volume;
  else if (operationName.includes("compra call")) usd = strikeMercado > strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;
  else if (operationName.includes("compra put")) usd = strikeMercado < strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("venda call")) usd = strikeMercado > strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("venda put")) usd = strikeMercado < strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;

  if (isMoedaOperation) {
    return { usd, brl: usd };
  }

  const isUsdOperation = String(item?.volume_financeiro_moeda || "").trim() === "U$";
  const fx = isUsdOperation ? (openUsdBrlQuote || parseLocalizedNumber(item?.dolar_ptax_vencimento)) : 1;

  return {
    usd,
    brl: isUsdOperation ? usd * fx : usd,
  };
};

const formatMoneyByCurrency = (value, currencyLabel) =>
  `${currencyLabel} ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CASHFLOW_STATUS_OPTIONS = {
  payments: [
    { value: "Pendente", label: "Pendente" },
    { value: "Pago", label: "Pago" },
  ],
  otherCashOutflows: [
    { value: "Pendente", label: "Pendente" },
    { value: "Pago", label: "Pago" },
  ],
  otherEntries: [
    { value: "Previsto", label: "Previsto" },
    { value: "Recebido", label: "Recebido" },
  ],
  derivatives: [
    { value: "Em aberto", label: "Em aberto" },
    { value: "Encerrado", label: "Encerrado" },
  ],
};

const readEChartNumericValue = (value) => {
  if (Array.isArray(value)) return Number(value[1] || 0);
  if (value && typeof value === "object" && Array.isArray(value.value)) return Number(value.value[1] || 0);
  return Number(value || 0);
};

const CASHFLOW_CURRENCY_CONFIGS = [
  { key: "USD", label: "U$", title: "Fluxo de Caixa em U$", matcher: isUsdCurrency },
  { key: "EUR", label: "E$", title: "Fluxo de Caixa em E$", matcher: isEuroCurrency },
  { key: "BRL", label: "R$", title: "Fluxo de Caixa em R$", matcher: isBrlCurrency },
];

const getCashflowSeriesDefs = (currencyConfig) =>
  currencyConfig?.key === "BRL"
    ? [
        { key: "payments", label: "Pagamentos", color: "#ef4444", stack: "cashflow" },
        { key: "otherCashOutflows", label: "Outras saídas Caixa", color: "#b91c1c", stack: "cashflow" },
        { key: "purchaseDerivatives", label: "Compra via Derivativos", color: "#f59e0b", stack: "cashflow" },
        { key: "physicalSales", label: "Vendas", color: "#16a34a", stack: "cashflow" },
        { key: "otherEntries", label: "Outras Entradas Caixa", color: "#0f766e", stack: "cashflow" },
        { key: "saleDerivatives", label: "Vendas via Derivativos", color: "#86efac", stack: "cashflow" },
      ]
    : [
        { key: "payments", label: `Pagamentos em ${currencyConfig.label}`, color: "#ef4444", stack: "cashflow" },
        { key: "otherCashOutflows", label: `Outras saídas Caixa em ${currencyConfig.label}`, color: "#b91c1c", stack: "cashflow" },
        { key: "purchaseDerivatives", label: `NDF/Call comprado em ${currencyConfig.label}`, color: "#ffd43b", stack: "cashflow" },
        { key: "physicalSales", label: `Vendas em ${currencyConfig.label}`, color: "#16a34a", stack: "cashflow" },
        { key: "otherEntries", label: `Outras Entradas Caixa em ${currencyConfig.label}`, color: "#14b8a6", stack: "cashflow" },
        { key: "saleDerivatives", label: `Vendas em ${currencyConfig.label} via Derivativos`, color: "#b7f7bd", stack: "cashflow" },
      ];

const getCashflowSeriesLabelMap = (currencyConfig) =>
  Object.fromEntries(getCashflowSeriesDefs(currencyConfig).map((item) => [item.key, item.label]));

const getDerivativeAssetLabel = (item, cropsById = null) => {
  const directLabel =
    item?.ativo_label ||
    item?.cultura_texto ||
    (item?.ativo && typeof item.ativo === "object" ? item.ativo : null) ||
    (item?.cultura && typeof item.cultura === "object" ? item.cultura : null) ||
    (item?.destino_cultura && typeof item.destino_cultura === "object" ? item.destino_cultura : null);

  const directResolved = normalizeText(readDashboardLabel(directLabel));
  if (directResolved) return directResolved;

  const relationId = item?.ativo ?? item?.cultura ?? item?.destino_cultura;
  if (relationId != null && relationId !== "" && cropsById) {
    const crop = cropsById[String(relationId)];
    const mappedLabel = normalizeText(readDashboardLabel(crop?.ativo || crop?.cultura));
    if (mappedLabel) return mappedLabel;
  }

  return "";
};

const matchesDerivativeAssetCurrency = (item, currencyConfig, cropsById = null) => {
  if (normalizeText(item?.destino_texto) === "swap de pagamento moeda estrangeira") {
    return currencyConfig?.key === "USD";
  }
  const assetLabel = getDerivativeAssetLabel(item, cropsById);
  if (!assetLabel) return true;
  if (currencyConfig?.key === "USD") {
    return assetLabel.includes("dolar") || assetLabel.includes("dólar") || assetLabel.includes("usd") || assetLabel.includes("u$");
  }
  if (currencyConfig?.key === "EUR") {
    return assetLabel.includes("euro") || assetLabel.includes("eur") || assetLabel.includes("e$") || assetLabel.includes("€");
  }
  return true;
};

const getDerivativeCashflowSide = (item, currencyConfig, cropsById = null) => {
  if (currencyConfig?.key === "BRL") {
    // NDF/Call purchases are USD instruments — exclude from BRL cashflow
    if (getDerivativePositionValue(item) === "compra") return null;
    // Only cmdtye (commodity) sales in BRL are relevant for the BRL cashflow
    if (normalizeText(item.moeda_ou_cmdtye) !== "cmdtye") return null;
    return "saleDerivatives";
  }

  if (!matchesDerivativeAssetCurrency(item, currencyConfig, cropsById)) {
    return null;
  }

  const position = getDerivativePositionValue(item);
  const derivativeType = normalizeText(item?.tipo_derivativo);
  const operationName = normalizeText(item?.nome_da_operacao);

  const isCall = derivativeType === "call" || operationName.includes("call");
  const isPut = derivativeType === "put" || operationName.includes("put");
  const isNdf = derivativeType === "ndf" || operationName.includes("ndf");

  if (position === "compra" && (isCall || isNdf)) {
    return "purchaseDerivatives";
  }
  if ((position === "venda" && isNdf) || (position === "compra" && isPut)) {
    return "saleDerivatives";
  }
  return null;
};

const reconcileCashflowRows = (rows) => rows;

const buildCashflowPeriodLabels = (interval, dateRange = {}) => {
  if (interval === "geral") return [];
  const start = startOfDashboardDay(dateRange?.start);
  const end = startOfDashboardDay(dateRange?.end);
  if (!start || !end || start > end) return [];

  const labels = [];
  if (interval === "daily") {
    const cursor = new Date(start);
    while (cursor <= end) {
      labels.push(buildComponentPeriodKey(cursor, interval));
      cursor.setDate(cursor.getDate() + 1);
    }
    return labels;
  }

  if (interval === "weekly") {
    const cursor = startOfDashboardWeek(start);
    while (cursor <= end) {
      labels.push(buildComponentPeriodKey(cursor, interval));
      cursor.setDate(cursor.getDate() + 7);
    }
    return labels;
  }

  const cursor = startOfDashboardMonth(start);
  while (cursor <= end) {
    labels.push(buildComponentPeriodKey(cursor, interval));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return labels;
};

const convertValueToBrl = (value, currency, usdBrlRate) => {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return 0;
  if (!isUsdCurrency(currency)) return amount;
  return Number.isFinite(usdBrlRate) && usdBrlRate > 0 ? amount * usdBrlRate : amount;
};

const getUsdBrlQuoteValue = (quotes = []) => {
  const directMatch = (quotes || []).find((item) => String(item?.ticker || "").trim().toUpperCase() === "USDBRL");
  const directValue = Number(directMatch?.price || 0);
  return Number.isFinite(directValue) && directValue > 0 ? directValue : 0;
};

const shouldIncludeCashflowCurrency = (currencyConfig, currency) => {
  return currencyConfig?.matcher?.(currency);
};

const resolveCashflowDisplayValue = (value, currency, currencyConfig, usdBrlRate) => {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return 0;
  if (currencyConfig?.key === "BRL" && isUsdCurrency(currency)) {
    return convertValueToBrl(amount, currency, usdBrlRate);
  }
  return amount;
};

const getPhysicalCostValue = (item, usdBrlRate) =>
  convertValueToBrl(
    Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0),
    item.moeda_contrato,
    usdBrlRate,
  );

const getPhysicalVolumeValue = (item) => Math.abs(Number(item.volume_fisico || 0));

const getDerivativePositionValue = (item) => normalizeText(item?.posicao || item?.grupo_montagem);

const getDerivativeFinancialValue = (item) =>
  Math.abs(Number(item?.volume_financeiro_valor_moeda_original ?? item?.volume_financeiro_valor ?? 0));

const buildComponentPeriodKey = (dateObj, interval) => {
  if (interval === "geral") return "Total Consolidado";
  if (interval === "weekly") {
    const monday = new Date(dateObj);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${formatBrazilianDate(monday)} a ${formatBrazilianDate(sunday)}`;
  }
  if (interval === "monthly") {
    return `${String(dateObj.getMonth() + 1).padStart(2, "0")}/${dateObj.getFullYear()}`;
  }
  return formatBrazilianDate(dateObj);
};

const getPercentileValue = (values, percentile) => {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((item) => Number(item || 0))
    .filter((item) => Number.isFinite(item) && item > 0)
    .sort((left, right) => left - right);
  if (!numericValues.length) return 0;
  const safePercentile = Math.min(Math.max(Number(percentile || 0), 0), 1);
  const index = Math.min(
    numericValues.length - 1,
    Math.max(0, Math.ceil(numericValues.length * safePercentile) - 1),
  );
  return numericValues[index] || numericValues[numericValues.length - 1] || 0;
};

const getComponentPeriodBounds = (label, interval) => {
  if (!label || interval === "geral") return null;

  if (interval === "daily") {
    const [day, month, year] = String(label).split("/");
    const start = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (interval === "weekly") {
    const [startLabel, endLabel] = String(label).split(" a ");
    const [startDay, startMonth, startYear] = String(startLabel || "").split("/");
    const [endDay, endMonth, endYear] = String(endLabel || "").split("/");
    const start = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
    const end = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (interval === "monthly") {
    const [month, year] = String(label).split("/");
    const start = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(Number(year), Number(month), 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  return null;
};

const getComponentSortKey = (label, interval) => {
  if (interval === "daily") {
    const [day, month, year] = String(label).split("/");
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  if (interval === "weekly") {
    const [start] = String(label).split(" a ");
    const [day, month, year] = String(start).split("/");
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  if (interval === "monthly") {
    const [month, year] = String(label).split("/");
    return new Date(Number(year), Number(month) - 1, 1).getTime();
  }
  return 0;
};

const buildComponentSalesRows = ({ sales, derivatives, counterpartyMap, matchesDashboardFilter, dashboardFilter, dateFrom, dateTo }) => {
  const parseDate = (value) => {
    if (!value) return null;
    if (String(value).includes("/")) {
      const [day, month, year] = String(value).split("/");
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const physicalRows = sales
    .filter((item) => matchesDashboardFilter(item, dashboardFilter))
    .filter((item) => normalizeText(item.objetivo_venda_dolarizada) === "venda de componentes")
    .map((item) => {
      const date = parseDate(item.data_pagamento);
      if (!date) return null;
      const value = Math.abs(Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0));
      return {
        recordId: item.id,
        resourceKey: "physical-sales",
        categoria: "Venda Físico em U$",
        subcategoria: item.cultura_produto || "Outros",
        data: formatBrazilianDate(item.data_pagamento || date),
        date,
        valor: value,
        volume: Number(item.volume_fisico || 0),
        strike: Number(item.preco || 0),
        unidade: item.unidade_contrato || "",
        moeda_unidade: item.moeda_contrato && item.unidade_contrato ? `${item.moeda_contrato}/${item.unidade_contrato}` : item.moeda_contrato || "",
        instituicao: counterpartyMap[String(item.contraparte)] || "",
      };
    })
    .filter(Boolean);

  const derivativeRows = derivatives
    .filter((item) => {
      return rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: DERIVATIVE_CULTURE_KEYS,
      });
    })
    .filter((item) => {
      const compraVenda = getDerivativePositionValue(item);
      const tipoDerivativo = normalizeText(item.tipo_derivativo);
      return (
        (compraVenda === "compra" && tipoDerivativo === "put") ||
        (compraVenda === "venda" && tipoDerivativo === "ndf")
      );
    })
    .map((item) => {
      const date = parseDate(item.data_liquidacao);
      if (!date) return null;
      const compraVenda = getDerivativePositionValue(item);
      const tipoDerivativo = normalizeText(item.tipo_derivativo);
      const operationLabel = compraVenda === "compra" && tipoDerivativo === "put" ? "Compra Put" : "Venda NDF";
      const marketLabel = normalizeText(item.moeda_ou_cmdtye) === "cmdtye" ? "Bolsa (Futuros)" : "Dólar";
      return {
        recordId: item.id,
        operationCode: item.cod_operacao_mae || "",
        resourceKey: "derivative-operations",
        categoria: `${marketLabel} · ${operationLabel}`,
        categoriaBase: marketLabel,
        subcategoria: item.nome_da_operacao || "Outros",
        data: formatBrazilianDate(item.data_liquidacao || date),
        date,
        valor: getDerivativeFinancialValue(item),
        volume: Number(item.volume || item.volume_fisico || item.volume_fisico_valor || item.numero_lotes || 0),
        strike: Number(item.strike_montagem || 0),
        unidade: item.unidade || item.volume_fisico_unidade || "",
        moeda_unidade: item.moeda_unidade || item.strike_moeda_unidade || item.volume_financeiro_moeda || "",
        instituicao: item.bolsa_ref || counterpartyMap[String(item.contraparte)] || "",
      };
    })
    .filter(Boolean);

  const fromDateValue = dateFrom ? startOfDashboardDay(dateFrom) : null;
  const toDateValue = dateTo ? startOfDashboardDay(dateTo) : null;
  if (toDateValue) {
    toDateValue.setHours(23, 59, 59, 999);
  }

  return [...physicalRows, ...derivativeRows].filter((item) => {
    const time = item.date?.getTime?.();
    if (!Number.isFinite(time)) return false;
    if (fromDateValue && time < fromDateValue.getTime()) return false;
    if (toDateValue && time > toDateValue.getTime()) return false;
    return true;
  });
};

const buildComponentSalesChartState = (rows, interval, datasetVisibility = {}) => {
  const aggregate = {};
  rows.forEach((item) => {
    const period = buildComponentPeriodKey(item.date, interval);
    if (!aggregate[period]) aggregate[period] = {};
    if (!aggregate[period][item.categoria]) {
      aggregate[period][item.categoria] = {
        sumValor: 0,
        wStrikeNum: 0,
        wStrikeDen: 0,
        unidade: item.unidade || null,
        moeda_unidade: item.moeda_unidade || null,
        ops: [],
      };
    }
    const node = aggregate[period][item.categoria];
    node.sumValor += Number(item.valor) || 0;
    const strikeWeight = Math.abs(Number(item.volume) || 0) || Math.abs(Number(item.valor) || 0);
    if (Number.isFinite(item.strike)) {
      node.wStrikeNum += (Number(item.strike) || 0) * strikeWeight;
      node.wStrikeDen += strikeWeight;
    }
    if (!node.unidade && item.unidade) node.unidade = item.unidade;
    if (!node.moeda_unidade && item.moeda_unidade) node.moeda_unidade = item.moeda_unidade;
    node.ops.push(item);
  });

  const labels = Object.keys(aggregate);
  if (interval !== "geral") {
    labels.sort((left, right) => getComponentSortKey(left, interval) - getComponentSortKey(right, interval));
  }

  const metaMap = new Map();
  const opsIndex = new Map();
  const visibleKeys = new Set(
    COMPONENT_DATASETS
      .filter((definition) => datasetVisibility[definition.key] !== false)
      .map((definition) => definition.key),
  );
  const datasets = COMPONENT_DATASETS.map((definition) => {
    const data = labels.map((period) => {
      const node = aggregate[period]?.[definition.key];
      const mapKey = `${period}||${definition.key}`;
      if (!node) {
        metaMap.set(mapKey, { sumValor: 0, wAvgStrike: null, unidade: null, moeda_unidade: null });
        opsIndex.set(mapKey, []);
        return 0;
      }
      const wAvgStrike = node.wStrikeDen > 0 ? node.wStrikeNum / node.wStrikeDen : null;
      metaMap.set(mapKey, {
        sumValor: node.sumValor,
        wAvgStrike,
        unidade: node.unidade,
        moeda_unidade: node.moeda_unidade,
      });
      opsIndex.set(mapKey, node.ops);
      return Math.abs(node.sumValor);
    });

    return {
      label: definition.key,
      data,
      backgroundColor: definition.color,
      stack: definition.stack,
      borderRadius: 0,
      hidden: datasetVisibility[definition.key] === false,
    };
  });

  const totalsByCategory = [
    ...COMPONENT_CATEGORY_GROUPS.map((group) => ({
      ...group,
      keys: group.keys.filter((key) => visibleKeys.has(key)),
    })),
  ].map((group) => ({
    label: group.label,
    value: labels.reduce(
      (sum, label) =>
        sum +
        group.keys.reduce((groupSum, key) => groupSum + (aggregate[label]?.[key]?.sumValor || 0), 0),
      0,
    ),
    color: COMPONENT_DATASETS.find((definition) => definition.baseKey === group.label)?.color || "#64748b",
    strike: (() => {
      let weightedValue = 0;
      let weightedBase = 0;
      let strikeUnit = "";
      labels.forEach((label) => {
        group.keys.forEach((key) => {
          const meta = metaMap.get(`${label}||${key}`);
          const weight = Math.abs(Number(meta?.sumValor) || 0);
          if (meta?.wAvgStrike != null && weight > 0) {
            weightedValue += Number(meta.wAvgStrike) * weight;
            weightedBase += weight;
            if (!strikeUnit && meta.moeda_unidade) {
              strikeUnit = meta.moeda_unidade;
            }
          }
        });
      });
      if (!weightedBase) {
        return null;
      }
      return {
        value: weightedValue / weightedBase,
        unit: strikeUnit,
      };
    })(),
  }));

  const periods = labels.map((label) => {
    const fisico = visibleKeys.has("Venda Físico em U$") ? Math.abs(aggregate[label]?.["Venda Físico em U$"]?.sumValor || 0) : 0;
    const bolsaCompraPut = visibleKeys.has("Bolsa (Futuros) · Compra Put")
      ? Math.abs(aggregate[label]?.["Bolsa (Futuros) · Compra Put"]?.sumValor || 0)
      : 0;
    const bolsaVendaNdf = visibleKeys.has("Bolsa (Futuros) · Venda NDF")
      ? Math.abs(aggregate[label]?.["Bolsa (Futuros) · Venda NDF"]?.sumValor || 0)
      : 0;
    const dolarCompraPut = visibleKeys.has("Dólar · Compra Put")
      ? Math.abs(aggregate[label]?.["Dólar · Compra Put"]?.sumValor || 0)
      : 0;
    const dolarVendaNdf = visibleKeys.has("Dólar · Venda NDF")
      ? Math.abs(aggregate[label]?.["Dólar · Venda NDF"]?.sumValor || 0)
      : 0;
    const bolsa = bolsaCompraPut + bolsaVendaNdf;
    const dolar = dolarCompraPut + dolarVendaNdf;
    return {
      label,
      fisico,
      bolsa,
      dolar,
      bolsaCompraPut,
      bolsaVendaNdf,
      dolarCompraPut,
      dolarVendaNdf,
      stackTotal: fisico + bolsa,
      strongestValue: Math.max(fisico + bolsa, dolar),
    };
  });

  labels.forEach((label) => {
    const bolsaKeys = ["Bolsa (Futuros) · Compra Put", "Bolsa (Futuros) · Venda NDF"];
    const dolarKeys = ["Dólar · Compra Put", "Dólar · Venda NDF"];

    const buildCombinedMeta = (keys) => {
      let sumValor = 0;
      let wStrikeNum = 0;
      let wStrikeDen = 0;
      let unidade = null;
      let moeda_unidade = null;
      const ops = [];

      keys.forEach((key) => {
        const node = aggregate[label]?.[key];
        if (!node) return;
        sumValor += Number(node.sumValor) || 0;
        wStrikeNum += Number(node.wStrikeNum) || 0;
        wStrikeDen += Number(node.wStrikeDen) || 0;
        if (!unidade && node.unidade) unidade = node.unidade;
        if (!moeda_unidade && node.moeda_unidade) moeda_unidade = node.moeda_unidade;
        ops.push(...(node.ops || []));
      });

      return {
        sumValor,
        wAvgStrike: wStrikeDen > 0 ? wStrikeNum / wStrikeDen : null,
        unidade,
        moeda_unidade,
        ops,
      };
    };

    const bolsaMeta = buildCombinedMeta(bolsaKeys);
    metaMap.set(`${label}||Bolsa (Futuros)`, {
      sumValor: bolsaMeta.sumValor,
      wAvgStrike: bolsaMeta.wAvgStrike,
      unidade: bolsaMeta.unidade,
      moeda_unidade: bolsaMeta.moeda_unidade,
    });
    opsIndex.set(`${label}||Bolsa (Futuros)`, bolsaMeta.ops);

    const dolarMeta = buildCombinedMeta(dolarKeys);
    metaMap.set(`${label}||Dólar`, {
      sumValor: dolarMeta.sumValor,
      wAvgStrike: dolarMeta.wAvgStrike,
      unidade: dolarMeta.unidade,
      moeda_unidade: dolarMeta.moeda_unidade,
    });
    opsIndex.set(`${label}||Dólar`, dolarMeta.ops);
  });

  return { labels, datasets, metaMap, opsIndex, totalsByCategory, periods };
};

function useComponentSalesSource(dashboardFilter, dateFrom, dateTo, cacheKey) {
  const { matchesDashboardFilter } = useDashboardFilter();
  const initialCache = getDashboardPageCache(cacheKey);
  const initialSource = initialCache?.componentSalesSource || {};
  const [sales, setSales] = useState(() => initialSource.sales || []);
  const [derivatives, setDerivatives] = useState(() => initialSource.derivatives || []);
  const [counterparties, setCounterparties] = useState(() => initialSource.counterparties || []);
  const [sourceReady, setSourceReady] = useState(() => Boolean(initialCache?.componentSalesSourceReady));

  useEffect(() => {
    let isMounted = true;
    const cachedDashboard = getDashboardPageCache(cacheKey);

    if (cachedDashboard?.componentSalesSourceReady) {
      const cachedSource = cachedDashboard.componentSalesSource || {};
      setSales(cachedSource.sales || []);
      setDerivatives(cachedSource.derivatives || []);
      setCounterparties(cachedSource.counterparties || []);
      setSourceReady(true);
    }

    const loadSource = () => {
      Promise.all([
        resourceService.listAll("physical-sales").catch(() => []),
        resourceService.listAll("derivative-operations").catch(() => []),
        resourceService.listAll("counterparties").catch(() => []),
      ]).then(([salesResponse, derivativesResponse, counterpartiesResponse]) => {
        if (!isMounted) return;
        const nextSource = {
          sales: salesResponse || [],
          derivatives: derivativesResponse || [],
          counterparties: counterpartiesResponse || [],
        };
        setSales(nextSource.sales);
        setDerivatives(nextSource.derivatives);
        setCounterparties(nextSource.counterparties);
        setSourceReady(true);
        setDashboardPageCache(cacheKey, {
          componentSalesSource: nextSource,
          componentSalesSourceReady: true,
        });
      });
    };

    const timeoutId = typeof window !== "undefined"
      ? window.setTimeout(loadSource, cachedDashboard?.componentSalesSourceReady ? 1200 : 0)
      : 0;
    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!sourceReady) return;
    setDashboardPageCache(cacheKey, {
      componentSalesSource: { sales, derivatives, counterparties },
      componentSalesSourceReady: true,
    });
  }, [cacheKey, counterparties, derivatives, sales, sourceReady]);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );

  const rows = useMemo(
    () =>
      buildComponentSalesRows({
        sales,
        derivatives,
        counterpartyMap,
        matchesDashboardFilter,
        dashboardFilter,
        dateFrom,
        dateTo,
      }),
    [counterpartyMap, dashboardFilter, dateFrom, dateTo, derivatives, matchesDashboardFilter, sales],
  );

  return { rows, sales, setSales, derivatives, setDerivatives };
}

function ComponentSalesDetailsPopup({ selectedBar, onClose, onOpenOperation }) {
  const popupSummary = useMemo(() => {
    if (!selectedBar?.ops?.length) return null;
    const totalValor = selectedBar.ops.reduce((sum, item) => sum + Math.abs(Number(item.valor) || 0), 0);
    const totalVolume = selectedBar.ops.reduce((sum, item) => sum + (Number(item.volume) || 0), 0);
    const wDen = selectedBar.ops.reduce(
      (sum, item) => sum + (Math.abs(Number(item.volume) || 0) || Math.abs(Number(item.valor) || 0)),
      0,
    );
    const wNum = selectedBar.ops.reduce(
      (sum, item) =>
        sum + (Number(item.strike) || 0) * (Math.abs(Number(item.volume) || 0) || Math.abs(Number(item.valor) || 0)),
      0,
    );
    const wAvgStrike = wDen > 0 ? wNum / wDen : null;
    return { totalValor, totalVolume, wAvgStrike };
  }, [selectedBar]);

  if (!selectedBar) {
    return null;
  }

  const handleOpenOperation = (item) => {
    onClose?.();
    onOpenOperation?.(item);
  };

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>
          ×
        </button>
        <div className="component-popup-header">
          <span
            className="chart-legend-dot"
            style={{ background: selectedBar.color || COMPONENT_DATASETS.find((dataset) => dataset.key === selectedBar.category)?.color || "#64748b" }}
          />
          <strong>{selectedBar.category}</strong>
          <span className="muted">— {selectedBar.period}</span>
        </div>
        <table className="component-popup-table">
          <thead>
            <tr>
              <th className="component-popup-action-col" />
              <th>Data do vencimento</th>
              <th>Valor</th>
              <th>Volume</th>
              <th>Strike</th>
              <th>Instituição</th>
            </tr>
          </thead>
          <tbody>
            {selectedBar.ops.map((item, index) => (
              <tr key={`${item.data}-${index}`}>
                <td className="component-popup-action-cell">
                  {item.recordId ? <ComponentPopupEyeButton onClick={() => handleOpenOperation(item)} /> : null}
                </td>
                <td>{item.data}</td>
                <td>{formatCurrency0(Math.abs(item.valor || 0))}</td>
                <td>
                  {Number(item.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  {item.unidade ? ` ${item.unidade}` : ""}
                </td>
                <td>
                  {Number(item.strike || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {item.moeda_unidade ? ` ${item.moeda_unidade}` : ""}
                </td>
                <td>{item.instituicao || "—"}</td>
              </tr>
            ))}
            {popupSummary ? (
              <tr>
                <td />
                <td><strong>Total</strong></td>
                <td><strong>{formatCurrency0(popupSummary.totalValor)}</strong></td>
                <td><strong>{popupSummary.totalVolume.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</strong></td>
                <td>
                  <strong>
                    {popupSummary.wAvgStrike != null
                      ? popupSummary.wAvgStrike.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "—"}
                  </strong>
                </td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComponentSalesDashboard({ dashboardFilter }) {
  const { user } = useAuth();
  const dashboardCacheKey = useMemo(
    () => buildDashboardPageCacheKey("component-sales", dashboardFilter, user),
    [dashboardFilter, user],
  );
  const initialUiState = getDashboardPageCache(dashboardCacheKey)?.componentSalesUi || {};
  const chartWrapRef = useRef(null);
  const zoomIntervalMountRef = useRef(true);
  const [interval, setInterval] = useState(() => initialUiState.interval || "monthly");
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [zoomRange, setZoomRange] = useState(() => {
    if (initialUiState.zoomRange) return initialUiState.zoomRange;
    return { start: new Date(0), end: new Date(2999, 11, 31) };
  });
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(360);

  const { rows, sales, setSales, derivatives, setDerivatives } = useComponentSalesSource(
    dashboardFilter, null, null, dashboardCacheKey,
  );
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales, setSales, derivatives, setDerivatives,
  });

  // Timeline from ALL rows (drives slider range)
  const allChartState = useMemo(
    () => buildComponentSalesChartState(rows, interval, {}),
    [rows, interval],
  );
  const timelinePeriods = useMemo(() => {
    if (interval === "geral") return [];
    return allChartState.labels
      .map((label, idx) => {
        const bounds = getComponentPeriodBounds(label, interval);
        if (!bounds?.start || !bounds?.end) return null;
        return { label, idx, start: bounds.start, end: bounds.end };
      })
      .filter(Boolean);
  }, [allChartState.labels, interval]);

  // Slider thumb positions
  const sliderStartIdx = useMemo(() => {
    if (!timelinePeriods.length) return 0;
    const t = zoomRange.start.getTime();
    const idx = timelinePeriods.findIndex((p) => p.start.getTime() >= t);
    return idx < 0 ? 0 : idx;
  }, [timelinePeriods, zoomRange]);
  const sliderEndIdx = useMemo(() => {
    if (!timelinePeriods.length) return 0;
    const t = zoomRange.end.getTime();
    let found = timelinePeriods.length - 1;
    for (let i = timelinePeriods.length - 1; i >= 0; i--) {
      if (timelinePeriods[i].start.getTime() <= t) { found = i; break; }
    }
    return found;
  }, [timelinePeriods, zoomRange]);

  // Visible rows — data in the selected slider range
  const visibleRows = useMemo(() => {
    if (interval === "geral") return rows;
    if (!timelinePeriods.length) return rows;
    const visibleLabels = new Set(
      timelinePeriods.slice(sliderStartIdx, sliderEndIdx + 1).map((p) => p.label),
    );
    return rows.filter((item) => visibleLabels.has(buildComponentPeriodKey(item.date, interval)));
  }, [interval, rows, timelinePeriods, sliderStartIdx, sliderEndIdx]);

  // Single source of truth: visible chart state drives BOTH cards and chart
  const visibleChartState = useMemo(
    () => buildComponentSalesChartState(visibleRows, interval, {}),
    [visibleRows, interval],
  );

  // Reset zoom when interval changes (skip mount so cached value is preserved)
  useEffect(() => {
    if (zoomIntervalMountRef.current) { zoomIntervalMountRef.current = false; return; }
    setZoomRange({ start: new Date(0), end: new Date(2999, 11, 31) });
  }, [interval]);

  // Save UI state
  useEffect(() => {
    setDashboardPageCache(dashboardCacheKey, { componentSalesUi: { interval, zoomRange } });
  }, [dashboardCacheKey, interval, zoomRange]);

  // ResizeObserver for chart container dimensions
  useEffect(() => {
    const node = chartWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      if (Number.isFinite(rect?.width) && rect.width > 0) setChartWidth(rect.width);
      if (Number.isFinite(rect?.height) && rect.height > 0) setChartHeight(rect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Format a period key ("10/2026") into a human-readable x-axis label
  const fmtPeriod = useCallback((label) => {
    if (interval === "geral") return label;
    const bounds = getComponentPeriodBounds(label, interval);
    if (!bounds?.start) return label;
    return interval === "monthly"
      ? formatCashflowMonthYear(bounds.start)
      : formatBrazilianDate(bounds.start);
  }, [interval]);

  // Open modal when clicking a summary card
  const openSummaryCardModal = useCallback((groupLabel) => {
    const matching = visibleRows.filter((row) => {
      if (groupLabel === "Venda Físico em U$") return row.resourceKey === "physical-sales";
      if (groupLabel === "Bolsa (Futuros)") return row.resourceKey === "derivative-operations" && row.categoriaBase === "Bolsa (Futuros)";
      if (groupLabel === "Dólar") return row.resourceKey === "derivative-operations" && row.categoriaBase === "Dólar";
      return false;
    });
    const definition = groupLabel === "Venda Físico em U$"
      ? resourceDefinitions.physicalSales
      : resourceDefinitions.derivativeOperations;
    const source = definition?.resource === "physical-sales" ? sales : derivatives;
    const ids = new Set(matching.map((r) => String(r.recordId)).filter(Boolean));
    const codes = new Set(matching.map((r) => String(r.operationCode || "")).filter(Boolean));
    const filtered = source.filter(
      (row) => ids.has(String(row.id)) || codes.has(String(row.cod_operacao_mae || "")),
    );
    if (!filtered.length) return;
    const suffix = interval === "geral" ? "Total Consolidado" : "Período visível";
    setSelectedTableModal({ title: `${groupLabel} — ${suffix}`, definition, rows: filtered });
  }, [derivatives, interval, sales, visibleRows]);

  // Open modal when clicking a chart bar
  const openTableModal = useCallback((periodLabel, seriesName) => {
    const ops = visibleChartState.opsIndex.get(`${periodLabel}||${seriesName}`) || [];
    const definition = seriesName.startsWith("Venda Físico")
      ? resourceDefinitions.physicalSales
      : resourceDefinitions.derivativeOperations;
    const source = definition?.resource === "physical-sales" ? sales : derivatives;
    const ids = new Set(ops.map((o) => String(o.recordId)).filter(Boolean));
    const codes = new Set(ops.map((o) => String(o.operationCode || "")).filter(Boolean));
    const filtered = source.filter(
      (row) => ids.has(String(row.id)) || codes.has(String(row.cod_operacao_mae || "")),
    );
    if (!filtered.length) return;
    setSelectedTableModal({ title: `${seriesName} — ${periodLabel}`, definition, rows: filtered });
  }, [derivatives, sales, visibleChartState.opsIndex]);

  // Chart option — uses visibleChartState directly, no index translation
  const chartOption = useMemo(() => {
    const now = startOfDashboardDay(new Date()).getTime();
    const visibleDatasets = visibleChartState.datasets.filter((d) => !d.hidden);
    const lastByStack = visibleDatasets.reduce((acc, d) => ({ ...acc, [d.stack]: d.label }), {});
    const periodsByIndex = visibleChartState.periods || [];
    const effectiveWidth = Math.max(Number(chartWidth) || 0, 320);
    const labelCount = Math.max(visibleChartState.labels.length, 1);
    const stackCount = Math.max(1, new Set(visibleDatasets.map((d) => d.stack)).size);
    const slotW = (effectiveWidth - 60) / labelCount;
    const barWidth = Math.max(6, Math.min(80, (slotW * 0.55) / stackCount));
    const todayLabel = interval !== "geral"
      ? visibleChartState.labels.find((label) => {
          const b = getComponentPeriodBounds(label, interval);
          return b && now >= b.start.getTime() && now <= b.end.getTime();
        })
      : null;

    return {
      animationDuration: 200,
      grid: { top: 32, right: 16, bottom: 8, left: 16, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const items = params.filter((p) => Number(p.value || 0) > 0);
          if (!items.length) return "";
          const header = items[0]?.axisValueLabel || "";
          const body = items
            .map((p) => `${p.marker}${p.seriesName}: U$ ${Number(p.value || 0).toLocaleString("pt-BR")}`)
            .join("<br/>");
          return header ? `<strong>${header}</strong><br/>${body}` : body;
        },
      },
      xAxis: {
        type: "category",
        data: visibleChartState.labels.map(fmtPeriod),
        axisTick: { show: false },
        axisLabel: { color: "#475569", fontWeight: 700, fontSize: 12, hideOverlap: true, margin: 12 },
        axisLine: { lineStyle: { color: "rgba(15,23,42,0.15)" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: "#475569", fontSize: 11, formatter: (v) => Number(v).toLocaleString("pt-BR") },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.08)" } },
      },
      series: visibleChartState.datasets.map((dataset, di) => ({
        name: dataset.label,
        type: "bar",
        stack: dataset.stack,
        barWidth,
        barMaxWidth: barWidth,
        barMinHeight: dataset.hidden ? 0 : 2,
        cursor: "pointer",
        itemStyle: { color: dataset.backgroundColor, borderRadius: 0 },
        label: {
          show: !dataset.hidden && lastByStack[dataset.stack] === dataset.label,
          position: "top",
          color: "#111827",
          fontSize: 11,
          fontWeight: 700,
          distance: 4,
          formatter: ({ value, dataIndex }) => {
            if (!(Number(value) > 0)) return "";
            const period = periodsByIndex[dataIndex];
            const total = dataset.stack === "stack_dolar" ? period?.dolar || 0 : period?.stackTotal || 0;
            return total > 0 ? `U$ ${Number(total).toLocaleString("pt-BR")}` : "";
          },
        },
        markLine: di === 0 && todayLabel
          ? {
              symbol: ["none", "none"],
              silent: true,
              animation: false,
              data: [{ xAxis: fmtPeriod(todayLabel) }],
              lineStyle: { color: "rgba(37,99,235,0.9)", type: "dashed", width: 2 },
              label: {
                show: true,
                formatter: "Hoje",
                position: "start",
                color: "#1d4ed8",
                backgroundColor: "#dbeafe",
                borderRadius: 999,
                padding: [3, 8],
                fontSize: 11,
              },
            }
          : { data: [] },
        data: dataset.hidden ? [] : dataset.data,
      })),
    };
  }, [visibleChartState, interval, chartWidth, fmtPeriod]);

  const chartEvents = useMemo(() => ({
    click: (params) => {
      if (!params?.seriesName) return;
      if (!(Number(params.value || 0) > 0)) return;
      const periodLabel = visibleChartState.labels[params.dataIndex];
      if (periodLabel) openTableModal(periodLabel, params.seriesName);
    },
  }), [openTableModal, visibleChartState.labels]);

  const sliderFmtLabel = useCallback(
    (p) => (interval === "monthly" ? formatCashflowMonthYear(p.start) : formatBrazilianDate(p.start)),
    [interval],
  );

  return (
    <section className="component-sales-shell">
      <section className="stats-grid">
        {visibleChartState.totalsByCategory.map((item) => (
          <article
            key={`cs-card-${item.label}`}
            className="card stat-card component-summary-card summary-insight-card"
            role="button"
            tabIndex={0}
            onClick={() => openSummaryCardModal(item.label)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSummaryCardModal(item.label); }
            }}
            style={{ cursor: "pointer" }}
          >
            <SummaryInsightButton
              title={item.label}
              message={
                <SummaryInsightCopy
                  paragraphs={[
                    `O valor principal de ${formatCurrency0(item.value)} representa o faturamento total acumulado desta categoria no período visível.`,
                    item.strike
                      ? `O strike médio de ${formatCurrency2(item.strike.value)}${item.strike.unit ? ` ${item.strike.unit}` : ""} resume o preço médio ponderado das operações que formam esse total.`
                      : "Esse número é a soma financeira das operações associadas a esta categoria dentro do intervalo filtrado.",
                  ]}
                />
              }
            />
            <span className="component-summary-label">
              <span
                className="component-summary-dot"
                style={{ background: COMPONENT_DATASETS.find((d) => d.baseKey === item.label)?.color || "#64748b" }}
              />
              {item.label}
            </span>
            <strong>{formatCurrency0(item.value)}</strong>
            {item.strike ? (
              <span className="component-summary-meta">
                strike medio: {formatCurrency2(item.strike.value)}
                {item.strike.unit ? ` ${item.strike.unit}` : ""}
              </span>
            ) : null}
          </article>
        ))}
      </section>

      <div className="chart-card component-chartjs-card cashflow-chart-card summary-insight-card">
        <SummaryInsightButton
          title="Venda de Componentes"
          message={
            <SummaryInsightCopy
              paragraphs={[
                "Este gráfico distribui o valor financeiro das vendas de componentes por período, usando os totais dos cards acima como referência resumida.",
                "Cada barra mostra o valor de uma categoria no intervalo selecionado, e os rótulos no topo destacam os totais por período em U$.",
              ]}
            />
          }
        />
        <div className="chart-card-header">
          <div><h3>Venda de Componentes</h3></div>
          <div className="chart-toolbar">
            {[["daily", "Diário"], ["weekly", "Semanal"], ["monthly", "Mensal"], ["geral", "Geral"]].map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                className={`chart-period-btn${interval === v ? " active" : ""}`}
                onClick={() => setInterval(v)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div ref={chartWrapRef} className="component-chartjs-wrap">
          <ReactECharts
            option={chartOption}
            onEvents={chartEvents}
            style={{ height: `${chartHeight}px` }}
            opts={{ renderer: "svg" }}
          />
        </div>

        <div className="component-chart-legend-bottom">
          {COMPONENT_CATEGORY_GROUPS.map((item) => (
            <div key={`cs-legend-${item.label}`} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {interval !== "geral" && timelinePeriods.length > 1 ? (() => {
          const total = timelinePeriods.length;
          const startPct = (sliderStartIdx / Math.max(total - 1, 1)) * 100;
          const endPct = (sliderEndIdx / Math.max(total - 1, 1)) * 100;
          return (
            <div className="hedge-slider-wrap">
              <div className="hedge-slider-dates">
                <span>{sliderFmtLabel(timelinePeriods[0])}</span>
                <span>{sliderFmtLabel(timelinePeriods[total - 1])}</span>
              </div>
              <div className="hedge-slider-track">
                <div className="hedge-slider-track-bg" />
                <div className="hedge-slider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
                <input
                  type="range"
                  className="hedge-slider-input"
                  min={0} max={total - 1}
                  value={sliderStartIdx}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v <= sliderEndIdx && timelinePeriods[v]?.start && timelinePeriods[sliderEndIdx]?.end) {
                      setZoomRange({ start: timelinePeriods[v].start, end: timelinePeriods[sliderEndIdx].end });
                    }
                  }}
                />
                <input
                  type="range"
                  className="hedge-slider-input"
                  min={0} max={total - 1}
                  value={sliderEndIdx}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= sliderStartIdx && timelinePeriods[sliderStartIdx]?.start && timelinePeriods[v]?.end) {
                      setZoomRange({ start: timelinePeriods[sliderStartIdx].start, end: timelinePeriods[v].end });
                    }
                  }}
                />
              </div>
            </div>
          );
        })() : null}
      </div>

      {selectedTableModal ? (
        <DashboardResourceTableModal
          title={selectedTableModal.title}
          definition={selectedTableModal.definition}
          rows={selectedTableModal.rows}
          onClose={() => setSelectedTableModal(null)}
          onEdit={(row) => openOperationForm({
            ...row,
            recordId: row.id,
            resourceKey: selectedTableModal.definition.resource,
          })}
        />
      ) : null}
      {editorNode}
    </section>
  );
}


const buildCashflowRows = ({
  sales,
  cashPayments,
  otherCashOutflows,
  otherEntries,
  derivatives,
  counterpartyMap,
  dashboardFilter,
  currencyConfig,
  usdBrlRate,
  cropsById,
}) => {
  const labelMap = getCashflowSeriesLabelMap(currencyConfig);
  const parseDate = (value) => {
    if (!value) return null;
    if (String(value).includes("/")) {
      const [day, month, year] = String(value).split("/");
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const paymentRows = cashPayments
    .filter((item) =>
      rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: ["fazer_frente_com"],
        seasonKeys: ["safra"],
      }),
    )
    .filter((item) => shouldIncludeCashflowCurrency(currencyConfig, item.moeda))
    .map((item) => {
      const cashflowDate = item.data_pagamento || item.data_vencimento;
      const rawAmount = Number(item.valor ?? item.volume ?? 0);
      const amount = resolveCashflowDisplayValue(rawAmount, item.moeda, currencyConfig, usdBrlRate);
      const date = parseDate(cashflowDate);
      if (!date) return null;
      return {
        recordId: item.id,
        resourceKey: "cash-payments",
        categoryKey: "payments",
        category: labelMap.payments,
        date,
        data: formatBrazilianDate(cashflowDate || date),
        valor: -Math.abs(amount),
        volume: rawAmount,
        instituicao: item.contraparte_texto || counterpartyMap[String(item.contraparte)] || "",
        descricao: item.descricao || "",
        conversionNote:
          currencyConfig?.key === "BRL" && isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
            : "",
      };
    })
    .filter(Boolean);

  const salesRows = sales
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .filter((item) => shouldIncludeCashflowCurrency(currencyConfig, item.moeda_contrato))
    .map((item) => {
      const date = parseDate(item.data_pagamento || item.data_negociacao);
      if (!date) return null;
      const rawAmount = Math.abs(Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0));
      const amount = resolveCashflowDisplayValue(rawAmount, item.moeda_contrato, currencyConfig, usdBrlRate);
      return {
        recordId: item.id,
        resourceKey: "physical-sales",
        categoryKey: "physicalSales",
        category: labelMap.physicalSales,
        date,
        data: formatBrazilianDate(item.data_pagamento || item.data_negociacao || date),
        valor: amount,
        volume: Number(item.volume_fisico || 0),
        preco: Number(item.preco || 0),
        moedaUnidade: item.moeda_contrato && item.unidade_contrato ? `${item.moeda_contrato}/${item.unidade_contrato}` : item.moeda_contrato || "",
        instituicao: counterpartyMap[String(item.contraparte)] || "",
        conversionNote:
          currencyConfig?.key === "BRL" && isUsdCurrency(item.moeda_contrato) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
            : "",
      };
    })
    .filter(Boolean);

  const otherCashOutflowRows = otherCashOutflows
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .filter((item) => shouldIncludeCashflowCurrency(currencyConfig, item.moeda))
    .map((item) => {
      const date = parseDate(item.data_pagamento);
      if (!date) return null;
      const rawAmount = Number(item.valor || 0);
      const amount = resolveCashflowDisplayValue(rawAmount, item.moeda, currencyConfig, usdBrlRate);
      return {
        recordId: item.id,
        resourceKey: "other-cash-outflows",
        categoryKey: "otherCashOutflows",
        category: labelMap.otherCashOutflows,
        date,
        data: formatBrazilianDate(item.data_pagamento || date),
        valor: -Math.abs(amount),
        volume: rawAmount,
        descricao: item.descricao || "",
        instituicao: "",
        conversionNote:
          currencyConfig?.key === "BRL" && isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
            : "",
      };
    })
    .filter(Boolean);

  const otherEntryRows = otherEntries
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .filter((item) => shouldIncludeCashflowCurrency(currencyConfig, item.moeda))
    .map((item) => {
      const date = parseDate(item.data_entrada);
      if (!date) return null;
      const rawAmount = Number(item.valor || 0);
      const amount = resolveCashflowDisplayValue(rawAmount, item.moeda, currencyConfig, usdBrlRate);
      return {
        recordId: item.id,
        resourceKey: "other-entries",
        categoryKey: "otherEntries",
        category: labelMap.otherEntries,
        date,
        data: formatBrazilianDate(item.data_entrada || date),
        valor: Math.abs(amount),
        volume: rawAmount,
        descricao: item.descricao || "",
        instituicao: "",
        conversionNote:
          currencyConfig?.key === "BRL" && isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
            : "",
      };
    })
    .filter(Boolean);

  const derivativeRows = derivatives
    .filter((item) =>
      rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: DERIVATIVE_CULTURE_KEYS,
      }),
    )
    .filter((item) => {
      const tipo = normalizeText(item.moeda_ou_cmdtye);
      if (tipo === "moeda") return true;
      // cmdtye derivatives: only include in BRL chart (commodity sales priced in R$)
      if (currencyConfig?.key === "BRL" && tipo === "cmdtye") return true;
      return false;
    })
    .filter((item) => shouldIncludeCashflowCurrency(currencyConfig, item.volume_financeiro_moeda || item.moeda_unidade))
    .map((item) => {
      const date = parseDate(item.data_liquidacao || item.data_contratacao);
      if (!date) return null;
      const cashflowSide = getDerivativeCashflowSide(item, currencyConfig, cropsById);
      if (!cashflowSide) return null;
      const derivativeCurrency = item.volume_financeiro_moeda || item.moeda_unidade;
      const rawAmount = Number(item.volume_financeiro_valor_moeda_original ?? item.volume_financeiro_valor ?? 0);
      const amount = resolveCashflowDisplayValue(rawAmount, derivativeCurrency, currencyConfig, usdBrlRate);
      return {
        recordId: item.id,
        resourceKey: "derivative-operations",
        categoryKey: cashflowSide,
        category: labelMap[cashflowSide],
        date,
        data: formatBrazilianDate(item.data_liquidacao || item.data_contratacao || date),
        valor: Math.abs(amount),
        volume: Number(item.volume || item.numero_lotes || 0),
        preco: Number(item.strike_montagem || item.strike_liquidacao || 0),
        moedaUnidade: item.moeda_unidade || item.volume_financeiro_moeda || "",
        instituicao: item.bolsa_ref || counterpartyMap[String(item.contraparte)] || "",
        tipo: item.tipo_derivativo || "",
        conversionNote:
          currencyConfig?.key === "BRL" && isUsdCurrency(derivativeCurrency) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
            : "",
      };
    })
    .filter(Boolean);

  return reconcileCashflowRows([...paymentRows, ...otherCashOutflowRows, ...salesRows, ...otherEntryRows, ...derivativeRows]);
};

const buildCashflowChartState = (rows, interval, currencyConfig, dateRange) => {
  const seriesDefs = getCashflowSeriesDefs(currencyConfig);
  const grouped = new Map();
  rows.forEach((row) => {
    const period = buildComponentPeriodKey(row.date, interval);
    if (!grouped.has(period)) {
      grouped.set(period, Object.fromEntries(seriesDefs.map((item) => [item.key, { total: 0, ops: [] }])));
    }
    const periodNode = grouped.get(period);
    periodNode[row.categoryKey].total += Number(row.valor || 0);
    periodNode[row.categoryKey].ops.push(row);
  });

  const labels = Array.from(grouped.keys());
  if (interval !== "geral") {
    labels.sort((left, right) => getComponentSortKey(left, interval) - getComponentSortKey(right, interval));
  }

  const opsIndex = new Map();
  const datasets = seriesDefs.map((seriesDef) => ({
    label: seriesDef.label,
    data: labels.map((label) => {
      const node = grouped.get(label)?.[seriesDef.key];
      const key = `${label}||${seriesDef.key}`;
      opsIndex.set(key, node?.ops || []);
      return Number(node?.total || 0);
    }),
    backgroundColor: seriesDef.color,
    borderColor: seriesDef.color,
    stack: seriesDef.stack,
    borderRadius: 0,
    order: 2,
  }));

  const saldoData = labels.map((label) =>
    seriesDefs.reduce((sum, item) => sum + Number(grouped.get(label)?.[item.key]?.total || 0), 0),
  );

  const saldoLabel = currencyConfig?.key === "BRL" ? "Saldo" : `Exposição líquida em ${currencyConfig?.label ?? ""}`;

  const saldoAbsValues = saldoData.map((v) => Math.abs(Number(v || 0)));
  const maxSaldoAbs = Math.max(...saldoAbsValues, 1);
  const saldoPointRadii = saldoAbsValues.map((abs) => {
    const ratio = abs / maxSaldoAbs;
    return Math.round(4 + ratio * 10);
  });

  datasets.push({
    label: saldoLabel,
    type: "line",
    data: saldoData,
    borderColor: "#64748b",
    backgroundColor: "#64748b",
    pointBackgroundColor: saldoData.map((value) => (Number(value || 0) < 0 ? "#ef4444" : "#16a34a")),
    tension: 0.35,
    pointRadius: saldoPointRadii,
    pointHoverRadius: saldoPointRadii.map((r) => r + 2),
    pointBorderWidth: 2,
    pointBorderColor: "#ffffff",
    yAxisID: "y",
    order: 0,
  });

  const totals = seriesDefs.map((item) => ({
    label: item.label,
    value: labels.reduce((sum, label) => sum + Number(grouped.get(label)?.[item.key]?.total || 0), 0),
    color: item.color,
  }));
  const saldoTotal = saldoData.reduce((sum, value) => sum + Number(value || 0), 0);

  const periodSummaries = new Map(
    labels.map((label, index) => [
      label,
      {
        totals: seriesDefs.map((item) => ({
          label: item.label,
          value: Number(grouped.get(label)?.[item.key]?.total || 0),
          color: item.color,
        })),
        saldo: Number(saldoData[index] || 0),
      },
    ]),
  );

  return { labels, datasets, opsIndex, totals, saldoData, saldoTotal, periodSummaries, seriesDefs };
};

function CashflowHedgeGauge({ pct }) {
  const MAX = 150;
  const cx = 150;
  const cy = 108;
  const arcRadius = 74;
  const outerTickRadius = 84;
  const labelRadius = 96;
  const gaugeStartAngle = -135;
  const gaugeSweep = 270;

  const clampedPct = Math.min(Math.max(Number(pct) || 0, 0), MAX);

  const polarToCartesian = (radius, angleDeg) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (radius, startAngle, endAngle) => {
    const start = polarToCartesian(radius, endAngle);
    const end = polarToCartesian(radius, startAngle);
    const largeArc = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const angleFor = (value) => gaugeStartAngle + (Math.min(Math.max(value, 0), MAX) / MAX) * gaugeSweep;

  const zones = [
    { from: 0, to: 80, color: "#ff1a1a" },
    { from: 80, to: 90, color: "#f5b82e" },
    { from: 90, to: 110, color: "#16a34a" },
    { from: 110, to: 120, color: "#f5b82e" },
    { from: 120, to: MAX, color: "#ff1a1a" },
  ];

  const ticks = [0, 30, 60, 90, 120, 150].map((value) => {
    const angle = angleFor(value);
    return {
      value,
      outer: polarToCartesian(outerTickRadius, angle),
      inner: polarToCartesian(value % 60 === 0 ? 66 : 72, angle),
      label: polarToCartesian(labelRadius, angle),
    };
  });

  const needleAngle = angleFor(clampedPct);
  const needleEnd = polarToCartesian(56, needleAngle);
  const needleLeft = polarToCartesian(9, needleAngle - 90);
  const needleRight = polarToCartesian(9, needleAngle + 90);

  const displayColor =
    clampedPct >= 90 && clampedPct <= 110
      ? "#16a34a"
      : clampedPct >= 80 && clampedPct <= 120
      ? "#f5b82e"
      : "#ff1a1a";

  return (
    <svg viewBox="10 0 235 195" width="128" height="107" aria-label={`Cobertura: ${Math.round(pct)}%`}>
      {zones.map((z) => (
        <path
          key={`${z.from}-${z.to}`}
          d={describeArc(arcRadius, angleFor(z.from), angleFor(z.to))}
          fill="none"
          stroke={z.color}
          strokeWidth="20"
          strokeLinecap="butt"
        />
      ))}
      {ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={tick.outer.x} y1={tick.outer.y}
            x2={tick.inner.x} y2={tick.inner.y}
            stroke="#0f172a"
            strokeWidth={tick.value % 60 === 0 ? 2.5 : 1.2}
            strokeLinecap="round"
          />
          <text
            x={tick.label.x}
            y={tick.label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fill="#475569"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            {tick.value}
          </text>
        </g>
      ))}
      <path
        d={`M ${needleLeft.x} ${needleLeft.y} L ${needleRight.x} ${needleRight.y} L ${needleEnd.x} ${needleEnd.y} Z`}
        fill="#0f172a"
      />
      <circle cx={cx} cy={cy} r="11" fill="#fff" stroke="#0f172a" strokeWidth="4" />
      <text
        x={cx}
        y="172"
        textAnchor="middle"
        fontSize="22"
        fontWeight="800"
        fill={displayColor}
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        {`${Math.round(pct)}%`}
      </text>
      <text
        x={cx}
        y="188"
        textAnchor="middle"
        fontSize="12"
        fill="#94a3b8"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        cobertura
      </text>
    </svg>
  );
}

function CashflowTotalsBar({ totals }) {
  const positives = totals.filter((t) => t.value > 0);
  const negatives = totals.filter((t) => t.value < 0);
  const totalPos = positives.reduce((s, t) => s + t.value, 0);
  const totalNeg = negatives.reduce((s, t) => s + Math.abs(t.value), 0);
  const maxAbs = Math.max(totalPos, totalNeg, 1);

  const VB_W = 100;
  const VB_H = 220;
  const BAR_W = 42;
  const HALF_H = 90;
  const ZERO_Y = 110;
  const bx = (VB_W - BAR_W) / 2;

  let posY = ZERO_Y;
  const posBars = positives.map((t) => {
    const h = (t.value / maxAbs) * HALF_H;
    const bar = { x: bx, y: posY - h, w: BAR_W, h, color: t.color };
    posY -= h;
    return bar;
  });

  let negY = ZERO_Y;
  const negBars = negatives.map((t) => {
    const h = (Math.abs(t.value) / maxAbs) * HALF_H;
    const bar = { x: bx, y: negY, w: BAR_W, h, color: t.color };
    negY += h;
    return bar;
  });

  return (
    <div style={{ flex: "1 1 0", width: "100%", minHeight: 80, overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <line x1={bx + BAR_W / 2} y1={5} x2={bx + BAR_W / 2} y2={VB_H - 5} stroke="#e2e8f0" strokeWidth="1" />
        {posBars.filter((b) => b.h > 0.1).map((b, i) => (
          <rect key={`pos-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} opacity="0.85" />
        ))}
        {negBars.filter((b) => b.h > 0.1).map((b, i) => (
          <rect key={`neg-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} opacity="0.85" />
        ))}
        <line x1={bx - 6} y1={ZERO_Y} x2={bx + BAR_W + 6} y2={ZERO_Y} stroke="#64748b" strokeWidth="1.5" />
        <text x={bx + BAR_W + 8} y={ZERO_Y - 6} textAnchor="start" fontSize="9" fill="#94a3b8" style={{ fontFamily: "system-ui, sans-serif" }}>+</text>
        <text x={bx + BAR_W + 8} y={ZERO_Y + 12} textAnchor="start" fontSize="9" fill="#94a3b8" style={{ fontFamily: "system-ui, sans-serif" }}>−</text>
      </svg>
    </div>
  );
}

function CashflowHorizonCards({ rows, currencyConfig, onOpen }) {
  const isBrl = currencyConfig.key === "BRL";
  const label = currencyConfig.label;

  const summaries = useMemo(() => {
    const today = startOfDashboardDay(new Date());
    if (!today) return [];
    const startTime = today.getTime();

    return [7, 30, 90, 365].map((days) => {
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + days);
      const endTime = endDate.getTime();

      const windowRows = rows.filter((row) => {
        const t = row.date instanceof Date ? row.date.getTime() : null;
        return Number.isFinite(t) && t >= startTime && t <= endTime;
      });

      const pgtos = windowRows
        .filter((r) => r.categoryKey === "payments" || r.categoryKey === "otherCashOutflows")
        .reduce((s, r) => s + Math.abs(Number(r.valor || 0)), 0);

      const hedge = windowRows
        .filter((r) => r.categoryKey === "purchaseDerivatives" || r.categoryKey === "saleDerivatives" || r.categoryKey === "physicalSales" || r.categoryKey === "otherEntries")
        .reduce((s, r) => s + Math.abs(Number(r.valor || 0)), 0);

      const saldo = pgtos - hedge;
      return { days, pgtos, hedge, saldo, windowRows };
    });
  }, [rows]);

  return (
    <div className="cashflow-horizon-cards">
      {summaries.map(({ days, pgtos, hedge, saldo, windowRows }) => (
        <div
          key={days}
          className="cashflow-horizon-card cashflow-horizon-card--clickable"
          role="button"
          tabIndex={0}
          onClick={() => onOpen?.(days, windowRows)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(days, windowRows); } }}
        >
          <div className="cashflow-horizon-title">Próximos {days} dias</div>
          <div className="cashflow-horizon-row">
            <span>{isBrl ? "Pagamentos" : `Pgtos em ${label}`}</span>
            <span>{formatMoneyByCurrency(pgtos, label)}</span>
          </div>
          <div className="cashflow-horizon-row">
            <span>{isBrl ? "Entradas" : "Hedge"}</span>
            <span>{formatMoneyByCurrency(hedge, label)}</span>
          </div>
          <div className="cashflow-horizon-row cashflow-horizon-saldo" style={{ color: saldo <= 0 ? "#16a34a" : "#ef4444" }}>
            <span>Saldo</span>
            <span>{formatMoneyByCurrency(Math.abs(saldo), label)}{saldo <= 0 ? " ✓" : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CashflowCurrencyChart({
  currencyConfig,
  rows,
  interval,
  dateRange,
  fixedDateRange,
  compact = false,
  onOpenTable,
  sectionRef,
  onDateRangeChange,
  conversionMessage = "",
}) {
  const chartWrapRef = useRef(null);
  const echartsRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const visibleRows = useMemo(() => {
    const startDateValue = dateRange?.start ? startOfDashboardDay(dateRange.start) : null;
    const endDateValue = dateRange?.end ? startOfDashboardDay(dateRange.end) : null;
    const startTime = startDateValue ? startDateValue.getTime() : null;
    const endTime = endDateValue
      ? new Date(
          endDateValue.getFullYear(),
          endDateValue.getMonth(),
          endDateValue.getDate(),
          23,
          59,
          59,
          999,
        ).getTime()
      : null;

    return rows.filter((row) => {
      const rowTime = row.date instanceof Date ? row.date.getTime() : null;
      if (!Number.isFinite(rowTime)) return false;
      if (startTime != null && rowTime < startTime) return false;
      if (endTime != null && rowTime > endTime) return false;
      return true;
    });
  }, [dateRange.end, dateRange.start, rows]);
  const chartRows = visibleRows;
  const chartRange = dateRange;
  const chartState = useMemo(
    () => buildCashflowChartState(chartRows, interval, currencyConfig, chartRange),
    [chartRange, chartRows, currencyConfig, interval],
  );
  const visibleSummaryState = useMemo(
    () => buildCashflowChartState(visibleRows, interval, currencyConfig, dateRange),
    [currencyConfig, dateRange, interval, visibleRows],
  );
  const activeSummary = hoveredPeriod ? chartState.periodSummaries.get(hoveredPeriod) : null;
  const summaryCards = activeSummary?.totals || visibleSummaryState.totals;
  const saldoSummary = activeSummary?.saldo ?? visibleSummaryState.saldoTotal;
  const coveragePct = useMemo(() => {
    const totals = visibleSummaryState.totals;
    const totalOutflows = totals.reduce((sum, t) => sum + (t.value < 0 ? Math.abs(t.value) : 0), 0);
    const totalInflows = totals.reduce((sum, t) => sum + (t.value > 0 ? t.value : 0), 0);
    if (totalOutflows <= 0) return totalInflows > 0 ? 100 : 0;
    return (totalInflows / totalOutflows) * 100;
  }, [visibleSummaryState.totals]);
  const timelinePeriods = useMemo(() => {
    if (interval === "geral") return [];
    return chartState.labels
      .map((label, labelIndex) => {
        const bounds = getComponentPeriodBounds(label, interval);
        if (!bounds?.start || !bounds?.end) return null;
        if (Number.isNaN(bounds.start.getTime())) return null;
        return {
          label,
          labelIndex,
          start: bounds.start,
          end: bounds.end,
          anchor: bounds.start,
        };
      })
      .filter(Boolean);
  }, [chartState.labels, interval]);
  const visiblePeriodCount = Math.max(interval === "geral" ? chartState.labels.length : timelinePeriods.length, 1);
  const visibleBarDatasets = useMemo(
    () => chartState.datasets.filter((dataset) => dataset.type !== "line"),
    [chartState.datasets],
  );
  const lastVisibleByStack = useMemo(
    () => visibleBarDatasets.reduce((acc, dataset) => ({ ...acc, [dataset.stack]: dataset.label }), {}),
    [visibleBarDatasets],
  );
  const effectiveChartWidth = Math.max(Number(chartWidth || 0), 320);
  const slotWidth = Math.max(18, (effectiveChartWidth - 48) / visiblePeriodCount);
  const intervalFillRatio = {
    daily: effectiveChartWidth <= 640 ? 0.82 : 0.80,
    weekly: effectiveChartWidth <= 640 ? 0.90 : 0.88,
    monthly: effectiveChartWidth <= 640 ? 0.96 : 0.94,
    geral: effectiveChartWidth <= 640 ? 0.97 : 0.95,
  };
  const intervalMinBarWidth = {
    daily: effectiveChartWidth <= 640 ? 5 : 6,
    weekly: effectiveChartWidth <= 640 ? 9 : 12,
    monthly: effectiveChartWidth <= 640 ? 14 : 18,
    geral: effectiveChartWidth <= 640 ? 28 : 40,
  };
  const intervalMaxBarWidth = {
    daily: effectiveChartWidth <= 640 ? 22 : 30,
    weekly: effectiveChartWidth <= 640 ? 40 : 60,
    monthly: effectiveChartWidth <= 640 ? 80 : 120,
    geral: effectiveChartWidth <= 640 ? 200 : 360,
  };
  const intervalDateGapPreset = {
    daily: 2,
    weekly: 2,
    monthly: 2,
    geral: 2,
  };
  const visibleStackCount = Math.max(1, new Set(visibleBarDatasets.map((dataset) => dataset.stack)).size);
  const intraBarGapPx = visibleStackCount > 1 ? 2 : 0;
  const dateGapPx = intervalDateGapPreset[interval] ?? 5;
  const availableGroupWidth = Math.max(
    visibleStackCount * 3,
    Math.min(slotWidth - dateGapPx, slotWidth * (intervalFillRatio[interval] ?? 0.5)),
  );
  const slotLimitedBarWidth = (availableGroupWidth - intraBarGapPx * Math.max(visibleStackCount - 1, 0)) / visibleStackCount;
  const responsiveBarWidth = Math.max(
    intervalMinBarWidth[interval] ?? 4,
    Math.min(intervalMaxBarWidth[interval] ?? 12, slotLimitedBarWidth),
  );
  const responsiveBarGap = visibleStackCount > 1 && responsiveBarWidth > 0
    ? `${Math.max(0, (intraBarGapPx / responsiveBarWidth) * 100)}%`
    : "0%";
  const responsiveCategoryGap = `${Math.max(8, Math.min(60, (dateGapPx / slotWidth) * 100))}%`;
  const hasNativeZoom = false;
  const fixedStartValue = fixedDateRange?.start ? startOfDashboardDay(fixedDateRange.start)?.getTime?.() : null;
  const fixedEndDate = fixedDateRange?.end ? startOfDashboardDay(fixedDateRange.end) : null;
  const fixedEndValue = fixedEndDate
    ? new Date(
        fixedEndDate.getFullYear(),
        fixedEndDate.getMonth(),
        fixedEndDate.getDate(),
        23,
        59,
        59,
        999,
      ).getTime()
    : null;
  const selectedStartValue = dateRange?.start ? startOfDashboardDay(dateRange.start)?.getTime?.() : null;
  const selectedEndDate = dateRange?.end ? startOfDashboardDay(dateRange.end) : null;
  const selectedEndValue = selectedEndDate
    ? new Date(
        selectedEndDate.getFullYear(),
        selectedEndDate.getMonth(),
        selectedEndDate.getDate(),
        23,
        59,
        59,
        999,
      ).getTime()
    : null;
  const sliderStartIndex = useMemo(() => {
    if (!Number.isFinite(selectedStartValue) || !timelinePeriods.length) return 0;
    const idx = timelinePeriods.findIndex((p) => p.anchor.getTime() >= selectedStartValue);
    return idx < 0 ? 0 : idx;
  }, [selectedStartValue, timelinePeriods]);
  const sliderEndIndex = useMemo(() => {
    if (!Number.isFinite(selectedEndValue) || !timelinePeriods.length) return Math.max(0, timelinePeriods.length - 1);
    let found = timelinePeriods.length - 1;
    for (let i = timelinePeriods.length - 1; i >= 0; i--) {
      if (timelinePeriods[i].anchor.getTime() <= selectedEndValue) { found = i; break; }
    }
    return found;
  }, [selectedEndValue, timelinePeriods]);
  const openSummaryCardTable = useCallback((label) => {
    const seriesDef = visibleSummaryState.seriesDefs.find((item) => item.label === label);
    if (!seriesDef) return;
    const chartRows = visibleRows.filter((row) => row.categoryKey === seriesDef.key);
    if (!chartRows.length) return;
    onOpenTable?.({
      title: `${label} — Periodo visivel`,
      resourceKey: chartRows[0]?.resourceKey,
      chartRows,
    });
  }, [onOpenTable, visibleRows, visibleSummaryState.seriesDefs]);
  const chartOption = useMemo(() => {
    const today = startOfDashboardDay(new Date())?.getTime?.();
    const temporalGridBottom = 18;
    const temporalGridTop = 14;
    const temporalAxisLabelMargin = 8;

    if (interval === "geral") {
      return {
        animationDuration: 250,
        grid: { top: 28, right: 18, bottom: 56, left: 18, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) =>
            `<strong>${params[0]?.axisValue || ""}</strong><br/>${params
              .filter((item) => Math.abs(readEChartNumericValue(item.value)) > 0)
              .map((item) => `${item.marker}${item.seriesName}: ${formatMoneyByCurrency(readEChartNumericValue(item.value), currencyConfig.label)}`)
              .join("<br/>")}`,
        },
        legend: { show: false },
        dataZoom: [],
        xAxis: {
          type: "category",
          data: chartState.labels,
          axisTick: { show: false },
          axisLabel: { color: "#475569", fontWeight: 700, fontSize: 12 },
          axisLine: { lineStyle: { color: "rgba(15,23,42,0.18)" } },
        },
        yAxis: {
          type: "value",
          name: currencyConfig.label,
          nameTextStyle: { color: "#475569", fontSize: 10, fontWeight: 700 },
          axisLabel: {
            color: "#475569",
            fontSize: 11,
            formatter: (value) => Number(value).toLocaleString("pt-BR"),
          },
          splitLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
        },
        series: chartState.datasets.map((dataset) => ({
          name: dataset.label,
          type: dataset.type === "line" ? "line" : "bar",
          stack: dataset.type === "line" ? undefined : dataset.stack,
          smooth: false,
          symbol: dataset.type === "line" ? "circle" : "none",
          symbolSize: dataset.type === "line"
            ? (value) => (Math.abs(readEChartNumericValue(value)) > 0 ? 8 : 0)
            : 0,
          barWidth: dataset.type === "line" ? undefined : responsiveBarWidth,
          barMaxWidth: dataset.type === "line" ? undefined : responsiveBarWidth,
          barGap: dataset.type === "line" ? undefined : responsiveBarGap,
          barCategoryGap: dataset.type === "line" ? undefined : responsiveCategoryGap,
          cursor: "pointer",
          lineStyle: { color: dataset.borderColor || dataset.backgroundColor, width: dataset.type === "line" ? 3 : 2 },
          itemStyle: {
            color: dataset.borderColor || dataset.backgroundColor,
            borderRadius: 0,
          },
          label: dataset.type === "line"
            ? { show: false }
            : {
                show: !compact && lastVisibleByStack[dataset.stack] === dataset.label,
                position: "top",
                color: "#111827",
                fontSize: 11,
                fontWeight: 700,
                formatter: ({ value }) => {
                  const numericValue = readEChartNumericValue(value);
                  return numericValue ? formatMoneyByCurrency(numericValue, currencyConfig.label) : "";
                },
              },
          data: dataset.data,
        })),
      };
    }

    const todayPeriod = Number.isFinite(today)
      ? timelinePeriods.find((p) => today >= p.start.getTime() && today <= p.end.getTime())
      : null;
    const todayLabel = todayPeriod
      ? (interval === "monthly" ? formatCashflowMonthYear(todayPeriod.start) : formatBrazilianDate(todayPeriod.start))
      : null;

    return {
      animationDuration: 250,
      grid: { top: temporalGridTop, right: 18, bottom: temporalGridBottom, left: 18, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const periodLabel = params.find((item) => item?.data?.periodLabel)?.data?.periodLabel || "";
          const rowsHtml = params
            .filter((item) => Math.abs(readEChartNumericValue(item.value)) > 0)
            .map((item) => `${item.marker}${item.seriesName}: ${formatMoneyByCurrency(readEChartNumericValue(item.value), currencyConfig.label)}`)
            .join("<br/>");
          return `<strong>${periodLabel}</strong><br/>${rowsHtml}`;
        },
      },
      legend: { show: false },
      dataZoom: hasNativeZoom
        ? [
            {
              type: "inside",
              xAxisIndex: 0,
              filterMode: "none",
              startValue: sliderStartIndex,
              endValue: sliderEndIndex,
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: true,
              preventDefaultMouseMove: false,
            },
          ]
        : [],
      xAxis: {
        type: "category",
        data: timelinePeriods.map((p) =>
          interval === "monthly" ? formatCashflowMonthYear(p.start) : formatBrazilianDate(p.start)
        ),
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontWeight: 700,
          fontSize: 12,
          hideOverlap: true,
          margin: temporalAxisLabelMargin,
        },
        axisLine: { lineStyle: { color: "rgba(15,23,42,0.18)" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: currencyConfig.label,
        nameTextStyle: { color: "#475569", fontSize: 10, fontWeight: 700 },
        axisLabel: { color: "#475569", fontSize: 11, formatter: (value) => Number(value).toLocaleString("pt-BR") },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
      },
      series: chartState.datasets.map((dataset, datasetIndex) => ({
        name: dataset.label,
        type: dataset.type === "line" ? "line" : "bar",
        stack: dataset.type === "line" ? undefined : dataset.stack,
        smooth: false,
        symbol: dataset.type === "line" ? "circle" : "none",
        symbolSize: dataset.type === "line"
          ? (value) => (Math.abs(readEChartNumericValue(value)) > 0 ? 8 : 0)
          : 0,
        barWidth: dataset.type === "line" ? undefined : responsiveBarWidth,
        barMaxWidth: dataset.type === "line" ? undefined : responsiveBarWidth,
        barGap: dataset.type === "line" ? undefined : responsiveBarGap,
        barCategoryGap: dataset.type === "line" ? undefined : responsiveCategoryGap,
        cursor: "pointer",
        lineStyle: { color: dataset.borderColor || dataset.backgroundColor, width: dataset.type === "line" ? 3 : 2 },
        itemStyle: {
          color: dataset.type === "line"
            ? (params) => (Array.isArray(dataset.pointBackgroundColor) ? dataset.pointBackgroundColor[params.dataIndex] || dataset.borderColor : dataset.borderColor || dataset.backgroundColor)
            : dataset.backgroundColor,
          borderRadius: 0,
          borderColor: dataset.type === "line" ? "#111827" : undefined,
          borderWidth: dataset.type === "line" ? 2 : undefined,
        },
        label: dataset.type === "line"
          ? { show: false }
          : {
              show: !compact && lastVisibleByStack[dataset.stack] === dataset.label,
              position: "top",
              color: "#111827",
              fontSize: 11,
              fontWeight: 700,
              distance: 6,
              formatter: ({ data }) => {
                const numericValue = readEChartNumericValue(data?.value);
                return numericValue ? formatMoneyByCurrency(numericValue, currencyConfig.label) : "";
              },
            },
        labelLayout: dataset.type === "line" ? undefined : { hideOverlap: true },
        markLine: dataset.type !== "line" && datasetIndex === 0 && todayLabel != null
          ? {
              symbol: ["none", "none"],
              silent: true,
              animation: false,
              label: {
                show: true,
                formatter: "Hoje",
                position: "start",
                color: "#1d4ed8",
                backgroundColor: "#dbeafe",
                borderColor: "rgba(37, 99, 235, 0.2)",
                borderWidth: 1,
                borderRadius: 999,
                padding: [4, 10],
              },
              lineStyle: {
                color: "rgba(37, 99, 235, 0.95)",
                type: "dashed",
                width: 2,
              },
              data: [{ xAxis: todayLabel }],
            }
          : undefined,
        data: timelinePeriods.map((period) => ({
          value: Number(dataset.data[period.labelIndex] || 0),
          periodLabel: period.label,
        })),
      })),
    };
  }, [
    chartState,
    compact,
    currencyConfig.label,
    chartWidth,
    hasNativeZoom,
    interval,
    lastVisibleByStack,
    responsiveBarGap,
    responsiveBarWidth,
    responsiveCategoryGap,
    sliderEndIndex,
    sliderStartIndex,
    timelinePeriods,
    visiblePeriodCount,
  ]);
  const chartEvents = useMemo(() => ({
    mouseover: (params) => {
      if (params.componentType !== "series") return;
      setHoveredPeriod(params?.data?.periodLabel || chartState.labels[params.dataIndex] || null);
    },
    globalout: () => setHoveredPeriod(null),
    datazoom: (params) => {
      if (!hasNativeZoom || !timelinePeriods.length) return;
      const payload = Array.isArray(params?.batch) ? params.batch[0] : params;
      const rawStart = Number(payload?.startValue);
      const rawEnd = Number(payload?.endValue);
      let startPeriod, endPeriod;
      if (Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawStart >= 0) {
        const startIdx = Math.max(0, Math.min(Math.round(rawStart), timelinePeriods.length - 1));
        const endIdx = Math.max(0, Math.min(Math.round(rawEnd), timelinePeriods.length - 1));
        startPeriod = timelinePeriods[startIdx];
        endPeriod = timelinePeriods[endIdx];
      } else {
        const startPct = Math.min(Math.max(Number(payload?.start ?? 0), 0), 100);
        const endPct = Math.min(Math.max(Number(payload?.end ?? 100), 0), 100);
        const startIdx = Math.round((startPct / 100) * (timelinePeriods.length - 1));
        const endIdx = Math.min(timelinePeriods.length - 1, Math.round((endPct / 100) * (timelinePeriods.length - 1)));
        startPeriod = timelinePeriods[startIdx];
        endPeriod = timelinePeriods[endIdx];
      }
      if (!startPeriod?.start || !endPeriod?.end) return;
      onDateRangeChange?.({ start: startPeriod.start, end: endPeriod.end });
    },
    click: (params) => {
      if (params.componentType !== "series") return;
      const period = params?.data?.periodLabel || chartState.labels[params.dataIndex];
      const allTables = chartState.seriesDefs
        .map((def) => {
          const rows = chartState.opsIndex.get(`${period}||${def.key}`) || [];
          return rows.length ? { key: def.key, label: def.label, resourceKey: rows[0]?.resourceKey, chartRows: rows } : null;
        })
        .filter(Boolean);
      if (!allTables.length) return;
      onOpenTable?.({ period, allTables, periodSummary: chartState.periodSummaries?.get(period), currencyConfig });
    },
  }), [chartState, currencyConfig, hasNativeZoom, onDateRangeChange, onOpenTable, timelinePeriods]);

  useEffect(() => {
    const node = chartWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries?.[0]?.contentRect?.width;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setChartWidth(nextWidth);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onOpenTableRef = useRef(onOpenTable);
  onOpenTableRef.current = onOpenTable;
  const chartStateRef = useRef(chartState);
  chartStateRef.current = chartState;
  const currencyConfigRef = useRef(currencyConfig);
  currencyConfigRef.current = currencyConfig;

  useEffect(() => {
    let cleanup = () => {};
    const register = () => {
      const chart = echartsRef.current?.getEchartsInstance?.();
      if (!chart) return;
      const zr = chart.getZr();
      const handleZrClick = (event) => {
        const cs = chartStateRef.current;
        const dataIndex = chart.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]);
        const index = Array.isArray(dataIndex) ? dataIndex[0] : dataIndex;
        if (!Number.isFinite(index) || index < 0 || index >= cs.labels.length) return;
        const period = cs.labels[index];
        if (!period) return;
        const allTables = cs.seriesDefs
          .map((def) => {
            const rows = cs.opsIndex.get(`${period}||${def.key}`) || [];
            return rows.length ? { key: def.key, label: def.label, resourceKey: rows[0]?.resourceKey, chartRows: rows } : null;
          })
          .filter(Boolean);
        if (!allTables.length) return;
        onOpenTableRef.current?.({ period, allTables, periodSummary: cs.periodSummaries?.get(period), currencyConfig: currencyConfigRef.current });
      };
      zr.on("click", handleZrClick);
      cleanup = () => zr.off("click", handleZrClick);
    };
    const id = window.setTimeout(register, 0);
    return () => { window.clearTimeout(id); cleanup(); };
  }, []);

  return (
      <div
        ref={sectionRef}
        className={`chart-card component-chartjs-card cashflow-chart-card summary-insight-card${compact ? " cashflow-chart-card--compact" : ""}`}
      >
      <SummaryInsightButton
        title={currencyConfig.title}
        message={
          <SummaryInsightCopy
            paragraphs={[
              `Este painel resume o fluxo em ${currencyConfig.label}. Os cards acima mostram os totais por categoria no período visível, e o saldo atual é ${formatMoneyByCurrency(saldoSummary, currencyConfig.label)}.`,
              `As barras representam entradas e saídas por período, enquanto a linha de saldo mostra o efeito líquido acumulado dentro do recorte selecionado.`,
            ]}
          />
        }
      />
      <button
        type="button"
        className="cashflow-maximize-btn"
        title="Maximizar gráfico"
        onClick={() => setMaximized(true)}
      >
        ⛶
      </button>
      <div className="chart-card-header cashflow-chart-header">
        <div>
          <h3>{currencyConfig.title}</h3>
          <p className="muted">Clique nas barras para detalhar o período.</p>
          {conversionMessage ? <p className="muted">{conversionMessage}</p> : null}
        </div>
      </div>
      {maximized && (
        <div className="cashflow-fullscreen-backdrop" onClick={() => setMaximized(false)}>
          <div className="cashflow-fullscreen-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cashflow-fullscreen-header">
              <strong>{currencyConfig.title}</strong>
              <button type="button" className="component-popup-close" onClick={() => setMaximized(false)}>×</button>
            </div>
            <div className="cashflow-fullscreen-chart">
              <ReactECharts option={chartOption} notMerge onEvents={chartEvents} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
            </div>
          </div>
        </div>
      )}
      <CashflowHorizonCards
        rows={rows}
        currencyConfig={currencyConfig}
        onOpen={(days, windowRows) => {
          const seriesDefs = getCashflowSeriesDefs(currencyConfig);
          const allTables = seriesDefs
            .map((def) => {
              const defRows = windowRows.filter((r) => r.categoryKey === def.key);
              return defRows.length ? { key: def.key, label: def.label, resourceKey: defRows[0]?.resourceKey, chartRows: defRows } : null;
            })
            .filter(Boolean);
          if (!allTables.length) return;
          const totals = seriesDefs.map((def) => ({
            label: def.label,
            color: def.color,
            value: windowRows.filter((r) => r.categoryKey === def.key).reduce((s, r) => s + Number(r.valor || 0), 0),
          }));
          const saldo = totals.reduce((s, t) => s + t.value, 0);
          onOpenTable?.({ period: `Próximos ${days} dias`, allTables, periodSummary: { totals, saldo }, currencyConfig });
        }}
      />
      {!compact && <section className="stats-grid cashflow-summary-grid">
        {summaryCards.map((item) => (
          <article
            key={`${currencyConfig.key}-${item.label}`}
            className="card stat-card component-summary-card summary-insight-card"
            role="button"
            tabIndex={0}
            onClick={() => openSummaryCardTable(item.label)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSummaryCardTable(item.label);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <SummaryInsightButton
              title={`${currencyConfig.title} — ${item.label}`}
              message={
                <SummaryInsightCopy
                  paragraphs={[
                    `O valor de ${formatMoneyByCurrency(item.value, currencyConfig.label)} representa o total de ${item.label.toLowerCase()} no período visível deste fluxo.`,
                    "Ao abrir o detalhe, você vê quais operações individuais compõem esse número.",
                  ]}
                />
              }
            />
            <span className="component-summary-label">
              <span className="component-summary-dot" style={{ background: item.color }} />
              {item.label}
            </span>
            <strong>{formatMoneyByCurrency(item.value, currencyConfig.label)}</strong>
          </article>
        ))}
        <article className="card stat-card component-summary-card summary-insight-card">
          <SummaryInsightButton
            title={currencyConfig?.key === "BRL" ? `${currencyConfig.title} — Saldo` : `${currencyConfig.title} — Exposição líquida`}
            message={
              <SummaryInsightCopy
                paragraphs={[
                  currencyConfig?.key === "BRL"
                    ? `O saldo de ${formatMoneyByCurrency(saldoSummary, currencyConfig.label)} representa o resultado líquido entre entradas e saídas no período visível.`
                    : `A exposição líquida de ${formatMoneyByCurrency(saldoSummary, currencyConfig.label)} representa o valor ainda descoberto após descontar os derivativos de compra (NDF/Call) dos pagamentos em ${currencyConfig.label}.`,
                  "Quando positivo, indica sobra de caixa nessa moeda; quando negativo, indica pressão financeira no recorte selecionado.",
                ]}
              />
            }
          />
          <span className="component-summary-label">
            <span className="component-summary-dot" style={{ background: "#64748b" }} />
            {currencyConfig?.key === "BRL" ? "Saldo" : "Exposição líquida"}
          </span>
          <strong>{formatMoneyByCurrency(saldoSummary, currencyConfig.label)}</strong>
        </article>
      </section>}
      <div className="cashflow-chart-row">
        <div className="cashflow-gauge-col">
          <CashflowHedgeGauge pct={coveragePct} />
          {!compact && <CashflowTotalsBar totals={visibleSummaryState.totals} />}
        </div>
        <div ref={chartWrapRef} className={`component-chartjs-wrap cashflow-chartjs-wrap${compact ? " cashflow-chartjs-wrap--compact" : ""}`}>
          <ReactECharts ref={echartsRef} option={chartOption} notMerge onEvents={chartEvents} style={{ height: "100%" }} opts={{ renderer: "canvas" }} />
        </div>
      </div>
    </div>
  );
}

function CashflowDashboard({ dashboardFilter, compact = false }) {
  const isMobileViewport = useViewportMatch("(max-width: 768px)");
  const defaultSelectionRange = useMemo(() => buildCashflowDefaultDateRange(), []);
  const sectionRefs = useRef({});
  const [interval, setInterval] = useState("monthly");
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [sharedSliderTopHandle, setSharedSliderTopHandle] = useState("end");
  const [dateRange, setDateRange] = useState({
    start: defaultSelectionRange.fromBrazilian,
    end: defaultSelectionRange.toBrazilian,
  });
  const [isLoading, setIsLoading] = useState(() => !cashflowDataCache.data);
  const [sales, setSales] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [otherCashOutflows, setOtherCashOutflows] = useState([]);
  const [otherEntries, setOtherEntries] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [crops, setCrops] = useState([]);
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales,
    setSales,
    derivatives,
    setDerivatives,
    cashPayments,
    setCashPayments,
    otherCashOutflows,
    setOtherCashOutflows,
    otherEntries,
    setOtherEntries,
  });

  useEffect(() => {
    // Use cached data immediately on re-navigation — no reload needed
    if (cashflowDataCache.data) {
      const d = cashflowDataCache.data;
      setSales(d.sales);
      setCashPayments(d.cashPayments);
      setOtherCashOutflows(d.otherCashOutflows);
      setOtherEntries(d.otherEntries);
      setDerivatives(d.derivatives);
      setCounterparties(d.counterparties);
      setCrops(d.crops);
      setTradingviewQuotes(d.tradingviewQuotes);
      return;
    }

    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales").catch(() => []),
      resourceService.listAll("cash-payments").catch(() => []),
      resourceService.listAll("other-cash-outflows").catch(() => []),
      resourceService.listAll("other-entries").catch(() => []),
      resourceService.listAll("derivative-operations").catch(() => []),
      resourceService.listAll("counterparties").catch(() => []),
      resourceService.listAll("crops").catch(() => []),
      resourceService.listTradingviewQuotes().catch(() => []),
    ]).then(([salesResponse, cashPaymentsResponse, otherCashOutflowsResponse, otherEntriesResponse, derivativesResponse, counterpartiesResponse, cropsResponse, tradingviewQuotesResponse]) => {
      if (!isMounted) return;
      const d = {
        sales: salesResponse || [],
        cashPayments: cashPaymentsResponse || [],
        otherCashOutflows: otherCashOutflowsResponse || [],
        otherEntries: otherEntriesResponse || [],
        derivatives: derivativesResponse || [],
        counterparties: counterpartiesResponse || [],
        crops: cropsResponse || [],
        tradingviewQuotes: tradingviewQuotesResponse || [],
      };
      cashflowDataCache.data = d;
      setSales(d.sales);
      setCashPayments(d.cashPayments);
      setOtherCashOutflows(d.otherCashOutflows);
      setOtherEntries(d.otherEntries);
      setDerivatives(d.derivatives);
      setCounterparties(d.counterparties);
      setCrops(d.crops);
      setTradingviewQuotes(d.tradingviewQuotes);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Keep module-level cache in sync when state changes (e.g. after editing an operation)
  useEffect(() => {
    if (!cashflowDataCache.data) return;
    cashflowDataCache.data = { ...cashflowDataCache.data, sales };
  }, [sales]);
  useEffect(() => {
    if (!cashflowDataCache.data) return;
    cashflowDataCache.data = { ...cashflowDataCache.data, derivatives };
  }, [derivatives]);
  useEffect(() => {
    if (!cashflowDataCache.data) return;
    cashflowDataCache.data = { ...cashflowDataCache.data, cashPayments };
  }, [cashPayments]);
  useEffect(() => {
    if (!cashflowDataCache.data) return;
    cashflowDataCache.data = { ...cashflowDataCache.data, otherCashOutflows };
  }, [otherCashOutflows]);
  useEffect(() => {
    if (!cashflowDataCache.data) return;
    cashflowDataCache.data = { ...cashflowDataCache.data, otherEntries };
  }, [otherEntries]);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );
  const cropsById = useMemo(
    () => Object.fromEntries((crops || []).map((item) => [String(item.id), item])),
    [crops],
  );
  const usdBrlQuote = useMemo(() => getUsdBrlQuoteValue(tradingviewQuotes), [tradingviewQuotes]);
  const brlConversionMessage = useMemo(
    () =>
      usdBrlQuote > 0
        ? `Valores em U$ foram convertidos para R$ usando o USDBRL de hoje: ${usdBrlQuote.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}.`
        : "Valores em U$ devem ser convertidos para R$ pelo USDBRL de hoje quando a cotação estiver disponível.",
    [usdBrlQuote],
  );
  const defaultVisibleRange = useMemo(
    () => ({
      start: defaultSelectionRange.fromBrazilian,
      end: defaultSelectionRange.toBrazilian,
    }),
    [defaultSelectionRange.fromBrazilian, defaultSelectionRange.toBrazilian],
  );
  const allCurrencyRows = useMemo(
    () =>
      CASHFLOW_CURRENCY_CONFIGS.flatMap((currencyConfig) =>
        buildCashflowRows({
          sales,
          cashPayments,
          otherCashOutflows,
          otherEntries,
          derivatives,
          counterpartyMap,
          dashboardFilter,
          currencyConfig,
          usdBrlQuote,
          cropsById,
        }),
      ),
    [cashPayments, counterpartyMap, cropsById, dashboardFilter, derivatives, otherCashOutflows, otherEntries, sales, usdBrlQuote],
  );
  const sliderRange = useMemo(() => {
    const numericTimes = allCurrencyRows
      .map((row) => (row.date instanceof Date ? row.date.getTime() : null))
      .filter((time) => Number.isFinite(time));
    const defaultStartTime = startOfDashboardDay(defaultVisibleRange.start)?.getTime?.();
    const defaultEndBase = startOfDashboardDay(defaultVisibleRange.end);
    const defaultEndTime = defaultEndBase
      ? new Date(defaultEndBase.getFullYear(), defaultEndBase.getMonth(), defaultEndBase.getDate(), 23, 59, 59, 999).getTime()
      : null;
    const minTime = numericTimes.length ? Math.min(...numericTimes) : defaultStartTime;
    const maxTime = numericTimes.length ? Math.max(...numericTimes) : defaultEndTime;
    const boundedMin = Number.isFinite(defaultStartTime) ? Math.min(minTime, defaultStartTime) : minTime;
    const boundedMax = Number.isFinite(defaultEndTime) ? Math.max(maxTime, defaultEndTime) : maxTime;
    return {
      start: Number.isFinite(boundedMin) ? formatBrazilianDate(new Date(boundedMin)) : defaultVisibleRange.start,
      end: Number.isFinite(boundedMax) ? formatBrazilianDate(new Date(boundedMax)) : defaultVisibleRange.end,
    };
  }, [allCurrencyRows, defaultVisibleRange.end, defaultVisibleRange.start]);
  const hasCustomDateRange = useMemo(
    () =>
      formatIsoDate(dateRange.start) !== formatIsoDate(defaultVisibleRange.start) ||
      formatIsoDate(dateRange.end) !== formatIsoDate(defaultVisibleRange.end),
    [dateRange.end, dateRange.start, defaultVisibleRange.end, defaultVisibleRange.start],
  );
  const handleDateRangeChange = useCallback((nextRange) => {
    if (!nextRange?.start || !nextRange?.end) return;
    const nextStart = formatBrazilianDate(nextRange.start);
    const nextEnd = formatBrazilianDate(nextRange.end);
    setDateRange((current) => {
      if (formatIsoDate(current.start) === formatIsoDate(nextStart) && formatIsoDate(current.end) === formatIsoDate(nextEnd)) {
        return current;
      }
      return { start: nextStart, end: nextEnd };
    });
  }, []);
  const resolveTableDefinition = useCallback((resourceKey) =>
    resourceKey === "cash-payments" ? resourceDefinitions.cashPayments
    : resourceKey === "other-cash-outflows" ? resourceDefinitions.otherCashOutflows
    : resourceKey === "physical-sales" ? resourceDefinitions.physicalSales
    : resourceKey === "other-entries" ? resourceDefinitions.otherEntries
    : resourceDefinitions.derivativeOperations
  , []);

  const resolveTableSourceRows = useCallback((resourceKey) =>
    resourceKey === "cash-payments" ? cashPayments
    : resourceKey === "other-cash-outflows" ? otherCashOutflows
    : resourceKey === "physical-sales" ? sales
    : resourceKey === "other-entries" ? otherEntries
    : derivatives
  , [cashPayments, derivatives, otherCashOutflows, otherEntries, sales]);

  const handleOpenTable = useCallback(({ title, resourceKey, chartRows, period, allTables, periodSummary, currencyConfig: modalCurrencyConfig }) => {
    if (allTables?.length) {
      const resolvedTables = allTables
        .map(({ key, label, resourceKey: rk, chartRows: cr }) => {
          const definition = resolveTableDefinition(rk);
          const sourceRows = resolveTableSourceRows(rk);
          const ids = new Set(cr.map((r) => r.recordId).filter(Boolean).map(String));
          const filteredRows = sourceRows.filter((row) => ids.has(String(row.id)));
          return filteredRows.length ? { key, label, definition, rows: filteredRows } : null;
        })
        .filter(Boolean);
      if (!resolvedTables.length) return;
      setSelectedTableModal({ period, tables: resolvedTables, periodSummary, currencyConfig: modalCurrencyConfig });
      return;
    }
    if (!resourceKey || !chartRows?.length) return;
    const definition = resolveTableDefinition(resourceKey);
    const sourceRows = resolveTableSourceRows(resourceKey);
    const ids = new Set(chartRows.map((item) => item.recordId).filter(Boolean).map(String));
    const filteredRows = sourceRows.filter((row) => ids.has(String(row.id)));
    if (!filteredRows.length) return;
    setSelectedTableModal({ title, definition, rows: filteredRows });
  }, [resolveTableDefinition, resolveTableSourceRows]);

  const currencyRows = useMemo(
    () =>
      Object.fromEntries(
        CASHFLOW_CURRENCY_CONFIGS.map((currencyConfig) => [
          currencyConfig.key,
          buildCashflowRows({
            sales,
            cashPayments,
            otherCashOutflows,
            otherEntries,
            derivatives,
            counterpartyMap,
            dashboardFilter,
            currencyConfig,
            usdBrlQuote,
            cropsById,
          }),
        ]),
      ),
    [cashPayments, counterpartyMap, cropsById, dashboardFilter, derivatives, otherCashOutflows, otherEntries, sales, usdBrlQuote],
  );

  const visibleCurrencies = useMemo(
    () => CASHFLOW_CURRENCY_CONFIGS.filter((c) => (currencyRows[c.key]?.length || 0) > 0),
    [currencyRows],
  );
  const sharedSliderPeriods = useMemo(() => {
    if (interval === "geral") return [];
    const periodMap = new Map();
    allCurrencyRows.forEach((row) => {
      const key = buildComponentPeriodKey(row.date, interval);
      if (!periodMap.has(key)) {
        const bounds = getComponentPeriodBounds(key, interval);
        if (bounds?.start && !Number.isNaN(bounds.start.getTime())) {
          periodMap.set(key, { label: key, start: bounds.start, end: bounds.end, anchor: bounds.start });
        }
      }
    });
    return Array.from(periodMap.values()).sort((a, b) => a.anchor.getTime() - b.anchor.getTime());
  }, [allCurrencyRows, interval]);
  const sharedSliderStartIndex = useMemo(() => {
    if (!sharedSliderPeriods.length) return 0;
    const t = startOfDashboardDay(dateRange.start)?.getTime?.();
    if (!Number.isFinite(t)) return 0;
    const idx = sharedSliderPeriods.findIndex((p) => p.anchor.getTime() >= t);
    return idx < 0 ? 0 : idx;
  }, [dateRange.start, sharedSliderPeriods]);
  const sharedSliderEndIndex = useMemo(() => {
    if (!sharedSliderPeriods.length) return 0;
    const t = startOfDashboardDay(dateRange.end)?.getTime?.();
    if (!Number.isFinite(t)) return Math.max(0, sharedSliderPeriods.length - 1);
    let found = sharedSliderPeriods.length - 1;
    for (let i = sharedSliderPeriods.length - 1; i >= 0; i--) {
      if (sharedSliderPeriods[i].anchor.getTime() <= t) { found = i; break; }
    }
    return found;
  }, [dateRange.end, sharedSliderPeriods]);
  const scrollToCurrencySection = useCallback((currencyKey) => {
    const node = sectionRefs.current[currencyKey];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const handleCurrencyToolbarClick = useCallback((currencyKey) => {
    scrollToCurrencySection(currencyKey);
  }, [scrollToCurrencySection]);

  return (
    <section className="component-sales-shell">
      {isLoading ? (
        <div className="cashflow-loading-skeleton">
          {[1, 2].map((i) => (
            <div key={i} className="chart-card risk-kpi-skeleton-card risk-kpi-skeleton-card-tall" style={{ padding: "20px", borderRadius: "16px", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" style={{ marginBottom: 8 }} />
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-subtitle" style={{ marginBottom: 20 }} />
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="risk-kpi-skeleton-line" style={{ flex: 1, height: 48, borderRadius: 10 }} />
                ))}
              </div>
              <div className="risk-kpi-skeleton-chart" style={{ minHeight: 280 }} />
            </div>
          ))}
        </div>
      ) : null}
      {compact ? (
        <div className="cashflow-dashboard-toolbar">
          <div className="cashflow-currency-links">
            {CASHFLOW_CURRENCY_CONFIGS.filter((c) => (currencyRows[c.key]?.length || 0) > 0).map((currencyConfig) => (
              <button
                key={`cashflow-link-${currencyConfig.key}`}
                type="button"
                className="cashflow-currency-link"
                onClick={() => handleCurrencyToolbarClick(currencyConfig.key)}
              >
                {currencyConfig.title}
              </button>
            ))}
          </div>
          <div className="chart-toolbar cashflow-dashboard-periods">
            {[
              ["daily", "Diario"],
              ["weekly", "Semanal"],
              ["monthly", "Mensal"],
              ["geral", "Geral"],
            ].map(([value, label]) => (
              <button
                key={`cashflow-copy-${value}`}
                type="button"
                className={`chart-period-btn${interval === value ? " active" : ""}`}
                onClick={() => setInterval(value)}
              >
                {label}
              </button>
            ))}
            {hasCustomDateRange ? (
              <button
                type="button"
                className="chart-period-btn"
                onClick={() => setDateRange(defaultVisibleRange)}
              >
                Reset Zoom
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {interval !== "geral" && sharedSliderPeriods.length > 1 ? (() => {
        const totalCount = sharedSliderPeriods.length;
        const maxIdx = Math.max(totalCount - 1, 1);
        const startPct = (sharedSliderStartIndex / maxIdx) * 100;
        const endPct = (sharedSliderEndIndex / maxIdx) * 100;
        const fmtLabel = (p) => interval === "monthly" ? formatCashflowMonthYear(p.start) : formatBrazilianDate(p.start);
        const handleTrackPointerMove = (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const hovered = pct * maxIdx;
          const distToStart = Math.abs(hovered - sharedSliderStartIndex);
          const distToEnd = Math.abs(hovered - sharedSliderEndIndex);
          const next = distToStart <= distToEnd ? "start" : "end";
          if (next !== sharedSliderTopHandle) setSharedSliderTopHandle(next);
        };
        return (
          <div className="hedge-slider-wrap cashflow-shared-slider">
            <div className="hedge-slider-dates">
              <span>{fmtLabel(sharedSliderPeriods[0])}</span>
              <span>{fmtLabel(sharedSliderPeriods[totalCount - 1])}</span>
            </div>
            <div className="hedge-slider-track" onPointerMove={handleTrackPointerMove}>
              <div className="hedge-slider-track-bg" />
              <div className="hedge-slider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
              <input
                type="range"
                className="hedge-slider-input hedge-slider-input--active"
                style={{ zIndex: sharedSliderTopHandle === "start" ? 5 : 3 }}
                min={0}
                max={totalCount - 1}
                value={sharedSliderStartIndex}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const endPeriod = sharedSliderPeriods[sharedSliderEndIndex];
                  if (v <= sharedSliderEndIndex && sharedSliderPeriods[v]?.start && endPeriod?.end) {
                    handleDateRangeChange({ start: sharedSliderPeriods[v].start, end: endPeriod.end });
                  }
                }}
              />
              <input
                type="range"
                className="hedge-slider-input hedge-slider-input--active"
                style={{ zIndex: sharedSliderTopHandle === "end" ? 5 : 3 }}
                min={0}
                max={totalCount - 1}
                value={sharedSliderEndIndex}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const startPeriod = sharedSliderPeriods[sharedSliderStartIndex];
                  if (v >= sharedSliderStartIndex && startPeriod?.start && sharedSliderPeriods[v]?.end) {
                    handleDateRangeChange({ start: startPeriod.start, end: sharedSliderPeriods[v].end });
                  }
                }}
              />
            </div>
          </div>
        );
      })() : null}
      <section
        className={`cashflow-dashboard-shell${compact ? " cashflow-dashboard-shell--compact" : ""}${compact && isMobileViewport ? " cashflow-dashboard-shell--mobile-stacked" : ""}`}
      >
      {visibleCurrencies.map((currencyConfig) => (
        <CashflowCurrencyChart
          key={currencyConfig.key}
          currencyConfig={currencyConfig}
          rows={currencyRows[currencyConfig.key] || []}
          interval={interval}
          dateRange={dateRange}
          compact={compact}
          onOpenTable={handleOpenTable}
          onDateRangeChange={handleDateRangeChange}
          conversionMessage={currencyConfig.key === "BRL" ? brlConversionMessage : ""}
          sectionRef={(node) => {
            if (node) {
              sectionRefs.current[currencyConfig.key] = node;
            } else {
              delete sectionRefs.current[currencyConfig.key];
            }
          }}
        />
      ))}
      </section>
      {selectedTableModal?.tables ? (
        <CashflowMultiTableModal
          period={selectedTableModal.period}
          tables={selectedTableModal.tables}
          periodSummary={selectedTableModal.periodSummary}
          currencyConfig={selectedTableModal.currencyConfig}
          onClose={() => setSelectedTableModal(null)}
          onEdit={(row, resourceKey) => openOperationForm({
            ...row,
            recordId: row.id,
            resourceKey,
          })}
        />
      ) : selectedTableModal ? (
        <DashboardResourceTableModal
          title={selectedTableModal.title}
          definition={selectedTableModal.definition}
          rows={selectedTableModal.rows}
          onClose={() => setSelectedTableModal(null)}
          onEdit={(row) => openOperationForm({
            ...row,
            recordId: row.id,
            resourceKey: selectedTableModal.definition.resource,
          })}
        />
      ) : null}
      {editorNode}
    </section>
  );
}

const formatCashflowDailyCurrency = (value) =>
  `R$ ${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatCashflowDailyInteger = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const resolvePhysicalSaleDailyAmountBrl = (item) => {
  const contractValue = Math.abs(Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0));
  if (!contractValue) return 0;
  if (isUsdCurrency(item.moeda_contrato)) {
    const fxRate = Number(item.dolar_de_venda || 0);
    return fxRate > 0 ? contractValue * fxRate : contractValue;
  }
  return contractValue;
};

const buildCashflowDailyEntries = ({ sales, cashPayments, otherCashOutflows, otherEntries, derivatives, dashboardFilter, counterpartyMap, usdBrlRate }) => {
  const salesEntries = (sales || [])
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .filter((item) => normalizeText(item.compra_venda) !== "compra")
    .map((item) => {
      const date = startOfDashboardDay(item.data_pagamento);
      if (!date) return null;
      const rawAmount = Math.abs(Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0));
      const amount = resolveCashflowDisplayValue(rawAmount, item.moeda_contrato, { key: "BRL" }, usdBrlRate);
      return {
        id: `sale-${item.id}`,
        recordId: item.id,
        resourceKey: "physical-sales",
        type: "entrada",
        typeLabel: "Venda Físico",
        date,
        dateKey: dashboardDateKey(date),
        amount,
        currency: "R$",
        title: item.cultura_produto || "Venda físico",
        subtitle: counterpartyMap[String(item.contraparte)] || item.localidade || "",
        description: item.obs || "",
        meta: [
          item.volume_fisico ? `${Number(item.volume_fisico).toLocaleString("pt-BR")} ${item.unidade_contrato || ""}`.trim() : "",
          item.preco ? `Preço ${Number(item.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "",
          isUsdCurrency(item.moeda_contrato) && Number(item.dolar_de_venda || 0) > 0
            ? `Câmbio ${Number(item.dolar_de_venda).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
            : "",
          isUsdCurrency(item.moeda_contrato) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .filter(Boolean);

  const cashEntries = (cashPayments || [])
    .filter((item) =>
      rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: ["fazer_frente_com"],
        seasonKeys: ["safra"],
      }),
    )
    .map((item) => {
      const cashflowDate = item.data_pagamento || item.data_vencimento;
      const amount = resolveCashflowDisplayValue(Number(item.valor ?? item.volume ?? 0), item.moeda, { key: "BRL" }, usdBrlRate);
      const date = startOfDashboardDay(cashflowDate);
      if (!date) return null;
      return {
        id: `cash-${item.id}`,
        recordId: item.id,
        resourceKey: "cash-payments",
        statusField: "status",
        statusValue: item.status || "Pendente",
        statusOptions: CASHFLOW_STATUS_OPTIONS.payments,
        type: "saida",
        typeLabel: "Pgto Caixa",
        date,
        dateKey: dashboardDateKey(date),
        amount: -Math.abs(amount),
        currency: item.moeda || "R$",
        title: item.descricao || "Pagamento caixa",
        subtitle: item.contraparte_texto || counterpartyMap[String(item.contraparte)] || "",
        description: item.obs || "",
        meta: [
          isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`
            : "",
        ].filter(Boolean).join(" · "),
      };
    })
    .filter(Boolean);

  const otherCashOutflowEntries = (otherCashOutflows || [])
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .map((item) => {
      const date = startOfDashboardDay(item.data_pagamento);
      if (!date) return null;
      const amount = resolveCashflowDisplayValue(Number(item.valor || 0), item.moeda, { key: "BRL" }, usdBrlRate);
      return {
        id: `other-cash-outflow-${item.id}`,
        recordId: item.id,
        resourceKey: "other-cash-outflows",
        statusField: "status",
        statusValue: item.status || "Pendente",
        statusOptions: CASHFLOW_STATUS_OPTIONS.otherCashOutflows,
        type: "saida",
        typeLabel: "Outras saídas Caixa",
        date,
        dateKey: dashboardDateKey(date),
        amount: -Math.abs(amount),
        currency: item.moeda || "R$",
        title: item.descricao || "Outra saída",
        subtitle: "",
        description: item.obs || "",
        meta: [
          isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`
            : "",
        ].filter(Boolean).join(" · "),
      };
    })
    .filter(Boolean);

  const otherEntriesRows = (otherEntries || [])
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .map((item) => {
      const date = startOfDashboardDay(item.data_entrada);
      if (!date) return null;
      const amount = resolveCashflowDisplayValue(Number(item.valor || 0), item.moeda, { key: "BRL" }, usdBrlRate);
      return {
        id: `other-entry-${item.id}`,
        recordId: item.id,
        resourceKey: "other-entries",
        statusField: "status",
        statusValue: item.status || "Previsto",
        statusOptions: CASHFLOW_STATUS_OPTIONS.otherEntries,
        type: "entrada",
        typeLabel: "Outras Entradas Caixa",
        date,
        dateKey: dashboardDateKey(date),
        amount: Math.abs(amount),
        currency: item.moeda || "R$",
        title: item.descricao || "Outra entrada",
        subtitle: "",
        description: item.obs || "",
        meta: [
          isUsdCurrency(item.moeda) && usdBrlRate > 0
            ? `Valor em U$ convertido para R$ pelo USDBRL de hoje (${usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`
            : "",
        ].filter(Boolean).join(" · "),
      };
    })
    .filter(Boolean);

  const derivativeEntries = (derivatives || [])
    .filter((item) =>
      rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: DERIVATIVE_CULTURE_KEYS,
      }),
    )
    .map((item) => {
      const date = startOfDashboardDay(item.data_liquidacao || item.data_contratacao);
      if (!date) return null;
      const isMoedaItem = normalizeText(item.moeda_ou_cmdtye) === "moeda";
      const amount = Number((isMoedaItem ? item.ajustes_totais_usd : item.ajustes_totais_brl) || 0);
      if (!amount) return null;
      return {
        id: `derivative-${item.id}`,
        recordId: item.id,
        resourceKey: "derivative-operations",
        statusField: "status_operacao",
        statusValue: normalizeText(item.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto",
        statusOptions: CASHFLOW_STATUS_OPTIONS.derivatives,
        type: amount >= 0 ? "entrada" : "saida",
        typeLabel: amount >= 0 ? "Ajuste MTM Derivativo" : "Ajuste MTM Derivativo",
        date,
        dateKey: dashboardDateKey(date),
        amount,
        currency: "R$",
        title: item.nome_da_operacao || item.cod_operacao_mae || "Derivativo",
        subtitle: item.bolsa_ref || counterpartyMap[String(item.contraparte)] || "",
        description: item.obs || "",
        meta: [
          item.tipo_derivativo ? `Tipo ${item.tipo_derivativo}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .filter(Boolean);

  return [...salesEntries, ...cashEntries, ...otherCashOutflowEntries, ...otherEntriesRows, ...derivativeEntries].sort((left, right) => {
    const timeDiff = (left.date?.getTime?.() || 0) - (right.date?.getTime?.() || 0);
    if (timeDiff !== 0) return timeDiff;
    return Number(right.amount || 0) - Number(left.amount || 0);
  });
};

function CashflowDailyDashboard({ dashboardFilter }) {
  const { user } = useAuth();
  const defaultRange = useMemo(() => buildCashflowDailyDefaultDateRange(), []);
  const dashboardCacheKey = useMemo(
    () => buildDashboardPageCacheKey("cashflow-daily", dashboardFilter, user),
    [dashboardFilter, user],
  );
  const initialDashboardCache = getDashboardPageCache(dashboardCacheKey);
  const initialUiState = initialDashboardCache?.cashflowDailyUi || {};
  const initialSource = initialDashboardCache?.cashflowDailySource || {};
  const [dateStart, setDateStart] = useState(() => initialUiState.dateStart || defaultRange.startIso);
  const [dateEnd, setDateEnd] = useState(() => initialUiState.dateEnd || defaultRange.endIso);
  const [chartInterval, setChartInterval] = useState(() => initialUiState.chartInterval || "daily");
  const [initialBalanceInput, setInitialBalanceInput] = useState(() => initialUiState.initialBalanceInput || "0");
  const [openingBalanceOverrides, setOpeningBalanceOverrides] = useState(() => initialUiState.openingBalanceOverrides || {});
  const [entriesOverrides, setEntriesOverrides] = useState(() => initialUiState.entriesOverrides || {});
  const [outputsOverrides, setOutputsOverrides] = useState(() => initialUiState.outputsOverrides || {});
  const [expandedDays, setExpandedDays] = useState(() => new Set(initialUiState.expandedDays || []));
  const [entryPickerOpen, setEntryPickerOpen] = useState(false);
  const [outputPickerOpen, setOutputPickerOpen] = useState(false);
  const [summaryModal, setSummaryModal] = useState(null);
  const [createModal, setCreateModal] = useState(null);
  const [createFormError, setCreateFormError] = useState("");
  const [sales, setSales] = useState(() => initialSource.sales || []);
  const [cashPayments, setCashPayments] = useState(() => initialSource.cashPayments || []);
  const [otherCashOutflows, setOtherCashOutflows] = useState(() => initialSource.otherCashOutflows || []);
  const [otherEntries, setOtherEntries] = useState(() => initialSource.otherEntries || []);
  const [derivatives, setDerivatives] = useState(() => initialSource.derivatives || []);
  const [counterparties, setCounterparties] = useState(() => initialSource.counterparties || []);
  const [tradingviewQuotes, setTradingviewQuotes] = useState(() => initialSource.tradingviewQuotes || []);
  const [sourceReady, setSourceReady] = useState(() => Boolean(initialDashboardCache?.cashflowDailySourceReady));
  const [statusSavingByEntry, setStatusSavingByEntry] = useState({});
  const [statusErrorByEntry, setStatusErrorByEntry] = useState({});
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales,
    setSales,
    derivatives,
    setDerivatives,
    cashPayments,
    setCashPayments,
    otherCashOutflows,
    setOtherCashOutflows,
    otherEntries,
    setOtherEntries,
  });

  useEffect(() => {
    let isMounted = true;
    const cachedDashboard = getDashboardPageCache(dashboardCacheKey);

    if (cachedDashboard?.cashflowDailySourceReady) {
      const cachedSource = cachedDashboard.cashflowDailySource || {};
      setSales(cachedSource.sales || []);
      setCashPayments(cachedSource.cashPayments || []);
      setOtherCashOutflows(cachedSource.otherCashOutflows || []);
      setOtherEntries(cachedSource.otherEntries || []);
      setDerivatives(cachedSource.derivatives || []);
      setCounterparties(cachedSource.counterparties || []);
      setTradingviewQuotes(cachedSource.tradingviewQuotes || []);
      setSourceReady(true);
    }

    const loadSource = () => {
      Promise.all([
        resourceService.listAll("physical-sales").catch(() => []),
        resourceService.listAll("cash-payments").catch(() => []),
        resourceService.listAll("other-cash-outflows").catch(() => []),
        resourceService.listAll("other-entries").catch(() => []),
        resourceService.listAll("derivative-operations").catch(() => []),
        resourceService.listAll("counterparties").catch(() => []),
        resourceService.listTradingviewQuotes().catch(() => []),
      ]).then(([salesResponse, cashPaymentsResponse, otherCashOutflowsResponse, otherEntriesResponse, derivativesResponse, counterpartiesResponse, tradingviewQuotesResponse]) => {
        if (!isMounted) return;
        const nextSource = {
          sales: salesResponse || [],
          cashPayments: cashPaymentsResponse || [],
          otherCashOutflows: otherCashOutflowsResponse || [],
          otherEntries: otherEntriesResponse || [],
          derivatives: derivativesResponse || [],
          counterparties: counterpartiesResponse || [],
          tradingviewQuotes: tradingviewQuotesResponse || [],
        };
        setSales(nextSource.sales);
        setCashPayments(nextSource.cashPayments);
        setOtherCashOutflows(nextSource.otherCashOutflows);
        setOtherEntries(nextSource.otherEntries);
        setDerivatives(nextSource.derivatives);
        setCounterparties(nextSource.counterparties);
        setTradingviewQuotes(nextSource.tradingviewQuotes);
        setSourceReady(true);
        setDashboardPageCache(dashboardCacheKey, {
          cashflowDailySource: nextSource,
          cashflowDailySourceReady: true,
        });
      });
    };

    const timeoutId = typeof window !== "undefined"
      ? window.setTimeout(loadSource, cachedDashboard?.cashflowDailySourceReady ? 1200 : 0)
      : 0;
    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dashboardCacheKey]);

  useEffect(() => {
    if (!sourceReady) return;
    setDashboardPageCache(dashboardCacheKey, {
      cashflowDailySource: {
        sales,
        cashPayments,
        otherCashOutflows,
        otherEntries,
        derivatives,
        counterparties,
        tradingviewQuotes,
      },
      cashflowDailySourceReady: true,
    });
  }, [cashPayments, counterparties, dashboardCacheKey, derivatives, otherCashOutflows, otherEntries, sales, sourceReady, tradingviewQuotes]);

  useEffect(() => {
    setDashboardPageCache(dashboardCacheKey, {
      cashflowDailyUi: {
        dateStart,
        dateEnd,
        chartInterval,
        initialBalanceInput,
        openingBalanceOverrides,
        entriesOverrides,
        outputsOverrides,
        expandedDays: Array.from(expandedDays),
      },
    });
  }, [
    chartInterval,
    dashboardCacheKey,
    dateEnd,
    dateStart,
    entriesOverrides,
    expandedDays,
    initialBalanceInput,
    openingBalanceOverrides,
    outputsOverrides,
  ]);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );
  const usdBrlQuote = useMemo(() => getUsdBrlQuoteValue(tradingviewQuotes), [tradingviewQuotes]);
  const replaceRowById = useCallback((items, updated) => items.map((row) => (String(row.id) === String(updated.id) ? updated : row)), []);
  const handleInlineStatusChange = useCallback(async (entry, nextStatus) => {
    if (!entry?.recordId || !entry?.resourceKey || !entry?.statusField) return;
    if (String(entry.statusValue || "") === String(nextStatus || "")) return;

    setStatusSavingByEntry((current) => ({ ...current, [entry.id]: true }));
    setStatusErrorByEntry((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });

    try {
      const saved = await resourceService.patch(entry.resourceKey, entry.recordId, {
        [entry.statusField]: nextStatus,
      });

      if (entry.resourceKey === "cash-payments") {
        setCashPayments((currentRows) => replaceRowById(currentRows, saved));
      } else if (entry.resourceKey === "other-cash-outflows") {
        setOtherCashOutflows((currentRows) => replaceRowById(currentRows, saved));
      } else if (entry.resourceKey === "other-entries") {
        setOtherEntries((currentRows) => replaceRowById(currentRows, saved));
      } else if (entry.resourceKey === "derivative-operations") {
        setDerivatives((currentRows) => replaceRowById(currentRows, saved));
      }
    } catch (error) {
      setStatusErrorByEntry((current) => ({
        ...current,
        [entry.id]: error?.response?.data?.detail || "Nao foi possivel salvar o status.",
      }));
    } finally {
      setStatusSavingByEntry((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    }
  }, [replaceRowById, setCashPayments, setDerivatives, setOtherCashOutflows, setOtherEntries]);

  const initialBalance = useMemo(() => parseLocalizedNumber(initialBalanceInput), [initialBalanceInput]);
  const rangeStart = useMemo(() => startOfDashboardDay(dateStart), [dateStart]);
  const rangeEnd = useMemo(() => startOfDashboardDay(dateEnd), [dateEnd]);
  const hasOpenDateRange = !rangeStart || !rangeEnd;
  const normalizedEnd = useMemo(() => {
    if (!rangeStart || !rangeEnd) return rangeEnd;
    return rangeEnd >= rangeStart ? rangeEnd : rangeStart;
  }, [rangeEnd, rangeStart]);

  useEffect(() => {
    if (!rangeStart || !rangeEnd || rangeEnd >= rangeStart) return;
    setDateEnd(formatIsoDate(rangeStart));
  }, [rangeEnd, rangeStart]);

  const entries = useMemo(
    () => buildCashflowDailyEntries({ sales, cashPayments, otherCashOutflows, otherEntries, derivatives, dashboardFilter, counterpartyMap, usdBrlRate: usdBrlQuote }),
    [cashPayments, counterpartyMap, dashboardFilter, derivatives, otherCashOutflows, otherEntries, sales, usdBrlQuote],
  );

  const entriesDateBounds = useMemo(() => {
    const datedEntries = entries.filter((entry) => entry.date?.getTime?.());
    if (!datedEntries.length) return { start: null, end: null };

    return datedEntries.reduce(
      (acc, entry) => {
        const time = entry.date.getTime();
        if (!acc.start || time < acc.start.getTime()) acc.start = entry.date;
        if (!acc.end || time > acc.end.getTime()) acc.end = entry.date;
        return acc;
      },
      { start: null, end: null },
    );
  }, [entries]);

  const effectiveRangeStart = hasOpenDateRange ? entriesDateBounds.start : rangeStart;
  const effectiveRangeEnd = hasOpenDateRange ? entriesDateBounds.end : normalizedEnd;

  const createFormFields = createModal?.definition?.fields || [];
  const createInitialValues = useMemo(() => {
    if (!createModal) return {};
    return {
      grupo: dashboardFilter?.grupo?.length === 1 ? dashboardFilter.grupo[0] : "",
      subgrupo: dashboardFilter?.subgrupo?.length === 1 ? dashboardFilter.subgrupo[0] : "",
    };
  }, [createModal, dashboardFilter?.grupo, dashboardFilter?.subgrupo]);

  const closeCreateModal = useCallback(() => {
    setCreateModal(null);
    setCreateFormError("");
    setEntryPickerOpen(false);
    setOutputPickerOpen(false);
  }, []);

  const openCreateModal = useCallback((definition, title) => {
    setCreateFormError("");
    setEntryPickerOpen(false);
    setCreateModal({ definition, title });
  }, []);

  const entriesByDate = useMemo(
    () =>
      entries.reduce((acc, entry) => {
        if (!acc[entry.dateKey]) acc[entry.dateKey] = [];
        acc[entry.dateKey].push(entry);
        return acc;
      }, {}),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    if (hasOpenDateRange) {
      return entries.filter((entry) => Number.isFinite(entry.date?.getTime?.()));
    }
    if (!rangeStart || !normalizedEnd) return [];
    const startTime = rangeStart.getTime();
    const endTime = normalizedEnd.getTime();
    return entries.filter((entry) => {
      const entryTime = entry.date?.getTime?.();
      return Number.isFinite(entryTime) && entryTime >= startTime && entryTime <= endTime;
    });
  }, [entries, hasOpenDateRange, normalizedEnd, rangeStart]);

  const dayRows = useMemo(() => {
    if (!effectiveRangeStart || !effectiveRangeEnd) return [];
    const rows = [];
    const cursor = new Date(effectiveRangeStart);
    let runningBalance = initialBalance;

    while (cursor <= effectiveRangeEnd) {
      const date = new Date(cursor);
      const dateKey = dashboardDateKey(date);
      const launches = (entriesByDate[dateKey] || []).slice().sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));
      const calculatedTotalIn = launches.reduce((sum, item) => sum + (Number(item.amount || 0) > 0 ? Number(item.amount || 0) : 0), 0);
      const calculatedTotalOut = launches.reduce((sum, item) => sum + (Number(item.amount || 0) < 0 ? Math.abs(Number(item.amount || 0)) : 0), 0);
      const overriddenTotalIn = entriesOverrides[dateKey];
      const overriddenTotalOut = outputsOverrides[dateKey];
      const totalIn = overriddenTotalIn !== undefined ? parseLocalizedNumber(overriddenTotalIn) : calculatedTotalIn;
      const totalOut = overriddenTotalOut !== undefined ? parseLocalizedNumber(overriddenTotalOut) : calculatedTotalOut;
      const overriddenOpeningBalance = openingBalanceOverrides[dateKey];
      const openingBalance = overriddenOpeningBalance !== undefined
        ? parseLocalizedNumber(overriddenOpeningBalance)
        : runningBalance;
      const closingBalance = openingBalance + totalIn - totalOut;

      rows.push({
        date,
        dateKey,
        label: formatCashflowDailyTableDate(date),
        isToday: dateKey === dashboardDateKey(new Date()),
        launches,
        launchCount: launches.length,
        totalIn,
        totalOut,
        totalInInput: overriddenTotalIn ?? formatCashflowDailyInteger(totalIn),
        totalOutInput: overriddenTotalOut ?? formatCashflowDailyInteger(totalOut),
        openingBalance,
        openingBalanceInput: overriddenOpeningBalance ?? formatCashflowDailyInteger(openingBalance),
        closingBalance,
      });

      runningBalance = closingBalance;
      cursor.setDate(cursor.getDate() + 1);
    }

    return rows;
  }, [effectiveRangeEnd, effectiveRangeStart, entriesByDate, entriesOverrides, initialBalance, openingBalanceOverrides, outputsOverrides]);

  const summary = useMemo(() => {
    const totalIn = dayRows.reduce((sum, row) => sum + row.totalIn, 0);
    const totalOut = dayRows.reduce((sum, row) => sum + row.totalOut, 0);
    return {
      totalIn,
      totalOut,
      finalBalance: dayRows.length ? dayRows[dayRows.length - 1].closingBalance : initialBalance,
      totalDays: dayRows.length,
      activeDays: dayRows.filter((row) => row.launchCount > 0).length,
      foreignCurrencyEntries: visibleEntries.filter((item) => !isBrlCurrency(item.currency)).length,
    };
  }, [dayRows, initialBalance, visibleEntries]);

  const totalInEntries = useMemo(
    () => visibleEntries.filter((entry) => Number(entry.amount || 0) > 0),
    [visibleEntries],
  );

  const totalOutEntries = useMemo(
    () => visibleEntries.filter((entry) => Number(entry.amount || 0) < 0),
    [visibleEntries],
  );

  const forecastSummaries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    return [7, 30, 90, 365].map((days) => {
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + days - 1);
      endDate.setHours(23, 59, 59, 999);
      const endTime = endDate.getTime();
      const periodEntries = entries.filter((entry) => {
        const t = entry.date?.getTime?.();
        return Number.isFinite(t) && t >= todayTime && t <= endTime;
      });
      const totalIn = periodEntries.reduce((sum, e) => sum + (Number(e.amount || 0) > 0 ? Number(e.amount || 0) : 0), 0);
      const totalOut = periodEntries.reduce((sum, e) => sum + (Number(e.amount || 0) < 0 ? Math.abs(Number(e.amount || 0)) : 0), 0);
      return { days, totalIn, totalOut };
    });
  }, [entries]);

  const sliderStartVal = useMemo(() => {
    if (!rangeStart) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(CASHFLOW_DAILY_SLIDER_MIN, Math.min(CASHFLOW_DAILY_SLIDER_MAX, Math.round((rangeStart.getTime() - today.getTime()) / 86400000)));
  }, [rangeStart]);

  const sliderEndVal = useMemo(() => {
    if (!normalizedEnd) return 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(CASHFLOW_DAILY_SLIDER_MIN, Math.min(CASHFLOW_DAILY_SLIDER_MAX, Math.round((normalizedEnd.getTime() - today.getTime()) / 86400000)));
  }, [normalizedEnd]);

  const handleSliderStartChange = useCallback((val) => {
    const numVal = Number(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDate = new Date(today);
    newDate.setDate(today.getDate() + numVal);
    setDateStart(formatIsoDate(newDate));
  }, []);

  const handleSliderEndChange = useCallback((val) => {
    const numVal = Number(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDate = new Date(today);
    newDate.setDate(today.getDate() + numVal);
    setDateEnd(formatIsoDate(newDate));
  }, []);

  const handleForecastCardClick = useCallback((days) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDateStart(formatIsoDate(today));
    const end = new Date(today);
    end.setDate(today.getDate() + days - 1);
    setDateEnd(formatIsoDate(end));
  }, []);

  const activeForecastPeriod = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = formatIsoDate(today);
    if (dateStart !== todayIso) return null;
    for (const days of [7, 30, 90, 365]) {
      const end = new Date(today);
      end.setDate(today.getDate() + days - 1);
      if (dateEnd === formatIsoDate(end)) return days;
    }
    return null;
  }, [dateStart, dateEnd]);

  const groupedChartRows = useMemo(() => {
    if (chartInterval === "daily") {
      return dayRows.map((row) => ({
        label: row.label,
        totalIn: row.totalIn,
        totalOut: row.totalOut,
        closingBalance: row.closingBalance,
      }));
    }

    if (chartInterval === "geral") {
      return [{
        label: "Geral",
        totalIn: dayRows.reduce((sum, row) => sum + row.totalIn, 0),
        totalOut: dayRows.reduce((sum, row) => sum + row.totalOut, 0),
        closingBalance: dayRows.length ? dayRows[dayRows.length - 1].closingBalance : initialBalance,
      }];
    }

    const grouped = new Map();

    dayRows.forEach((row) => {
      const date = row.date;
      if (!date) return;

      let key = "";
      let label = "";

      if (chartInterval === "weekly") {
        const start = startOfDashboardWeek(date);
        const end = endOfDashboardWeek(date);
        key = dashboardDateKey(start);
        label = `${formatShortBrazilianDate(start)} a ${formatShortBrazilianDate(end)}`;
      } else if (chartInterval === "monthly") {
        const start = startOfDashboardMonth(date);
        key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
        label = formatCashflowMonthYear(start);
      } else if (chartInterval === "yearly") {
        key = String(date.getFullYear());
        label = String(date.getFullYear());
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          label,
          totalIn: 0,
          totalOut: 0,
          closingBalance: row.closingBalance,
          sortValue: date.getTime(),
        });
      }

      const bucket = grouped.get(key);
      bucket.totalIn += row.totalIn;
      bucket.totalOut += row.totalOut;
      bucket.closingBalance = row.closingBalance;
    });

    return Array.from(grouped.values()).sort((left, right) => left.sortValue - right.sortValue);
  }, [chartInterval, dayRows, initialBalance]);

  const cashflowDailyChartOption = useMemo(() => ({
    animationDuration: 250,
    grid: {
      top: 34,
      right: 24,
      bottom: 56,
      left: 56,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value) =>
        `R$ ${Number(value || 0).toLocaleString("pt-BR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}`,
    },
    legend: {
      bottom: 10,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        color: "#475569",
        fontSize: 12,
        fontWeight: 700,
      },
    },
    xAxis: {
      type: "category",
      data: groupedChartRows.map((row) => row.label),
      axisLabel: {
        color: "#64748b",
        fontSize: 11,
        interval: groupedChartRows.length > 24 ? Math.ceil(groupedChartRows.length / 12) - 1 : 0,
      },
      axisLine: {
        lineStyle: {
          color: "rgba(15,23,42,0.12)",
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#64748b",
        fontSize: 11,
        formatter: (value) => Number(value || 0).toLocaleString("pt-BR"),
      },
      splitLine: {
        lineStyle: {
          color: "rgba(15,23,42,0.08)",
        },
      },
    },
    series: [
      {
        name: "Entradas",
        type: "bar",
        data: groupedChartRows.map((row) => row.totalIn),
        itemStyle: {
          color: "#16a34a",
          borderRadius: [6, 6, 0, 0],
        },
      },
      {
        name: "Saídas",
        type: "bar",
        data: groupedChartRows.map((row) => -Math.abs(row.totalOut)),
        itemStyle: {
          color: "#dc2626",
          borderRadius: [6, 6, 0, 0],
        },
      },
      {
        name: "Saldo final",
        type: "line",
        smooth: false,
        data: groupedChartRows.map((row) => (row.closingBalance >= 0 ? row.closingBalance : null)),
        symbol: "circle",
        symbolSize: 7,
        lineStyle: {
          width: 3,
          color: "#16a34a",
        },
        itemStyle: {
          color: "#16a34a",
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      },
      {
        name: "Saldo final",
        type: "line",
        smooth: false,
        data: groupedChartRows.map((row) => (row.closingBalance < 0 ? row.closingBalance : null)),
        symbol: "circle",
        symbolSize: 7,
        lineStyle: {
          width: 3,
          color: "#dc2626",
        },
        itemStyle: {
          color: "#dc2626",
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      },
    ],
  }), [groupedChartRows]);

  const toggleDay = useCallback((dateKey) => {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  const handleOpeningBalanceChange = useCallback((dateKey, value) => {
    setOpeningBalanceOverrides((current) => ({
      ...current,
      [dateKey]: value,
    }));
  }, []);

  const handleOpeningBalanceBlur = useCallback((dateKey, fallbackValue) => {
    setOpeningBalanceOverrides((current) => {
      const rawValue = String(current[dateKey] ?? "").trim();
      if (!rawValue) {
        const next = { ...current };
        delete next[dateKey];
        return next;
      }
      return {
        ...current,
        [dateKey]: formatCashflowDailyInteger(parseLocalizedNumber(rawValue || fallbackValue)),
      };
    });
  }, []);

  const handleEntriesChange = useCallback((dateKey, value) => {
    setEntriesOverrides((current) => ({
      ...current,
      [dateKey]: value,
    }));
  }, []);

  const handleEntriesBlur = useCallback((dateKey, fallbackValue) => {
    setEntriesOverrides((current) => {
      const rawValue = String(current[dateKey] ?? "").trim();
      if (!rawValue) {
        const next = { ...current };
        delete next[dateKey];
        return next;
      }
      return {
        ...current,
        [dateKey]: formatCashflowDailyInteger(parseLocalizedNumber(rawValue || fallbackValue)),
      };
    });
  }, []);

  const handleOutputsChange = useCallback((dateKey, value) => {
    setOutputsOverrides((current) => ({
      ...current,
      [dateKey]: value,
    }));
  }, []);

  const handleOutputsBlur = useCallback((dateKey, fallbackValue) => {
    setOutputsOverrides((current) => {
      const rawValue = String(current[dateKey] ?? "").trim();
      if (!rawValue) {
        const next = { ...current };
        delete next[dateKey];
        return next;
      }
      return {
        ...current,
        [dateKey]: formatCashflowDailyInteger(parseLocalizedNumber(rawValue || fallbackValue)),
      };
    });
  }, []);

  const openSummaryModal = useCallback((type) => {
    if (type === "in") {
      setSummaryModal({
        title: "Operações de entradas",
        entries: totalInEntries,
        totalAmount: summary.totalIn,
      });
      return;
    }

    setSummaryModal({
      title: "Operações de saídas",
      entries: totalOutEntries,
      totalAmount: summary.totalOut,
    });
  }, [summary.totalIn, summary.totalOut, totalInEntries, totalOutEntries]);

  const cashflowDailyInsightMessage = (
    <SummaryInsightCopy
      paragraphs={[
        "O saldo percorre dia a dia a partir do valor inicial. Vendas físicas, outras entradas e ajustes MTM R$ dos derivativos entram como crédito na data cadastrada, enquanto pgtos caixa e outras saídas caixa saem como débito.",
        usdBrlQuote > 0
          ? `Valores em U$ são convertidos para R$ usando o USDBRL de hoje: ${usdBrlQuote.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}.`
          : "Valores em U$ são convertidos para R$ usando a cotação USDBRL mais recente disponível.",
      ]}
    />
  );

  return (
    <section className="cashflow-daily-shell" data-dashboard-debug-region data-dashboard-debug-label="Fluxo de Caixa Diário">
      <div className="card cashflow-daily-toolbar-card summary-insight-card">
        <SummaryInsightButton
          title="Como o fluxo diário é calculado"
          message={cashflowDailyInsightMessage}
        />
        <div className="cashflow-daily-toolbar">
          <div className="chart-date-filters">
            <label className="chart-date-filter">
              <span>Data início</span>
              <DatePickerField value={dateStart} onChange={setDateStart} />
            </label>
            <label className="chart-date-filter">
              <span>Data fim</span>
              <DatePickerField value={dateEnd} onChange={setDateEnd} />
            </label>
            <label className="chart-date-filter cashflow-daily-balance-filter">
              <span>Saldo inicial</span>
              <input
                type="text"
                inputMode="decimal"
                value={initialBalanceInput}
                onChange={(event) => setInitialBalanceInput(event.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>
          <div className="chart-toolbar">
            <button
              type="button"
              className="chart-period-btn active"
              onClick={() => setEntryPickerOpen(true)}
            >
              Cadastrar entrada
            </button>
            <button
              type="button"
              className="chart-period-btn"
              onClick={() => setOutputPickerOpen(true)}
            >
              Cadastrar saída
            </button>
          </div>
        </div>
      </div>

      <section className="cashflow-daily-forecast-grid">
        {forecastSummaries.map(({ days, totalIn, totalOut }) => (
          <button
            key={days}
            type="button"
            className="card cashflow-daily-forecast-card"
            onClick={() => handleForecastCardClick(days)}
          >
            <span className="cashflow-daily-forecast-label">
              Próximos {days === 365 ? "365 dias" : `${days} dias`}
            </span>
            <div className="cashflow-daily-forecast-values">
              <span className="cashflow-daily-forecast-in">
                <small>Entradas</small>
                <strong>{formatCashflowDailyCurrency(totalIn)}</strong>
              </span>
              <span className="cashflow-daily-forecast-out">
                <small>Saídas</small>
                <strong>{formatCashflowDailyCurrency(totalOut)}</strong>
              </span>
            </div>
          </button>
        ))}
      </section>

      <div className="card cashflow-daily-chart-card">
        <div className="chart-card-header">
          <div>
            <h3>Fluxo Diário</h3>
            <p className="muted">Entradas em verde, saídas em vermelho e a linha mostra o saldo final de cada dia.</p>
          </div>
          <div className="chart-toolbar">
            {[
              ["daily", "Diario"],
              ["weekly", "Semanal"],
              ["monthly", "Mensal"],
              ["yearly", "Anual"],
              ["geral", "Geral"],
            ].map(([value, label]) => (
              <button
                key={`cashflow-daily-chart-${value}`}
                type="button"
                className={`chart-period-btn${chartInterval === value ? " active" : ""}`}
                onClick={() => setChartInterval(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="cashflow-daily-chart-controls">
          <div className="cashflow-daily-slider-presets">
            {[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [365, "1 ano"]].map(([days, label]) => (
              <button
                key={days}
                type="button"
                className={`chart-period-btn${activeForecastPeriod === days ? " active" : ""}`}
                onClick={() => handleForecastCardClick(days)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="cashflow-daily-range-slider">
            <div className="cashflow-daily-range-slider-track" />
            <div
              className="cashflow-daily-range-slider-fill"
              style={{
                left: `${((sliderStartVal - CASHFLOW_DAILY_SLIDER_MIN) / (CASHFLOW_DAILY_SLIDER_MAX - CASHFLOW_DAILY_SLIDER_MIN)) * 100}%`,
                right: `${100 - ((sliderEndVal - CASHFLOW_DAILY_SLIDER_MIN) / (CASHFLOW_DAILY_SLIDER_MAX - CASHFLOW_DAILY_SLIDER_MIN)) * 100}%`,
              }}
            />
            <input
              type="range"
              min={CASHFLOW_DAILY_SLIDER_MIN}
              max={CASHFLOW_DAILY_SLIDER_MAX}
              value={sliderStartVal}
              onChange={(e) => handleSliderStartChange(e.target.value)}
              className="cashflow-slider-input"
            />
            <input
              type="range"
              min={CASHFLOW_DAILY_SLIDER_MIN}
              max={CASHFLOW_DAILY_SLIDER_MAX}
              value={sliderEndVal}
              onChange={(e) => handleSliderEndChange(e.target.value)}
              className="cashflow-slider-input"
            />
          </div>
        </div>
        <div className="cashflow-daily-chart-wrap">
          <ReactECharts option={cashflowDailyChartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "svg" }} />
        </div>
      </div>

      <div className="card cashflow-daily-table-card">
        <div className="cashflow-daily-table-wrap">
          <table className="cashflow-daily-table">
            <thead>
              <tr>
                <th aria-label="Expandir" />
                <th>Data</th>
                <th>Lançamentos</th>
                <th>Entradas</th>
                <th>Saídas</th>
                <th>Saldo inicial</th>
                <th>Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((row) => {
                const isExpanded = expandedDays.has(row.dateKey);
                return (
                  <Fragment key={row.dateKey}>
                    <tr className={`${row.launchCount ? "has-movement" : ""}${row.isToday ? " is-today" : ""}`.trim()}>
                      <td>
                        {row.launchCount ? (
                          <button
                            type="button"
                            className="cashflow-daily-expand-btn"
                            onClick={() => toggleDay(row.dateKey)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? `Recolher ${row.label}` : `Expandir ${row.label}`}
                          >
                            {isExpanded ? "−" : "+"}
                          </button>
                        ) : null}
                      </td>
                      <td>{row.label}</td>
                      <td>{row.launchCount}</td>
                      <td>
                        <div className="cashflow-daily-balance-input-wrap">
                          <span className="cashflow-daily-balance-prefix">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="cashflow-daily-balance-input is-positive"
                            value={row.totalInInput}
                            onChange={(event) => handleEntriesChange(row.dateKey, event.target.value)}
                            onBlur={() => handleEntriesBlur(row.dateKey, row.totalIn)}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="cashflow-daily-balance-input-wrap">
                          <span className="cashflow-daily-balance-prefix">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="cashflow-daily-balance-input is-negative"
                            value={row.totalOutInput}
                            onChange={(event) => handleOutputsChange(row.dateKey, event.target.value)}
                            onBlur={() => handleOutputsBlur(row.dateKey, row.totalOut)}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="cashflow-daily-balance-input-wrap">
                          <span className="cashflow-daily-balance-prefix">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={`cashflow-daily-balance-input ${row.openingBalance >= 0 ? "is-positive" : "is-negative"}`}
                            value={row.openingBalanceInput}
                            onChange={(event) => handleOpeningBalanceChange(row.dateKey, event.target.value)}
                            onBlur={() => handleOpeningBalanceBlur(row.dateKey, row.openingBalance)}
                          />
                        </div>
                      </td>
                      <td className={row.closingBalance >= 0 ? "is-positive" : "is-negative"}>
                        {formatCashflowDailyCurrency(row.closingBalance)}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="cashflow-daily-detail-row">
                        <td colSpan={7}>
                          {row.launchCount ? (
                            <CashflowDailyLaunchList
                              entries={row.launches}
                              statusSavingByEntry={statusSavingByEntry}
                              statusErrorByEntry={statusErrorByEntry}
                              onStatusChange={handleInlineStatusChange}
                              onEdit={(entry) =>
                                openOperationForm({
                                  recordId: entry.recordId,
                                  resourceKey: entry.resourceKey,
                                })}
                            />
                          ) : (
                            <div className="cashflow-daily-empty">Nenhum lançamento neste dia.</div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <CashflowDailyEntriesModal
        open={Boolean(summaryModal)}
        title={summaryModal?.title}
        entries={summaryModal?.entries || []}
        totalAmount={summaryModal?.totalAmount || 0}
        statusSavingByEntry={statusSavingByEntry}
        statusErrorByEntry={statusErrorByEntry}
        onStatusChange={handleInlineStatusChange}
        onEdit={(entry) => {
          setSummaryModal(null);
          openOperationForm({
            recordId: entry.recordId,
            resourceKey: entry.resourceKey,
          });
        }}
        onClose={() => setSummaryModal(null)}
      />
      {editorNode}
      {entryPickerOpen ? (
        <div className="component-popup-backdrop" onClick={() => setEntryPickerOpen(false)}>
          <div className="component-popup cashflow-daily-entry-picker" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="component-popup-close" onClick={() => setEntryPickerOpen(false)}>
              ×
            </button>
            <div className="component-popup-header">
              <div>
                <strong>Cadastrar entrada</strong>
                <p className="muted">Escolha qual tipo de entrada você quer lançar no fluxo diário.</p>
              </div>
            </div>
            <div className="cashflow-daily-entry-picker-actions">
              <button
                type="button"
                className="chart-period-btn active"
                onClick={() => openCreateModal(resourceDefinitions.physicalSales, "Cadastrar entrada - Venda Físico")}
              >
                Venda Físico
              </button>
              <button
                type="button"
                className="chart-period-btn"
                onClick={() => openCreateModal(resourceDefinitions.otherEntries, "Cadastrar entrada - Outras entradas Caixa")}
              >
                Outras entradas Caixa
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {outputPickerOpen ? (
        <div className="component-popup-backdrop" onClick={() => setOutputPickerOpen(false)}>
          <div className="component-popup cashflow-daily-entry-picker" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="component-popup-close" onClick={() => setOutputPickerOpen(false)}>
              ×
            </button>
            <div className="component-popup-header">
              <div>
                <strong>Cadastrar saída</strong>
                <p className="muted">Escolha qual tipo de saída você quer lançar no fluxo diário.</p>
              </div>
            </div>
            <div className="cashflow-daily-entry-picker-actions">
              <button
                type="button"
                className="chart-period-btn active"
                onClick={() => openCreateModal(resourceDefinitions.cashPayments, "Cadastrar saída - Novo empréstimo")}
              >
                Cadastrar novo empréstimo
              </button>
              <button
                type="button"
                className="chart-period-btn"
                onClick={() => openCreateModal(resourceDefinitions.otherCashOutflows, "Cadastrar saída - Outras saídas Caixa")}
              >
                Outras saídas Caixa
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {createModal ? (
        <ResourceForm
          title={createModal.title}
          fields={createFormFields}
          initialValues={createInitialValues}
          submitLabel="Salvar"
          error={createFormError}
          onClose={closeCreateModal}
          onSubmit={async (payload, rawValues) => {
            try {
              const attachmentField = createFormFields.find((field) => field.type === "file-multi");
              const files = attachmentField && Array.isArray(rawValues[attachmentField.name]) ? rawValues[attachmentField.name] : [];
              let cleanPayload = attachmentField
                ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== attachmentField.name))
                : payload;

              if (createModal.definition.resource === "physical-sales" && cleanPayload.cultura_produto) {
                const crops = await resourceService.listAll("crops");
                const selectedCrop = crops.find((item) => (item.ativo || item.cultura) === cleanPayload.cultura_produto);
                if (selectedCrop) {
                  cleanPayload = {
                    ...cleanPayload,
                    cultura: selectedCrop.id,
                  };
                }
              }

              const saved = await resourceService.create(createModal.definition.resource, cleanPayload);
              if (files.length) {
                await resourceService.uploadAttachments(createModal.definition.resource, saved.id, files);
              }

              if (createModal.definition.resource === "physical-sales") {
                setSales((currentRows) => [...currentRows, saved]);
              }
              if (createModal.definition.resource === "cash-payments") {
                setCashPayments((currentRows) => [...currentRows, saved]);
              }
              if (createModal.definition.resource === "other-cash-outflows") {
                setOtherCashOutflows((currentRows) => [...currentRows, saved]);
              }
              if (createModal.definition.resource === "other-entries") {
                setOtherEntries((currentRows) => [...currentRows, saved]);
              }
              closeCreateModal();
            } catch (requestError) {
              setCreateFormError(requestError?.response?.data?.detail || "Nao foi possivel salvar o lançamento.");
            }
          }}
        />
      ) : null}
    </section>
  );
}

const readCultureLabel = (value) => {
  if (!value) return "Sem ativo";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return readCultureLabel(value[0]);
  return value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
};

const readRelationId = (value) => {
  if (Array.isArray(value)) return readRelationId(value[0]);
  if (value && typeof value === "object" && value.id != null) return String(value.id);
  if (value != null && value !== "") return String(value);
  return "";
};

const formatDashboardExchangeLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll("/", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const capitalizeFirstSummaryLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const formatDerivativeOperationPart = (value) => {
  const raw = String(value || "").replaceAll("_", " ").replaceAll("-", " ").trim();
  if (!raw) return "";
  const specialTokens = {
    ndf: "NDF",
    usd: "USD",
    brl: "BRL",
  };
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => specialTokens[part.toLowerCase()] || `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
};

const buildDerivativePositionTypeLabel = (item = {}) => {
  const operationLabel = [
    formatDerivativeOperationPart(item?.posicao || item?.grupo_montagem || item?.compra_venda),
    formatDerivativeOperationPart(item?.tipo_derivativo),
  ].filter(Boolean).join(" ");
  return operationLabel || capitalizeFirstSummaryLabel(
    item?.nome_da_operacao ||
      item?.title ||
      item?.contrato_derivativo ||
      item?.cod_operacao_mae ||
      item?.summaryLabel ||
      "Operacao derivativa",
  );
};

const formatDashboardStrikeLabel = (value, unit) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = parseLocalizedNumber(value);
  if (!Number.isFinite(parsed)) return "";
  const formatted = parsed.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const unitLabel = String(unit || "").trim();
  return `${formatted}${unitLabel ? ` ${unitLabel}` : ""}`;
};

const buildDerivativeMaturitySummaryLabel = (item, derivativeRow = null) => {
  const exchangeLabel = formatDashboardExchangeLabel(
    derivativeRow?.bolsa_ref ||
      derivativeRow?.ctrbolsa ||
      derivativeRow?.instituicao ||
      item?.exchangeLabel ||
      item?.bolsa_ref,
  );
  const operationLabel = buildDerivativePositionTypeLabel(derivativeRow || item);
  const strikeLabel =
    item?.strikeMontagemLabel ||
    formatDashboardStrikeLabel(
      derivativeRow?.strike_montagem ?? item?.strike_montagem,
      derivativeRow?.strike_moeda_unidade || item?.strike_moeda_unidade,
    );
  const operationWithStrike = `${operationLabel}${strikeLabel ? ` ${strikeLabel}` : ""}`;
  return exchangeLabel
    ? `${exchangeLabel} - ${operationWithStrike}`
    : operationWithStrike;
};

function CommercialRiskAnalyticsSkeleton() {
  return (
    <>
      <section className="stats-grid risk-kpi-grid risk-kpi-grid-summary">
        {Array.from({ length: 2 }).map((_, index) => (
          <article key={`risk-summary-skeleton-${index}`} className="chart-card risk-kpi-skeleton-card">
            <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" />
            <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-subtitle" />
            <div className="risk-kpi-skeleton-line" />
            <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-short" />
          </article>
        ))}
      </section>

      <section className="risk-kpi-long-short-grid risk-kpi-hedge-chart-row">
        <article className="chart-card risk-kpi-skeleton-card risk-kpi-skeleton-card-tall">
          <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" />
          <div className="risk-kpi-skeleton-chart" />
        </article>
      </section>

      <section className="risk-kpi-long-short-grid">
        <article className="chart-card risk-kpi-skeleton-card risk-kpi-skeleton-card-medium">
          <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" />
          <div className="risk-kpi-skeleton-chart risk-kpi-skeleton-chart-medium" />
        </article>
      </section>

    </>
  );
}

function CommercialRiskDashboard({ dashboardFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { options, updateFilter } = useDashboardFilter();
  const summaryParams = useMemo(
    () => ({
      grupo: dashboardFilter?.grupo || EMPTY_DASHBOARD_FILTER_ARRAY,
      subgrupo: dashboardFilter?.subgrupo || EMPTY_DASHBOARD_FILTER_ARRAY,
      cultura: dashboardFilter?.cultura || EMPTY_DASHBOARD_FILTER_ARRAY,
      safra: dashboardFilter?.safra || EMPTY_DASHBOARD_FILTER_ARRAY,
    }),
    [dashboardFilter?.grupo, dashboardFilter?.subgrupo, dashboardFilter?.cultura, dashboardFilter?.safra],
  );
  const dashboardCacheKey = useMemo(
    () => buildCommercialRiskDashboardCacheKey(summaryParams, user),
    [summaryParams, user],
  );
  const initialDashboardCache = getCommercialRiskDashboardCache(dashboardCacheKey);
  const [physicalSales, setPhysicalSales] = useState(() => initialDashboardCache?.physicalSales || []);
  const [derivatives, setDerivatives] = useState(() => initialDashboardCache?.derivatives || []);
  const [cropBoards, setCropBoards] = useState(() => initialDashboardCache?.cropBoards || []);
  const [hedgePolicies, setHedgePolicies] = useState(() => initialDashboardCache?.hedgePolicies || []);
  const [physicalPayments, setPhysicalPayments] = useState(() => initialDashboardCache?.physicalPayments || []);
  const [cashPayments, setCashPayments] = useState(() => initialDashboardCache?.cashPayments || []);
  const [budgetCosts, setBudgetCosts] = useState(() => initialDashboardCache?.budgetCosts || []);
  const [actualCosts, setActualCosts] = useState(() => initialDashboardCache?.actualCosts || []);
  const [hedgePolicyUsdBrlRate, setHedgePolicyUsdBrlRate] = useState(() => initialDashboardCache?.hedgePolicyUsdBrlRate || 0);
  const [strategyTriggers, setStrategyTriggers] = useState(() => initialDashboardCache?.strategyTriggers || []);
  const [triggerQuotes, setTriggerQuotes] = useState(() => initialDashboardCache?.triggerQuotes || []);
  const [triggerExchanges, setTriggerExchanges] = useState(() => initialDashboardCache?.triggerExchanges || []);
  const [summaryData, setSummaryData] = useState(() => initialDashboardCache?.summaryData || DEFAULT_COMMERCIAL_RISK_SUMMARY_DATA);
  const [summaryLoading, setSummaryLoading] = useState(() => !initialDashboardCache?.summaryData);
  const [analyticsReady, setAnalyticsReady] = useState(() => Boolean(initialDashboardCache?.analyticsReady));
  const [summaryHedgeChartMode, setSummaryHedgeChartMode] = useState("production");
  const [selectedMarketNewsPost, setSelectedMarketNewsPost] = useState(null);
  const [selectedMarketNewsAttachments, setSelectedMarketNewsAttachments] = useState([]);
  const [selectedMarketNewsAttachmentsLoading, setSelectedMarketNewsAttachmentsLoading] = useState(false);
  const [editingMaturityItem, setEditingMaturityItem] = useState(null);
  const [maturityAttachments, setMaturityAttachments] = useState([]);
  const [maturityFormError, setMaturityFormError] = useState("");
  const [resourceTableModal, setResourceTableModal] = useState(null);
  const summaryReadyEventDispatchedRef = useRef(false);
  const prevBaseParamsKeyRef = useRef(null);
  const prevAnalyticsBaseKeyRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    // Only treat as a "base change" (requiring loading skeleton) when grupo/subgrupo
    // change — cultura/safra filter locally and must not blank the page.
    const baseKey = JSON.stringify({ grupo: summaryParams.grupo, subgrupo: summaryParams.subgrupo });
    const isBaseChange = prevBaseParamsKeyRef.current !== baseKey;
    prevBaseParamsKeyRef.current = baseKey;

    const cachedDashboard = getCommercialRiskDashboardCache(dashboardCacheKey);
    const cachedSummary = cachedDashboard?.summaryData || resourceService.getCachedCommercialRiskSummary(summaryParams);

    if (cachedSummary) {
      setSummaryData(cachedSummary);
      setSummaryLoading(false);
    } else if (isBaseChange) {
      // Full loading state only for grupo/subgrupo changes
      setSummaryData(DEFAULT_COMMERCIAL_RISK_SUMMARY_DATA);
      setSummaryLoading(true);
    }
    // When only cultura/safra changed and no cache: keep current data visible,
    // update silently in background when the API responds.

    resourceService
      .getCommercialRiskSummary(summaryParams, cachedSummary ? { force: true } : {})
      .then((response) => {
        if (!isMounted) return;
        const nextSummary = response || DEFAULT_COMMERCIAL_RISK_SUMMARY_DATA;
        setSummaryData(nextSummary);
        setCommercialRiskDashboardCache(dashboardCacheKey, { summaryData: nextSummary });
      })
      .catch(() => {
        if (!isMounted) return;
        setSummaryData((current) => ({ ...current }));
      })
      .finally(() => {
        if (!isMounted) return;
        setSummaryLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [dashboardCacheKey, summaryParams]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = 0;

    const baseKey = JSON.stringify({ grupo: summaryParams.grupo, subgrupo: summaryParams.subgrupo });
    const isBaseChange = prevAnalyticsBaseKeyRef.current !== baseKey;
    prevAnalyticsBaseKeyRef.current = baseKey;

    const cachedDashboard = getCommercialRiskDashboardCache(dashboardCacheKey);

    if (cachedDashboard?.analyticsReady) {
      setPhysicalSales(cachedDashboard.physicalSales || []);
      setDerivatives(cachedDashboard.derivatives || []);
      setCropBoards(cachedDashboard.cropBoards || []);
      setHedgePolicies(cachedDashboard.hedgePolicies || []);
      setPhysicalPayments(cachedDashboard.physicalPayments || []);
      setCashPayments(cachedDashboard.cashPayments || []);
      setBudgetCosts(cachedDashboard.budgetCosts || []);
      setActualCosts(cachedDashboard.actualCosts || []);
      setHedgePolicyUsdBrlRate(cachedDashboard.hedgePolicyUsdBrlRate || 0);
      setStrategyTriggers(cachedDashboard.strategyTriggers || []);
      setTriggerQuotes(cachedDashboard.triggerQuotes || []);
      setTriggerExchanges(cachedDashboard.triggerExchanges || []);
      setAnalyticsReady(true);
    } else if (isBaseChange) {
      // Only reset raw data when grupo/subgrupo actually change — cultura/safra
      // don't affect the listAll fetches and must not clear existing data.
      setPhysicalSales([]);
      setDerivatives([]);
      setCropBoards([]);
      setHedgePolicies([]);
      setPhysicalPayments([]);
      setCashPayments([]);
      setBudgetCosts([]);
      setActualCosts([]);
      setHedgePolicyUsdBrlRate(0);
      setStrategyTriggers([]);
      setTriggerQuotes([]);
      setTriggerExchanges([]);
      setAnalyticsReady(false);
    }

    const loadAnalytics = () => {
      Promise.all([
        resourceService.listAll("physical-sales").catch(() => []),
        resourceService.listAll("derivative-operations").catch(() => []),
        resourceService.listAll("crop-boards").catch(() => []),
        resourceService.listAll("hedge-policies").catch(() => []),
        resourceService.listAll("physical-payments").catch(() => []),
        resourceService.listAll("cash-payments").catch(() => []),
        resourceService.listAll("budget-costs").catch(() => []),
        resourceService.listAll("actual-costs").catch(() => []),
        resourceService.listAll("strategy-triggers").catch(() => []),
        resourceService.listTradingviewQuotes().catch(() => []),
        resourceService.listAll("exchanges").catch(() => []),
      ])
        .then(([
          salesResponse,
          derivativeResponse,
          cropBoardResponse,
          policiesResponse,
          physicalPaymentsResponse,
          cashPaymentsResponse,
          budgetCostsResponse,
          actualCostsResponse,
          strategyTriggersResponse,
          triggerQuotesResponse,
          triggerExchangesResponse,
        ]) => {
          if (!isMounted) return;
          setPhysicalSales(salesResponse || []);
          setDerivatives(derivativeResponse || []);
          setCropBoards(cropBoardResponse || []);
          setHedgePolicies(policiesResponse || []);
          setPhysicalPayments(physicalPaymentsResponse || []);
          setCashPayments(cashPaymentsResponse || []);
          setBudgetCosts(budgetCostsResponse || []);
          setActualCosts(actualCostsResponse || []);
          setStrategyTriggers(strategyTriggersResponse || []);
          setTriggerQuotes(triggerQuotesResponse || []);
          setTriggerExchanges(triggerExchangesResponse || []);
          setCommercialRiskDashboardCache(dashboardCacheKey, {
            physicalSales: salesResponse || [],
            derivatives: derivativeResponse || [],
            cropBoards: cropBoardResponse || [],
            hedgePolicies: policiesResponse || [],
            physicalPayments: physicalPaymentsResponse || [],
            cashPayments: cashPaymentsResponse || [],
            budgetCosts: budgetCostsResponse || [],
            actualCosts: actualCostsResponse || [],
            strategyTriggers: strategyTriggersResponse || [],
            triggerQuotes: triggerQuotesResponse || [],
            triggerExchanges: triggerExchangesResponse || [],
            analyticsReady: true,
          });
          setAnalyticsReady(true);
        });
    };

    if (typeof window !== "undefined") {
      timeoutId = window.setTimeout(() => {
        loadAnalytics();
      }, cachedDashboard?.analyticsReady ? 1200 : 50);
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dashboardCacheKey, summaryParams]);

  useEffect(() => {
    let isMounted = true;
    resourceService
      .fetchJsonCached("sheety-cotacoes-spot", SHEETY_QUOTES_URL)
      .then((sheetyResponse) => {
        if (!isMounted) return;
        const usdBrlRow = (sheetyResponse?.planilha1 || []).find((item) => normalizeText(item.ctrbolsa) === "usdbrl");
        const nextUsdBrlRate = Number(usdBrlRow?.cotacao);
        if (Number.isFinite(nextUsdBrlRate) && nextUsdBrlRate > 0) {
          setHedgePolicyUsdBrlRate(nextUsdBrlRate);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!analyticsReady || summaryReadyEventDispatchedRef.current || typeof window === "undefined") {
      return;
    }
    summaryReadyEventDispatchedRef.current = true;
    window.dispatchEvent(new CustomEvent("sdt:summary-ready"));
  }, [analyticsReady]);

  useEffect(() => {
    if (summaryLoading) return;
    setCommercialRiskDashboardCache(dashboardCacheKey, { summaryData });
  }, [dashboardCacheKey, summaryData, summaryLoading]);

  useEffect(() => {
    if (!analyticsReady) return;
    setCommercialRiskDashboardCache(dashboardCacheKey, {
      physicalSales,
      derivatives,
      cropBoards,
      hedgePolicies,
      physicalPayments,
      cashPayments,
      budgetCosts,
      actualCosts,
      hedgePolicyUsdBrlRate,
      strategyTriggers,
      triggerQuotes,
      triggerExchanges,
      analyticsReady: true,
    });
  }, [
    actualCosts,
    analyticsReady,
    budgetCosts,
    cashPayments,
    cropBoards,
    dashboardCacheKey,
    derivatives,
    hedgePolicies,
    hedgePolicyUsdBrlRate,
    physicalPayments,
    physicalSales,
    strategyTriggers,
    triggerExchanges,
    triggerQuotes,
  ]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedMarketNewsPost?.id) {
      setSelectedMarketNewsAttachments([]);
      setSelectedMarketNewsAttachmentsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setSelectedMarketNewsAttachmentsLoading(true);
    resourceService
      .listAttachments("market-news-posts", selectedMarketNewsPost.id, { force: true })
      .then((items) => {
        if (!isMounted) return;
        setSelectedMarketNewsAttachments(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSelectedMarketNewsAttachments([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setSelectedMarketNewsAttachmentsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMarketNewsPost?.id]);

  const productionSummary = summaryData?.productionSummary || {};
  const marketQuotes = Array.isArray(summaryData?.marketQuotes) ? summaryData.marketQuotes : [];
  const marketNewsPosts = Array.isArray(summaryData?.marketNewsPosts) ? summaryData.marketNewsPosts : [];
  const upcomingMaturityRows = Array.isArray(summaryData?.upcomingMaturityRows) ? summaryData.upcomingMaturityRows : [];
  const formCompletionRows = Array.isArray(summaryData?.formCompletionRows) ? summaryData.formCompletionRows : [];
  const formCompletionSummary = summaryData?.formCompletionSummary || {};
  const summaryUsdBrlRate = hedgePolicyUsdBrlRate || getUsdBrlQuoteValue(triggerQuotes) || getUsdBrlQuoteValue(marketQuotes);
  const upcomingMaturityDisplayRows = useMemo(
    () =>
      upcomingMaturityRows.map((item) => {
        if (item?.resourceKey !== "derivative-operations") return item;
        const derivativeRow = derivatives.find((row) => String(row.id) === String(item.recordId));
        const title = derivativeRow ? buildDerivativePositionTypeLabel(derivativeRow) : item.title;
        return {
          ...item,
          title,
          summaryLabel: buildDerivativeMaturitySummaryLabel(item, derivativeRow),
        };
      }),
    [derivatives, upcomingMaturityRows],
  );

  const filteredSales = useMemo(
    () => physicalSales.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, physicalSales],
  );
  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter],
  );
  const cropBoardDateMarkerRows = useMemo(
    () => (hasDashboardFilterSelection(dashboardFilter) ? filteredCropBoards : cropBoards),
    [cropBoards, dashboardFilter, filteredCropBoards],
  );
  const cropBoardDateMarkers = useMemo(
    () => buildCropBoardDateMarkers(cropBoardDateMarkerRows),
    [cropBoardDateMarkerRows],
  );
  const filteredPolicies = useMemo(
    () => hedgePolicies.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, hedgePolicies],
  );
  const filteredBudgetCosts = useMemo(
    () => budgetCosts.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [budgetCosts, dashboardFilter],
  );
  const filteredActualCosts = useMemo(
    () => actualCosts.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [actualCosts, dashboardFilter],
  );
  const filteredPhysicalPayments = useMemo(
    () =>
      physicalPayments.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: ["fazer_frente_com"],
        }),
      ),
    [dashboardFilter, physicalPayments],
  );
  const filteredDerivatives = useMemo(
    () =>
      derivatives.filter((item) => {
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: DERIVATIVE_CULTURE_KEYS,
        });
      }),
    [dashboardFilter, derivatives],
  );
  const cultureLabelById = useMemo(() => {
    const map = new Map();
    [...(options.crops || []), ...(options.cropBoardCrops || [])].forEach((item) => {
      if (item?.id != null) {
        map.set(String(item.id), item.ativo || item.cultura || item.nome || item.label || item.descricao || String(item.id));
      }
    });
    return map;
  }, [options.crops, options.cropBoardCrops]);
  const resolveCultureLabel = useCallback((value) => {
    if (!value) return "Sem ativo";
    if (Array.isArray(value)) return resolveCultureLabel(value[0]);
    if (typeof value === "string" || typeof value === "number") {
      return cultureLabelById.get(String(value)) || String(value);
    }
    const nestedId = value.id != null ? cultureLabelById.get(String(value.id)) : null;
    return nestedId || value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
  }, [cultureLabelById]);
  const seasonLabelById = useMemo(() => {
    const map = new Map();
    [...(options.seasons || []), ...(options.cropBoardSeasons || [])].forEach((item) => {
      if (item?.id != null) {
        map.set(String(item.id), item.safra || item.nome || item.label || item.descricao || String(item.id));
      }
    });
    return map;
  }, [options.seasons, options.cropBoardSeasons]);
  const resolveSeasonLabel = useCallback((value) => {
    if (!value) return "Sem safra";
    if (Array.isArray(value)) return resolveSeasonLabel(value[0]);
    if (typeof value === "string" || typeof value === "number") {
      return seasonLabelById.get(String(value)) || String(value);
    }
    const nestedId = value.id != null ? seasonLabelById.get(String(value.id)) : null;
    return nestedId || value.safra || value.nome || value.label || value.descricao || "Sem safra";
  }, [seasonLabelById]);

  const maturityFormDefinition = useMemo(() => {
    if (!editingMaturityItem?.resourceKey) return null;
    if (editingMaturityItem.resourceKey === "derivative-operations") {
      return resourceDefinitions.derivativeOperations;
    }
    if (editingMaturityItem.resourceKey === "physical-sales") {
      return resourceDefinitions.physicalSales;
    }
    if (editingMaturityItem.resourceKey === "physical-payments") {
      return resourceDefinitions.physicalPayments;
    }
    if (editingMaturityItem.resourceKey === "cash-payments") {
      return resourceDefinitions.cashPayments;
    }
    return null;
  }, [editingMaturityItem?.resourceKey]);

  const maturityFormFields = useMemo(() => {
    if (!maturityFormDefinition) return [];
    return editingMaturityItem ? maturityFormDefinition.editFields || maturityFormDefinition.fields || [] : maturityFormDefinition.fields || [];
  }, [editingMaturityItem, maturityFormDefinition]);

  const closeMaturityModal = () => {
    setEditingMaturityItem(null);
    setMaturityAttachments([]);
    setMaturityFormError("");
  };

  useEffect(() => {
    let isMounted = true;
    const attachmentField = maturityFormFields.find((field) => field.type === "file-multi") || maturityFormDefinition?.attachmentField;

    if (!editingMaturityItem?.id || !maturityFormDefinition?.resource || !attachmentField) {
      setMaturityAttachments([]);
      return () => {
        isMounted = false;
      };
    }

    resourceService.listAttachments(maturityFormDefinition.resource, editingMaturityItem.id).then((items) => {
      if (isMounted) {
        setMaturityAttachments(items);
      }
    }).catch(() => {
      if (isMounted) {
        setMaturityAttachments([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [editingMaturityItem?.id, maturityFormDefinition?.resource, maturityFormFields]);

  const openMaturityForm = async (item) => {
    if (!item?.recordId || !item?.resourceKey) return;

    if (item.resourceKey === "derivative-operations") {
      const current =
        derivatives.find((row) => String(row.id) === String(item.recordId)) ||
        (await resourceService.getOne(item.resourceKey, item.recordId).catch(() => null));
      if (!current) return;
      setEditingMaturityItem({
        ...current,
        resourceKey: item.resourceKey,
        siblingRows: derivatives
          .filter((candidate) => candidate.cod_operacao_mae === current.cod_operacao_mae)
          .sort((left, right) => (left.ordem || 0) - (right.ordem || 0) || left.id - right.id),
      });
      setMaturityFormError("");
      return;
    }

    const sourceRows =
      item.resourceKey === "physical-sales"
        ? physicalSales
        : item.resourceKey === "physical-payments"
          ? physicalPayments
          : cashPayments;
    const current =
      sourceRows.find((row) => String(row.id) === String(item.recordId)) ||
      (await resourceService.getOne(item.resourceKey, item.recordId).catch(() => null));
    if (!current) return;
    setEditingMaturityItem({ ...current, resourceKey: item.resourceKey });
    setMaturityFormError("");
  };

  const replaceRowById = (items, updated) => items.map((row) => (String(row.id) === String(updated.id) ? updated : row));

  const productionTotal = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0),
    [filteredCropBoards],
  );
  const derivativeStandardVolumeGetter = useMemo(
    () => (item) => getDerivativeVolumeInStandardUnit(item, options.exchanges || [], resolveCultureLabel),
    [options.exchanges, resolveCultureLabel],
  );
  const bolsaDerivatives = useMemo(
    () => filteredDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "cmdtye"),
    [filteredDerivatives],
  );
  const currencyDerivatives = useMemo(
    () => filteredDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "moeda"),
    [filteredDerivatives],
  );
  const physicalPaymentVolume = useMemo(
    () => filteredPhysicalPayments.reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0),
    [filteredPhysicalPayments],
  );
  const netProductionBase = useMemo(
    () => getNetProductionValue(filteredCropBoards, filteredPhysicalPayments, (item) => item.producao_total, (item) => item.volume),
    [filteredCropBoards, filteredPhysicalPayments],
  );
  const hedgeCostBase = useMemo(
    () => filteredBudgetCosts.reduce((sum, item) => sum + convertValueToBrl(item.valor, item.moeda, summaryUsdBrlRate), 0),
    [filteredBudgetCosts, summaryUsdBrlRate],
  );
  const hedgeCostSummaryChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit: "BRL",
        frequency: "monthly",
        baseValue: hedgeCostBase,
        physicalRows: filteredSales,
        derivativeRows: filteredDerivatives,
        policies: filteredPolicies,
        physicalValueGetter: (item) => getPhysicalCostValue(item, summaryUsdBrlRate),
        derivativeValueGetter: (item) => getDerivativeCostValue(item, summaryUsdBrlRate),
        comparisonRows: filteredActualCosts,
        comparisonDateGetter: (item) => item.data_travamento,
        comparisonValueGetter: (item) => convertValueToBrl(item.valor, item.moeda, summaryUsdBrlRate),
        dateMarkers: cropBoardDateMarkers,
      }),
    [cropBoardDateMarkers, filteredActualCosts, filteredDerivatives, filteredPolicies, filteredSales, hedgeCostBase, summaryUsdBrlRate],
  );
  const hedgeSummaryChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit: "SC",
        frequency: "monthly",
        baseValue: netProductionBase,
        physicalRows: filteredSales,
        derivativeRows: bolsaDerivatives,
        policies: filteredPolicies,
        physicalValueGetter: getPhysicalVolumeValue,
        derivativeValueGetter: derivativeStandardVolumeGetter,
        dateMarkers: cropBoardDateMarkers,
      }),
    [bolsaDerivatives, cropBoardDateMarkers, derivativeStandardVolumeGetter, filteredPolicies, filteredSales, netProductionBase],
  );
  const hedgeSummaryTodayIndex = useMemo(
    () => getHedgeTodayIndex(hedgeSummaryChartState.points),
    [hedgeSummaryChartState.points],
  );
  const hedgeSummaryPointsKey = useMemo(
    () => hedgeSummaryChartState.points.map((point) => dashboardDateKey(point.date)).join("|"),
    [hedgeSummaryChartState.points],
  );
  const [hedgeSummaryActiveState, setHedgeSummaryActiveState] = useState(() => ({
    key: "",
    index: 0,
  }));

  useEffect(() => {
    setHedgeSummaryActiveState({
      key: hedgeSummaryPointsKey,
      index: hedgeSummaryTodayIndex,
    });
  }, [hedgeSummaryPointsKey, hedgeSummaryTodayIndex]);

  const hedgeSummaryActiveIndex =
    hedgeSummaryActiveState.key === hedgeSummaryPointsKey
      ? hedgeSummaryActiveState.index
      : hedgeSummaryTodayIndex;
  const updateHedgeSummaryActiveIndex = useCallback(
    (index) => {
      setHedgeSummaryActiveState({
        key: hedgeSummaryPointsKey,
        index,
      });
    },
    [hedgeSummaryPointsKey],
  );

  const hedgeSummaryActivePoint =
    hedgeSummaryChartState.points[hedgeSummaryActiveIndex] || hedgeSummaryChartState.points[hedgeSummaryTodayIndex] || hedgeSummaryChartState.points.at(-1) || null;
  const hedgeSummaryReferenceDate = hedgeSummaryActivePoint?.date || startOfDashboardDay(new Date());
  const hedgeCardCommercializedVolume = hedgeSummaryActivePoint?.total || 0;
  const activePhysicalSales = useMemo(
    () =>
      filteredSales.filter((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return saleDate && hedgeSummaryReferenceDate && saleDate <= hedgeSummaryReferenceDate;
      }),
    [filteredSales, hedgeSummaryReferenceDate],
  );
  const activeBolsaDerivatives = useMemo(
    () =>
      bolsaDerivatives.filter((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        return startDate && endDate && hedgeSummaryReferenceDate && startDate <= hedgeSummaryReferenceDate && hedgeSummaryReferenceDate < endDate;
      }),
    [bolsaDerivatives, hedgeSummaryReferenceDate],
  );
  const summaryPhysicalPriceLines = useMemo(() => {
    const groups = new Map();
    activePhysicalSales.forEach((item) => {
      const volume = Math.abs(Number(item.volume_fisico || 0));
      const price = Number(item.preco || 0);
      if (!volume || !price) return;
      const unitLabel =
        item.moeda_unidade ||
        (item.moeda_contrato && item.unidade_contrato ? `${item.moeda_contrato}/${item.unidade_contrato}` : item.moeda_contrato || item.unidade_contrato || "");
      const key = unitLabel || "sem-unidade";
      const current = groups.get(key) || { unitLabel, volume: 0, weightedPrice: 0 };
      current.volume += volume;
      current.weightedPrice += volume * price;
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .map((item) => ({ ...item, averagePrice: item.volume > 0 ? item.weightedPrice / item.volume : 0 }))
      .sort((left, right) => right.volume - left.volume);
  }, [activePhysicalSales]);
  const summaryDerivativePriceLines = useMemo(() => {
    const groups = new Map();
    activeBolsaDerivatives.forEach((item) => {
      const volume = derivativeStandardVolumeGetter(item);
      const strike = Number(item.strike_montagem || item.strike_liquidacao || 0);
      if (!volume || !strike) return;
      const unitLabel = item.moeda_unidade || item.volume_financeiro_moeda || "";
      const key = unitLabel || "sem-unidade";
      const current = groups.get(key) || { unitLabel, volume: 0, weightedStrike: 0 };
      current.volume += volume;
      current.weightedStrike += volume * strike;
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .map((item) => ({ ...item, averageStrike: item.volume > 0 ? item.weightedStrike / item.volume : 0 }))
      .sort((left, right) => right.volume - left.volume);
  }, [activeBolsaDerivatives, derivativeStandardVolumeGetter]);

  const derivativeOperationsByExchange = useMemo(() => {
    const exchangeMap = new Map();
    filteredDerivatives.forEach((item) => {
      const exchangeLabel =
        item.bolsa_ref ||
        item.ctrbolsa ||
        item.instituicao ||
        item.bolsa?.nome ||
        item.bolsa ||
        "Sem bolsa";
      const status = normalizeText(item.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";
      const current = exchangeMap.get(exchangeLabel) || { label: exchangeLabel, total: 0, open: 0, closed: 0 };
      current.total += 1;
      if (status === "Encerrado") {
        current.closed += 1;
      } else {
        current.open += 1;
      }
      exchangeMap.set(exchangeLabel, current);
    });
    return Array.from(exchangeMap.values())
      .sort((left, right) => right.total - left.total)
      .map((item, index) => ({
        ...item,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }));
  }, [filteredDerivatives]);
  const derivativeStatusCounts = useMemo(
    () =>
      derivativeOperationsByExchange.reduce(
        (acc, item) => {
          acc.total += item.total;
          acc.open += item.open;
          acc.closed += item.closed;
          return acc;
        },
        { total: 0, open: 0, closed: 0 },
      ),
    [derivativeOperationsByExchange],
  );
  const derivativeExchangeSlices = useMemo(() => {
    const slices = derivativeOperationsByExchange
      .filter((item) => item.total > 0)
      .map((item) => ({ label: item.label, value: item.total, color: item.color }));
    return slices.length ? slices : [{ label: "Sem operações", value: 1, color: "#cbd5e1" }];
  }, [derivativeOperationsByExchange]);
  const derivativeExchangeOpenSlices = useMemo(() => {
    const slices = derivativeOperationsByExchange
      .filter((item) => item.open > 0)
      .map((item) => ({ label: item.label, value: item.open, color: item.color }));
    return slices.length ? slices : [{ label: "Sem operações", value: 1, color: "#cbd5e1" }];
  }, [derivativeOperationsByExchange]);
  const derivativeExchangeClosedSlices = useMemo(() => {
    const slices = derivativeOperationsByExchange
      .filter((item) => item.closed > 0)
      .map((item) => ({ label: item.label, value: item.closed, color: item.color }));
    return slices.length ? slices : [{ label: "Sem operações", value: 1, color: "#cbd5e1" }];
  }, [derivativeOperationsByExchange]);
  const derivativeExchangeOperationRows = useMemo(
    () =>
      filteredDerivatives.map((item) => {
        const exchangeLabel =
          item.bolsa_ref ||
          item.ctrbolsa ||
          item.instituicao ||
          item.bolsa?.nome ||
          item.bolsa ||
          "Sem bolsa";
        const status = normalizeText(item.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";
        return {
          ...item,
          exchangeLabel,
          dashboard_status_label: status,
        };
      }),
    [filteredDerivatives],
  );
  const openDerivativeExchangeDetail = useCallback((sliceLabel, statusFilter = "all") => {
    if (!sliceLabel || sliceLabel === "Sem operações") return;
    const rows = derivativeExchangeOperationRows.filter((item) => {
      if (item.exchangeLabel !== sliceLabel) return false;
      if (statusFilter === "open") return item.dashboard_status_label !== "Encerrado";
      if (statusFilter === "closed") return item.dashboard_status_label === "Encerrado";
      return true;
    });
    setResourceTableModal({
      title:
        statusFilter === "open"
          ? `${sliceLabel} · Derivativos em aberto`
          : statusFilter === "closed"
            ? `${sliceLabel} · Derivativos encerrados`
            : `${sliceLabel} · Derivativos`,
      definition: resourceDefinitions.derivativeOperations,
      rows,
    });
  }, [derivativeExchangeOperationRows]);
  const openCommercialRiskLongShortDetail = useCallback(({ rowLabel, series, rows, referenceDate: detailReferenceDate }) => {
    if (!series?.key || !rows?.length) return;
    const definition =
      series.key === "derivatives"
        ? resourceDefinitions.derivativeOperations
        : series.key === "physical"
          ? resourceDefinitions.physicalSales
          : resourceDefinitions.physicalPayments;
    setResourceTableModal({
      title: `${series.label} — ${rowLabel}${detailReferenceDate ? ` — ${formatHedgeTitleDate(detailReferenceDate)}` : ""}`,
      definition,
      rows,
    });
  }, []);
  const currentMonthPolicy = useMemo(() => {
    const currentMonth = startOfDashboardMonth(new Date());
    return (
      filteredPolicies
        .map((item) => ({
          ...item,
          monthDate: startOfDashboardMonth(item.mes_ano),
          minRatio: normalizePolicyRatio(item.vendas_x_prod_total_minimo),
          maxRatio: normalizePolicyRatio(item.vendas_x_prod_total_maximo),
        }))
        .filter((item) => item.monthDate && currentMonth && item.monthDate.getTime() === currentMonth.getTime())
        .sort((left, right) => new Date(right.mes_ano) - new Date(left.mes_ano))[0] || null
    );
  }, [filteredPolicies]);
  const totalArea = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.area || 0)), 0),
    [filteredCropBoards],
  );
  const displayedProductionTotal = analyticsReady ? productionTotal : Number(productionSummary?.productionTotal || 0);
  const displayedPhysicalPaymentVolume = analyticsReady ? physicalPaymentVolume : Number(productionSummary?.physicalPaymentVolume || 0);
  const displayedNetProductionVolume = analyticsReady ? netProductionBase : Number(productionSummary?.netProductionVolume || 0);
  const displayedTotalArea = analyticsReady ? totalArea : Number(productionSummary?.totalArea || 0);
  const activePhysicalCommercializedVolume = hedgeSummaryActivePoint?.physicalRaw || 0;
  const activeDerivativeCommercializedVolume = hedgeSummaryActivePoint?.derivativeRaw || 0;
  const totalCommercializedVolume = hedgeCardCommercializedVolume;
  const totalSalesPercent = netProductionBase > 0 ? (totalCommercializedVolume / netProductionBase) * 100 : 0;
  const derivativeSalesPercent = netProductionBase > 0 ? (activeDerivativeCommercializedVolume / netProductionBase) * 100 : 0;
  const physicalSalesPercent = netProductionBase > 0 ? (activePhysicalCommercializedVolume / netProductionBase) * 100 : 0;
  const totalScPerHa = totalArea > 0 ? totalCommercializedVolume / totalArea : 0;
  const derivativeScPerHa = totalArea > 0 ? activeDerivativeCommercializedVolume / totalArea : 0;
  const physicalScPerHa = totalArea > 0 ? activePhysicalCommercializedVolume / totalArea : 0;
  const currentPolicyMinPercent = currentMonthPolicy?.minRatio != null ? currentMonthPolicy.minRatio * 100 : null;
  const currentPolicyMaxPercent = currentMonthPolicy?.maxRatio != null ? currentMonthPolicy.maxRatio * 100 : null;
  const activePolicyMinPercent = hedgeSummaryActivePoint?.minPct != null ? hedgeSummaryActivePoint.minPct * 100 : currentPolicyMinPercent;
  const activePolicyMaxPercent = hedgeSummaryActivePoint?.maxPct != null ? hedgeSummaryActivePoint.maxPct * 100 : currentPolicyMaxPercent;
  const hedgeSummaryCardTone = useMemo(() => {
    const totalPercent = netProductionBase > 0 ? (Number(hedgeSummaryActivePoint?.total || 0) / netProductionBase) * 100 : 0;
    return getHedgeBandTone(totalPercent, activePolicyMinPercent, activePolicyMaxPercent);
  }, [activePolicyMaxPercent, activePolicyMinPercent, hedgeSummaryActivePoint, netProductionBase]);
  const hedgeSummaryHeaderLines = useMemo(() => {
    const activeTotalValue = hedgeSummaryActivePoint?.total || 0;
    return [
      formatHedgeSummaryPolicyHeadline(
        activeTotalValue,
        netProductionBase,
        hedgeSummaryActivePoint?.minValue,
        hedgeSummaryActivePoint?.maxValue,
        "SC",
      ),
    ].filter(Boolean);
  }, [
    hedgeSummaryActivePoint,
    netProductionBase,
  ]);
  const hedgeSummaryCardRows = useMemo(
    () => [
      {
        label: "Politica Min",
        value:
          hedgeSummaryActivePoint?.minValue != null
            ? formatHedgeSummaryLine("Politica Min", hedgeSummaryActivePoint.minValue, "SC", netProductionBase, totalArea).replace("Politica Min: ", "")
            : "—",
      },
      {
        label: "Politica Max",
        value:
          hedgeSummaryActivePoint?.maxValue != null
            ? formatHedgeSummaryLine("Politica Max", hedgeSummaryActivePoint.maxValue, "SC", netProductionBase, totalArea).replace("Politica Max: ", "")
            : "—",
      },
    ],
    [
      hedgeSummaryActivePoint,
      netProductionBase,
      totalArea,
    ],
  );
  const groupSubgroupFilter = useMemo(
    () => ({
      grupo: dashboardFilter?.grupo || [],
      subgrupo: dashboardFilter?.subgrupo || [],
      cultura: [],
      safra: [],
    }),
    [dashboardFilter?.grupo, dashboardFilter?.subgrupo],
  );
  const longShortFilter = useMemo(
    () => ({
      grupo: dashboardFilter?.grupo || [],
      subgrupo: dashboardFilter?.subgrupo || [],
      cultura: [],
      safra: dashboardFilter?.safra || [],
    }),
    [dashboardFilter?.grupo, dashboardFilter?.safra, dashboardFilter?.subgrupo],
  );
  const longShortCropBoards = useMemo(
    () => cropBoards.filter((item) => rowMatchesDashboardFilter(item, longShortFilter)),
    [cropBoards, longShortFilter],
  );
  const longShortPhysicalSales = useMemo(
    () =>
      physicalSales
        .filter((item) => rowMatchesDashboardFilter(item, longShortFilter))
        .filter((item) => {
          const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
          return saleDate && hedgeSummaryReferenceDate && saleDate <= hedgeSummaryReferenceDate;
        }),
    [hedgeSummaryReferenceDate, longShortFilter, physicalSales],
  );
  const longShortBolsaDerivatives = useMemo(
    () =>
      derivatives
        .filter((item) =>
          rowMatchesDashboardFilter(item, longShortFilter, {
            cultureKeys: DERIVATIVE_CULTURE_KEYS,
          }) && normalizeText(item.moeda_ou_cmdtye) === "cmdtye"
        )
        .filter((item) => {
          const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
          const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
          return startDate && endDate && hedgeSummaryReferenceDate && startDate <= hedgeSummaryReferenceDate && hedgeSummaryReferenceDate < endDate;
        }),
    [derivatives, hedgeSummaryReferenceDate, longShortFilter],
  );
  const longShortPhysicalPayments = useMemo(
    () =>
      physicalPayments.filter((item) =>
        rowMatchesDashboardFilter(item, longShortFilter, {
          cultureKeys: ["fazer_frente_com"],
        }),
      ),
    [longShortFilter, physicalPayments],
  );

  const longShortRows = useMemo(() => {
    const map = new Map();
    const ensureNode = (rawLabel) => {
      const label = resolveCultureLabel(rawLabel);
      if (!label || normalizeText(label) === "sem cultura") return null;
      const current =
        map.get(label) || {
          label,
          production: 0,
          physical: 0,
          derivatives: 0,
          physicalPayments: 0,
          detailRows: {
            derivatives: [],
            physical: [],
            physicalPayments: [],
          },
        };
      map.set(label, current);
      return current;
    };

    longShortCropBoards.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_texto);
      if (!node) return;
      node.production += Math.abs(Number(item.producao_total || 0));
    });

    longShortPhysicalSales.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_produto || item.cultura_texto);
      if (!node) return;
      node.physical += Math.abs(Number(item.volume_fisico || 0));
      node.detailRows.physical.push({
        ...item,
        detailVolume: Math.abs(Number(item.volume_fisico || 0)),
      });
    });

    longShortBolsaDerivatives.forEach((item) => {
      const node = ensureNode(getDerivativeCultureValue(item));
      if (!node) return;
      const detailVolume = derivativeStandardVolumeGetter(item);
      node.derivatives += detailVolume;
      node.detailRows.derivatives.push({
        ...item,
        detailVolume,
      });
    });

    longShortPhysicalPayments.forEach((item) => {
      const node = ensureNode(item.fazer_frente_com || item.cultura || item.cultura_texto);
      if (!node) return;
      const detailVolume = Math.abs(Number(item.volume || 0));
      node.physicalPayments += detailVolume;
      node.detailRows.physicalPayments.push({
        ...item,
        detailVolume,
      });
    });

    return Array.from(map.values())
      .map((item) => {
        const covered = item.physical + item.derivatives + item.physicalPayments;
        const nothingDone = Math.max(item.production - covered, 0);
        const totalForShare = item.production;
        return {
          ...item,
          nadaFeito: nothingDone,
          gap: nothingDone,
          covered,
          coverage: totalForShare > 0 ? covered / totalForShare : 0,
          totalForShare,
        };
      })
      .filter((item) => item.production > 0 || item.covered > 0)
      .sort((left, right) => {
        const rightBase = Math.max(right.production, right.covered);
        const leftBase = Math.max(left.production, left.covered);
        return rightBase - leftBase;
      });
  }, [
    derivativeStandardVolumeGetter,
    longShortBolsaDerivatives,
    longShortCropBoards,
    longShortPhysicalPayments,
    longShortPhysicalSales,
  ]);
  const longShortSeasonTitle = useMemo(() => {
    const selectedSeasons = (dashboardFilter?.safra || []).map((item) => resolveSeasonLabel(item)).filter(Boolean);
    if (!selectedSeasons.length) return "";
    return selectedSeasons.length === 1 ? selectedSeasons[0] : `${selectedSeasons[0]} +${selectedSeasons.length - 1}`;
  }, [dashboardFilter?.safra, resolveSeasonLabel]);
  const hedgeByCultureReferenceDate = useMemo(() => {
    const referenceCropBoards = cropBoards.filter((item) => rowMatchesDashboardFilter(item, groupSubgroupFilter));
    const referencePhysicalPayments = physicalPayments.filter((item) =>
      rowMatchesDashboardFilter(item, groupSubgroupFilter, {
        cultureKeys: ["fazer_frente_com"],
      }),
    );
    const referenceBase = getNetProductionValue(referenceCropBoards, referencePhysicalPayments, (item) => item.producao_total, (item) => item.volume);
    const referenceChartState = buildHedgePolicyChartState({
      unit: "SC",
      frequency: "monthly",
      baseValue: referenceBase,
      physicalRows: physicalSales.filter((item) => rowMatchesDashboardFilter(item, groupSubgroupFilter)),
      derivativeRows: derivatives.filter((item) =>
        rowMatchesDashboardFilter(item, groupSubgroupFilter, {
          cultureKeys: DERIVATIVE_CULTURE_KEYS,
        }) && normalizeText(item.moeda_ou_cmdtye) === "cmdtye"
      ),
      policies: hedgePolicies.filter((item) => rowMatchesDashboardFilter(item, groupSubgroupFilter)),
      physicalValueGetter: getPhysicalVolumeValue,
      derivativeValueGetter: derivativeStandardVolumeGetter,
    });
    return referenceChartState.points[getHedgeTodayIndex(referenceChartState.points)]?.date || startOfDashboardDay(new Date());
  }, [
    cropBoards,
    derivatives,
    derivativeStandardVolumeGetter,
    groupSubgroupFilter,
    hedgePolicies,
    physicalPayments,
    physicalSales,
  ]);
  const hedgeByCultureRows = useMemo(() => {
    const selectedCultureIds = new Set((dashboardFilter?.cultura || []).map(String));
    const selectedSeasonIds = new Set((dashboardFilter?.safra || []).map(String));
    const nodeMap = new Map();
    const aliasMap = new Map();

    const normalizeKeyPart = (value) => normalizeText(value || "sem-valor");
    const buildKey = (cultureId, cultureLabel, seasonId, seasonLabel) =>
      `${cultureId || normalizeKeyPart(cultureLabel)}::${seasonId || normalizeKeyPart(seasonLabel)}`;
    const buildAliasKey = (cultureLabel, seasonLabel) =>
      `${normalizeKeyPart(cultureLabel)}::${normalizeKeyPart(seasonLabel)}`;
    const findNode = (cultureValue, seasonValue) => {
      const cultureId = readRelationId(cultureValue);
      const seasonId = readRelationId(seasonValue);
      const cultureLabel = resolveCultureLabel(cultureValue);
      const seasonLabel = resolveSeasonLabel(seasonValue);
      return (
        nodeMap.get(buildKey(cultureId, cultureLabel, seasonId, seasonLabel)) ||
        aliasMap.get(buildAliasKey(cultureLabel, seasonLabel))
      );
    };

    cropBoards
      .filter((item) => rowMatchesDashboardFilter(item, groupSubgroupFilter))
      .forEach((item) => {
        const cultureValue = item.cultura || item.cultura_texto;
        const seasonValue = item.safra || item.safra_texto;
        const cultureId = readRelationId(item.cultura);
        const seasonId = readRelationId(item.safra);
        const cultureLabel = resolveCultureLabel(cultureValue);
        const seasonLabel = resolveSeasonLabel(seasonValue);
        const key = buildKey(cultureId, cultureLabel, seasonId, seasonLabel);
        const current = nodeMap.get(key) || {
          cultureId,
          seasonId,
          label: cultureLabel,
          seasonLabel,
          production: 0,
          physical: 0,
          derivatives: 0,
          physicalPayments: 0,
        };
        current.production += Math.abs(Number(item.producao_total || 0));
        nodeMap.set(key, current);
        aliasMap.set(buildAliasKey(cultureLabel, seasonLabel), current);
      });

    physicalSales
      .filter((item) => rowMatchesDashboardFilter(item, groupSubgroupFilter))
      .forEach((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        if (!saleDate || !hedgeByCultureReferenceDate || saleDate > hedgeByCultureReferenceDate) return;
        const node = findNode(item.cultura || item.cultura_produto || item.cultura_texto, item.safra || item.safra_texto);
        if (node) {
          node.physical += Math.abs(Number(item.volume_fisico || 0));
        }
      });

    derivatives
      .filter((item) =>
        rowMatchesDashboardFilter(item, groupSubgroupFilter, {
          cultureKeys: DERIVATIVE_CULTURE_KEYS,
        }) && normalizeText(item.moeda_ou_cmdtye) === "cmdtye"
      )
      .forEach((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        if (!startDate || !endDate || !hedgeByCultureReferenceDate || startDate > hedgeByCultureReferenceDate || hedgeByCultureReferenceDate >= endDate) return;
        const node = findNode(getDerivativeCultureValue(item), item.safra || item.safra_texto);
        if (node) {
          node.derivatives += derivativeStandardVolumeGetter(item);
        }
      });

    physicalPayments
      .filter((item) =>
        rowMatchesDashboardFilter(item, groupSubgroupFilter, {
          cultureKeys: ["fazer_frente_com"],
        })
      )
      .forEach((item) => {
        const node = findNode(item.fazer_frente_com || item.cultura || item.cultura_texto, item.safra || item.safra_texto);
        if (node) {
          node.physicalPayments += Math.abs(Number(item.volume || 0));
        }
      });

    return Array.from(nodeMap.values())
      .map((item) => {
        const covered = item.physical + item.derivatives;
        const netProduction = Math.max(item.production - item.physicalPayments, 0);
        const coverage = netProduction > 0 ? covered / netProduction : 0;
        const isActive =
          item.cultureId &&
          selectedCultureIds.has(String(item.cultureId)) &&
          (!item.seasonId || !selectedSeasonIds.size || selectedSeasonIds.has(String(item.seasonId)));
        return {
          label: item.label,
          badge: item.seasonLabel,
          value: `${formatNumber0(coverage * 100)}%`,
          progress: coverage * 100,
          isActive,
          onClick: item.cultureId
            ? () => {
                updateFilter("cultura", [item.cultureId]);
                if (item.seasonId) {
                  updateFilter("safra", [item.seasonId]);
                }
              }
            : undefined,
          sortValue: netProduction,
        };
      })
      .filter((item) => item.sortValue > 0 && item.progress > 0)
      .sort((left, right) => left.progress - right.progress || right.sortValue - left.sortValue);
  }, [
    cropBoards,
    dashboardFilter,
    derivativeStandardVolumeGetter,
    derivatives,
    groupSubgroupFilter,
    hedgeByCultureReferenceDate,
    physicalPayments,
    physicalSales,
    resolveCultureLabel,
    resolveSeasonLabel,
    updateFilter,
  ]);
  const producaoLiquidaHint = useMemo(() => {
    const cultures = (dashboardFilter?.cultura || []).map((v) => resolveCultureLabel(v)).filter(Boolean);
    const seasons = (dashboardFilter?.safra || []).map((v) => resolveSeasonLabel(v)).filter(Boolean);
    const parts = [cultures.join(", "), seasons.join(", ")].filter(Boolean);
    return parts.length ? parts.join(" ") : "";
  }, [dashboardFilter?.cultura, dashboardFilter?.safra, resolveCultureLabel, resolveSeasonLabel]);

  const upcomingByAppRows = useMemo(() => {
    const grouped = upcomingMaturityRows.reduce((acc, item) => {
      const key = item?.app || "Sem categoria";
      const current = acc.get(key) || { label: key, count: 0, nextDate: item?.dateText || "—" };
      current.count += 1;
      if (item?.dateText && (!current.nextDate || current.nextDate === "—")) {
        current.nextDate = item.dateText;
      }
      acc.set(key, current);
      return acc;
    }, new Map());
    return Array.from(grouped.values())
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
      .map((item) => ({
        label: item.label,
        value: `${item.count} item${item.count > 1 ? "s" : ""}`,
        note: `Próx. ${item.nextDate || "—"}`,
      }));
  }, [upcomingMaturityRows]);
  const nextMaturityDate = upcomingMaturityRows[0]?.dateText || "Sem agenda";
  const trackedQuotes = useMemo(
    () => marketQuotes.filter((item) => Number.isFinite(Number(item?.change_percent))),
    [marketQuotes],
  );
  const topPositiveQuote = useMemo(
    () =>
      [...trackedQuotes].sort((left, right) => Number(right.change_percent || 0) - Number(left.change_percent || 0))[0] || null,
    [trackedQuotes],
  );
  const topNegativeQuote = useMemo(
    () =>
      [...trackedQuotes].sort((left, right) => Number(left.change_percent || 0) - Number(right.change_percent || 0))[0] || null,
    [trackedQuotes],
  );
  const filledForms = Number(formCompletionSummary?.filledForms || 0);
  const totalForms = Number(formCompletionSummary?.totalForms || 0);
  const pendingForms = Number(formCompletionSummary?.pendingForms || 0);
  const pendingFormRows = useMemo(
    () =>
      formCompletionRows
        .filter((item) => Number(item?.count || 0) <= 0)
        .slice(0, 4)
        .map((item) => ({
          label: item.label,
          value: "Pendente",
          note: item.hint || "Sem registros",
        })),
    [formCompletionRows],
  );
  const filledFormsPercent = totalForms > 0 ? (filledForms / totalForms) * 100 : 0;
  const triggerExchangePriceUnitMap = useMemo(
    () =>
      new Map(
        (Array.isArray(triggerExchanges) ? triggerExchanges : [])
          .filter((item) => item?.nome)
          .map((item) => [String(item.nome).trim(), String(item.moeda_unidade_padrao || "").trim()]),
      ),
    [triggerExchanges],
  );
  const filteredSummaryTriggers = useMemo(
    () =>
      strategyTriggers.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          groupKeys: ["grupo", "grupos"],
          subgroupKeys: ["subgrupo", "subgrupos"],
          cultureKeys: ["cultura"],
        }),
      ),
    [dashboardFilter, strategyTriggers],
  );
  const evaluatedSummaryTriggers = useMemo(
    () =>
      filteredSummaryTriggers
        .map((trigger) => {
          const tipo = resolveTriggerTypeValue(trigger) || "Sem tipo";
          const contractLabel = resolveTriggerContractValue(trigger);
          const strike = resolveTriggerStrikeValue(trigger);
          const direction = resolveTriggerDirectionValue(trigger);
          const priceUnit = resolveTriggerPriceUnitValue(trigger);
          const quote = normalizeText(tipo) === "derivativo" ? findMatchingDerivativeQuote(trigger, triggerQuotes) : null;
          const currentPrice = quote ? parseLocalizedNumber(quote?.price) : Number.NaN;
          const isHit = normalizeText(tipo) === "derivativo" && quote && Number.isFinite(currentPrice) && strike > 0
            ? (normalizeText(direction).includes("abaixo") ? currentPrice <= strike : currentPrice >= strike)
            : normalizeText(resolveTriggerStatusValue(trigger)).includes("ating");
          const groupLabels = collectRelationLabels(trigger, "grupos", "grupo", ["grupo", "nome"]);
          const subgroupLabels = collectRelationLabels(trigger, "subgrupos", "subgrupo", ["subgrupo", "nome"]);
          return {
            ...trigger,
            contractLabel: contractLabel || "Sem contrato",
            exchangeLabel: resolveTriggerExchangeValue(trigger) || "Sem bolsa",
            directionLabel: direction || "Sem direção",
            strike,
            priceUnitLabel: priceUnit,
            currentPrice,
            isHit,
            percentDistanceValue: getTriggerPercentDistanceValue(currentPrice, strike),
            groupSummary: formatCompactRelationList(groupLabels, "Sem grupo"),
            subgroupSummary: formatCompactRelationList(subgroupLabels, "Sem subgrupo"),
          };
        })
        .filter((item) => Number.isFinite(item.percentDistanceValue) || item.isHit),
    [filteredSummaryTriggers, triggerQuotes],
  );
  const openQuotesPage = () => {
    navigateFromSummary(navigate, "/mercado/cotacoes", "Cotações");
  };

  const openBlogNewsPage = () => {
    navigateFromSummary(navigate, "/mercado/blog", "Blog");
  };

  const openMarketNewsPreview = useCallback((post) => {
    if (!post) return;
    setSelectedMarketNewsPost(post);
  }, []);

  const closeMarketNewsPreview = useCallback(() => {
    setSelectedMarketNewsPost(null);
    setSelectedMarketNewsAttachments([]);
    setSelectedMarketNewsAttachmentsLoading(false);
  }, []);

  const openCommercialRiskResourceRow = useCallback((resourceKey, row) => {
    if (!row?.id || !resourceKey) return;
    openMaturityForm({
      recordId: row.id,
      resourceKey,
    });
  }, [openMaturityForm]);

  const hedgeRealizadoSummaryCard = (
    <HedgeStatusSummaryCard
      title="Resumo Hedge"
      tone={hedgeSummaryCardTone}
      summaryLines={hedgeSummaryHeaderLines}
      rows={hedgeSummaryCardRows}
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            "A linha principal resume o percentual atual do hedge em relação à política e, quando houver desvio, traz o volume excedente ou faltante entre parênteses.",
            "As linhas seguintes mostram os limites mínimo e máximo da política aplicável ao ponto atual.",
          ]}
        />
      }
    />
  );

  const hedgeSummaryCardsRow = (
    <section className="stats-grid risk-kpi-grid risk-kpi-grid-summary">
      <HedgeSummaryGaugeCards
        totalPercent={totalSalesPercent}
        totalMetricValue={totalCommercializedVolume}
        totalMetricLabel={totalArea > 0 ? `${formatNumber2(totalScPerHa)} scs/ha` : null}
        physicalPercent={totalCommercializedVolume > 0 ? (activePhysicalCommercializedVolume / totalCommercializedVolume) * 100 : physicalSalesPercent}
        physicalMetricValue={activePhysicalCommercializedVolume}
        physicalMetricLabel={totalArea > 0 ? `${formatNumber2(physicalScPerHa)} scs/ha` : `${formatNumber0(activePhysicalCommercializedVolume)} sc`}
        physicalDetailLines={summaryPhysicalPriceLines.map((item) => `${formatNumber0(item.volume)} sc | ${formatCurrency2(item.averagePrice)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)}
        derivativePercent={totalCommercializedVolume > 0 ? (activeDerivativeCommercializedVolume / totalCommercializedVolume) * 100 : derivativeSalesPercent}
        derivativeMetricValue={activeDerivativeCommercializedVolume}
        derivativeMetricLabel={totalArea > 0 ? `${formatNumber2(derivativeScPerHa)} scs/ha` : `${formatNumber0(activeDerivativeCommercializedVolume)} sc`}
        derivativeDetailLines={summaryDerivativePriceLines.map((item) => `${formatNumber0(item.volume)} sc | Strike ${formatCurrency2(item.averageStrike)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)}
        policyMinPercent={activePolicyMinPercent}
        policyMaxPercent={activePolicyMaxPercent}
      />
      {hedgeRealizadoSummaryCard}
    </section>
  );

  const hedgePolicyChartSelector = (
    <select
      value={summaryHedgeChartMode}
      onChange={(event) => setSummaryHedgeChartMode(event.target.value)}
      className="hedge-chart-title-select"
      aria-label="Escolher grafico de politica de hedge"
    >
      <option value="production">Gráfico 2 - Hedge produção liquida (sc)</option>
      <option value="cost">Gráfico 1 - Hedge sobre o custo (R$)</option>
    </select>
  );

  const hedgeCostChartNode = (
    <HedgePolicyChart
      key="summary-hedge-cost-chart"
      title="Gráfico 1 — Hedge sobre o custo (R$)"
      unit="BRL"
      frequency="monthly"
      baseValue={hedgeCostBase}
      physicalRows={filteredSales}
      derivativeRows={filteredDerivatives}
      policies={filteredPolicies}
      physicalValueGetter={(item) => getPhysicalCostValue(item, summaryUsdBrlRate)}
      derivativeValueGetter={(item) => getDerivativeCostValue(item, summaryUsdBrlRate)}
      comparisonSeriesName="Custo Realizado"
      comparisonRows={filteredActualCosts}
      comparisonDateGetter={(item) => item.data_travamento}
      comparisonValueGetter={(item) => convertValueToBrl(item.valor, item.moeda, summaryUsdBrlRate)}
      onFocusToggle={() => navigateFromSummary(navigate, "/dashboard/politica-hedge", "Política de Hedge")}
      onOpenResourceRow={openCommercialRiskResourceRow}
      showFloatingCard={false}
      dateMarkers={cropBoardDateMarkers}
      titleControl={hedgePolicyChartSelector}
      insightTitle="Hedge sobre o custo"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            `Este gráfico compara o hedge realizado sobre o custo total da operação. A base usada para o cálculo é de R$ ${formatCurrency2(hedgeCostBase)}.`,
            "A linha preta mostra quanto desse custo já está protegido via vendas físicas e derivativos, enquanto a faixa verde indica a política mínima e máxima desejada.",
          ]}
        />
      }
      precomputedChartState={hedgeCostSummaryChartState}
    />
  );

  const hedgeProductionChartNode = (
    <HedgePolicyChart
      key="summary-hedge-production-chart"
      title="Gráfico 2 — Hedge produção liquida (sc)"
      unit="SC"
      frequency="monthly"
      baseValue={netProductionBase}
      areaBase={totalArea}
      activeIndex={hedgeSummaryActiveIndex}
      onActiveIndexChange={updateHedgeSummaryActiveIndex}
      physicalRows={filteredSales}
      derivativeRows={bolsaDerivatives}
      policies={filteredPolicies}
      physicalValueGetter={getPhysicalVolumeValue}
      derivativeValueGetter={derivativeStandardVolumeGetter}
      onFocusToggle={() => navigateFromSummary(navigate, "/dashboard/politica-hedge", "Política de Hedge")}
      onOpenResourceRow={openCommercialRiskResourceRow}
      showFloatingCard={false}
      dateMarkers={cropBoardDateMarkers}
      titleControl={hedgePolicyChartSelector}
      insightTitle="Hedge produção líquida"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            "Este gráfico mostra, ao longo do tempo, quantas sacas da produção líquida já estão cobertas por vendas físicas e derivativos.",
            "A linha principal representa o hedge acumulado, enquanto a faixa de política indica o intervalo desejado para cada momento. Assim, os números mostram a evolução da cobertura em volume e em aderência à política.",
          ]}
        />
      }
      precomputedChartState={hedgeSummaryChartState}
    />
  );

  return (
    <section className="risk-kpi-shell risk-kpi-shell--summary">
      {!summaryLoading ? (
        <CommercialRiskQuotesSummaryCard rows={marketQuotes} onOpen={openQuotesPage} />
      ) : (
        <section className="stats-grid risk-kpi-grid risk-kpi-grid-three">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={`risk-top-skeleton-${index}`} className="card stat-card risk-kpi-skeleton-card">
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" />
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-short" />
            </article>
          ))}
        </section>
      )}

      <section className="stats-grid risk-kpi-grid risk-kpi-grid-three">
        {!summaryLoading ? (
          <>
            <HedgeByCultureChart
              rows={hedgeByCultureRows}
              insightTitle="Hedge por cultura"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Este bloco mostra as culturas existentes para o grupo e subgrupo filtrados, usando a mesma metodologia do Hedge Realizado.",
                    "O percentual considera vendas físicas e derivativos ativos sobre a produção líquida, descontando Pgtos Físico da base.",
                  ]}
                />
              }
            />
            <article className="card stat-card summary-insight-card">
              <SummaryInsightButton
                title="Produção líquida"
                message={
                  <SummaryInsightCopy
                    paragraphs={[
                      `O número principal de ${formatNumber0(displayedNetProductionVolume)} sc representa a produção líquida disponível para comercialização e hedge no recorte atual.`,
                      `Abaixo, ${formatNumber0(displayedPhysicalPaymentVolume)} sc mostra os pagamentos físicos já comprometidos, e ${formatNumber0(displayedProductionTotal)} sc representa a produção total antes desse desconto${displayedTotalArea > 0 ? `, equivalente a ${formatNumber0(displayedProductionTotal / displayedTotalArea)} sc/ha em ${formatNumber0(displayedTotalArea)} ha` : ""}.`,
                    ]}
                  />
                }
              />
              <h1 className="stat-card-primary-title risk-kpi-card-title">Produção líquida{producaoLiquidaHint ? <span className="hedge-culture-filter-hint">{producaoLiquidaHint}</span> : null}</h1>
              <strong>{formatNumber0(displayedNetProductionVolume)} sc</strong>
              <span className="stat-card-secondary-label">(-) Pgtos Físico</span>
              <strong className="stat-card-secondary-value">{formatNumber0(displayedPhysicalPaymentVolume)} sc</strong>
              <span className="stat-card-secondary-label">Produção total</span>
              <strong className="stat-card-secondary-value">
                {formatNumber0(displayedProductionTotal)} sc ({formatNumber0(displayedTotalArea)} ha | {formatNumber0(displayedTotalArea > 0 ? displayedProductionTotal / displayedTotalArea : 0)} sc/ha)
              </strong>
            </article>
            <UpcomingMaturitiesCard rows={upcomingMaturityDisplayRows} onOpenItem={openMaturityForm} usdBrlRate={getUsdBrlQuoteValue(marketQuotes)} />
          </>
        ) : (
          Array.from({ length: 3 }).map((_, index) => (
            <article key={`risk-summary-card-skeleton-${index}`} className="card stat-card risk-kpi-skeleton-card risk-kpi-skeleton-card-medium">
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-title" />
              <div className="risk-kpi-skeleton-line" />
              <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-short" />
              <div className="risk-kpi-skeleton-line" />
            </article>
          ))
        )}
      </section>

      {analyticsReady ? (
        <>
          <section className="risk-kpi-hedge-main-row">
            <div className="risk-kpi-hedge-cards-col">
              {hedgeSummaryCardsRow}
            </div>
            <div className="risk-kpi-hedge-chart-col">
              {summaryHedgeChartMode === "cost" ? hedgeCostChartNode : hedgeProductionChartNode}
            </div>
          </section>

          <section className="risk-kpi-long-short-grid">
            <CommercialRiskLongShortChart
              rows={longShortRows}
              seasonTitle={longShortSeasonTitle}
              referenceDate={hedgeSummaryReferenceDate}
              onOpenDetailTable={openCommercialRiskLongShortDetail}
            />
          </section>

        </>
      ) : (
        <CommercialRiskAnalyticsSkeleton />
      )}

      <section className="risk-kpi-forms-grid">
        <article className="chart-card risk-kpi-forms-card summary-insight-card">
          <SummaryInsightButton
            title="Formulários preenchidos"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  "Cada linha mostra um formulário ou módulo do sistema, o número ao lado indica quantos registros existem naquele bloco e o status mostra se ele já foi alimentado ou continua pendente.",
                  "Na prática, esses números representam a profundidade de dados disponível para cada tema do resumo, ajudando a identificar rapidamente onde ainda faltam cadastros.",
                ]}
              />
            }
          />
          <div className="chart-card-header">
            <div>
              <h3>Formulários preenchidos</h3>
              <p className="muted">Visão orientativa para mostrar o que já foi alimentado e o que ainda falta no sistema.</p>
            </div>
          </div>
          <div className="risk-kpi-forms-list">
            {formCompletionRows.map((item) => (
              <div key={item.label} className="risk-kpi-form-row">
                <div>
                  <button type="button" className="risk-kpi-form-link" onClick={() => navigateFromSummary(navigate, item.path, item.label)}>
                    {item.label}
                  </button>
                  <span>{item.hint}</span>
                </div>
                <div className="risk-kpi-form-meta">
                  <b>{item.count}</b>
                  <small className={item.count > 0 ? "is-filled" : "is-pending"}>{item.status}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {editingMaturityItem && maturityFormDefinition?.customForm === "derivative-operation" ? (
        <DerivativeOperationForm
          title={`Editar ${maturityFormDefinition.title}`}
          initialValues={editingMaturityItem}
          existingAttachments={maturityAttachments}
          error={maturityFormError}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (editingMaturityItem?.id) {
              const items = await resourceService.listAttachments(maturityFormDefinition.resource, editingMaturityItem.id);
              setMaturityAttachments(items);
            }
          }}
          onClose={closeMaturityModal}
          onSubmit={async (payload, rawValues) => {
            try {
              const files = Array.isArray(rawValues.attachments) ? rawValues.attachments : [];
              const siblingRows = Array.isArray(editingMaturityItem?.siblingRows) ? editingMaturityItem.siblingRows : [];
              const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "attachments" && key !== "itens"));
              const itemPayloads = Array.isArray(payload.itens) ? payload.itens : [];
              let primaryRecord = null;
              const savedRows = [];
              const removedIds = [];
              const existingRows = siblingRows.length ? siblingRows : derivatives.filter((row) => row.cod_operacao_mae === editingMaturityItem.cod_operacao_mae);
              const keepIds = [];

              for (let index = 0; index < itemPayloads.length; index += 1) {
                const itemPayload = itemPayloads[index];
                const existingRow = existingRows[index];
                const rowPayload = {
                  ...cleanPayload,
                  grupo_montagem: itemPayload.grupo_montagem || "",
                  tipo_derivativo: itemPayload.tipo_derivativo || "",
                  numero_lotes: itemPayload.numero_lotes,
                  strike_montagem: itemPayload.strike_montagem,
                  custo_total_montagem_brl: itemPayload.custo_total_montagem_brl,
                  strike_liquidacao: itemPayload.strike_liquidacao,
                  ajustes_totais_brl: itemPayload.ajustes_totais_brl,
                  ajustes_totais_usd: itemPayload.ajustes_totais_usd,
                  ordem: index + 1,
                  volume: itemPayload.volume,
                  volume_financeiro_valor_moeda_original: itemPayload.volume_financeiro_valor_moeda_original,
                };

                if (existingRow?.id) {
                  const updated = await resourceService.update(maturityFormDefinition.resource, existingRow.id, rowPayload);
                  savedRows.push(updated);
                  keepIds.push(updated.id);
                  if (!primaryRecord || String(updated.id) === String(editingMaturityItem.id)) primaryRecord = updated;
                } else {
                  const created = await resourceService.create(maturityFormDefinition.resource, rowPayload);
                  savedRows.push(created);
                  keepIds.push(created.id);
                  if (!primaryRecord) primaryRecord = created;
                }
              }

              const removableRows = existingRows.filter((row) => !keepIds.includes(row.id));
              for (const removableRow of removableRows) {
                await resourceService.remove(maturityFormDefinition.resource, removableRow.id);
                removedIds.push(removableRow.id);
              }

              if (savedRows.length) {
                setDerivatives((currentRows) => {
                  const survivors = currentRows.filter((row) => !removedIds.includes(row.id));
                  const nextRows = [...survivors];
                  savedRows.forEach((savedRow) => {
                    const index = nextRows.findIndex((row) => String(row.id) === String(savedRow.id));
                    if (index >= 0) nextRows[index] = savedRow;
                    else nextRows.push(savedRow);
                  });
                  return nextRows;
                });
              }

              if (primaryRecord && files.length) {
                await resourceService.uploadAttachments(maturityFormDefinition.resource, primaryRecord.id, files);
              }

              closeMaturityModal();
            } catch (requestError) {
              setMaturityFormError(requestError?.response?.data?.detail || "Nao foi possivel salvar o derivativo.");
            }
          }}
        />
      ) : null}

      {editingMaturityItem && maturityFormDefinition && maturityFormDefinition.customForm !== "derivative-operation" ? (
        <ResourceForm
          title={`Editar ${maturityFormDefinition.title}`}
          fields={maturityFormFields}
          initialValues={editingMaturityItem}
          submitLabel={maturityFormDefinition.submitLabel || "Salvar"}
          existingAttachments={maturityAttachments}
          error={maturityFormError}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (editingMaturityItem?.id) {
              const items = await resourceService.listAttachments(maturityFormDefinition.resource, editingMaturityItem.id);
              setMaturityAttachments(items);
            }
          }}
          onClose={closeMaturityModal}
          onSubmit={async (payload, rawValues) => {
            try {
              const attachmentField = maturityFormFields.find((field) => field.type === "file-multi");
              const files = attachmentField && Array.isArray(rawValues[attachmentField.name]) ? rawValues[attachmentField.name] : [];
              let cleanPayload = attachmentField
                ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== attachmentField.name))
                : payload;

              if (maturityFormDefinition.resource === "physical-sales" && cleanPayload.cultura_produto) {
                const crops = await resourceService.listAll("crops");
                const selectedCrop = crops.find((item) => (item.ativo || item.cultura) === cleanPayload.cultura_produto);
                if (selectedCrop) {
                  cleanPayload = {
                    ...cleanPayload,
                    cultura: selectedCrop.id,
                  };
                }
              }

              const saved = await resourceService.update(maturityFormDefinition.resource, editingMaturityItem.id, cleanPayload);

              if (files.length) {
                await resourceService.uploadAttachments(maturityFormDefinition.resource, saved.id, files);
              }

              if (maturityFormDefinition.resource === "physical-sales") {
                setPhysicalSales((currentRows) => replaceRowById(currentRows, saved));
              } else if (maturityFormDefinition.resource === "physical-payments") {
                setPhysicalPayments((currentRows) => replaceRowById(currentRows, saved));
              } else if (maturityFormDefinition.resource === "cash-payments") {
                setCashPayments((currentRows) => replaceRowById(currentRows, saved));
              }

              closeMaturityModal();
            } catch (requestError) {
              setMaturityFormError(requestError?.response?.data?.detail || "Nao foi possivel salvar o registro.");
            }
          }}
        />
      ) : null}

      {resourceTableModal ? (
        <DashboardResourceTableModal
          title={resourceTableModal.title}
          definition={resourceTableModal.definition}
          rows={resourceTableModal.rows}
          onClose={() => setResourceTableModal(null)}
          onEdit={(row) => {
            setResourceTableModal(null);
            openMaturityForm({
              recordId: row.id,
              resourceKey: resourceTableModal.definition.resource,
            });
          }}
        />
      ) : null}
      <MarketNewsPreviewModal
        post={selectedMarketNewsPost}
        attachments={selectedMarketNewsAttachments}
        attachmentsLoading={selectedMarketNewsAttachmentsLoading}
        onClose={closeMarketNewsPreview}
      />
    </section>
  );
}

const SIM_ROWS = 15;
const SIM_COLS = 15;
const SIM_STEP = 0.02;

const parseLocaleNumber = (value) => {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .trim()
    .replace(/\s|%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatNumber2 = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPercent1 = (value) =>
  `${(Number(value || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const parsePercentValue = (value) => {
  let parsed = parseLocaleNumber(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (parsed > 1.5) parsed /= 100;
  return parsed;
};

const averageOf = (items) => {
  const valid = items.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (!valid.length) return null;
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
};

const simulationColor = (value, low, min, mid, good, max) => {
  if (!Number.isFinite(value)) return "";
  const mix = (a, b, t) => a.map((entry, index) => Math.round(entry + (b[index] - entry) * t));
  const rgb = (color) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  const norm = (current, start, end) => Math.min(1, Math.max(0, (current - start) / (end - start || 1)));
  const darkRed = [130, 0, 0];
  const red = [255, 0, 0];
  const yellow = [255, 255, 0];
  const greenLight = [128, 255, 0];
  const greenDark = [0, 100, 0];

  if (value < min) return rgb(mix(darkRed, red, norm(value, low, min)));
  if (value < mid) return rgb(mix(red, yellow, norm(value, min, mid)));
  if (value < good) return rgb(mix(yellow, greenLight, norm(value, mid, good)));
  if (value < max) return rgb(mix(greenLight, greenDark, norm(value, good, max)));
  return rgb(greenDark);
};

function SimulationsMatrixDashboard({ dashboardFilter, filterOptions }) {
  const { matchesDashboardFilter } = useDashboardFilter();
  const [quotes, setQuotes] = useState([]);
  const [sales, setSales] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [budgetCosts, setBudgetCosts] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [selectedSojaTicker, setSelectedSojaTicker] = useState("");
  const [selectedDollarTicker, setSelectedDollarTicker] = useState("");
  const [selectedCell, setSelectedCell] = useState({ row: 8, col: 9 });
  const [hoverCell, setHoverCell] = useState(null);
  const [sojaValue, setSojaValue] = useState("0,00");
  const [cambioValue, setCambioValue] = useState("0,00");
  const [breakevenValue, setBreakevenValue] = useState("0,00");
  const [basisValue, setBasisValue] = useState("0,00");
  const [targetPercentValue, setTargetPercentValue] = useState("0,0%");

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      Promise.all([
        resourceService.listAll("physical-quotes"),
        resourceService.listAll("physical-sales"),
        resourceService.listAll("hedge-policies"),
        resourceService.listAll("budget-costs"),
        resourceService.listAll("derivative-operations"),
        resourceService.listTradingviewQuotes({ force: true }).catch(() => []),
      ]).then(([quotesResponse, salesResponse, policiesResponse, budgetResponse, derivativesResponse, tradingviewResponse]) => {
        if (!isMounted) return;
        setQuotes(quotesResponse || []);
        setSales(salesResponse || []);
        setPolicies(policiesResponse || []);
        setBudgetCosts(budgetResponse || []);
        setDerivatives(derivativesResponse || []);
        const marketRows = Array.isArray(tradingviewResponse) ? tradingviewResponse : [];
        setTradingviewQuotes(marketRows);

        const sojaContracts = marketRows.filter(
          (item) =>
            normalizeText(item?.section_name).includes("soja cbot") &&
            item?.ticker &&
            item?.price !== null &&
            item?.price !== undefined,
        );
        const dollarContracts = marketRows.filter(
          (item) =>
            normalizeText(item?.section_name).includes("dolar fwd") &&
            String(item?.ticker || "")
              .trim()
              .toUpperCase()
              .startsWith("DOL") &&
            item?.price !== null &&
            item?.price !== undefined,
        );

        if (sojaContracts[0]?.ticker) {
          setSelectedSojaTicker(String(sojaContracts[0].ticker));
        }

        if (dollarContracts[0]?.ticker) {
          setSelectedDollarTicker(String(dollarContracts[0].ticker));
        }
      });
    }, 2600);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const selectedCultureLabel = useMemo(() => {
    const selectedIds = new Set((dashboardFilter?.cultura || []).map(String));
    return (filterOptions?.crops || [])
      .filter((item) => selectedIds.has(String(item.id)))
      .map((item) => item.ativo || item.cultura);
  }, [dashboardFilter?.cultura, filterOptions?.crops]);

  const filteredQuotes = useMemo(
    () =>
      quotes.filter((item) => {
        const selectedSeasons = dashboardFilter?.safra || [];
        if (!selectedSeasons.length && !selectedCultureLabel.length) return true;
        const seasonMatch = !selectedSeasons.length || selectedSeasons.map(String).includes(String(item.safra || ""));
        const cultureMatch =
          !selectedCultureLabel.length ||
          selectedCultureLabel.some((label) => normalizeText(item.cultura_texto).includes(normalizeText(label)));
        return seasonMatch && cultureMatch;
      }),
    [dashboardFilter?.safra, quotes, selectedCultureLabel],
  );

  const filteredSales = useMemo(() => sales.filter((item) => matchesDashboardFilter(item, dashboardFilter)), [dashboardFilter, sales]);
  const filteredPolicies = useMemo(
    () => policies.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, policies],
  );
  const filteredBudgetCosts = useMemo(
    () => budgetCosts.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [budgetCosts, dashboardFilter],
  );
  const filteredDerivatives = useMemo(
    () => derivatives.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, derivatives],
  );

  useEffect(() => {
    const sojaAvg =
      averageOf(
        filteredQuotes
          .filter((item) => normalizeText(item.cultura_texto).includes("soja"))
          .map((item) => item.cotacao),
      ) ??
      averageOf(filteredQuotes.map((item) => item.cotacao)) ??
      12;

    const cambioAvg =
      averageOf(filteredDerivatives.map((item) => item.dolar_ptax_vencimento)) ??
      averageOf(filteredSales.map((item) => item.dolar_de_venda)) ??
      5.5;

    const breakEvenAvg =
      averageOf(filteredBudgetCosts.map((item) => item.valor)) ??
      averageOf(filteredSales.map((item) => item.preco)) ??
      120;

    const basisAvg = averageOf(filteredSales.map((item) => item.basis_valor)) ?? 0;
    const latestPolicy = [...filteredPolicies].sort((left, right) => String(right.mes_ano || "").localeCompare(String(left.mes_ano || "")))[0];
    const targetPct = parsePercentValue(latestPolicy?.margem_alvo_minimo ?? 0.18);

    setSojaValue((current) => (selectedSojaTicker ? current : formatNumber2(sojaAvg)));
    setCambioValue((current) => (selectedDollarTicker ? current : formatNumber2(cambioAvg)));
    setBreakevenValue(formatNumber2(breakEvenAvg));
    setBasisValue(formatNumber2(basisAvg));
    setTargetPercentValue(formatPercent1(Number.isFinite(targetPct) ? targetPct : 0.18));
  }, [filteredBudgetCosts, filteredDerivatives, filteredPolicies, filteredQuotes, filteredSales, selectedDollarTicker, selectedSojaTicker]);

  const sojaTickerOptions = useMemo(() => {
    const unique = new Map();
    tradingviewQuotes
      .filter(
        (item) =>
          normalizeText(item?.section_name).includes("soja cbot") &&
          item?.ticker &&
          item?.price !== null &&
          item?.price !== undefined,
      )
      .forEach((item) => {
        const key = String(item.ticker);
        if (!unique.has(key)) unique.set(key, item);
      });
    return Array.from(unique.values());
  }, [tradingviewQuotes]);

  const dollarTickerOptions = useMemo(() => {
    const unique = new Map();
    tradingviewQuotes
      .filter((item) => {
        const ticker = String(item?.ticker || "")
          .trim()
          .toUpperCase();
        return (
          normalizeText(item?.section_name).includes("dolar fwd") &&
          ticker.startsWith("DOL") &&
          item?.price !== null &&
          item?.price !== undefined
        );
      })
      .forEach((item) => {
        const key = String(item.ticker);
        if (!unique.has(key)) unique.set(key, item);
      });
    return Array.from(unique.values());
  }, [tradingviewQuotes]);

  useEffect(() => {
    if (!selectedSojaTicker) return;
    const match = sojaTickerOptions.find((item) => String(item.ticker) === String(selectedSojaTicker));
    if (!match) return;
    const cotacao = Number(match.price);
    if (Number.isFinite(cotacao)) {
      setSojaValue(formatNumber2(cotacao));
    }
  }, [selectedSojaTicker, sojaTickerOptions]);

  useEffect(() => {
    if (!selectedDollarTicker) return;
    const match = dollarTickerOptions.find((item) => String(item.ticker) === String(selectedDollarTicker));
    if (!match) return;
    const cotacao = Number(match.price);
    if (Number.isFinite(cotacao)) {
      setCambioValue(formatNumber2(cotacao));
    }
  }, [dollarTickerOptions, selectedDollarTicker]);

  const sojaBase = parseLocaleNumber(sojaValue);
  const cambioBase = parseLocaleNumber(cambioValue);
  const breakeven = parseLocaleNumber(breakevenValue);
  const basis = parseLocaleNumber(basisValue);
  const targetPercent = parsePercentValue(targetPercentValue);

  const thresholds = useMemo(() => {
    const targetBRL = Number.isFinite(breakeven) && Number.isFinite(targetPercent) && targetPercent < 1 ? breakeven / (1 - targetPercent) : null;
    return {
      low: Number.isFinite(breakeven) ? breakeven * 0.9 : 80,
      min: Number.isFinite(breakeven) ? breakeven : 88,
      mid: Number.isFinite(targetBRL) ? targetBRL * 0.9 : 120,
      good: Number.isFinite(targetBRL) ? targetBRL : 125,
      max: Number.isFinite(targetBRL) ? targetBRL * 1.2 : 145,
      targetBRL,
      targetUSD: Number.isFinite(targetBRL) && Number.isFinite(cambioBase) && cambioBase > 0 ? targetBRL / cambioBase : null,
    };
  }, [breakeven, cambioBase, targetPercent]);

  const rowProgression = useMemo(() => {
    const values = Array.from({ length: SIM_ROWS + 1 }, () => Number.NaN);
    for (let row = 2; row <= SIM_ROWS; row += 1) {
      values[row] = sojaBase * (1 + SIM_STEP * (row - 8));
    }
    return values;
  }, [sojaBase]);

  const colProgression = useMemo(() => {
    const values = Array.from({ length: SIM_COLS + 1 }, () => Number.NaN);
    for (let col = 2; col <= SIM_COLS; col += 1) {
      values[col] = cambioBase * (1 + SIM_STEP * (col - 9));
    }
    return values;
  }, [cambioBase]);

  const matrix = useMemo(
    () =>
      Array.from({ length: SIM_ROWS }, (_, rowIndex) =>
        Array.from({ length: SIM_COLS }, (_, colIndex) => {
          const row = rowIndex + 1;
          const col = colIndex + 1;

          if (row === 1 && col === 1) return { type: "corner", text: "" };
          if (col === 1) return { type: "row-header", value: rowProgression[row] };
          if (row === 1) return { type: "col-header", value: colProgression[col] };

          const sojaSim = rowProgression[row];
          const cambioSim = colProgression[col];
          const value =
            Number.isFinite(sojaSim) && Number.isFinite(cambioSim)
              ? ((sojaSim + basis) * 2.2046) * cambioSim
              : Number.NaN;

          return {
            type: "value",
            value,
            sojaSim,
            cambioSim,
            background: simulationColor(value, thresholds.low, thresholds.min, thresholds.mid, thresholds.good, thresholds.max),
          };
        }),
      ),
    [basis, colProgression, rowProgression, thresholds.good, thresholds.low, thresholds.max, thresholds.mid, thresholds.min],
  );

  const selectedValue = matrix[selectedCell.row - 1]?.[selectedCell.col - 1];
  const sojaSim = rowProgression[selectedCell.row];
  const cambioSim = colProgression[selectedCell.col];
  const fisicoBRL = selectedValue?.type === "value" ? selectedValue.value : Number.NaN;
  const fisicoUSD = Number.isFinite(fisicoBRL) && Number.isFinite(cambioSim) && cambioSim > 0 ? fisicoBRL / cambioSim : Number.NaN;
  const simulatedMargin = Number.isFinite(fisicoBRL) && Number.isFinite(breakeven) && fisicoBRL !== 0 ? (fisicoBRL - breakeven) / fisicoBRL : Number.NaN;

  return (
    <section className="simulation-shell">
      <div className="simulation-topbar card summary-insight-card">
        <SummaryInsightButton
          title="Parâmetros da simulação"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `Os campos acima definem as premissas da matriz. Hoje a soja base está em ${formatNumber2(sojaBase)}, o câmbio base em ${formatNumber2(cambioBase)}, o breakeven em ${formatNumber2(breakeven)} R$/sc e a margem alvo em ${formatPercent1(targetPercent)}.`,
                `Os campos de preço-alvo mostram o nível mínimo de preço físico necessário para atingir essa margem nas condições atuais.`,
              ]}
            />
          }
        />
        <label>
          Contrato soja CBOT:
          <select value={selectedSojaTicker} onChange={(event) => setSelectedSojaTicker(event.target.value)}>
            <option value="">Selecione</option>
            {sojaTickerOptions.map((item) => (
              <option key={item.ticker} value={item.ticker}>
                {item.ticker}
              </option>
            ))}
          </select>
        </label>
        <label>
          Soja Cbot:
          <input type="text" value={sojaValue} onChange={(event) => setSojaValue(event.target.value)} />
        </label>
        <label>
          Dólar futuro:
          <select value={selectedDollarTicker} onChange={(event) => setSelectedDollarTicker(event.target.value)}>
            <option value="">Selecione</option>
            {dollarTickerOptions.map((item) => (
              <option key={item.ticker} value={item.ticker}>
                {item.ticker}
              </option>
            ))}
          </select>
        </label>
        <label>
          Câmbio futuro:
          <input type="text" value={cambioValue} onChange={(event) => setCambioValue(event.target.value)} />
        </label>
        <label>
          Breakeven (R$/sc):
          <input type="text" value={breakevenValue} onChange={(event) => setBreakevenValue(event.target.value)} />
        </label>
        <label>
          Margem alvo (%):
          <input type="text" value={targetPercentValue} onChange={(event) => setTargetPercentValue(event.target.value)} />
        </label>
        <label>
          Preço (R$/sc) p/ alvo:
          <input type="text" value={Number.isFinite(thresholds.targetBRL) ? formatNumber2(thresholds.targetBRL) : ""} readOnly />
        </label>
        <label>
          Preço (US$/sc) p/ alvo:
          <input type="text" value={Number.isFinite(thresholds.targetUSD) ? formatNumber2(thresholds.targetUSD) : ""} readOnly />
        </label>
      </div>

      <div className="simulation-summary card summary-insight-card">
        <SummaryInsightButton
          title="Resumo da simulação"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `A célula selecionada gera um preço físico estimado de ${Number.isFinite(fisicoBRL) ? formatNumber2(fisicoBRL) : "0,00"} R$/sc e ${Number.isFinite(fisicoUSD) ? formatNumber2(fisicoUSD) : "0,00"} U$/sc.`,
                `Com soja simulada em ${Number.isFinite(sojaSim) ? formatNumber2(sojaSim) : "0,00"}, câmbio em ${Number.isFinite(cambioSim) ? formatNumber2(cambioSim) : "0,00"} e basis em ${formatNumber2(basis)}, a margem simulada fica em ${Number.isFinite(simulatedMargin) ? formatPercent1(simulatedMargin) : "0,0%"}.`,
              ]}
            />
          }
        />
        <h3>Simulação</h3>
        <div className="simulation-summary-grid">
          <label>
            Soja Cbot (simul):
            <input type="text" value={Number.isFinite(sojaSim) ? formatNumber2(sojaSim) : ""} readOnly />
          </label>
          <label>
            Câmbio futuro (simul):
            <input type="text" value={Number.isFinite(cambioSim) ? formatNumber2(cambioSim) : ""} readOnly />
          </label>
          <label>
            Basis:
            <input type="text" value={basisValue} onChange={(event) => setBasisValue(event.target.value)} />
          </label>
          <label>
            Preço físico (R$/sc):
            <input type="text" value={Number.isFinite(fisicoBRL) ? formatNumber2(fisicoBRL) : ""} readOnly />
          </label>
          <label>
            Preço físico (U$/sc):
            <input type="text" value={Number.isFinite(fisicoUSD) ? formatNumber2(fisicoUSD) : ""} readOnly />
          </label>
          <label>
            Margem simulada (%):
            <input type="text" value={Number.isFinite(simulatedMargin) ? formatPercent1(simulatedMargin) : ""} readOnly />
          </label>
        </div>
      </div>

      <div className="simulation-grid-shell card custom-scrollbar summary-insight-card">
        <SummaryInsightButton
          title="Matriz de simulação"
          message={
            <SummaryInsightCopy
              paragraphs={[
                "Cada célula interna representa um preço físico projetado em R$/sc para uma combinação de soja CBOT e câmbio futuro.",
                "As linhas alteram a soja, as colunas alteram o câmbio e a cor indica se o preço resultante está abaixo do breakeven, em zona intermediária ou acima do alvo calculado.",
              ]}
            />
          }
        />
        <table className="simulation-grid-table">
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={rowIndex + 1}>
                {row.map((cell, colIndex) => {
                  const rowNumber = rowIndex + 1;
                  const colNumber = colIndex + 1;
                  const isSelected = selectedCell.row === rowNumber && selectedCell.col === colNumber;
                  const isHoverLine = hoverCell && (hoverCell.row === rowNumber || hoverCell.col === colNumber);
                  const cellClassName = [
                    cell.type === "value" ? "simulation-value-cell" : "simulation-header-cell",
                    isHoverLine ? "hovered" : "",
                    isSelected ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <td
                      key={`${rowNumber}-${colNumber}`}
                      className={cellClassName}
                      style={cell.type === "value" ? { background: cell.background } : undefined}
                      onMouseEnter={() => setHoverCell({ row: rowNumber, col: colNumber })}
                      onMouseLeave={() => setHoverCell(null)}
                      onClick={() => cell.type === "value" && setSelectedCell({ row: rowNumber, col: colNumber })}
                    >
                      {cell.type === "row-header" || cell.type === "col-header"
                        ? Number.isFinite(cell.value)
                          ? formatNumber2(cell.value)
                          : ""
                        : cell.type === "value"
                          ? formatNumber2(cell.value)
                          : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildHedgePolicyChartState({
  unit,
  frequency,
  baseValue,
  physicalRows,
  derivativeRows,
  policies,
  physicalValueGetter,
  derivativeValueGetter,
  comparisonRows = [],
  comparisonDateGetter = null,
  comparisonValueGetter = null,
  showPhysical = true,
  showDerivatives = true,
  simulatedIncrement = 0,
  dateMarkers = [],
}) {
  const normalizedDateMarkers = (dateMarkers || [])
    .map((item) => ({
      ...item,
      date: startOfDashboardDay(item?.date),
    }))
    .filter((item) => item.date);
  const policyRows = (policies || [])
    .map((item) => ({
      ...item,
      monthDate: startOfDashboardMonth(item.mes_ano),
      minRatio: normalizePolicyRatio(
        unit === "BRL" ? item.vendas_x_custo_minimo : item.vendas_x_prod_total_minimo,
      ),
      maxRatio: normalizePolicyRatio(
        unit === "BRL" ? item.vendas_x_custo_maximo : item.vendas_x_prod_total_maximo,
      ),
    }))
    .filter((item) => item.monthDate && (item.minRatio != null || item.maxRatio != null))
    .sort((left, right) => left.monthDate - right.monthDate);

  const physicalSeries = (physicalRows || [])
    .map((item) => ({
      date: startOfDashboardDay(item.data_negociacao || item.created_at),
      value: physicalValueGetter(item),
    }))
    .filter((item) => item.date && Number.isFinite(item.value) && item.value > 0)
    .sort((left, right) => left.date - right.date);

  const derivativeSeries = (derivativeRows || [])
    .map((item) => ({
      startDate: startOfDashboardDay(item.data_contratacao || item.created_at),
      endDate: startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at),
      value: derivativeValueGetter(item),
    }))
    .filter((item) => item.startDate && item.endDate && Number.isFinite(item.value) && item.value > 0)
    .sort((left, right) => left.startDate - right.startDate);

  const comparisonSeries =
    typeof comparisonDateGetter === "function" && typeof comparisonValueGetter === "function"
      ? (comparisonRows || [])
          .map((item) => ({
            date: startOfDashboardDay(comparisonDateGetter(item)),
            value: comparisonValueGetter(item),
          }))
          .filter((item) => item.date && Number.isFinite(item.value) && item.value > 0)
          .sort((left, right) => left.date - right.date)
      : [];

  const derivativeEvents = derivativeSeries
    .flatMap((item) => [
      { date: item.startDate, delta: item.value },
      { date: item.endDate, delta: -item.value },
    ])
    .sort((left, right) => left.date - right.date);

  const allDates = [
    ...policyRows.map((item) => item.monthDate),
    ...physicalSeries.map((item) => item.date),
    ...derivativeSeries.flatMap((item) => [item.startDate, item.endDate]),
    ...comparisonSeries.map((item) => item.date),
    ...normalizedDateMarkers.map((item) => item.date),
  ].filter(Boolean);

  const today = startOfDashboardDay(new Date());
  const startDate = allDates.length ? new Date(Math.min(...allDates.map((item) => item.getTime()))) : today;
  const endDate = allDates.length ? new Date(Math.max(...allDates.map((item) => item.getTime()), today.getTime())) : today;
  const buckets = buildHedgeBuckets(startDate, endDate, frequency);

  let activePolicy = policyRows[0] || null;
  let activePolicyIndex = 0;
  let physicalPointer = 0;
  let physicalTotal = 0;
  let derivativePointer = 0;
  let derivativeTotal = 0;
  let comparisonPointer = 0;
  let comparisonTotal = 0;

  const points = buckets.map((bucket) => {
    while (
      activePolicy &&
      activePolicyIndex < policyRows.length - 1 &&
      policyRows[activePolicyIndex + 1].monthDate <= startOfDashboardMonth(bucket.date)
    ) {
      activePolicyIndex += 1;
      activePolicy = policyRows[activePolicyIndex];
    }

    while (physicalPointer < physicalSeries.length && physicalSeries[physicalPointer].date <= bucket.date) {
      physicalTotal += physicalSeries[physicalPointer].value;
      physicalPointer += 1;
    }

    while (derivativePointer < derivativeEvents.length && derivativeEvents[derivativePointer].date <= bucket.date) {
      derivativeTotal += derivativeEvents[derivativePointer].delta;
      derivativePointer += 1;
    }

    while (comparisonPointer < comparisonSeries.length && comparisonSeries[comparisonPointer].date <= bucket.date) {
      comparisonTotal += comparisonSeries[comparisonPointer].value;
      comparisonPointer += 1;
    }

    const visibleDerivative = showDerivatives ? derivativeTotal : 0;
    const visiblePhysical = showPhysical ? physicalTotal : 0;
    const total = visibleDerivative + visiblePhysical;
    const minValue = activePolicy?.minRatio != null ? activePolicy.minRatio * baseValue : null;
    const maxValue = activePolicy?.maxRatio != null ? activePolicy.maxRatio * baseValue : null;

    return {
      ...bucket,
      physicalRaw: physicalTotal,
      derivativeRaw: derivativeTotal,
      comparisonRaw: comparisonTotal,
      physicalVisible: visiblePhysical,
      derivativeVisible: visibleDerivative,
      minValue,
      maxValue,
      minPct: baseValue > 0 && minValue != null ? minValue / baseValue : null,
      maxPct: baseValue > 0 && maxValue != null ? maxValue / baseValue : null,
      total,
      totalPct: baseValue > 0 ? total / baseValue : 0,
    };
  });

  const totalDataset = points.map((item, index) => item.total + (index === points.length - 1 ? simulatedIncrement : 0));

  return {
    labels: points.map((item) => item.label),
    points,
    minDataset: points.map((item) => item.minValue ?? null),
    maxDataset: points.map((item) => item.maxValue ?? null),
    minPctDataset: points.map((item) => (item.minPct != null ? item.minPct * 100 : null)),
    maxPctDataset: points.map((item) => (item.maxPct != null ? item.maxPct * 100 : null)),
    bandPctDataset: points.map((item) => {
      if (item.minPct == null || item.maxPct == null) return null;
      return Math.max((item.maxPct - item.minPct) * 100, 0);
    }),
    derivativeDataset: points.map((item) => item.derivativeVisible),
    physicalDataset: points.map((item) => item.derivativeVisible + item.physicalVisible),
    comparisonDataset: points.map((item) => item.comparisonRaw),
    totalDataset,
    totalPctDataset: points.map((item) => item.totalPct * 100),
    dateMarkers: normalizedDateMarkers,
    domainStart: startDate,
    domainEnd: endDate,
  };
}

function HedgePolicyChart({
  title,
  unit,
  frequency,
  baseValue,
  physicalRows,
  derivativeRows,
  policies,
  physicalValueGetter,
  derivativeValueGetter,
  comparisonSeriesName = "",
  comparisonRows = [],
  comparisonDateGetter = null,
  comparisonValueGetter = null,
  areaBase = 0,
  activeIndex: controlledActiveIndex = null,
  onActiveIndexChange = null,
  onFocusToggle,
  focusButtonIcon = "⛶",
  focusButtonTitle = "Destacar gráfico",
  titleControl = null,
  extraActions = null,
  simulatedIncrement = 0,
  simulatedLabel = null,
  onOpenResourceRow = null,
  showFloatingCard = true,
  insightTitle = "",
  insightMessage = null,
  precomputedChartState = null,
  dateMarkers = [],
  externalSliderStart = null,
  externalSliderEnd = null,
  onExternalSliderChange = null,
  externalHoverDate = null,
  onHoverDateChange = null,
}) {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [detailIndex, setDetailIndex] = useState(null);
  const [showPhysical, setShowPhysical] = useState(true);
  const [showDerivatives, setShowDerivatives] = useState(true);
  const [detailPhysicalSearch, setDetailPhysicalSearch] = useState("");
  const [detailDerivativeSearch, setDetailDerivativeSearch] = useState("");
  const [hoverSnapshot, setHoverSnapshot] = useState(null);
  const [hoverExactDate, setHoverExactDate] = useState(null);
  const [hoverExactX, setHoverExactX] = useState(null);
  const [sliderStart, setSliderStart] = useState(0);
  const [sliderEnd, setSliderEnd] = useState(null);

  const chartState = useMemo(
    () => {
      if (precomputedChartState && showPhysical && showDerivatives) {
        return precomputedChartState;
      }
      return buildHedgePolicyChartState({
        unit,
        frequency,
        baseValue,
        physicalRows,
        derivativeRows,
        policies,
        physicalValueGetter,
        derivativeValueGetter,
        comparisonRows,
        comparisonDateGetter,
        comparisonValueGetter,
        showPhysical,
        showDerivatives,
        simulatedIncrement,
        dateMarkers,
      });
    },
    [
      baseValue,
      dateMarkers,
      derivativeRows,
      derivativeValueGetter,
      frequency,
      comparisonDateGetter,
      comparisonRows,
      comparisonSeriesName,
      comparisonValueGetter,
      physicalRows,
      physicalValueGetter,
      policies,
      precomputedChartState,
      simulatedIncrement,
      showDerivatives,
      showPhysical,
      unit,
    ],
  );
  const extendedChartState = useMemo(() => {
    if (!chartState.points.length || !frequency) return chartState;
    const firstDate = chartState.domainStart || chartState.points[0]?.date;
    const lastDate = chartState.domainEnd || chartState.points.at(-1)?.date;
    if (!firstDate || !lastDate) return chartState;
    const twoYearsMs = 2 * 365.25 * 24 * 3600 * 1000;
    const extStart = new Date(firstDate.getTime() - twoYearsMs);
    const extEnd = new Date(lastDate.getTime() + twoYearsMs);
    const extBuckets = buildHedgeBuckets(extStart, extEnd, frequency);
    const pointsByKey = new Map(chartState.points.map((p) => [p.key, p]));
    const lastOrigTime = lastDate.getTime();
    const lastPoint = chartState.points.at(-1);
    const extPoints = extBuckets.map((bucket) => {
      const existing = pointsByKey.get(bucket.key);
      if (existing) return existing;
      const bucketTime = bucket.date.getTime();
      if (bucketTime > lastOrigTime && lastPoint) {
        // Pós-data: carregar os últimos valores acumulados
        // Físico não diminui; derivativos ficam no último saldo (os vencidos já foram descontados)
        return {
          ...bucket,
          physicalRaw: lastPoint.physicalRaw,
          derivativeRaw: lastPoint.derivativeRaw,
          comparisonRaw: lastPoint.comparisonRaw,
          physicalVisible: lastPoint.physicalVisible,
          derivativeVisible: lastPoint.derivativeVisible,
          minValue: lastPoint.minValue ?? null,
          maxValue: lastPoint.maxValue ?? null,
          minPct: lastPoint.minPct ?? null,
          maxPct: lastPoint.maxPct ?? null,
          total: lastPoint.total,
          totalPct: lastPoint.totalPct,
        };
      }
      // Pré-data: ainda não havia dados
      return {
        ...bucket,
        physicalRaw: 0, derivativeRaw: 0, comparisonRaw: 0,
        physicalVisible: 0, derivativeVisible: 0,
        minValue: null, maxValue: null, minPct: null, maxPct: null,
        total: 0, totalPct: 0,
      };
    });
    return {
      ...chartState,
      points: extPoints,
      minDataset: extPoints.map((p) => p.minValue ?? null),
      maxDataset: extPoints.map((p) => p.maxValue ?? null),
      derivativeDataset: extPoints.map((p) => p.derivativeVisible),
      physicalDataset: extPoints.map((p) => p.derivativeVisible + p.physicalVisible),
      comparisonDataset: extPoints.map((p) => p.comparisonRaw),
      totalDataset: extPoints.map((p) => p.total),
      domainStart: extStart,
      domainEnd: extEnd,
    };
  }, [chartState, frequency]);

  const todayIndex = useMemo(() => getHedgeTodayIndex(chartState.points), [chartState.points]);
  const activeIndex = controlledActiveIndex != null ? controlledActiveIndex : internalActiveIndex;

  const updateActiveIndex = useCallback(
    (nextIndex) => {
      const safeIndex = Math.max(0, Math.min(Number(nextIndex || 0), Math.max(chartState.points.length - 1, 0)));
      if (controlledActiveIndex == null) {
        setInternalActiveIndex(safeIndex);
      }
      if (typeof onActiveIndexChange === "function") {
        onActiveIndexChange(safeIndex);
      }
    },
    [chartState.points.length, controlledActiveIndex, onActiveIndexChange],
  );

  useEffect(() => {
    if (!chartState.points.length) {
      if (controlledActiveIndex == null) {
        setInternalActiveIndex(0);
      }
      if (typeof onActiveIndexChange === "function") {
        onActiveIndexChange(0);
      }
      return;
    }
    if (controlledActiveIndex == null) {
      setInternalActiveIndex(todayIndex);
    }
    if (typeof onActiveIndexChange === "function") {
      onActiveIndexChange(todayIndex);
    }
  }, [chartState.points.length, frequency, todayIndex]);

  useEffect(() => {
    if (!extendedChartState.points.length || !chartState.points.length) {
      setSliderStart(0);
      setSliderEnd(null);
      return;
    }
    const keys = extendedChartState.points.map((p) => p.key);
    const startIdx = keys.indexOf(chartState.points[0]?.key);
    const endIdx = keys.lastIndexOf(chartState.points.at(-1)?.key);
    setSliderStart(startIdx >= 0 ? startIdx : 0);
    setSliderEnd(endIdx >= 0 ? endIdx : extendedChartState.points.length - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartState.points.length]);

  const isExternalSlider = typeof onExternalSliderChange === "function";
  const effectiveSliderStart = isExternalSlider && externalSliderStart != null ? externalSliderStart : sliderStart;
  const effectiveSliderEnd = isExternalSlider && externalSliderEnd != null ? externalSliderEnd : sliderEnd;

  const crossHoverPoint = useMemo(() => {
    if (!externalHoverDate || hoverExactDate) return null;
    const t = externalHoverDate.getTime();
    return chartState.points.reduce((best, p) => {
      if (!p.date) return best;
      return !best || Math.abs(p.date.getTime() - t) < Math.abs(best.date.getTime() - t) ? p : best;
    }, null);
  }, [externalHoverDate, hoverExactDate, chartState.points]);

  const activePoint = hoverSnapshot?.point || crossHoverPoint || chartState.points[activeIndex] || chartState.points.at(-1) || null;
  const detailPoint = detailIndex != null ? chartState.points[detailIndex] || null : null;
  const activeSimulation = hoverSnapshot?.point
    ? hoverSnapshot.index === chartState.points.length - 1
      ? simulatedIncrement
      : 0
    : activeIndex === chartState.points.length - 1
      ? simulatedIncrement
      : 0;
  const statusSummary = useMemo(() => {
    if (!activePoint) return null;
    const activeTotal = activePoint.total + activeSimulation;
    if (Number.isFinite(activePoint.maxValue) && activeTotal > activePoint.maxValue) {
      return {
        tone: "bad",
        text: `${(((activeTotal - activePoint.maxValue) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}% acima da politica`,
      };
    }
    if (Number.isFinite(activePoint.minValue) && activeTotal < activePoint.minValue) {
      return {
        tone: "bad",
        text: `${(((activePoint.minValue - activeTotal) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}% abaixo da politica`,
      };
    }
    return {
      tone: "ok",
      text: "dentro da politica",
    };
  }, [activePoint, baseValue]);

  const detailRows = useMemo(() => {
    if (!detailPoint) return null;
    const selectedDate = detailPoint.date;

    const physical = (physicalRows || [])
      .filter((item) => {
        const itemDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return itemDate && itemDate <= selectedDate;
      });

    const derivativesIncluded = (derivativeRows || [])
      .filter((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        return startDate && endDate && startDate <= selectedDate && selectedDate <= endDate;
      });

    return {
      physical,
      derivatives: derivativesIncluded,
    };
  }, [detailPoint, derivativeRows, physicalRows]);

  useEffect(() => {
    setDetailPhysicalSearch("");
    setDetailDerivativeSearch("");
  }, [detailIndex]);

  const nativeChart = (() => {
    const width = 1000;
    const height = 360;
    const plot = { left: 8, right: 8, top: 16, bottom: 32 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const allPoints = extendedChartState.points || [];
    const rangeStart = effectiveSliderStart;
    const rangeEnd = effectiveSliderEnd !== null ? Math.min(effectiveSliderEnd, Math.max(0, allPoints.length - 1)) : Math.max(0, allPoints.length - 1);
    const points = allPoints.slice(rangeStart, rangeEnd + 1);
    const sd = (arr) => (arr || []).slice(rangeStart, rangeEnd + 1);
    // Offset of original data within extended points (for todayIndex mapping)
    const dataOffset = allPoints.findIndex((p) => p.key === (chartState.points[0]?.key));
    const extTodayIndex = dataOffset >= 0 ? dataOffset + todayIndex : todayIndex;
    const values = [
      ...sd(extendedChartState.minDataset),
      ...sd(extendedChartState.maxDataset),
      ...sd(extendedChartState.derivativeDataset),
      ...sd(extendedChartState.physicalDataset),
      ...sd(extendedChartState.comparisonDataset),
      ...sd(extendedChartState.totalDataset),
    ].filter((value) => Number.isFinite(Number(value)));
    const yMax = Math.max(1, ...values, Number(baseValue || 0));
    const scaleMax = yMax * 1.08;
    const xForIndex = (index) => plot.left + (plotWidth * index) / Math.max(points.length - 1, 1);
    const xForDate = (value) => {
      const date = startOfDashboardDay(value);
      const domainStart = startOfDashboardDay(points[0]?.date);
      const domainEnd = startOfDashboardDay(points.at(-1)?.date);
      if (!date || !domainStart || !domainEnd) return null;
      const startTime = domainStart.getTime();
      const endTime = domainEnd.getTime();
      if (startTime === endTime) return xForIndex(0);
      const x = plot.left + ((date.getTime() - startTime) / (endTime - startTime)) * plotWidth;
      return Math.min(Math.max(x, plot.left), width - plot.right);
    };
    const yForValue = (value) => plot.top + plotHeight - (Math.max(0, Number(value || 0)) / scaleMax) * plotHeight;
    const baselineY = yForValue(0);
    const buildLinePath = (dataset) => {
      let path = "";
      let openSegment = false;
      dataset.forEach((value, index) => {
        if (!Number.isFinite(Number(value))) {
          openSegment = false;
          return;
        }
        path += `${openSegment ? "L" : "M"} ${xForIndex(index)} ${yForValue(value)} `;
        openSegment = true;
      });
      return path.trim();
    };
    const buildAreaPath = (dataset) => {
      const coords = dataset
        .map((value, index) => (Number.isFinite(Number(value)) ? [xForIndex(index), yForValue(value)] : null))
        .filter(Boolean);
      if (!coords.length) return "";
      return `M ${coords[0][0]} ${baselineY} ${coords.map(([x, y]) => `L ${x} ${y}`).join(" ")} L ${coords.at(-1)[0]} ${baselineY} Z`;
    };
    const buildBetweenAreaPath = (topDataset, bottomDataset) => {
      const topCoords = [];
      const bottomCoords = [];
      topDataset.forEach((value, index) => {
        const bottomValue = bottomDataset[index];
        if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(bottomValue))) return;
        topCoords.push([xForIndex(index), yForValue(value)]);
        bottomCoords.push([xForIndex(index), yForValue(bottomValue)]);
      });
      if (!topCoords.length) return "";
      return `M ${topCoords[0][0]} ${topCoords[0][1]} ${topCoords.map(([x, y]) => `L ${x} ${y}`).join(" ")} ${bottomCoords
        .reverse()
        .map(([x, y]) => `L ${x} ${y}`)
        .join(" ")} Z`;
    };
    const tickValues = [0, scaleMax * 0.25, scaleMax * 0.5, scaleMax * 0.75, scaleMax];
    const labelEvery = Math.max(1, Math.ceil(points.length / 7));
    const dataLabelEvery = points.length <= 18 ? 1 : Math.max(1, Math.ceil(points.length / 12));
    const globalHoverExtIndex = hoverSnapshot?.extendedIndex ?? extTodayIndex;
    const localHoverIndex = globalHoverExtIndex - rangeStart;
    const hoverX = Number.isInteger(localHoverIndex) && localHoverIndex >= 0 && localHoverIndex < points.length ? xForIndex(localHoverIndex) : null;
    const localTodayIndex = extTodayIndex - rangeStart;
    const todayX = localTodayIndex >= 0 && localTodayIndex < points.length ? xForIndex(localTodayIndex) : null;
    const derivativeAreaPath = buildAreaPath(sd(extendedChartState.derivativeDataset));
    const hasDerivativeArea = sd(extendedChartState.derivativeDataset).some((value) => Number(value || 0) > 0);
    const xAxisLabels = points
      .map((point, index) => {
        const shouldShowLabel = index === 0 || index === points.length - 1 || index % labelEvery === 0;
        if (!shouldShowLabel) return null;
        return {
          key: `${point.label}-${index}`,
          xPercent: `${(xForIndex(index) / width) * 100}%`,
          yPercent: `${((height - 10) / height) * 100}%`,
          anchor: index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
          label: point.label,
        };
      })
      .filter(Boolean);
    const todayLabel = todayX != null
      ? {
          xPercent: `${((todayX + 6) / width) * 100}%`,
          yPercent: `${((plot.top + 14) / height) * 100}%`,
          label: "Hoje",
        }
      : null;
    const totalDataLabels = sd(extendedChartState.totalDataset)
      .map((value, index) => {
        const numericValue = Number(value);
        const shouldShow =
          Number(baseValue || 0) > 0 &&
          Number.isFinite(numericValue) &&
          numericValue > 0 &&
          (index === points.length - 1 || index === localTodayIndex || index % dataLabelEvery === 0);
        if (!shouldShow) return null;
        const x = Math.min(Math.max(xForIndex(index), plot.left + 10), width - plot.right - 10);
        const lineY = yForValue(numericValue);
        const y = lineY < plot.top + 14 ? lineY + 13 : lineY - 7;
        return {
          key: `${points[index]?.label || index}-${index}`,
          xPercent: `${(x / width) * 100}%`,
          yPercent: `${(y / height) * 100}%`,
          anchor: index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
          label: formatHedgeSummaryPercentValue(numericValue, baseValue),
        };
      })
      .filter(Boolean);
    const cropDateMarkers = (chartState.dateMarkers || [])
      .map((marker, index) => {
        const x = xForDate(marker.date);
        if (x == null) return null;
        const anchor = x > width - plot.right - 90 ? "end" : "start";
        return {
          ...marker,
          key: marker.key || `${marker.label}-${index}`,
          x,
          labelX: anchor === "end" ? x - 7 : x + 7,
          labelY: plot.top + 18 + index * 18,
          anchor,
          color: marker.color || "#0f766e",
        };
      })
      .filter(Boolean);

    return {
      width,
      height,
      plot,
      plotWidth,
      plotHeight,
      points,
      xForIndex,
      xForDate,
      yForValue,
      tickValues,
      labelEvery,
      xAxisLabels,
      todayLabel,
      totalDataLabels,
      cropDateMarkers,
      hoverX,
      todayX,
      minPath: buildLinePath(sd(extendedChartState.minDataset)),
      maxPath: buildLinePath(sd(extendedChartState.maxDataset)),
      derivativeAreaPath,
      derivativeBorderPath: hasDerivativeArea ? derivativeAreaPath : "",
      physicalAreaPath: buildBetweenAreaPath(sd(extendedChartState.physicalDataset), sd(extendedChartState.derivativeDataset)),
      policyBandPath: buildBetweenAreaPath(sd(extendedChartState.maxDataset), sd(extendedChartState.minDataset)),
      comparisonPath: buildLinePath(sd(extendedChartState.comparisonDataset)),
      totalPath: buildLinePath(sd(extendedChartState.totalDataset)),
    };
  })();

  const handleNativeChartPoint = useCallback(
    (localIndex) => {
      const extendedIndex = localIndex + effectiveSliderStart;
      const extPoint = extendedChartState.points[extendedIndex];
      if (!extPoint) return;
      const x = nativeChart.xForIndex(localIndex);
      const origIndex = chartState.points.findIndex((p) => p.key === extPoint.key);
      setHoverSnapshot({
        extendedIndex,
        index: origIndex >= 0 ? origIndex : 0,
        point: origIndex >= 0 ? chartState.points[origIndex] : extPoint,
        x,
        label: extPoint?.date ? formatHedgeTitleDate(extPoint.date) : null,
      });
      if (origIndex >= 0) {
        updateActiveIndex(origIndex);
      }
    },
    [chartState.points, extendedChartState.points, nativeChart, updateActiveIndex, effectiveSliderStart],
  );

  const crossHoverX = (externalHoverDate && !hoverExactDate) ? nativeChart.xForDate(externalHoverDate) : null;

  const clearNativeChartHover = useCallback(() => {
    setHoverSnapshot(null);
    setHoverExactDate(null);
    setHoverExactX(null);
    updateActiveIndex(todayIndex);
    if (typeof onHoverDateChange === "function") onHoverDateChange(null);
  }, [todayIndex, updateActiveIndex, onHoverDateChange]);

  const handleSvgMouseMove = useCallback((event) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * nativeChart.width;
    const clampedX = Math.max(nativeChart.plot.left, Math.min(nativeChart.width - nativeChart.plot.right, svgX));
    setHoverExactX(clampedX);
    const pts = nativeChart.points;
    if (!pts.length) return;
    const domainStart = pts[0]?.date;
    const domainEnd = pts.at(-1)?.date;
    if (!domainStart || !domainEnd) return;
    const startTime = domainStart.getTime();
    const endTime = domainEnd.getTime();
    if (startTime === endTime) return;
    const ratio = Math.max(0, Math.min(1, (svgX - nativeChart.plot.left) / nativeChart.plotWidth));
    const exactTime = startTime + ratio * (endTime - startTime);
    const exactDate = startOfDashboardDay(new Date(exactTime));
    setHoverExactDate(exactDate);
    if (typeof onHoverDateChange === "function") onHoverDateChange(exactDate);
  }, [nativeChart, onHoverDateChange]);

  return (
    <article className={`hedge-chart-card${showFloatingCard && activePoint ? " has-floating-card" : " is-chart-fill"}`}>
      <div className="hedge-chart-card-header">
        {titleControl || <h2>{title}</h2>}
        <div className="hedge-chart-actions">
          {extraActions}
          {insightMessage ? (
            <SummaryInsightButton
              title={insightTitle || title}
              message={insightMessage}
              className="summary-insight-button-inline"
            />
          ) : null}
          <button type="button" className="hedge-chart-icon-btn" onClick={onFocusToggle} title={focusButtonTitle}>
            {focusButtonIcon}
          </button>
        </div>
      </div>

      {showFloatingCard && activePoint ? (
        <aside className="hedge-floating-card">
          <div className="hedge-floating-topline">
            <div className="hedge-floating-title">{formatHedgeTitleDate(hoverExactDate || externalHoverDate || activePoint.date)}</div>
          </div>
          <div className={`hedge-floating-total-box ${statusSummary?.tone || "ok"}`}>
            <div className="hedge-floating-total-main">
              {formatHedgePercentValue(activePoint.total + activeSimulation, baseValue)} - {statusSummary?.text || "—"} - {formatHedgeTooltipValue(activePoint.total + activeSimulation, unit)}
              {formatHedgeScPerHaValue(activePoint.total + activeSimulation, unit, areaBase)
                ? ` - ${formatHedgeScPerHaValue(activePoint.total + activeSimulation, unit, areaBase)}`
                : ""}
            </div>
          </div>
          <div className="hedge-floating-line">
            <strong>Vendas Fisico</strong>{`: ${formatHedgeTooltipLine("Vendas Fisico", activePoint.physicalRaw, unit, baseValue, areaBase).replace("Vendas Fisico: ", "")}`}
          </div>
          <div className="hedge-floating-line">
            <strong>Derivativos</strong>{`: ${formatHedgeTooltipLine("Derivativos", activePoint.derivativeRaw, unit, baseValue, areaBase).replace("Derivativos: ", "")}`}
          </div>
          {comparisonSeriesName ? (
            <div className="hedge-floating-line">
              <strong>{comparisonSeriesName}</strong>{`: ${formatHedgeTooltipLine(comparisonSeriesName, activePoint.comparisonRaw, unit, baseValue, areaBase).replace(`${comparisonSeriesName}: `, "")}`}
            </div>
          ) : null}
          <div className="hedge-floating-line">
            {activePoint.minValue != null
              ? <><strong>Politica Min</strong>{`: ${formatHedgeTooltipLine("Politica Min", activePoint.minValue, unit, baseValue, areaBase).replace("Politica Min: ", "")}`}</>
              : <><strong>Politica Min</strong>{": —"}</>}
          </div>
          <div className="hedge-floating-line">
            {activePoint.maxValue != null
              ? <><strong>Politica Max</strong>{`: ${formatHedgeTooltipLine("Politica Max", activePoint.maxValue, unit, baseValue, areaBase).replace("Politica Max: ", "")}`}</>
              : <><strong>Politica Max</strong>{": —"}</>}
          </div>
          {activeSimulation > 0 && simulatedLabel ? (
            <div className="hedge-floating-line">
              <strong>Simulação</strong>{`: +${formatHedgeTooltipValue(activeSimulation, unit)} ${simulatedLabel}`}
            </div>
          ) : null}
        </aside>
      ) : null}

      <div className="hedge-chart-wrap">
        {nativeChart.points.length ? (
          <>
            <svg
              className="hedge-chart-svg"
              viewBox={`0 0 ${nativeChart.width} ${nativeChart.height}`}
              preserveAspectRatio="none"
              onMouseLeave={clearNativeChartHover}
              onMouseMove={handleSvgMouseMove}
              role="img"
              aria-label={title}
            >
            {nativeChart.tickValues.map((tick, index) => {
              const y = nativeChart.yForValue(tick);
              return (
                <g key={`${tick}-${index}`}>
                  <line x1={nativeChart.plot.left} x2={nativeChart.width - nativeChart.plot.right} y1={y} y2={y} className="hedge-chart-svg-grid" />
                </g>
              );
            })}
            {nativeChart.policyBandPath ? <path d={nativeChart.policyBandPath} className="hedge-chart-svg-policy-band" /> : null}
            {nativeChart.derivativeAreaPath ? <path d={nativeChart.derivativeAreaPath} className="hedge-chart-svg-derivative-area" /> : null}
            {nativeChart.physicalAreaPath ? <path d={nativeChart.physicalAreaPath} className="hedge-chart-svg-physical-area" /> : null}
            {nativeChart.derivativeBorderPath ? <path d={nativeChart.derivativeBorderPath} className="hedge-chart-svg-derivative-border" /> : null}
            {nativeChart.comparisonPath && comparisonSeriesName ? <path d={nativeChart.comparisonPath} className="hedge-chart-svg-comparison-line" /> : null}
            {nativeChart.totalPath ? <path d={nativeChart.totalPath} className="hedge-chart-svg-total-line" /> : null}
            {nativeChart.cropDateMarkers.map((marker) => (
              <g key={marker.key} className="hedge-chart-svg-crop-marker">
                <line
                  x1={marker.x}
                  x2={marker.x}
                  y1={nativeChart.plot.top}
                  y2={nativeChart.plot.top + nativeChart.plotHeight}
                  className="hedge-chart-svg-crop-marker-line"
                  stroke={marker.color}
                />
                <text
                  x={marker.labelX}
                  y={marker.labelY}
                  textAnchor={marker.anchor}
                  className="hedge-chart-svg-crop-marker-label"
                  fill={marker.color}
                >
                  {marker.label}
                </text>
              </g>
            ))}
            {nativeChart.todayX != null ? (
              <g>
                <line
                  x1={nativeChart.todayX}
                  x2={nativeChart.todayX}
                  y1={nativeChart.plot.top}
                  y2={nativeChart.plot.top + nativeChart.plotHeight}
                  className="hedge-chart-svg-today-line"
                />
              </g>
            ) : null}
            {(hoverExactX ?? crossHoverX) != null ? (
              <line
                x1={hoverExactX ?? crossHoverX}
                x2={hoverExactX ?? crossHoverX}
                y1={nativeChart.plot.top}
                y2={nativeChart.plot.top + nativeChart.plotHeight}
                className="hedge-chart-svg-hover-line"
              />
            ) : null}
            {nativeChart.points.map((point, index) => {
              const x = nativeChart.xForIndex(index);
              const bandWidth = nativeChart.plotWidth / Math.max(nativeChart.points.length, 1);
              return (
                <g key={`${point.label}-${index}`}>
                  <rect
                    x={x - bandWidth / 2}
                    y={nativeChart.plot.top}
                    width={bandWidth}
                    height={nativeChart.plotHeight}
                    fill="transparent"
                    className="hedge-chart-svg-hit-area"
                    onMouseEnter={() => handleNativeChartPoint(index)}
                    onClick={() => setDetailIndex(index)}
                  />
                </g>
              );
            })}
            </svg>
            <div className="hedge-chart-label-layer" aria-hidden="true">
              {nativeChart.xAxisLabels.map((label) => (
                <span
                  key={label.key}
                  className={`hedge-chart-x-axis-label hedge-chart-x-axis-label--${label.anchor}`}
                  style={{ left: label.xPercent, top: label.yPercent }}
                >
                  {label.label}
                </span>
              ))}
              {nativeChart.todayLabel ? (
                <span
                  className="hedge-chart-today-overlay-label"
                  style={{ left: nativeChart.todayLabel.xPercent, top: nativeChart.todayLabel.yPercent }}
                >
                  {nativeChart.todayLabel.label}
                </span>
              ) : null}
              {nativeChart.totalDataLabels.map((label) => (
                <span
                  key={label.key}
                  className={`hedge-chart-total-label hedge-chart-total-label--${label.anchor}`}
                  style={{ left: label.xPercent, top: label.yPercent }}
                >
                  {label.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="hedge-chart-empty">Sem dados suficientes para montar o gráfico.</div>
        )}
      </div>

      {!isExternalSlider && extendedChartState.points.length > 2 ? (() => {
        const totalCount = extendedChartState.points.length;
        const effEnd = effectiveSliderEnd ?? totalCount - 1;
        const startPct = (effectiveSliderStart / Math.max(totalCount - 1, 1)) * 100;
        const endPct = (effEnd / Math.max(totalCount - 1, 1)) * 100;
        return (
          <div className="hedge-slider-wrap">
            <div className="hedge-slider-dates">
              <span>{extendedChartState.points[effectiveSliderStart]?.label || ""}</span>
              <span>{extendedChartState.points[effEnd]?.label || ""}</span>
            </div>
            <div className="hedge-slider-track">
              <div className="hedge-slider-track-bg" />
              <div className="hedge-slider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
              <input
                type="range"
                className="hedge-slider-input"
                min={0}
                max={totalCount - 1}
                value={effectiveSliderStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v < effEnd) setSliderStart(v);
                }}
              />
              <input
                type="range"
                className="hedge-slider-input"
                min={0}
                max={totalCount - 1}
                value={effEnd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v > effectiveSliderStart) setSliderEnd(v);
                }}
              />
            </div>
          </div>
        );
      })() : null}

      <div className="hedge-legend">
        <button
          type="button"
          className={`hedge-legend-item${showDerivatives ? "" : " is-off"}`}
          onClick={() => setShowDerivatives((current) => !current)}
        >
          <span className="hedge-legend-swatch derivativos" />
          Hedge via Derivativos
        </button>
        <button
          type="button"
          className={`hedge-legend-item${showPhysical ? "" : " is-off"}`}
          onClick={() => setShowPhysical((current) => !current)}
        >
          <span className="hedge-legend-swatch fisico" />
          Vendas via Fisico
        </button>

        {comparisonSeriesName ? (
          <span className="hedge-legend-item">
            <span className="hedge-legend-swatch" style={{ background: "#15803d" }} />
            {comparisonSeriesName}
          </span>
        ) : null}
      </div>

      {detailPoint && detailRows ? (
        <div className="hedge-detail-backdrop" onClick={() => setDetailIndex(null)}>
          <div className="hedge-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="hedge-detail-close" onClick={() => setDetailIndex(null)}>
              ×
            </button>
            <div className="hedge-detail-header">
              <strong>Detalhes — {formatHedgeTitleDate(detailPoint.date)}</strong>
            </div>
            {detailRows.physical.length ? (
              <section className="hedge-detail-section">
                <ResourceTable
                  definition={resourceDefinitions.physicalSales}
                  rows={detailRows.physical}
                  cardTitle="Vendas Físico (≤ dia)"
                  searchValue={detailPhysicalSearch}
                  searchPlaceholder={resourceDefinitions.physicalSales.searchPlaceholder || "Buscar..."}
                  onSearchChange={setDetailPhysicalSearch}
                  onClear={() => setDetailPhysicalSearch("")}
                  onEdit={onOpenResourceRow ? (row) => onOpenResourceRow(resourceDefinitions.physicalSales.resource, row) : undefined}
                  tableHeight="100%"
                  showClearButton={false}
                />
              </section>
            ) : null}
            {detailRows.derivatives.length ? (
              <section className="hedge-detail-section">
                <ResourceTable
                  definition={resourceDefinitions.derivativeOperations}
                  rows={detailRows.derivatives}
                  cardTitle="Derivativos (dia entre início e liquidação — inclusivo)"
                  searchValue={detailDerivativeSearch}
                  searchPlaceholder={resourceDefinitions.derivativeOperations.searchPlaceholder || "Buscar..."}
                  onSearchChange={setDetailDerivativeSearch}
                  onClear={() => setDetailDerivativeSearch("")}
                  onEdit={onOpenResourceRow ? (row) => onOpenResourceRow(resourceDefinitions.derivativeOperations.resource, row) : undefined}
                  tableHeight="100%"
                  showClearButton={false}
                />
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function HedgePolicyChartPlaceholder({ title }) {
  return (
    <article className="hedge-chart-card is-chart-fill">
      <div className="hedge-chart-card-header">
        <h2>{title}</h2>
      </div>
      <div className="hedge-chart-empty">Carregando gráfico...</div>
    </article>
  );
}

function HedgePolicyRangeChart({
  title,
  unit,
  frequency,
  baseValue,
  physicalRows,
  derivativeRows,
  policies,
  physicalValueGetter,
  derivativeValueGetter,
  onFocusToggle,
}) {
  const chartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit,
        frequency,
        baseValue,
        physicalRows,
        derivativeRows,
        policies,
        physicalValueGetter,
        derivativeValueGetter,
      }),
    [baseValue, derivativeRows, derivativeValueGetter, frequency, physicalRows, physicalValueGetter, policies, unit],
  );

  const latestPoint = chartState.points.at(-1) || null;

  const option = useMemo(() => {
    if (!latestPoint) return null;
    const maxDomain = Math.max(
      Number(latestPoint.maxValue || 0),
      Number(latestPoint.total || 0),
      Number(latestPoint.physicalRaw + latestPoint.derivativeRaw || 0),
      baseValue * 0.2,
      1,
    );

    return {
      animationDuration: 220,
      grid: { left: 70, right: 40, top: 22, bottom: 16 },
      xAxis: {
        type: "value",
        min: 0,
        max: maxDomain * 1.08,
        axisLabel: {
          color: "#475569",
          formatter: (value) => formatHedgeAxisValue(value, unit),
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
      },
      yAxis: {
        type: "category",
        data: ["Atual"],
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#0f172a", fontWeight: 700 },
      },
      tooltip: { show: false },
      series: [
        {
          type: "bar",
          stack: "realizado",
          data: [latestPoint.derivativeRaw],
          barWidth: 28,
          itemStyle: { color: "rgba(251, 146, 60, 0.85)", borderRadius: [CHART_BAR_RADIUS, 0, 0, CHART_BAR_RADIUS] },
          markArea: latestPoint.minValue != null && latestPoint.maxValue != null ? {
            silent: true,
            itemStyle: { color: "rgba(34, 197, 94, 0.10)" },
            data: [[{ xAxis: latestPoint.minValue }, { xAxis: latestPoint.maxValue }]],
          } : undefined,
        },
        {
          type: "bar",
          stack: "realizado",
          data: [latestPoint.physicalRaw],
          barWidth: 28,
          itemStyle: { color: "rgba(250, 204, 21, 0.45)", borderRadius: [0, CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0] },
        },
        {
          type: "scatter",
          data: [[latestPoint.total, "Atual"]],
          symbolSize: 16,
          itemStyle: { color: "#111827" },
          label: {
            show: true,
            position: "top",
            color: "#111827",
            fontWeight: 800,
            formatter: () =>
              `${(latestPoint.totalPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
          },
        },
      ],
    };
  }, [baseValue, latestPoint, unit]);

  return (
    <article className="hedge-chart-card">
      <div className="hedge-chart-card-header">
        <h2>{title}</h2>
        <div className="hedge-chart-actions">
          <button type="button" className="hedge-chart-icon-btn" onClick={onFocusToggle} title="Destacar gráfico">
            ⛶
          </button>
        </div>
      </div>
      {showFloatingCard && latestPoint ? (
        <aside className="hedge-floating-card">
          <div className="hedge-floating-topline">
            <div className="hedge-floating-title">{formatHedgeTitleDate(latestPoint.date)}</div>
          </div>
          <div className="hedge-floating-line">
            Faixa alvo:{" "}
            {latestPoint.minValue != null && latestPoint.maxValue != null
              ? `${formatHedgeTooltipValue(latestPoint.minValue, unit)} ate ${formatHedgeTooltipValue(latestPoint.maxValue, unit)}`
              : "—"}
          </div>
          <div className="hedge-floating-line">
            Derivativos: {formatHedgeTooltipValue(latestPoint.derivativeRaw, unit)}
          </div>
          <div className="hedge-floating-line">
            Fisico: {formatHedgeTooltipValue(latestPoint.physicalRaw, unit)}
          </div>
        </aside>
      ) : null}
      <div className="hedge-chart-wrap hedge-chart-wrap--compact">
        {option ? <ReactECharts option={option} style={{ height: "100%", width: "100%" }} opts={{ renderer: "svg" }} /> : null}
      </div>
    </article>
  );
}

function HedgePolicyPercentChart({
  title,
  unit,
  frequency,
  baseValue,
  physicalRows,
  derivativeRows,
  policies,
  physicalValueGetter,
  derivativeValueGetter,
  onFocusToggle,
}) {
  const chartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit,
        frequency,
        baseValue,
        physicalRows,
        derivativeRows,
        policies,
        physicalValueGetter,
        derivativeValueGetter,
      }),
    [baseValue, derivativeRows, derivativeValueGetter, frequency, physicalRows, physicalValueGetter, policies, unit],
  );

  const latestPoint = chartState.points.at(-1) || null;

  const option = useMemo(() => ({
    animationDuration: 220,
    grid: { left: 50, right: 22, top: 18, bottom: 38 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) =>
        value == null ? "—" : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    },
    legend: {
      bottom: 0,
      data: ["Politica Min.", "Politica Max.", "Realizado"],
      textStyle: { color: "#475569", fontSize: 11, fontWeight: 700 },
      itemWidth: 12,
      itemHeight: 12,
    },
    xAxis: {
      type: "category",
      data: chartState.labels,
      axisLabel: { color: "#475569", fontSize: 11, fontWeight: 700 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.3)" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLabel: {
        color: "#475569",
        formatter: (value) => `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
      },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
      series: [
        {
          name: "Politica Min.",
          type: "line",
          smooth: false,
          symbol: "none",
          stack: "policy-band",
          lineStyle: { color: "#22c55e", width: 2 },
          areaStyle: undefined,
          data: chartState.minPctDataset,
        },
        {
          name: "__policy_band__",
          type: "line",
          smooth: false,
          symbol: "none",
          stack: "policy-band",
          lineStyle: { opacity: 0 },
          itemStyle: { opacity: 0 },
          emphasis: { disabled: true },
          tooltip: { show: false },
          areaStyle: { color: "rgba(34, 197, 94, 0.14)" },
          data: chartState.bandPctDataset,
        },
        {
          name: "Politica Max.",
          type: "line",
          smooth: false,
          symbol: "none",
          lineStyle: { color: "#22c55e", width: 2 },
          areaStyle: undefined,
          data: chartState.maxPctDataset,
        },
        {
          name: "Realizado",
          type: "line",
          smooth: false,
          symbol: "circle",
        symbolSize: 7,
        lineStyle: { color: "#111827", width: 4 },
        itemStyle: { color: "#111827" },
        areaStyle: { color: "rgba(250, 204, 21, 0.16)" },
        data: chartState.totalPctDataset,
      },
    ],
  }), [chartState.bandPctDataset, chartState.labels, chartState.maxPctDataset, chartState.minPctDataset, chartState.totalPctDataset]);

  return (
    <article className="hedge-chart-card has-floating-card">
      <div className="hedge-chart-card-header">
        <h2>{title}</h2>
        <div className="hedge-chart-actions">
          <button type="button" className="hedge-chart-icon-btn" onClick={onFocusToggle} title="Destacar gráfico">
            ⛶
          </button>
        </div>
      </div>
      {latestPoint ? (
        <aside className="hedge-floating-card">
          <div className="hedge-floating-topline">
            <div className="hedge-floating-title">{formatHedgeTitleDate(latestPoint.date)}</div>
          </div>
          <div className="hedge-floating-line">
            Realizado: {(latestPoint.totalPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </div>
          <div className="hedge-floating-line">
            Politica Min.: {latestPoint.minPct != null ? `${(latestPoint.minPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
          </div>
          <div className="hedge-floating-line">
            Politica Max.: {latestPoint.maxPct != null ? `${(latestPoint.maxPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
          </div>
        </aside>
      ) : null}
      <div className="hedge-chart-wrap hedge-chart-wrap--compact">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} opts={{ renderer: "svg" }} />
      </div>
    </article>
  );
}

function HedgePolicyMultiSelect({ options, value, onChange, labelKey, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = new Set((value || []).map(String));
  const toggle = (id) => {
    const s = new Set(selected);
    if (s.has(String(id))) s.delete(String(id)); else s.add(String(id));
    onChange([...s].map(Number));
  };
  const labels = (options || []).filter((o) => selected.has(String(o.id))).map((o) => o[labelKey] || String(o.id));

  return (
    <div className="hpe-multisel" ref={ref}>
      <button type="button" className="hpe-multisel-btn" onClick={() => setOpen((v) => !v)}>
        {labels.length > 0
          ? <span className="hpe-multisel-tags">{labels.map((l) => <span key={l} className="hpe-multisel-tag">{l}</span>)}</span>
          : <span className="hpe-multisel-placeholder">{placeholder || "Selecionar…"}</span>
        }
        <svg className="hpe-multisel-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="hpe-multisel-dropdown">
          {(options || []).length === 0 && <div className="hpe-multisel-empty">Sem opções</div>}
          {(options || []).map((o) => (
            <label key={o.id} className="hpe-multisel-option">
              <input
                type="checkbox"
                checked={selected.has(String(o.id))}
                onChange={() => toggle(o.id)}
              />
              {o[labelKey] || String(o.id)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function HedgePolicySingleSelect({ options, value, onChange, labelKey, placeholder }) {
  const idStr = value != null ? String(value) : "";
  return (
    <select
      className="hedge-policy-editor-input hpe-select"
      value={idStr}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{placeholder || "—"}</option>
      {(options || []).map((o) => (
        <option key={o.id} value={String(o.id)}>{o[labelKey] || String(o.id)}</option>
      ))}
    </select>
  );
}

function HedgePolicyEditorModal({
  policies,
  onClose,
  onSaved,
  buildPreviewChartStates,
  optionGroups = [],
  optionSubgroups = [],
  optionCrops = [],
  optionSeasons = [],
  initialFilter = {},
}) {
  const extractIds = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map((v) => (typeof v === "object" ? v?.id : v)).filter(Boolean).map(Number);
    return [typeof val === "object" ? val?.id : val].filter(Boolean).map(Number);
  };

  const extractId = (val) => {
    if (!val) return null;
    if (typeof val === "object") return val?.id ?? null;
    return val;
  };

  // Convert stored decimal (0.15) to display percentage (15)
  const decimalToPct = (v) => {
    if (v == null || v === "") return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return String(Math.round(n * 100 * 1000) / 1000); // keep up to 3 decimal places of precision
  };

  // ALL rows — every policy across every cultura/safra combination
  const [rows, setRows] = useState(() =>
    (policies || [])
      .slice()
      .sort((a, b) => String(a.mes_ano || "").localeCompare(String(b.mes_ano || "")))
      .map((p) => ({
        _draftId: Math.random().toString(36).slice(2),
        id: p.id ?? null,
        mes_ano: p.mes_ano ? String(p.mes_ano).slice(0, 10) : "",
        vendas_x_prod_total_minimo: decimalToPct(p.vendas_x_prod_total_minimo),
        vendas_x_prod_total_maximo: decimalToPct(p.vendas_x_prod_total_maximo),
        vendas_x_custo_minimo: decimalToPct(p.vendas_x_custo_minimo),
        vendas_x_custo_maximo: decimalToPct(p.vendas_x_custo_maximo),
        grupos: extractIds(p.grupos),
        subgrupos: extractIds(p.subgrupos),
        cultura: extractId(p.cultura),
        safra: extractId(p.safra),
        obs: p.obs ?? "",
        _original: p,
      })),
  );

  // Filter state — cultura/safra work as display filters, not assignment
  const seedCultura = useMemo(() => {
    const first = (policies || []).find((p) => extractId(p.cultura) != null);
    return first ? extractId(first.cultura) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seedSafra = useMemo(() => {
    const first = (policies || []).find((p) => extractId(p.safra) != null);
    return first ? extractId(first.safra) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filterCultura, setFilterCultura] = useState(initialFilter.cultura ?? seedCultura);
  const [filterSafra, setFilterSafra] = useState(initialFilter.safra ?? seedSafra);
  const [filterGrupo, setFilterGrupo] = useState(initialFilter.grupo ?? null);
  const [filterSubgrupo, setFilterSubgrupo] = useState(initialFilter.subgrupo ?? null);

  // Subgroups visible in the filter (depend on selected grupo filter)
  const filterVisibleSubgroups = useMemo(
    () => filterGrupo != null
      ? (optionSubgroups || []).filter((s) => String(s.grupo) === String(filterGrupo))
      : (optionSubgroups || []),
    [filterGrupo, optionSubgroups],
  );

  // Rows visible in the table (apply all filters)
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const culturaMatch = filterCultura == null || String(r.cultura) === String(filterCultura);
      const safraMatch = filterSafra == null || String(r.safra) === String(filterSafra);
      const grupoMatch = filterGrupo == null || r.grupos.map(String).includes(String(filterGrupo));
      const subgrupoMatch = filterSubgrupo == null || r.subgrupos.map(String).includes(String(filterSubgrupo));
      return culturaMatch && safraMatch && grupoMatch && subgrupoMatch;
    });
  }, [rows, filterCultura, filterSafra, filterGrupo, filterSubgrupo]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // pctToDecimal: draft stores display % (50 = 50%), chart/save need decimal (0.5)
  const pctToDecimal = (v) => (v !== "" && v != null ? Number(v) / 100 : null);

  // Preview policies = visible rows only (filtered by cultura/safra) converted to decimal
  const previewPolicies = useMemo(() =>
    visibleRows.map((row) => ({
      id: row.id,
      mes_ano: row.mes_ano || null,
      vendas_x_prod_total_minimo: pctToDecimal(row.vendas_x_prod_total_minimo),
      vendas_x_prod_total_maximo: pctToDecimal(row.vendas_x_prod_total_maximo),
      vendas_x_custo_minimo: pctToDecimal(row.vendas_x_custo_minimo),
      vendas_x_custo_maximo: pctToDecimal(row.vendas_x_custo_maximo),
    })),
    [visibleRows],
  );

  const previewChartStates = useMemo(
    () => buildPreviewChartStates
      ? buildPreviewChartStates(previewPolicies, { cultura: filterCultura, safra: filterSafra, grupo: filterGrupo, subgrupo: filterSubgrupo })
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewPolicies, buildPreviewChartStates, filterCultura, filterSafra, filterGrupo, filterSubgrupo],
  );

  const updateRow = (draftId, field, value) =>
    setRows((prev) => prev.map((r) => (r._draftId === draftId ? { ...r, [field]: value } : r)));

  // New row inherits current filter values
  const addRow = () => setRows((prev) => [...prev, {
    _draftId: Math.random().toString(36).slice(2),
    id: null,
    mes_ano: "",
    vendas_x_prod_total_minimo: "",
    vendas_x_prod_total_maximo: "",
    vendas_x_custo_minimo: "",
    vendas_x_custo_maximo: "",
    grupos: filterGrupo ? [filterGrupo] : [],
    subgrupos: filterSubgrupo ? [filterSubgrupo] : [],
    cultura: filterCultura ?? null,
    safra: filterSafra ?? null,
    obs: "",
    _original: null,
  }]);

  const removeRow = (draftId) => setRows((prev) => prev.filter((r) => r._draftId !== draftId));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const originalIds = new Set((policies || []).map((p) => p.id).filter(Boolean));
      const keptIds = new Set(rows.map((r) => r.id).filter(Boolean));
      const deletedIds = [...originalIds].filter((id) => !keptIds.has(id));
      await Promise.all(deletedIds.map((id) => resourceService.remove("hedge-policies", id)));
      await Promise.all(
        rows.map((row) => {
          const payload = {
            mes_ano: row.mes_ano || null,
            vendas_x_prod_total_minimo: pctToDecimal(row.vendas_x_prod_total_minimo),
            vendas_x_prod_total_maximo: pctToDecimal(row.vendas_x_prod_total_maximo),
            vendas_x_custo_minimo: pctToDecimal(row.vendas_x_custo_minimo),
            vendas_x_custo_maximo: pctToDecimal(row.vendas_x_custo_maximo),
            grupos: row.grupos || [],
            subgrupos: row.subgrupos || [],
            cultura: row.cultura ?? null,
            safra: row.safra ?? null,
            obs: row.obs || "",
            insumos_travados_minimo: row._original?.insumos_travados_minimo ?? null,
            insumos_travados_maximo: row._original?.insumos_travados_maximo ?? null,
            margem_alvo_minimo: row._original?.margem_alvo_minimo ?? null,
          };
          return row.id
            ? resourceService.update("hedge-policies", row.id, payload)
            : resourceService.create("hedge-policies", payload);
        }),
      );
      onSaved();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : String(err));
    } finally {
      setSaving(false);
    }
  };

  const miniChartProps = {
    unit: "SC",
    frequency: "monthly",
    baseValue: 0,
    physicalRows: [],
    derivativeRows: [],
    policies: [],
    physicalValueGetter: () => 0,
    derivativeValueGetter: () => 0,
    showFloatingCard: false,
    insightTitle: "",
    insightMessage: null,
    activeIndex: null,
    onActiveIndexChange: () => {},
    onFocusToggle: null,
  };

  return (
    <div
      className="hedge-fullscreen-backdrop hedge-policy-editor-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="hedge-policy-editor-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="hedge-policy-editor-header">
          <div>
            <h2 className="hedge-policy-editor-title">Editar Política de Hedge</h2>
            <p className="hedge-policy-editor-subtitle">Defina limites mínimo e máximo por período. Valores em percentual (%).</p>
          </div>
          <button type="button" className="component-popup-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        {/* Mini charts side by side — atualizam ao vivo conforme edição */}
        {previewChartStates && (
          <div className="hedge-policy-editor-charts-row">
            <div className="hedge-policy-editor-mini-chart-wrap">
              <div className="hedge-policy-editor-mini-chart-label">
                Gráfico 1 — Hedge × Custo (R$)
                <span className="hedge-policy-editor-mini-chart-badge">prévia ao vivo</span>
              </div>
              <div className="hedge-policy-editor-mini-chart-inner">
                <HedgePolicyChart
                  {...miniChartProps}
                  title=""
                  unit="BRL"
                  baseValue={previewChartStates.costBaseValue || 0}
                  comparisonSeriesName="Custo Realizado"
                  precomputedChartState={previewChartStates.cost}
                />
              </div>
            </div>
            <div className="hedge-policy-editor-mini-chart-wrap">
              <div className="hedge-policy-editor-mini-chart-label">
                Gráfico 2 — Hedge × Produção (sc)
                <span className="hedge-policy-editor-mini-chart-badge">prévia ao vivo</span>
              </div>
              <div className="hedge-policy-editor-mini-chart-inner">
                <HedgePolicyChart
                  {...miniChartProps}
                  title=""
                  unit="SC"
                  baseValue={previewChartStates.productionBaseValue || 0}
                  precomputedChartState={previewChartStates.production}
                />
              </div>
            </div>
          </div>
        )}

        {/* Filter bar — filtra quais linhas aparecem na tabela */}
        <div className="hedge-policy-editor-filter-bar">
          <div className="hedge-policy-editor-filter-label-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span className="hedge-policy-editor-filter-label">Filtrar linhas:</span>
          </div>
          <label className="hedge-policy-editor-filter-field">
            <span>Cultura</span>
            <HedgePolicySingleSelect
              options={optionCrops}
              value={filterCultura}
              labelKey="ativo"
              placeholder="Todas"
              onChange={setFilterCultura}
            />
          </label>
          <label className="hedge-policy-editor-filter-field">
            <span>Safra</span>
            <HedgePolicySingleSelect
              options={optionSeasons}
              value={filterSafra}
              labelKey="safra"
              placeholder="Todas"
              onChange={setFilterSafra}
            />
          </label>
          <label className="hedge-policy-editor-filter-field">
            <span>Grupo</span>
            <HedgePolicySingleSelect
              options={optionGroups}
              value={filterGrupo}
              labelKey="grupo"
              placeholder="Todos"
              onChange={(val) => { setFilterGrupo(val); setFilterSubgrupo(null); }}
            />
          </label>
          <label className="hedge-policy-editor-filter-field">
            <span>Subgrupo</span>
            <HedgePolicySingleSelect
              options={filterVisibleSubgroups}
              value={filterSubgrupo}
              labelKey="subgrupo"
              placeholder="Todos"
              onChange={setFilterSubgrupo}
            />
          </label>
          {(filterCultura != null || filterSafra != null || filterGrupo != null || filterSubgrupo != null) && (
            <button
              type="button"
              className="hedge-policy-editor-filter-clear"
              onClick={() => { setFilterCultura(null); setFilterSafra(null); setFilterGrupo(null); setFilterSubgrupo(null); }}
            >
              Limpar filtro
            </button>
          )}
          <span className="hedge-policy-editor-filter-count">
            {visibleRows.length} de {rows.length} {rows.length === 1 ? "linha" : "linhas"}
          </span>
        </div>

        {/* Table */}
        <div className="hedge-policy-editor-table-section">
          <table className="hedge-policy-editor-table">
            <thead>
              <tr className="hedge-policy-editor-thead-group">
                <th rowSpan={2} className="hedge-policy-editor-th-mes">Data</th>
                <th colSpan={2} className="hedge-policy-editor-th-group hedge-policy-editor-th-custo">Hedge × Custo Total</th>
                <th colSpan={2} className="hedge-policy-editor-th-group hedge-policy-editor-th-prod">Hedge × Produção Total</th>
                <th rowSpan={2} className="hedge-policy-editor-th-assoc">Grupos</th>
                <th rowSpan={2} className="hedge-policy-editor-th-assoc">Subgrupos</th>
                <th rowSpan={2} className="hedge-policy-editor-th-actions"></th>
              </tr>
              <tr className="hedge-policy-editor-thead-sub">
                <th className="hedge-policy-editor-th-sub hedge-policy-editor-th-custo">Mín</th>
                <th className="hedge-policy-editor-th-sub hedge-policy-editor-th-custo">Máx</th>
                <th className="hedge-policy-editor-th-sub hedge-policy-editor-th-prod">Mín</th>
                <th className="hedge-policy-editor-th-sub hedge-policy-editor-th-prod">Máx</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="hedge-policy-editor-empty">
                    {rows.length === 0
                      ? "Nenhuma linha. Clique em \"+ Adicionar linha\" para começar."
                      : "Nenhuma linha corresponde ao filtro selecionado. Mude o filtro ou clique em \"+ Adicionar linha\"."}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const visibleSubgroups = row.grupos.length > 0
                  ? (optionSubgroups || []).filter((s) => row.grupos.map(String).includes(String(s.grupo)))
                  : optionSubgroups;
                return (
                  <tr key={row._draftId} className="hedge-policy-editor-row">
                    <td className="hedge-policy-editor-td-mes">
                      <input
                        type="date"
                        className="hedge-policy-editor-input hpe-date"
                        value={row.mes_ano}
                        onChange={(e) => updateRow(row._draftId, "mes_ano", e.target.value)}
                      />
                    </td>
                    {[
                      ["vendas_x_custo_minimo", "hedge-policy-editor-td-custo"],
                      ["vendas_x_custo_maximo", "hedge-policy-editor-td-custo"],
                      ["vendas_x_prod_total_minimo", "hedge-policy-editor-td-prod"],
                      ["vendas_x_prod_total_maximo", "hedge-policy-editor-td-prod"],
                    ].map(([field, cls]) => (
                      <td key={field} className={cls}>
                        <div className="hedge-policy-editor-pct-field">
                          <input
                            type="number"
                            className="hedge-policy-editor-input hedge-policy-editor-input-num"
                            value={row[field]}
                            placeholder="0"
                            min={0}
                            max={200}
                            onChange={(e) => updateRow(row._draftId, field, e.target.value)}
                          />
                          <span className="hedge-policy-editor-pct-sign">%</span>
                        </div>
                      </td>
                    ))}
                    <td className="hedge-policy-editor-td-assoc">
                      <HedgePolicyMultiSelect
                        options={optionGroups}
                        value={row.grupos}
                        labelKey="grupo"
                        placeholder="Grupos…"
                        onChange={(v) => updateRow(row._draftId, "grupos", v)}
                      />
                    </td>
                    <td className="hedge-policy-editor-td-assoc">
                      <HedgePolicyMultiSelect
                        options={visibleSubgroups}
                        value={row.subgrupos}
                        labelKey="subgrupo"
                        placeholder="Subgrupos…"
                        onChange={(v) => updateRow(row._draftId, "subgrupos", v)}
                      />
                    </td>
                    <td className="hedge-policy-editor-td-actions">
                      <button
                        type="button"
                        className="hedge-policy-editor-remove-btn"
                        onClick={() => removeRow(row._draftId)}
                        title="Remover linha"
                        aria-label="Remover linha"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="hedge-policy-editor-footer">
          <button type="button" className="hedge-policy-editor-add-btn" onClick={addRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar linha
          </button>
          <div className="hedge-policy-editor-footer-actions">
            {error && <span className="hedge-policy-editor-error">{error}</span>}
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HedgePolicyDashboard({ dashboardFilter }) {
  const { matchesDashboardFilter, options } = useDashboardFilter();
  const [frequency, setFrequency] = useState("monthly");
  const [focusedChart, setFocusedChart] = useState(null);
  const [productionChartMounted, setProductionChartMounted] = useState(false);
  const [costActiveIndex, setCostActiveIndex] = useState(0);
  const [productionActiveIndex, setProductionActiveIndex] = useState(0);
  const [showSimulationBox, setShowSimulationBox] = useState(false);
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [simulationVolume, setSimulationVolume] = useState("");
  const [simulationValue, setSimulationValue] = useState("");
  const [simulationCurrency, setSimulationCurrency] = useState("BRL");
  const [usdBrlRate, setUsdBrlRate] = useState(0);
  const [policies, setPolicies] = useState([]);
  const [physicalSales, setPhysicalSales] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [budgetCosts, setBudgetCosts] = useState([]);
  const [actualCosts, setActualCosts] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("hedge-policies"),
      resourceService.listAll("physical-sales"),
      resourceService.listAll("physical-payments"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("budget-costs"),
      resourceService.listAll("actual-costs"),
      resourceService.listAll("crop-boards"),
      resourceService.fetchJsonCached("sheety-cotacoes-spot", SHEETY_QUOTES_URL).catch(() => ({ planilha1: [] })),
    ]).then(([
      policiesResponse,
      physicalResponse,
      physicalPaymentsResponse,
      derivativeResponse,
      budgetResponse,
      actualCostsResponse,
      cropBoardResponse,
      sheetyResponse,
    ]) => {
      if (!isMounted) return;
      setPolicies(policiesResponse || []);
      setPhysicalSales(physicalResponse || []);
      setPhysicalPayments(physicalPaymentsResponse || []);
      setDerivatives(derivativeResponse || []);
      setBudgetCosts(budgetResponse || []);
      setActualCosts(actualCostsResponse || []);
      setCropBoards(cropBoardResponse || []);
      const usdBrlRow = (sheetyResponse?.planilha1 || []).find((item) => normalizeText(item.ctrbolsa) === "usdbrl");
      const nextUsdBrlRate = Number(usdBrlRow?.cotacao);
      setUsdBrlRate(Number.isFinite(nextUsdBrlRate) && nextUsdBrlRate > 0 ? nextUsdBrlRate : 0);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const costBase = useMemo(
    () =>
      budgetCosts
        .filter((item) => matchesDashboardFilter(item, dashboardFilter))
        .reduce((sum, item) => sum + convertValueToBrl(item.valor, item.moeda, usdBrlRate), 0),
    [budgetCosts, dashboardFilter, matchesDashboardFilter, usdBrlRate],
  );
  const productionBase = useMemo(
    () =>
      getNetProductionValue(
        cropBoards.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
        physicalPayments.filter((item) =>
          rowMatchesDashboardFilter(item, dashboardFilter, {
            cultureKeys: ["fazer_frente_com"],
          }),
        ),
        (item) => item.producao_total,
        (item) => item.volume,
      ),
    [cropBoards, dashboardFilter, matchesDashboardFilter, physicalPayments],
  );

  const filteredPolicies = useMemo(
    () => policies.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, policies],
  );
  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter, matchesDashboardFilter],
  );
  const cropBoardDateMarkerRows = useMemo(
    () => (hasDashboardFilterSelection(dashboardFilter) ? filteredCropBoards : cropBoards),
    [cropBoards, dashboardFilter, filteredCropBoards],
  );
  const cropBoardDateMarkers = useMemo(
    () => buildCropBoardDateMarkers(cropBoardDateMarkerRows),
    [cropBoardDateMarkerRows],
  );
  const filteredPhysicalSales = useMemo(
    () => physicalSales.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, physicalSales],
  );
  const filteredActualCosts = useMemo(
    () => actualCosts.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [actualCosts, dashboardFilter, matchesDashboardFilter],
  );
  const filteredDerivatives = useMemo(
    () =>
      derivatives.filter((item) => {
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: DERIVATIVE_CULTURE_KEYS,
        });
      }),
    [dashboardFilter, derivatives],
  );
  const cultureLabelById = useMemo(() => {
    const map = new Map();
    [...(options.crops || []), ...(options.cropBoardCrops || [])].forEach((item) => {
      if (item?.id != null) {
        map.set(String(item.id), item.ativo || item.cultura || item.nome || item.label || item.descricao || String(item.id));
      }
    });
    return map;
  }, [options.cropBoardCrops, options.crops]);
  const resolveCultureLabel = useCallback((value) => {
    if (!value) return "Sem ativo";
    if (Array.isArray(value)) return resolveCultureLabel(value[0]);
    if (typeof value === "string" || typeof value === "number") {
      return cultureLabelById.get(String(value)) || String(value);
    }
    const nestedId = value.id != null ? cultureLabelById.get(String(value.id)) : null;
    return nestedId || value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
  }, [cultureLabelById]);
  const derivativeStandardVolumeGetter = useMemo(
    () => (item) => getDerivativeVolumeInStandardUnit(item, options.exchanges || [], resolveCultureLabel),
    [options.exchanges, resolveCultureLabel],
  );
  const filteredCommodityDerivatives = useMemo(
    () => filteredDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "cmdtye"),
    [filteredDerivatives],
  );
  const totalArea = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.area || 0)), 0),
    [filteredCropBoards],
  );

  const parsedSimulationVolume = parseLocalizedInputNumber(simulationVolume) || 0;
  const parsedSimulationValue = parseLocalizedInputNumber(simulationValue) || 0;
  const hasSimulationValues = parsedSimulationVolume > 0 || parsedSimulationValue > 0;
  const simulatedCostValue =
    simulationCurrency === "USD" ? parsedSimulationValue * Math.max(usdBrlRate, 0) : parsedSimulationValue;
  const simulationLabel = simulationCurrency === "USD" ? "convertido em R$" : "adicionado em R$";
  const costChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit: "BRL",
        frequency,
        baseValue: costBase,
        physicalRows: filteredPhysicalSales,
        derivativeRows: filteredDerivatives,
        policies: filteredPolicies,
        physicalValueGetter: (item) => getPhysicalCostValue(item, usdBrlRate),
        derivativeValueGetter: (item) => getDerivativeCostValue(item, usdBrlRate),
        comparisonRows: filteredActualCosts,
        comparisonDateGetter: (item) => item.data_travamento,
        comparisonValueGetter: (item) => convertValueToBrl(item.valor, item.moeda, usdBrlRate),
        simulatedIncrement: simulatedCostValue,
        dateMarkers: cropBoardDateMarkers,
      }),
    [costBase, cropBoardDateMarkers, filteredActualCosts, filteredDerivatives, filteredPhysicalSales, filteredPolicies, frequency, simulatedCostValue, usdBrlRate],
  );
  const productionChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit: "SC",
        frequency,
        baseValue: productionBase,
        physicalRows: filteredPhysicalSales,
        derivativeRows: filteredCommodityDerivatives,
        policies: filteredPolicies,
        physicalValueGetter: getPhysicalVolumeValue,
        derivativeValueGetter: derivativeStandardVolumeGetter,
        simulatedIncrement: parsedSimulationVolume,
        dateMarkers: cropBoardDateMarkers,
      }),
    [
      cropBoardDateMarkers,
      derivativeStandardVolumeGetter,
      filteredCommodityDerivatives,
      filteredPhysicalSales,
      filteredPolicies,
      frequency,
      parsedSimulationVolume,
      productionBase,
    ],
  );
  const costTodayIndex = useMemo(() => getHedgeTodayIndex(costChartState.points), [costChartState.points]);
  const productionTodayIndex = useMemo(() => getHedgeTodayIndex(productionChartState.points), [productionChartState.points]);

  // Hover compartilhado entre os dois gráficos
  const [sharedHoverDate, setSharedHoverDate] = useState(null);

  // Slider compartilhado entre os dois gráficos
  const [sharedSliderStart, setSharedSliderStart] = useState(0);
  const [sharedSliderEnd, setSharedSliderEnd] = useState(null);
  const sharedExtendedPoints = useMemo(() => {
    const state = productionChartState;
    if (!state.points.length) return state.points;
    const firstDate = state.domainStart || state.points[0]?.date;
    const lastDate = state.domainEnd || state.points.at(-1)?.date;
    if (!firstDate || !lastDate) return state.points;
    const twoYearsMs = 2 * 365.25 * 24 * 3600 * 1000;
    const extStart = new Date(firstDate.getTime() - twoYearsMs);
    const extEnd = new Date(lastDate.getTime() + twoYearsMs);
    return buildHedgeBuckets(extStart, extEnd, frequency);
  }, [productionChartState, frequency]);
  useEffect(() => {
    if (!sharedExtendedPoints.length || !productionChartState.points.length) {
      setSharedSliderStart(0);
      setSharedSliderEnd(null);
      return;
    }
    const keys = sharedExtendedPoints.map((p) => p.key);
    const startIdx = keys.indexOf(productionChartState.points[0]?.key);
    const endIdx = keys.lastIndexOf(productionChartState.points.at(-1)?.key);
    setSharedSliderStart(startIdx >= 0 ? startIdx : 0);
    setSharedSliderEnd(endIdx >= 0 ? endIdx : sharedExtendedPoints.length - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionChartState.points.length, sharedExtendedPoints.length]);

  useEffect(() => {
    setCostActiveIndex(costTodayIndex);
  }, [costTodayIndex]);

  useEffect(() => {
    setProductionActiveIndex(productionTodayIndex);
  }, [productionTodayIndex]);

  useEffect(() => {
    if (productionChartMounted) return undefined;
    if (focusedChart === "production") {
      setProductionChartMounted(true);
      return undefined;
    }
    if (typeof window === "undefined") {
      setProductionChartMounted(true);
      return undefined;
    }

    let cancelled = false;
    const mountChart = () => {
      if (!cancelled) {
        setProductionChartMounted(true);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(mountChart, { timeout: 300 });
      return () => {
        cancelled = true;
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(mountChart, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [focusedChart, productionChartMounted]);

  const activeCostPoint =
    costChartState.points[costActiveIndex] || costChartState.points[costTodayIndex] || costChartState.points.at(-1) || null;
  const activeProductionPoint =
    productionChartState.points[productionActiveIndex] ||
    productionChartState.points[productionTodayIndex] ||
    productionChartState.points.at(-1) ||
    null;
  const focusedReferenceDate =
    focusedChart === "cost"
      ? activeCostPoint?.date || null
      : focusedChart === "production"
        ? activeProductionPoint?.date || null
        : null;
  const focusedActivePhysicalSales = useMemo(
    () => {
      if (!focusedReferenceDate) return [];
      return filteredPhysicalSales.filter((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return saleDate && saleDate <= focusedReferenceDate;
      });
    },
    [filteredPhysicalSales, focusedReferenceDate],
  );
  const focusedActiveDerivatives = useMemo(() => {
    if (!focusedReferenceDate) return [];
    const sourceRows = focusedChart === "production" ? filteredCommodityDerivatives : filteredDerivatives;
    return sourceRows.filter((item) => {
      const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
      const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
      return startDate && endDate && startDate <= focusedReferenceDate && focusedReferenceDate < endDate;
    });
  }, [filteredCommodityDerivatives, filteredDerivatives, focusedChart, focusedReferenceDate]);
  const focusedPhysicalPriceLines = useMemo(() => {
    const groups = new Map();
    focusedActivePhysicalSales.forEach((item) => {
      const volume = Math.abs(Number(item.volume_fisico || 0));
      const price = Number(item.preco || 0);
      if (!volume || !price) return;
      const unitLabel =
        item.moeda_unidade ||
        (item.moeda_contrato && item.unidade_contrato ? `${item.moeda_contrato}/${item.unidade_contrato}` : item.moeda_contrato || item.unidade_contrato || "");
      const key = unitLabel || "sem-unidade";
      const current = groups.get(key) || { unitLabel, volume: 0, weightedPrice: 0 };
      current.volume += volume;
      current.weightedPrice += volume * price;
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        averagePrice: item.volume > 0 ? item.weightedPrice / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [focusedActivePhysicalSales]);
  const focusedDerivativePriceLines = useMemo(() => {
    const groups = new Map();
    focusedActiveDerivatives.forEach((item) => {
      const volume = derivativeStandardVolumeGetter(item);
      const strike = Number(item.strike_montagem || item.strike_liquidacao || 0);
      if (!volume || !strike) return;
      const unitLabel = item.moeda_unidade || item.volume_financeiro_moeda || "";
      const key = unitLabel || "sem-unidade";
      const current = groups.get(key) || { unitLabel, volume: 0, weightedStrike: 0 };
      current.volume += volume;
      current.weightedStrike += volume * strike;
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        averageStrike: item.volume > 0 ? item.weightedStrike / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [derivativeStandardVolumeGetter, focusedActiveDerivatives]);

  const focusedSummaryProps = useMemo(() => {
    if (focusedChart === "cost") {
      const activeTotalValue = (activeCostPoint?.total || 0) + (costActiveIndex === costChartState.points.length - 1 ? simulatedCostValue : 0);
      const activePhysicalValue = activeCostPoint?.physicalRaw || 0;
      const activeDerivativeValue = activeCostPoint?.derivativeRaw || 0;
      const activeTotalPercent = costBase > 0 ? (activeTotalValue / costBase) * 100 : 0;
      const activePhysicalPercent = activeTotalValue > 0 ? (activePhysicalValue / activeTotalValue) * 100 : 0;
      const activeDerivativePercent = activeTotalValue > 0 ? (activeDerivativeValue / activeTotalValue) * 100 : 0;
      return {
        totalPercent: activeTotalPercent,
        totalMetricLabel: `R$ ${formatCurrency2(activeTotalValue)}`,
        physicalPercent: activePhysicalPercent,
        physicalMetricLabel: `R$ ${formatCurrency2(activePhysicalValue)}`,
        physicalDetailLines: focusedPhysicalPriceLines.length
          ? focusedPhysicalPriceLines.map((item) => `${formatNumber0(item.volume)} sc | ${formatCurrency2(item.averagePrice)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
          : [],
        derivativePercent: activeDerivativePercent,
        derivativeMetricLabel: `R$ ${formatCurrency2(activeDerivativeValue)}`,
        derivativeDetailLines: focusedDerivativePriceLines.length
          ? focusedDerivativePriceLines.map((item) => `${formatNumber0(item.volume)} sc | Strike ${formatCurrency2(item.averageStrike)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
          : [],
        policyMinPercent: activeCostPoint?.minPct != null ? activeCostPoint.minPct * 100 : null,
        policyMaxPercent: activeCostPoint?.maxPct != null ? activeCostPoint.maxPct * 100 : null,
      };
    }
    if (focusedChart === "production") {
      const activeTotalValue =
        (activeProductionPoint?.total || 0) + (productionActiveIndex === productionChartState.points.length - 1 ? parsedSimulationVolume : 0);
      const activePhysicalValue = activeProductionPoint?.physicalRaw || 0;
      const activeDerivativeValue = activeProductionPoint?.derivativeRaw || 0;
      const activeTotalPercent = productionBase > 0 ? (activeTotalValue / productionBase) * 100 : 0;
      const activePhysicalPercent = activeTotalValue > 0 ? (activePhysicalValue / activeTotalValue) * 100 : 0;
      const activeDerivativePercent = activeTotalValue > 0 ? (activeDerivativeValue / activeTotalValue) * 100 : 0;
      return {
        totalPercent: activeTotalPercent,
        totalMetricLabel: totalArea > 0 ? `${formatNumber2(activeTotalValue / totalArea)} scs/ha` : `${formatNumber0(activeTotalValue)} sc`,
        physicalPercent: activePhysicalPercent,
        physicalMetricLabel: totalArea > 0 ? `${formatNumber2(activePhysicalValue / totalArea)} scs/ha` : `${formatNumber0(activePhysicalValue)} sc`,
        physicalDetailLines: focusedPhysicalPriceLines.length
          ? focusedPhysicalPriceLines.map((item) => `${formatNumber0(item.volume)} sc | ${formatCurrency2(item.averagePrice)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
          : [],
        derivativePercent: activeDerivativePercent,
        derivativeMetricLabel: totalArea > 0 ? `${formatNumber2(activeDerivativeValue / totalArea)} scs/ha` : `${formatNumber0(activeDerivativeValue)} sc`,
        derivativeDetailLines: focusedDerivativePriceLines.length
          ? focusedDerivativePriceLines.map((item) => `${formatNumber0(item.volume)} sc | Strike ${formatCurrency2(item.averageStrike)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
          : [],
        policyMinPercent: activeProductionPoint?.minPct != null ? activeProductionPoint.minPct * 100 : null,
        policyMaxPercent: activeProductionPoint?.maxPct != null ? activeProductionPoint.maxPct * 100 : null,
      };
    }
    return null;
  }, [
    activeCostPoint,
    activeProductionPoint,
    costActiveIndex,
    costChartState.points.length,
    focusedChart,
    focusedDerivativePriceLines,
    focusedPhysicalPriceLines,
    parsedSimulationVolume,
    productionActiveIndex,
    productionChartState.points.length,
    productionBase,
    simulatedCostValue,
    costBase,
    totalArea,
  ]);
  const focusedStatusSummaryProps = useMemo(() => {
    if (!focusedChart) return null;
    const isCost = focusedChart === "cost";
    const activePoint = isCost ? activeCostPoint : activeProductionPoint;
    const chartPointsLength = isCost ? costChartState.points.length : productionChartState.points.length;
    const activeIndex = isCost ? costActiveIndex : productionActiveIndex;
    const extraValue = isCost
      ? activeIndex === chartPointsLength - 1
        ? simulatedCostValue
        : 0
      : activeIndex === chartPointsLength - 1
        ? parsedSimulationVolume
        : 0;
    const unit = isCost ? "BRL" : "SC";
    const baseValue = isCost ? costBase : productionBase;
    const totalValue = (activePoint?.total || 0) + extraValue;
    const physicalValue = activePoint?.physicalRaw || 0;
    const derivativeValue = activePoint?.derivativeRaw || 0;
    const totalPercent = baseValue > 0 ? (totalValue / baseValue) * 100 : 0;
    const policyMinPercent = activePoint?.minPct != null ? activePoint.minPct * 100 : null;
    const policyMaxPercent = activePoint?.maxPct != null ? activePoint.maxPct * 100 : null;
    const tone = getHedgeBandTone(totalPercent, policyMinPercent, policyMaxPercent);
    const summaryLines = [
      formatHedgeSummaryPolicyHeadline(totalValue, baseValue, activePoint?.minValue, activePoint?.maxValue, unit),
    ].filter(Boolean);

    return {
      title: "Resumo Hedge",
      tone,
      summaryLines,
      insightMessage: (
        <SummaryInsightCopy
          paragraphs={[
            `A primeira linha resume o percentual atual do hedge${isCost ? " sobre o custo" : " sobre a produção"} em relação à política.`,
            "Quando o hedge estiver acima ou abaixo da política, o valor excedente ou faltante aparece entre parênteses. As linhas abaixo mostram os limites mínimo e máximo da política aplicável ao ponto selecionado.",
          ]}
        />
      ),
      rows: [
        {
          label: "Politica Min",
          value:
            activePoint?.minValue != null
              ? formatHedgeSummaryLine("Politica Min", activePoint.minValue, unit, baseValue, totalArea).replace("Politica Min: ", "")
              : "—",
        },
        {
          label: "Politica Max",
          value:
            activePoint?.maxValue != null
              ? formatHedgeSummaryLine("Politica Max", activePoint.maxValue, unit, baseValue, totalArea).replace("Politica Max: ", "")
              : "—",
        },
      ],
    };
  }, [
    activeCostPoint,
    activeProductionPoint,
    costActiveIndex,
    costBase,
    costChartState.points.length,
    focusedChart,
    parsedSimulationVolume,
    productionActiveIndex,
    productionBase,
    productionChartState.points.length,
    simulatedCostValue,
    totalArea,
  ]);

  const costChartNode = (
    <HedgePolicyChart
      title="Gráfico 1 — Hedge sobre o custo (R$)"
      unit="BRL"
      frequency={frequency}
      baseValue={costBase}
      physicalRows={filteredPhysicalSales}
      derivativeRows={filteredDerivatives}
      policies={filteredPolicies}
      physicalValueGetter={(item) => getPhysicalCostValue(item, usdBrlRate)}
      derivativeValueGetter={(item) => getDerivativeCostValue(item, usdBrlRate)}
      comparisonSeriesName="Custo Realizado"
      activeIndex={costActiveIndex}
      onActiveIndexChange={setCostActiveIndex}
      onFocusToggle={() => setFocusedChart((current) => (current === "cost" ? null : "cost"))}
      focusButtonIcon={focusedChart === "cost" ? "↩" : "⛶"}
      focusButtonTitle={focusedChart === "cost" ? "Voltar" : "Maximizar gráfico"}
      simulatedIncrement={simulatedCostValue}
      simulatedLabel={simulationLabel}
      showFloatingCard={focusedChart !== "cost"}
      dateMarkers={cropBoardDateMarkers}
      insightTitle="Hedge sobre o custo"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            `Este gráfico compara o hedge realizado sobre o custo total da operação. A base usada para o cálculo é de R$ ${formatCurrency2(costBase)}.`,
            "A linha preta mostra quanto desse custo já está protegido via vendas físicas e derivativos.",
            "A faixa verde indica a política mínima e máxima desejada ao longo do tempo.",
          ]}
        />
      }
      precomputedChartState={costChartState}
      externalSliderStart={sharedSliderStart}
      externalSliderEnd={sharedSliderEnd}
      onExternalSliderChange={(s, e) => { setSharedSliderStart(s); setSharedSliderEnd(e); }}
      externalHoverDate={sharedHoverDate}
      onHoverDateChange={setSharedHoverDate}
    />
  );

  const productionChartNode = (
    <HedgePolicyChart
      title="Gráfico 2 — Hedge produção liquida (sc)"
      unit="SC"
      frequency={frequency}
      baseValue={productionBase}
      areaBase={totalArea}
      physicalRows={filteredPhysicalSales}
      derivativeRows={filteredCommodityDerivatives}
      policies={filteredPolicies}
      physicalValueGetter={getPhysicalVolumeValue}
      derivativeValueGetter={derivativeStandardVolumeGetter}
      activeIndex={productionActiveIndex}
      onActiveIndexChange={setProductionActiveIndex}
      onFocusToggle={() => setFocusedChart((current) => (current === "production" ? null : "production"))}
      focusButtonIcon={focusedChart === "production" ? "↩" : "⛶"}
      focusButtonTitle={focusedChart === "production" ? "Voltar" : "Maximizar gráfico"}
      simulatedIncrement={parsedSimulationVolume}
      simulatedLabel="adicionado em volume"
      showFloatingCard={focusedChart !== "production"}
      dateMarkers={cropBoardDateMarkers}
      insightTitle="Hedge produção líquida"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            `Este gráfico acompanha a cobertura da produção líquida, cuja base atual é ${formatNumber0(productionBase)} sc${totalArea > 0 ? `, equivalente a ${formatNumber2(productionBase / totalArea)} scs/ha` : ""}.`,
            "A linha mostra quanto da produção já foi coberta por físico e derivativos em cada período, comparando o realizado com a faixa da política.",
          ]}
        />
      }
      precomputedChartState={productionChartState}
      externalSliderStart={sharedSliderStart}
      externalSliderEnd={sharedSliderEnd}
      onExternalSliderChange={(s, e) => { setSharedSliderStart(s); setSharedSliderEnd(e); }}
      externalHoverDate={sharedHoverDate}
      onHoverDateChange={setSharedHoverDate}
    />
  );

  const sharedSliderNode = sharedExtendedPoints.length > 2 ? (() => {
    const totalCount = sharedExtendedPoints.length;
    const effEnd = sharedSliderEnd ?? totalCount - 1;
    const startPct = (sharedSliderStart / Math.max(totalCount - 1, 1)) * 100;
    const endPct = (effEnd / Math.max(totalCount - 1, 1)) * 100;
    return (
      <div className="hedge-shared-slider">
        <div className="hedge-slider-dates">
          <span>{sharedExtendedPoints[sharedSliderStart]?.label || ""}</span>
          <span>{sharedExtendedPoints[effEnd]?.label || ""}</span>
        </div>
        <div className="hedge-slider-track">
          <div className="hedge-slider-track-bg" />
          <div className="hedge-slider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
          <input
            type="range"
            className="hedge-slider-input"
            min={0}
            max={totalCount - 1}
            value={sharedSliderStart}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v < effEnd) setSharedSliderStart(v);
            }}
          />
          <input
            type="range"
            className="hedge-slider-input"
            min={0}
            max={totalCount - 1}
            value={effEnd}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > sharedSliderStart) setSharedSliderEnd(v);
            }}
          />
        </div>
      </div>
    );
  })() : null;

  const resetSimulation = () => {
    setSimulationVolume("");
    setSimulationValue("");
    setSimulationCurrency("BRL");
    setShowSimulationBox(false);
  };

  const buildPreviewChartStates = useCallback((previewPolicies, modalFilter = null) => {
    const hasModalFilter = modalFilter != null && (
      modalFilter.cultura != null || modalFilter.safra != null ||
      modalFilter.grupo != null || modalFilter.subgrupo != null
    );
    const filterObj = hasModalFilter ? {
      cultura: modalFilter.cultura != null ? [modalFilter.cultura] : [],
      safra: modalFilter.safra != null ? [modalFilter.safra] : [],
      grupo: modalFilter.grupo != null ? [modalFilter.grupo] : [],
      subgrupo: modalFilter.subgrupo != null ? [modalFilter.subgrupo] : [],
    } : null;
    const usePhysical = hasModalFilter
      ? physicalSales.filter((item) => rowMatchesDashboardFilter(item, filterObj))
      : filteredPhysicalSales;
    const useActualCosts = hasModalFilter
      ? actualCosts.filter((item) => rowMatchesDashboardFilter(item, filterObj))
      : filteredActualCosts;
    const useDerivatives = hasModalFilter
      ? derivatives.filter((item) => rowMatchesDashboardFilter(item, filterObj, { cultureKeys: DERIVATIVE_CULTURE_KEYS }))
      : filteredDerivatives;
    const useCommodityDerivatives = useDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "cmdtye");
    // Recompute base values using the same filter applied to physical/derivative data
    const useCostBase = hasModalFilter
      ? budgetCosts
          .filter((item) => rowMatchesDashboardFilter(item, filterObj))
          .reduce((sum, item) => sum + convertValueToBrl(item.valor, item.moeda, usdBrlRate), 0) || costBase
      : costBase;
    const useProductionBase = hasModalFilter
      ? getNetProductionValue(
          cropBoards.filter((item) => rowMatchesDashboardFilter(item, filterObj)),
          physicalPayments.filter((item) => rowMatchesDashboardFilter(item, filterObj, { cultureKeys: ["fazer_frente_com"] })),
          (item) => item.producao_total,
          (item) => item.volume,
        ) || productionBase
      : productionBase;
    return {
      cost: buildHedgePolicyChartState({
        unit: "BRL",
        frequency,
        baseValue: useCostBase,
        physicalRows: usePhysical,
        derivativeRows: useDerivatives,
        policies: previewPolicies,
        physicalValueGetter: (item) => getPhysicalCostValue(item, usdBrlRate),
        derivativeValueGetter: (item) => getDerivativeCostValue(item, usdBrlRate),
        comparisonRows: useActualCosts,
        comparisonDateGetter: (item) => item.data_travamento,
        comparisonValueGetter: (item) => convertValueToBrl(item.valor, item.moeda, usdBrlRate),
        dateMarkers: cropBoardDateMarkers,
      }),
      production: buildHedgePolicyChartState({
        unit: "SC",
        frequency,
        baseValue: useProductionBase,
        physicalRows: usePhysical,
        derivativeRows: useCommodityDerivatives,
        policies: previewPolicies,
        physicalValueGetter: getPhysicalVolumeValue,
        derivativeValueGetter: derivativeStandardVolumeGetter,
        dateMarkers: cropBoardDateMarkers,
      }),
      costBaseValue: useCostBase,
      productionBaseValue: useProductionBase,
    };
  }, [actualCosts, budgetCosts, costBase, cropBoardDateMarkers, cropBoards, derivativeStandardVolumeGetter, derivatives, filteredActualCosts, filteredDerivatives, filteredPhysicalSales, frequency, physicalPayments, physicalSales, productionBase, usdBrlRate]);

  return (
    <section className="hedge-dashboard-shell">
      <div className="hedge-dashboard-toolbar">
        <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="hedge-chart-select">
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensal</option>
        </select>
        <button
          type="button"
          className={`hedge-toolbar-btn${hasSimulationValues ? " hedge-toolbar-btn--active" : ""}`}
          onClick={() => {
            if (hasSimulationValues) {
              resetSimulation();
              return;
            }
            setShowSimulationBox((current) => !current);
          }}
        >
          {hasSimulationValues ? "Limpar simulação" : "Simular nova operação"}
        </button>
        <button
          type="button"
          className="hedge-toolbar-btn hedge-toolbar-btn--primary"
          onClick={() => setShowPolicyEditor(true)}
        >
          Editar Política
        </button>
      </div>
      {showSimulationBox ? (
        <div className="hedge-simulation-card">
          <div className="hedge-simulation-grid">
            <label className="hedge-simulation-field">
              <span>Volume (scs)</span>
              <input
                className="form-control"
                value={simulationVolume}
                onChange={(event) => setSimulationVolume(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="hedge-simulation-field">
              <span>Valor total</span>
              <input
                className="form-control"
                value={simulationValue}
                onChange={(event) => setSimulationValue(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="hedge-simulation-field">
              <span>Moeda</span>
              <select className="form-select" value={simulationCurrency} onChange={(event) => setSimulationCurrency(event.target.value)}>
                <option value="BRL">R$</option>
                <option value="USD">US$</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
      <section className="hedge-dashboard-grid">
        {costChartNode}
        {productionChartMounted ? productionChartNode : <HedgePolicyChartPlaceholder title="Gráfico 2 — Hedge produção liquida (sc)" />}
      </section>
      <div className="hedge-shared-slider-wrap">
        {sharedSliderNode}
      </div>
      {focusedChart ? (
        <div
          className="hedge-fullscreen-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setFocusedChart(null); }}
        >
          <div className="hedge-fullscreen-modal">
            <button type="button" className="component-popup-close hedge-fullscreen-close" onClick={() => setFocusedChart(null)} aria-label="Fechar gráfico">×</button>
            <div className="hedge-fullscreen-body">
              <div className="hedge-fullscreen-chart-area">
                {focusedChart === "cost" ? costChartNode : productionChartNode}
              </div>
              <div className="hedge-fullscreen-side">
                <div className="hedge-focus-side-panels">
                  {focusedSummaryProps ? <HedgeSummaryGaugeCards {...focusedSummaryProps} /> : null}
                  {focusedStatusSummaryProps ? <HedgeStatusSummaryCard {...focusedStatusSummaryProps} /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showPolicyEditor ? (
        <HedgePolicyEditorModal
          policies={filteredPolicies}
          buildPreviewChartStates={buildPreviewChartStates}
          optionGroups={options.groups || []}
          optionSubgroups={options.subgroups || []}
          optionCrops={[...(options.cropBoardCrops || []), ...(options.crops || [])]}
          optionSeasons={[...(options.cropBoardSeasons || []), ...(options.seasons || [])]}
          initialFilter={{
            cultura: dashboardFilter?.cultura?.[0] ? Number(dashboardFilter.cultura[0]) : null,
            safra: dashboardFilter?.safra?.[0] ? Number(dashboardFilter.safra[0]) : null,
            grupo: dashboardFilter?.grupo?.[0] ? Number(dashboardFilter.grupo[0]) : null,
            subgrupo: dashboardFilter?.subgrupo?.[0] ? Number(dashboardFilter.subgrupo[0]) : null,
          }}
          onClose={() => setShowPolicyEditor(false)}
          onSaved={() => {
            setShowPolicyEditor(false);
            resourceService.listAll("hedge-policies").then((data) => setPolicies(data || []));
          }}
        />
      ) : null}
    </section>
  );
}

const CURRENCY_HEDGE_COLORS = {
  exposure: "#ff6b35",
  saleDerivatives: "#58b3cf",
  purchaseDerivatives: "#ffc52e",
  commitments: "#64748b",
  physicalBrlEq: "#3f9440",
  physicalUsd: "#0b7a0a",
  balance: "#ff6b35",
  overhedge: "#ff0000",
};

let currencyExposureSessionDraft = null;
let currencyExposureSessionDirtyFields = {};
let currencyExposureProductionOverride = null;
let currencyExposureProductionDirty = false;

const buildCurrencyExposureDraftFromModel = (model) => ({
  compromissosUsd: formatInputInt(model.compromissosUsd),
  volumeVendR: formatInputInt(model.volumeVendR),
  precoMedioBRL: formatCurrency2(model.precoMedioBRL),
  dolarMedioVendas: formatInput4(model.dolarMedioVendas),
  volumeVendUSD: formatInputInt(model.volumeVendUSD),
  precoMedioUSD: formatCurrency2(model.precoMedioUSD),
  cotacaoMtmUSD: formatCurrency2(model.cotacaoMtmUSD),
  cotacaoMtmBRL: formatCurrency2(model.cotacaoMtmBRL),
  compraPutDolar: formatInputInt(model.compraPutDolar),
  vendaNdfDolar: formatInputInt(model.vendaNdfDolar),
  compraCallDolar: formatInputInt(model.compraCallDolar),
  compraNdfDolar: formatInputInt(model.compraNdfDolar),
});

const buildMergedCurrencyExposureDraft = (model) => {
  const baseDraft = buildCurrencyExposureDraftFromModel(model);
  if (!currencyExposureSessionDraft) {
    return baseDraft;
  }
  return Object.fromEntries(
    Object.keys(baseDraft).map((key) => [
      key,
      currencyExposureSessionDirtyFields[key] ? currencyExposureSessionDraft[key] : baseDraft[key],
    ]),
  );
};

function CurrencyExposureDashboard({ dashboardFilter, filterOptions }) {
  const { matchesDashboardFilter, filter, updateFilter } = useDashboardFilter();
  const [cropBoards, setCropBoards] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [physicalQuotes, setPhysicalQuotes] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [popupContent, setPopupContent] = useState(null);
  const [segmentTooltip, setSegmentTooltip] = useState(null);
  const [draft, setDraft] = useState(currencyExposureSessionDraft);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("crop-boards").catch(() => []),
      resourceService.listAll("physical-payments").catch(() => []),
      resourceService.listAll("cash-payments").catch(() => []),
      resourceService.listAll("physical-sales").catch(() => []),
      resourceService.listAll("derivative-operations").catch(() => []),
      resourceService.listAll("physical-quotes").catch(() => []),
    ]).then(([cropBoardResponse, physicalPaymentsResponse, cashPaymentsResponse, physicalSalesResponse, derivativesResponse, quotesResponse]) => {
      if (!isMounted) return;
      setCropBoards(cropBoardResponse || []);
      setPhysicalPayments(physicalPaymentsResponse || []);
      setCashPayments(cashPaymentsResponse || []);
      setPhysicalSales(physicalSalesResponse || []);
      setDerivatives(derivativesResponse || []);
      setPhysicalQuotes(quotesResponse || []);
      setDataReady(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedCropLabels = useMemo(() => {
    const selectedIds = new Set((dashboardFilter?.cultura || []).map(String));
    return (filterOptions?.crops || [])
      .filter((item) => selectedIds.has(String(item.id)))
      .map((item) => normalizeText(item.ativo || item.cultura));
  }, [dashboardFilter?.cultura, filterOptions?.crops]);

  const selectedCultureValue = Array.isArray(filter?.cultura) && filter.cultura.length ? String(filter.cultura[0]) : "";
  const selectedSeasonValue = Array.isArray(filter?.safra) && filter.safra.length ? String(filter.safra[0]) : "";

  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter, matchesDashboardFilter],
  );

  const filteredPhysicalPayments = useMemo(
    () =>
      physicalPayments.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: ["fazer_frente_com"],
        }),
      ),
    [dashboardFilter, physicalPayments],
  );

  const filteredCashPayments = useMemo(
    () =>
      cashPayments.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: ["fazer_frente_com"],
          seasonKeys: ["safra"],
        }),
      ),
    [cashPayments, dashboardFilter],
  );

  const filteredPhysicalSales = useMemo(
    () => physicalSales.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, matchesDashboardFilter, physicalSales],
  );

  const filteredDerivatives = useMemo(
    () =>
      derivatives.filter((item) => {
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: DERIVATIVE_CULTURE_KEYS,
        });
      }),
    [dashboardFilter, derivatives],
  );

  const filteredPhysicalQuotes = useMemo(
    () =>
      physicalQuotes.filter((item) => {
        const selectedSeasons = Array.isArray(dashboardFilter?.safra) ? dashboardFilter.safra.map(String) : [];
        const quoteSeasonId =
          item?.safra && typeof item.safra === "object" && item.safra.id != null
            ? String(item.safra.id)
            : item?.safra != null
              ? String(item.safra)
              : "";
        const seasonMatches = !selectedSeasons.length || (quoteSeasonId && selectedSeasons.includes(quoteSeasonId));

        const cultureMatches =
          !selectedCropLabels.length ||
          selectedCropLabels.some((label) => normalizeText(item.cultura_texto).includes(label));

        return seasonMatches && cultureMatches;
      }),
    [dashboardFilter, physicalQuotes, selectedCropLabels],
  );

  const baseModel = useMemo(() => {
    const hasSeasonFilter = Array.isArray(dashboardFilter?.safra) && dashboardFilter.safra.length > 0;
    const volumePgtoFisico = filteredPhysicalPayments.reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0);
    const productionTotal = filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0);
    const producaoLiquida = Math.max(productionTotal - volumePgtoFisico, 0);

    const compromissosUsd = filteredCashPayments
      .filter((item) => isUsdCurrency(item.moeda))
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? item.volume ?? 0)), 0);

    const salesInBrl = filteredPhysicalSales.filter((item) => !isUsdCurrency(item.moeda_contrato));
    const salesInUsd = filteredPhysicalSales.filter((item) => isUsdCurrency(item.moeda_contrato));

    const volumeVendR = salesInBrl.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)), 0);
    const precoMedioBRL =
      volumeVendR > 0
        ? salesInBrl.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0), 0) / volumeVendR
        : 0;
    const dolarMedioVendas =
      volumeVendR > 0
        ? salesInBrl.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)) * Number(item.dolar_de_venda || 0), 0) / volumeVendR
        : 0;

    const volumeVendUSD = salesInUsd.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)), 0);
    const precoMedioUSD =
      volumeVendUSD > 0
        ? salesInUsd.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0), 0) / volumeVendUSD
        : 0;

    const usdQuoteItems = filteredPhysicalQuotes.filter((item) => isUsdCurrency(item.moeda_unidade));
    const brlQuoteItems = filteredPhysicalQuotes.filter((item) => normalizeText(item.moeda_unidade) === "r$/sc");

    const getQuoteValue = (items) => {
      if (!items.length) return 0;

      if (!hasSeasonFilter) {
        const values = items.map((item) => Number(item.cotacao || 0)).filter((value) => Number.isFinite(value));
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      }

      const latest = items.reduce((best, item) => {
        const currentDate = parseDashboardDate(item.data_report || item.data_pgto || item.created_at);
        if (!currentDate) return best;
        if (!best || currentDate > best.date) {
          return { value: Number(item.cotacao || 0), date: currentDate };
        }
        return best;
      }, null);

      return latest?.value || 0;
    };

    const cotacaoMtmUSD = getQuoteValue(usdQuoteItems);
    const cotacaoMtmBRL = getQuoteValue(brlQuoteItems);

    const currencyDerivatives = filteredDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "moeda");
    const compraPutDolar = currencyDerivatives
      .filter((item) => normalizeText(item.grupo_montagem) === "compra" && normalizeText(item.tipo_derivativo) === "put")
      .reduce((sum, item) => sum + Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)), 0);
    const vendaNdfDolar = currencyDerivatives
      .filter((item) => normalizeText(item.grupo_montagem) === "venda" && normalizeText(item.tipo_derivativo) === "ndf")
      .reduce((sum, item) => sum + Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)), 0);
    const compraCallDolar = currencyDerivatives
      .filter((item) => normalizeText(item.grupo_montagem) === "compra" && normalizeText(item.tipo_derivativo) === "call")
      .reduce((sum, item) => sum + Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)), 0);
    const compraNdfDolar = currencyDerivatives
      .filter((item) => normalizeText(item.grupo_montagem) === "compra" && normalizeText(item.tipo_derivativo) === "ndf")
      .reduce((sum, item) => sum + Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)), 0);

    const vendaFisicoEqBRL = dolarMedioVendas > 0 ? (volumeVendR * precoMedioBRL) / dolarMedioVendas : 0;
    const vendaFisicoUSD = volumeVendUSD * precoMedioUSD;
    const volVendTotal = volumeVendR + volumeVendUSD;
    const exposicao = vendaFisicoEqBRL + vendaFisicoUSD + (producaoLiquida - volVendTotal) * cotacaoMtmUSD;
    const vendaDeriv = vendaNdfDolar + compraPutDolar;
    const compraDerivNeg = -(compraNdfDolar + compraCallDolar);
    const hedgeRealizado = vendaDeriv + compromissosUsd + vendaFisicoEqBRL + vendaFisicoUSD + compraDerivNeg;
    const saldo = Math.max(exposicao - hedgeRealizado, 0);
    const overhedge = Math.max(hedgeRealizado - exposicao, 0);

    return {
      producaoLiquida,
      volumePgtoFisico,
      compromissosUsd,
      volumeVendR,
      precoMedioBRL,
      dolarMedioVendas,
      volumeVendUSD,
      precoMedioUSD,
      cotacaoMtmUSD,
      cotacaoMtmBRL,
      compraPutDolar,
      vendaNdfDolar,
      compraCallDolar,
      compraNdfDolar,
      vendaFisicoEqBRL,
      vendaFisicoUSD,
      exposicao,
      vendaDeriv,
      compraDerivNeg,
      saldo,
      overhedge,
    };
  }, [dashboardFilter?.safra, filteredCashPayments, filteredCropBoards, filteredDerivatives, filteredPhysicalPayments, filteredPhysicalQuotes, filteredPhysicalSales]);

  useEffect(() => {
    if (!dataReady) {
      return;
    }
    if (!currencyExposureProductionDirty) {
      currencyExposureProductionOverride = formatInputInt(baseModel.producaoLiquida);
    }
    const nextDraft = buildMergedCurrencyExposureDraft(baseModel);
    currencyExposureSessionDraft = nextDraft;
    setDraft(nextDraft);
  }, [baseModel, dataReady]);

  const updateDraft = (field, value) => {
    setDraft((current) => {
      const next = { ...(current || buildCurrencyExposureDraftFromModel(baseModel)), [field]: value };
      currencyExposureSessionDraft = next;
      currencyExposureSessionDirtyFields = { ...currencyExposureSessionDirtyFields, [field]: true };
      return next;
    });
  };

  const formatDraftField = (field, decimals) => {
    setDraft((current) => {
      if (!current) return current;
      const parsed = parseLocalizedInputNumber(current[field]);
      const next = {
        ...current,
        [field]:
          parsed == null
            ? ""
            : Number(parsed).toLocaleString("pt-BR", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              }),
      };
      currencyExposureSessionDraft = next;
      currencyExposureSessionDirtyFields = { ...currencyExposureSessionDirtyFields, [field]: true };
      return next;
    });
  };

  const productionInputValue = currencyExposureProductionOverride ?? formatInputInt(baseModel.producaoLiquida);

  const handleProductionInputChange = (value) => {
    currencyExposureProductionOverride = value;
    currencyExposureProductionDirty = true;
    setDraft((current) => (current ? { ...current } : buildCurrencyExposureDraftFromModel(baseModel)));
  };

  const handleProductionInputBlur = () => {
    const parsed = parseLocalizedInputNumber(currencyExposureProductionOverride);
    currencyExposureProductionOverride =
      parsed == null
        ? ""
        : Number(parsed).toLocaleString("pt-BR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          });
    currencyExposureProductionDirty = true;
    setDraft((current) => (current ? { ...current } : buildCurrencyExposureDraftFromModel(baseModel)));
  };

  const model = useMemo(() => {
    const source = draft || buildCurrencyExposureDraftFromModel(baseModel);
    const producaoLiquida = parseLocalizedInputNumber(currencyExposureProductionOverride ?? formatInputInt(baseModel.producaoLiquida)) || 0;
    const compromissosUsd = parseLocalizedInputNumber(source.compromissosUsd) || 0;
    const volumeVendR = parseLocalizedInputNumber(source.volumeVendR) || 0;
    const precoMedioBRL = parseLocalizedInputNumber(source.precoMedioBRL) || 0;
    const dolarMedioVendas = parseLocalizedInputNumber(source.dolarMedioVendas) || 0;
    const volumeVendUSD = parseLocalizedInputNumber(source.volumeVendUSD) || 0;
    const precoMedioUSD = parseLocalizedInputNumber(source.precoMedioUSD) || 0;
    const cotacaoMtmUSD = baseModel.cotacaoMtmUSD || 0;
    const cotacaoMtmBRL = baseModel.cotacaoMtmBRL || 0;
    const compraPutDolar = parseLocalizedInputNumber(source.compraPutDolar) || 0;
    const vendaNdfDolar = parseLocalizedInputNumber(source.vendaNdfDolar) || 0;
    const compraCallDolar = parseLocalizedInputNumber(source.compraCallDolar) || 0;
    const compraNdfDolar = parseLocalizedInputNumber(source.compraNdfDolar) || 0;

    const vendaFisicoEqBRL = dolarMedioVendas > 0 ? (volumeVendR * precoMedioBRL) / dolarMedioVendas : 0;
    const vendaFisicoUSD = volumeVendUSD * precoMedioUSD;
    const volVendTotal = volumeVendR + volumeVendUSD;
    const exposicao = vendaFisicoEqBRL + vendaFisicoUSD + (producaoLiquida - volVendTotal) * cotacaoMtmUSD;
    const vendaDeriv = vendaNdfDolar + compraPutDolar;
    const compraDerivNeg = -(compraNdfDolar + compraCallDolar);
    const hedgeRealizado = vendaDeriv + compromissosUsd + vendaFisicoEqBRL + vendaFisicoUSD + compraDerivNeg;
    const saldo = Math.max(exposicao - hedgeRealizado, 0);
    const overhedge = Math.max(hedgeRealizado - exposicao, 0);

    return {
      producaoLiquida,
      compromissosUsd,
      volumeVendR,
      precoMedioBRL,
      dolarMedioVendas,
      volumeVendUSD,
      precoMedioUSD,
      cotacaoMtmUSD,
      cotacaoMtmBRL,
      compraPutDolar,
      vendaNdfDolar,
      compraCallDolar,
      compraNdfDolar,
      vendaFisicoEqBRL,
      vendaFisicoUSD,
      exposicao,
      vendaDeriv,
      compraDerivNeg,
      saldo,
      overhedge,
    };
  }, [baseModel, draft]);

  const producaoNaoVendida = model.producaoLiquida - model.volumeVendR - model.volumeVendUSD;

  const openSegmentPopup = (segmentKey) => {
    if (segmentKey === "exposure") {
      setPopupContent({
        title: "Exposição Cambial Total",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.exposicao)}</p>
            <p><strong>Refere-se a:</strong> soma de 1, 2 e 3, onde a produção líquida total já considera quadro safra menos Pgtos Físico.</p>
            <p><strong>1:</strong> ({formatNumber0(model.volumeVendR)} scs × R$ {formatCurrency2(model.precoMedioBRL)}/sc) ÷ {formatInput4(model.dolarMedioVendas)} = US$ {formatCurrency2(model.vendaFisicoEqBRL)}</p>
            <p><strong>2:</strong> {formatNumber0(model.volumeVendUSD)} scs × US$ {formatCurrency2(model.precoMedioUSD)}/sc = US$ {formatCurrency2(model.vendaFisicoUSD)}</p>
            <p><strong>Produção líquida total:</strong> {formatNumber0(model.producaoLiquida)} scs</p>
            <p><strong>3:</strong> ({formatNumber0(model.producaoLiquida)} - {formatNumber0(model.volumeVendUSD)} - {formatNumber0(model.volumeVendR)}) × US$ {formatCurrency2(model.cotacaoMtmUSD)}/sc = US$ {formatCurrency2(producaoNaoVendida * model.cotacaoMtmUSD)}</p>
            <p><strong>Total:</strong> US$ {formatCurrency2(model.vendaFisicoEqBRL)} + US$ {formatCurrency2(model.vendaFisicoUSD)} + US$ {formatCurrency2(producaoNaoVendida * model.cotacaoMtmUSD)} = US$ {formatCurrency2(model.exposicao)}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "purchaseDerivatives") {
      setPopupContent({
        title: "Compra de Dólar via Derivativos",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(Math.abs(model.compraDerivNeg))}</p>
            <p><strong>Refere-se a:</strong> proteção comprada em dólar, formada por compra de call e compra de dólar via NDF.</p>
            <p><strong>Cálculo:</strong> US$ {formatCurrency2(model.compraCallDolar)} + US$ {formatCurrency2(model.compraNdfDolar)} = US$ {formatCurrency2(Math.abs(model.compraDerivNeg))}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "saleDerivatives") {
      setPopupContent({
        title: "Venda de Dólar via Derivativos",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.vendaDeriv)}</p>
            <p><strong>Refere-se a:</strong> proteção vendida em dólar, formada por venda de NDF e compra de put.</p>
            <p><strong>Cálculo:</strong> US$ {formatCurrency2(model.vendaNdfDolar)} + US$ {formatCurrency2(model.compraPutDolar)} = US$ {formatCurrency2(model.vendaDeriv)}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "commitments") {
      setPopupContent({
        title: "Compromissos em US$",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.compromissosUsd)}</p>
            <p><strong>Refere-se a:</strong> pagamentos e compromissos já assumidos em dólar que funcionam como hedge natural.</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "physicalBrlEq") {
      setPopupContent({
        title: "Venda Física em R$ equivalente em US$",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.vendaFisicoEqBRL)}</p>
            <p><strong>Refere-se a:</strong> vendas físicas fechadas em reais convertidas para dólar pelo dólar médio de venda.</p>
            <p><strong>Cálculo:</strong> ({formatNumber0(model.volumeVendR)} scs × R$ {formatCurrency2(model.precoMedioBRL)}/sc) ÷ {formatInput4(model.dolarMedioVendas)} = US$ {formatCurrency2(model.vendaFisicoEqBRL)}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "physicalUsd") {
      setPopupContent({
        title: "Venda Física em U$",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.vendaFisicoUSD)}</p>
            <p><strong>Refere-se a:</strong> vendas físicas já contratadas diretamente em dólar.</p>
            <p><strong>Cálculo:</strong> {formatNumber0(model.volumeVendUSD)} scs × US$ {formatCurrency2(model.precoMedioUSD)}/sc = US$ {formatCurrency2(model.vendaFisicoUSD)}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "balance") {
      setPopupContent({
        title: "Saldo em Aberto",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.saldo)}</p>
            <p><strong>Refere-se a:</strong> parcela da exposição cambial total ainda não coberta pelo hedge realizado.</p>
            <p><strong>Cálculo:</strong> max(US$ {formatCurrency2(model.exposicao)} - US$ {formatCurrency2(model.vendaDeriv + model.compromissosUsd + model.vendaFisicoEqBRL + model.vendaFisicoUSD + model.compraDerivNeg)}, 0) = US$ {formatCurrency2(model.saldo)}</p>
          </>
        ),
      });
      return;
    }
    if (segmentKey === "overhedge") {
      setPopupContent({
        title: "Overhedge",
        body: (
          <>
            <p><strong>Valor:</strong> US$ {formatCurrency2(model.overhedge)}</p>
            <p><strong>Refere-se a:</strong> excesso de hedge em relação à exposição cambial total.</p>
            <p><strong>Cálculo:</strong> max(US$ {formatCurrency2(model.vendaDeriv + model.compromissosUsd + model.vendaFisicoEqBRL + model.vendaFisicoUSD + model.compraDerivNeg)} - US$ {formatCurrency2(model.exposicao)}, 0) = US$ {formatCurrency2(model.overhedge)}</p>
          </>
        ),
      });
    }
  };

  const showSegmentTooltip = (event, segment) => {
    const plot = event.currentTarget.closest(".currency-hedge-plot");
    if (!plot) return;
    const plotRect = plot.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    setSegmentTooltip({
      title: segment.label,
      value: `US$ ${formatCurrency2(Math.abs(segment.amount ?? 0))}`,
      hint: segment.tooltipHint,
      left: rect.left - plotRect.left + rect.width / 2,
      top: rect.top - plotRect.top - 10,
    });
  };

  const chartRows = useMemo(() => {
    const exposureMi = model.exposicao / 1_000_000;
    const saleDerivativesMi = model.vendaDeriv / 1_000_000;
    const purchaseDerivativesMi = model.compraDerivNeg / 1_000_000;
    const commitmentsMi = model.compromissosUsd / 1_000_000;
    const physicalBrlEqMi = model.vendaFisicoEqBRL / 1_000_000;
    const physicalUsdMi = model.vendaFisicoUSD / 1_000_000;
    const balanceMi = model.saldo / 1_000_000;
    const overhedgeMi = model.overhedge / 1_000_000;

    return [
      {
        label: "Exposição Cambial Total",
        segments: [
          {
            key: "exposure",
            label: "Exposição Cambial Total",
            value: exposureMi,
            amount: model.exposicao,
            color: CURRENCY_HEDGE_COLORS.exposure,
            text: formatMi3(exposureMi),
            tooltipHint: "Exposição cambial total da posição filtrada.",
            onClick: () => openSegmentPopup("exposure"),
          },
        ],
      },
      {
        label: "Hedge Cambial Realizado",
        segments: [
          { key: "purchaseDerivatives", label: "Compra de Dólar via Derivativos", value: purchaseDerivativesMi, amount: Math.abs(model.compraDerivNeg), color: CURRENCY_HEDGE_COLORS.purchaseDerivatives, text: formatMi3(Math.abs(purchaseDerivativesMi)), tooltipHint: "Compra de call + compra de dólar via NDF.", onClick: () => openSegmentPopup("purchaseDerivatives") },
          { key: "saleDerivatives", label: "Venda de Dólar via Derivativos", value: saleDerivativesMi, amount: model.vendaDeriv, color: CURRENCY_HEDGE_COLORS.saleDerivatives, text: formatMi3(saleDerivativesMi), tooltipHint: "Venda de NDF + compra de put.", onClick: () => openSegmentPopup("saleDerivatives") },
          { key: "commitments", label: "Compromissos em US$", value: commitmentsMi, amount: model.compromissosUsd, color: CURRENCY_HEDGE_COLORS.commitments, text: formatMi3(commitmentsMi), tooltipHint: "Hedge natural via compromissos em dólar.", onClick: () => openSegmentPopup("commitments") },
          { key: "physicalBrlEq", label: "Venda Física em R$ (eq. US$)", value: physicalBrlEqMi, amount: model.vendaFisicoEqBRL, color: CURRENCY_HEDGE_COLORS.physicalBrlEq, text: formatMi3(physicalBrlEqMi), tooltipHint: "Venda física em reais convertida para dólar.", onClick: () => openSegmentPopup("physicalBrlEq") },
          { key: "physicalUsd", label: "Venda Física em U$", value: physicalUsdMi, amount: model.vendaFisicoUSD, color: CURRENCY_HEDGE_COLORS.physicalUsd, text: formatMi3(physicalUsdMi), tooltipHint: "Venda física já dolarizada.", onClick: () => openSegmentPopup("physicalUsd") },
          { key: "balance", label: "Saldo", value: balanceMi, amount: model.saldo, color: CURRENCY_HEDGE_COLORS.balance, text: `Saldo: ${formatMi3(balanceMi)}`, tooltipHint: "Parcela ainda não coberta pelo hedge.", onClick: () => openSegmentPopup("balance") },
        ].filter((item) => Math.abs(item.value) > 0.000001),
      },
      {
        label: "* Overhedge *",
        segments: [
          {
            key: "overhedge",
            label: "Overhedge",
            value: overhedgeMi,
            amount: model.overhedge,
            color: CURRENCY_HEDGE_COLORS.overhedge,
            text: formatMi3(overhedgeMi),
            tooltipHint: "Excesso de hedge sobre a exposição total.",
            onClick: () => openSegmentPopup("overhedge"),
          },
        ].filter((item) => Math.abs(item.value) > 0.000001),
      },
    ];
  }, [model]);

  const axis = useMemo(() => {
    const positiveExtent = Math.max(
      0,
      ...chartRows.map((row) =>
        row.segments.reduce((sum, segment) => sum + (segment.value > 0 ? segment.value : 0), 0),
      ),
    );
    const negativeExtent = Math.max(
      0,
      ...chartRows.map((row) =>
        Math.abs(row.segments.reduce((sum, segment) => sum + (segment.value < 0 ? segment.value : 0), 0)),
      ),
    );
    const positivePad = Math.max(0.08, positiveExtent * 0.12);
    const negativePad = negativeExtent > 0 ? Math.max(0.04, negativeExtent * 0.12) : 0;
    const minValue = negativeExtent > 0 ? -(negativeExtent + negativePad) : 0;
    const maxValue = Math.max(positiveExtent + positivePad, 0.12);
    const zeroPercent = ((0 - minValue) / Math.max(maxValue - minValue, 1)) * 100;
    const ticks = Array.from({ length: 7 }, (_, index) => {
      const value = minValue + ((maxValue - minValue) / 6) * index;
      return { value, left: `${(index / 6) * 100}%` };
    });
    return { minValue, maxValue, zeroPercent, ticks };
  }, [chartRows]);

  const getSegmentStyle = (segment) => {
    const range = Math.max(axis.maxValue - axis.minValue, 1);
    const size = (Math.abs(segment.value) / range) * 100;
    if (segment.value >= 0) {
      const left = ((0 - axis.minValue) / range) * 100;
      const previousPositive = 0;
      return { left: `${left + previousPositive}%`, width: `${size}%`, background: segment.color };
    }
    const right = ((0 - axis.minValue) / range) * 100;
    return { left: `${right - size}%`, width: `${size}%`, background: segment.color };
  };

  return (
    <section className="currency-hedge-shell">
      <div className="currency-hedge-filterbar">
        <label className="currency-hedge-filterfield">
          <span>Ativo</span>
          <select className="form-select" value={selectedCultureValue} onChange={(event) => updateFilter("cultura", event.target.value ? [event.target.value] : [])}>
            <option value="">Todas</option>
            {(filterOptions?.cropBoardCrops || filterOptions?.crops || []).map((item) => (
              <option key={`currency-crop-${item.id}`} value={String(item.id)}>
                {item.ativo || item.cultura || item.nome || item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="currency-hedge-filterfield">
          <span>Safra</span>
          <select className="form-select" value={selectedSeasonValue} onChange={(event) => updateFilter("safra", event.target.value ? [event.target.value] : [])}>
            <option value="">Todas</option>
            {(filterOptions?.cropBoardSeasons || filterOptions?.seasons || []).map((item) => (
              <option key={`currency-season-${item.id}`} value={String(item.id)}>
                {item.safra || item.nome || item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="currency-hedge-chart card summary-insight-card">
        <SummaryInsightButton
          title="Exposição cambial"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `A exposição cambial total mostrada no primeiro bloco é de US$ ${formatCurrency2(model.exposicao)}. O hedge realizado considera venda de derivativos, compromissos em dólar e vendas físicas convertidas, restando um saldo em aberto de US$ ${formatCurrency2(model.saldo)}.`,
                `Quando existe overhedge, o excesso aparece destacado separadamente. Cada barra mostra o valor financeiro em milhões de dólares e pode ser clicada para abrir o detalhamento do cálculo.`,
              ]}
            />
          }
        />
        <div className="currency-hedge-plot">
          <div className="currency-hedge-axis-zero" style={{ left: `${axis.zeroPercent}%` }} />
          {chartRows.map((row) => {
            let positiveCursor = axis.zeroPercent;
            let negativeCursor = axis.zeroPercent;
            return (
              <div key={row.label} className="currency-hedge-row">
                <div className="currency-hedge-row-label">{row.label}</div>
                <div className="currency-hedge-row-track">
                  <div className="currency-hedge-row-grid" />
                  {row.segments.map((segment) => {
                    const range = Math.max(axis.maxValue - axis.minValue, 1);
                    const size = (Math.abs(segment.value) / range) * 100;
                    const left =
                      segment.value >= 0
                        ? positiveCursor
                        : negativeCursor - size;
                    if (segment.value >= 0) {
                      positiveCursor += size;
                    } else {
                      negativeCursor -= size;
                    }
                    return (
                      <button
                        key={segment.key}
                        type="button"
                        className={`currency-hedge-segment${segment.onClick ? " is-clickable" : ""}`}
                        style={{ left: `${left}%`, width: `${size}%`, background: segment.color }}
                        onClick={segment.onClick || undefined}
                        onMouseEnter={(event) => showSegmentTooltip(event, segment)}
                        onMouseLeave={() => setSegmentTooltip(null)}
                        onFocus={(event) => showSegmentTooltip(event, segment)}
                        onBlur={() => setSegmentTooltip(null)}
                      >
                        <span>{segment.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="currency-hedge-ticks">
            {axis.ticks.map((tick, index) => (
              <span key={`${tick.value}-${index}`} style={{ left: tick.left }}>
                {formatMi3(tick.value)}
              </span>
            ))}
          </div>
          {segmentTooltip ? (
            <div
              className="currency-hedge-tooltip"
              style={{ left: `${segmentTooltip.left}px`, top: `${segmentTooltip.top}px` }}
            >
              <strong>{segmentTooltip.title}</strong>
              <span>{segmentTooltip.value}</span>
              <small>{segmentTooltip.hint}</small>
            </div>
          ) : null}
        </div>
      </div>

      <div className="currency-hedge-controls">
        <article className="currency-hedge-col currency-hedge-col--exposure">
          <div className="currency-hedge-col-title">Produção Líquida Total (scs)</div>
          <div className="currency-hedge-field">
            <input
              className="form-control currency-hedge-input currency-hedge-input--exposure"
              value={productionInputValue}
              onChange={(event) => handleProductionInputChange(event.target.value)}
              onBlur={handleProductionInputBlur}
            />
          </div>
          <div className="currency-hedge-col-title">Compromissos em US$ (Hedge natural)</div>
          <div className="currency-hedge-field">
            <input
              className="form-control currency-hedge-input currency-hedge-input--commitments"
              value={draft?.compromissosUsd ?? ""}
              onChange={(event) => updateDraft("compromissosUsd", event.target.value)}
              onBlur={() => formatDraftField("compromissosUsd", 0)}
            />
          </div>
        </article>
        <article className="currency-hedge-col currency-hedge-col--physical-brl">
          <div className="currency-hedge-col-title">Vendas Físico em R$</div>
          <div className="currency-hedge-field">
            <label>Volume vendido em R$ (scs)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--physical-brl"
              value={draft?.volumeVendR ?? ""}
              onChange={(event) => updateDraft("volumeVendR", event.target.value)}
              onBlur={() => formatDraftField("volumeVendR", 0)}
            />
          </div>
          <div className="currency-hedge-row2">
            <div className="currency-hedge-field">
              <label>Preço médio (R$/sc)</label>
              <input
                className="form-control currency-hedge-input currency-hedge-input--physical-brl"
                value={draft?.precoMedioBRL ?? ""}
                onChange={(event) => updateDraft("precoMedioBRL", event.target.value)}
                onBlur={() => formatDraftField("precoMedioBRL", 2)}
              />
            </div>
            <div className="currency-hedge-field">
              <label>Dólar médio de venda</label>
              <input
                className="form-control currency-hedge-input currency-hedge-input--physical-brl"
                value={draft?.dolarMedioVendas ?? ""}
                onChange={(event) => updateDraft("dolarMedioVendas", event.target.value)}
                onBlur={() => formatDraftField("dolarMedioVendas", 4)}
              />
            </div>
          </div>
        </article>
        <article className="currency-hedge-col currency-hedge-col--physical-usd">
          <div className="currency-hedge-col-title">Vendas Físico em U$</div>
          <div className="currency-hedge-field">
            <label>Volume vendido em U$ (scs)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--physical-usd"
              value={draft?.volumeVendUSD ?? ""}
              onChange={(event) => updateDraft("volumeVendUSD", event.target.value)}
              onBlur={() => formatDraftField("volumeVendUSD", 0)}
            />
          </div>
          <div className="currency-hedge-field">
            <label>Preço médio (U$/sc)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--physical-usd"
              value={draft?.precoMedioUSD ?? ""}
              onChange={(event) => updateDraft("precoMedioUSD", event.target.value)}
              onBlur={() => formatDraftField("precoMedioUSD", 2)}
            />
          </div>
        </article>
        <article className="currency-hedge-col currency-hedge-col--mtm">
          <div className="currency-hedge-col-title">Cotação Físico MTM</div>
          <div className="currency-hedge-field">
            <label>Cotação MTM (U$/sc)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--exposure"
              value={formatCurrency2(baseModel.cotacaoMtmUSD)}
              readOnly
            />
          </div>
          <div className="currency-hedge-field">
            <label>Cotação MTM (R$/sc)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--exposure"
              value={formatCurrency2(baseModel.cotacaoMtmBRL)}
              readOnly
            />
          </div>
        </article>
        <article className="currency-hedge-col currency-hedge-col--downside">
          <div className="currency-hedge-col-title">Dólar: Proteção contra a baixa</div>
          <div className="currency-hedge-field">
            <label>Compra de Put (U$)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--purchase-derivatives"
              value={draft?.compraPutDolar ?? ""}
              onChange={(event) => updateDraft("compraPutDolar", event.target.value)}
              onBlur={() => formatDraftField("compraPutDolar", 0)}
            />
          </div>
          <div className="currency-hedge-field">
            <label>Venda de Dólar via NDF (U$)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--sale-derivatives"
              value={draft?.vendaNdfDolar ?? ""}
              onChange={(event) => updateDraft("vendaNdfDolar", event.target.value)}
              onBlur={() => formatDraftField("vendaNdfDolar", 0)}
            />
          </div>
        </article>
        <article className="currency-hedge-col currency-hedge-col--upside">
          <div className="currency-hedge-col-title">Dólar: Proteção contra a alta</div>
          <div className="currency-hedge-field">
            <label>Compra de Call (U$)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--purchase-derivatives"
              value={draft?.compraCallDolar ?? ""}
              onChange={(event) => updateDraft("compraCallDolar", event.target.value)}
              onBlur={() => formatDraftField("compraCallDolar", 0)}
            />
          </div>
          <div className="currency-hedge-field">
            <label>Compra de Dólar via NDF (U$)</label>
            <input
              className="form-control currency-hedge-input currency-hedge-input--purchase-derivatives"
              value={draft?.compraNdfDolar ?? ""}
              onChange={(event) => updateDraft("compraNdfDolar", event.target.value)}
              onBlur={() => formatDraftField("compraNdfDolar", 0)}
            />
          </div>
        </article>
      </div>

      {popupContent ? (
        <div className="currency-hedge-popup-backdrop" onClick={() => setPopupContent(null)}>
          <div className="currency-hedge-popup" onClick={(event) => event.stopPropagation()}>
            <div className="currency-hedge-popup-header">
              <strong>{popupContent.title}</strong>
              <button type="button" className="btn btn-secondary" onClick={() => setPopupContent(null)}>
                Fechar
              </button>
            </div>
            <div className="currency-hedge-popup-body">{popupContent.body}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const PRICE_COMPOSITION_COLORS = {
  physical: "#006400",
  mtm: "#ba8e23",
  openPositive: "#006400",
  openNegative: "#ff0000",
  closedPositive: "#90ee90",
  closedNegative: "#ff8da1",
  bolsa: "#f59e0b",
  cambio: "#2563eb",
};

const PRICE_COMPOSITION_STACK_PALETTES = {
  Bolsa: {
    open: ["#166534", "#15803d", "#0f766e", "#0b7a0a"],
    closed: ["#86efac", "#bbf7d0", "#99f6e4", "#d9f99d"],
  },
  Cambio: {
    open: ["#1d4ed8", "#2563eb", "#3730a3", "#0f766e"],
    closed: ["#93c5fd", "#bfdbfe", "#c7d2fe", "#fecdd3"],
  },
};

const sumPriceCompositionSegments = (segments = []) =>
  segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0);

const pickPriceCompositionColor = (classification, index, status) => {
  const paletteGroup = PRICE_COMPOSITION_STACK_PALETTES[classification] || PRICE_COMPOSITION_STACK_PALETTES.Bolsa;
  const palette = status === "Encerrado" ? paletteGroup.closed : paletteGroup.open;
  return palette[index % palette.length];
};

const PRICE_COMPOSITION_WATERFALL_COLORS = {
  positive: "#0b7a0a",
  positiveSoft: "#7ddf8a",
  negative: "#dc2626",
  negativeSoft: "#f59e9e",
};

const getSignedPriceCompositionColor = (value, tone = "solid") => {
  const numericValue = roundCurrencyDisplayValue(value);
  if (numericValue < 0) {
    return tone === "soft" ? PRICE_COMPOSITION_WATERFALL_COLORS.negativeSoft : PRICE_COMPOSITION_WATERFALL_COLORS.negative;
  }
  return tone === "soft" ? PRICE_COMPOSITION_WATERFALL_COLORS.positiveSoft : PRICE_COMPOSITION_WATERFALL_COLORS.positive;
};

function PriceCompositionVerticalChart({ title, bars, unitLabel, onSelectBar, valueFormatter = formatCurrency2 }) {
  const plotHeight = 278;
  const plotAreaHeight = plotHeight - 1;
  const labelSpace = 30;
  const containerHeight = plotHeight + labelSpace;
  const chartRef = useRef(null);
  const [tooltipState, setTooltipState] = useState(null);
  const normalizedBars = bars.map((bar) => {
    const segments = (bar.segments?.length ? bar.segments : [{ label: bar.label, value: bar.value, color: bar.color }]).map((segment) => ({
      ...segment,
      value: roundCurrencyDisplayValue(segment.value),
    }))
      .filter((segment) => segment.value !== 0);
    const positiveTotal = segments.filter((segment) => segment.value > 0).reduce((sum, segment) => sum + segment.value, 0);
    const negativeTotal = segments.filter((segment) => segment.value < 0).reduce((sum, segment) => sum + segment.value, 0);
    const totalValue = roundCurrencyDisplayValue(segments.reduce((sum, segment) => sum + segment.value, 0));
    return {
      ...bar,
      segments,
      positiveTotal,
      negativeTotal,
      totalValue,
    };
  });
  const maxPositive = Math.max(...normalizedBars.map((bar) => bar.positiveTotal), 0);
  const maxNegativeAbs = Math.max(...normalizedBars.map((bar) => Math.abs(bar.negativeTotal)), 0);
  const minValue = -maxNegativeAbs;
  const maxValue = Math.max(maxPositive, 0);
  const range = Math.max(maxValue - minValue, 1);
  const zeroY = ((maxValue - 0) / range) * plotAreaHeight;
  const tickValues = useMemo(() => {
    const rawStep = (maxValue - minValue) / 4 || 1;
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
    const normalized = rawStep / magnitude;
    const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const niceStep = niceFactor * magnitude;
    const start = Math.floor(minValue / niceStep) * niceStep;
    const end = Math.ceil(maxValue / niceStep) * niceStep;
    const ticks = [];
    for (let current = start; current <= end + niceStep / 2; current += niceStep) {
      ticks.push(Number(current.toFixed(10)));
    }
    if (!ticks.includes(0)) {
      ticks.push(0);
      ticks.sort((left, right) => right - left);
    } else {
      ticks.sort((left, right) => right - left);
    }
    return ticks;
  }, [maxValue, minValue]);
  const getVerticalPosition = (value) => Math.min(Math.max(((maxValue - value) / range) * plotAreaHeight, 0), plotAreaHeight);
  const formatTooltipValue = (value) => `${value >= 0 ? "" : "-"}${unitLabel} ${valueFormatter(Math.abs(value))}`;
  const updateTooltip = (event, bar) => {
    const chartRect = chartRef.current?.getBoundingClientRect();
    if (!chartRect) return;
    const targetRect = event.currentTarget.getBoundingClientRect();
    const rawX = (event.clientX || (targetRect.left + targetRect.right) / 2) - chartRect.left;
    const x = Math.min(Math.max(rawX, 72), chartRect.width - 72);
    setTooltipState({
      x,
      label: bar.label,
      total: formatTooltipValue(bar.totalValue),
      segments: bar.segments.map((segment) => ({
        label: segment.label,
        value: formatTooltipValue(segment.value),
        color: segment.color,
      })),
    });
  };
  const clearTooltip = () => setTooltipState(null);

  return (
    <article className="price-comp-pane">
      <div className="price-comp-vertical-chart" ref={chartRef}>
        {tooltipState ? (
          <div className="price-comp-tooltip" style={{ left: `${tooltipState.x}px` }} role="status" aria-live="polite">
            <div className="price-comp-tooltip-title">{tooltipState.label}</div>
            <div className="price-comp-tooltip-total">{tooltipState.total}</div>
            {tooltipState.segments.map((segment) => (
              <div key={`${tooltipState.label}-${segment.label}`} className="price-comp-tooltip-row">
                <span className="price-comp-tooltip-dot" style={{ background: segment.color }} />
                <span className="price-comp-tooltip-text">{segment.label}</span>
                <span className="price-comp-tooltip-value">{segment.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="price-comp-vertical-body">
          <div className="price-comp-top-spacer" />
          <div className="price-comp-column-totals" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
            {normalizedBars.map((bar) => (
              <div
                key={bar.label}
                className="price-comp-column-total"
                onMouseEnter={(event) => updateTooltip(event, bar)}
                onMouseMove={(event) => updateTooltip(event, bar)}
                onMouseLeave={clearTooltip}
              >
                {bar.totalValue >= 0 ? "" : "-"}
                {unitLabel} {valueFormatter(Math.abs(bar.totalValue))}
              </div>
            ))}
          </div>
          <div className="price-comp-y-axis" style={{ height: `${plotAreaHeight}px` }}>
            {tickValues.map((value) => (
              <div key={value} className="price-comp-y-tick" style={{ top: `${getVerticalPosition(value)}px` }}>
                {value < 0 ? "-" : ""}
                {unitLabel} {valueFormatter(Math.abs(value))}
              </div>
            ))}
          </div>
          <div className="price-comp-vertical-plot" style={{ height: `${containerHeight}px`, ["--price-comp-plot-height"]: `${plotAreaHeight}px` }}>
            <div className="price-comp-vertical-grid">
              {tickValues.map((value) => (
                <div key={value} className={`price-comp-grid-line${value === 0 ? " is-zero" : ""}`} style={{ top: `${getVerticalPosition(value)}px` }} />
              ))}
            </div>
            <div className="price-comp-vertical-columns" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
              {normalizedBars.map((bar) => {
                let positiveOffset = 0;
                let negativeOffset = 0;
                return (
                  <div
                    key={bar.label}
                    className="price-comp-column"
                    onMouseEnter={(event) => updateTooltip(event, bar)}
                    onMouseMove={(event) => updateTooltip(event, bar)}
                    onMouseLeave={clearTooltip}
                  >
                    <button
                      type="button"
                      className={`price-comp-column-track${onSelectBar ? " is-clickable" : ""}`}
                      style={{ height: `${plotAreaHeight}px` }}
                      onClick={() => onSelectBar?.(bar)}
                    >
                      {bar.segments.map((segment, index) => {
                        const isPositive = segment.value >= 0;
                        const barHeight = (Math.abs(segment.value) / range) * plotAreaHeight;
                        const heightPx = Math.max(barHeight, 6);
                        const style = {
                          height: `${heightPx}px`,
                          background: segment.color,
                        };
                        if (isPositive) {
                          style.bottom = `${plotAreaHeight - zeroY + positiveOffset}px`;
                          positiveOffset += heightPx;
                        } else {
                          style.top = `${zeroY + negativeOffset}px`;
                          negativeOffset += heightPx;
                        }
                        return (
                          <div
                            key={`${bar.label}-${segment.label}-${index}`}
                            className={`price-comp-column-segment ${isPositive ? "positive" : "negative"}`}
                            style={style}
                            title={`${segment.label}: ${valueFormatter(Math.abs(segment.value))}`}
                          />
                        );
                      })}
                    </button>
                    <div className="price-comp-column-label">{bar.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PriceCompositionVerticalEChart({ bars, unitLabel, onSelectBar, valueFormatter = formatCurrency2 }) {
  const isMobileViewport = useViewportMatch("(max-width: 640px)");
  const topLabelBarWidth = isMobileViewport ? "72%" : "58%";
  const normalizedBars = useMemo(
    () =>
      bars.map((bar) => {
        const segments = (bar.segments?.length ? bar.segments : [{ label: bar.label, value: bar.value, color: bar.color }])
          .map((segment) => ({
            ...segment,
            value: roundCurrencyDisplayValue(segment.value),
          }))
          .filter((segment) => segment.value !== 0);
        const totalValue = roundCurrencyDisplayValue(segments.reduce((sum, segment) => sum + segment.value, 0));
        return { ...bar, segments, totalValue };
      }),
    [bars],
  );
  const categories = normalizedBars.map((bar) => bar.label);
  const clickTargetData = useMemo(() => categories.map((_, index) => index), [categories]);
  const seriesDefs = normalizedBars.flatMap((bar) => bar.segments.map((segment) => segment.label));
  const uniqueSeries = [...new Set(seriesDefs)];
  const option = useMemo(
    () => ({
      animationDuration: 250,
      grid: { top: isMobileViewport ? 72 : 80, right: isMobileViewport ? 4 : 12, bottom: isMobileViewport ? 56 : 38, left: isMobileViewport ? 6 : 56, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const index = params[0]?.dataIndex ?? 0;
          const bar = normalizedBars[index];
          const lines = bar.segments
            .map(
              (segment) =>
                `<span style="display:inline-block;margin-right:6px;border-radius:999px;width:8px;height:8px;background:${segment.color}"></span>${segment.label}: ${segment.value >= 0 ? "" : "-"}${unitLabel} ${valueFormatter(Math.abs(segment.value))}`,
            )
            .join("<br/>");
          return `<strong>${bar.label}</strong><br/>Total: ${bar.totalValue >= 0 ? "" : "-"}${unitLabel} ${valueFormatter(Math.abs(bar.totalValue))}${lines ? `<br/>${lines}` : ""}`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(100, 116, 139, 0.75)" } },
        axisLabel: {
          color: "#475569",
          fontWeight: 700,
          fontSize: isMobileViewport ? 12 : 18,
          margin: isMobileViewport ? 10 : 18,
          interval: 0,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          show: !isMobileViewport,
          fontSize: 12,
          fontWeight: 700,
          formatter: (value) => `${value < 0 ? "-" : ""}${unitLabel} ${valueFormatter(Math.abs(value))}`,
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      },
      series: [
        {
          name: "__click_target__",
          type: "custom",
          silent: !onSelectBar,
          z: 0,
          tooltip: { show: false },
          data: clickTargetData,
          renderItem: (params, api) => {
            const categoryIndex = api.value(0);
            const center = api.coord([categoryIndex, 0]);
            const bandWidth = api.size([1, 0])[0];
            const { x, y, height } = params.coordSys;
            return {
              type: "rect",
              shape: {
                x: Math.max(center[0] - bandWidth / 2, x),
                y,
                width: Math.min(bandWidth, x + params.coordSys.width - (center[0] - bandWidth / 2)),
                height,
              },
              style: {
                fill: "rgba(15, 23, 42, 0)",
              },
            };
          },
        },
        ...uniqueSeries.map((seriesLabel) => ({
          name: seriesLabel,
          type: "bar",
          stack: "price-comp",
          barWidth: topLabelBarWidth,
          emphasis: { focus: "series" },
          itemStyle: {
            borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
          },
          data: normalizedBars.map((bar) => {
            const segment = bar.segments.find((item) => item.label === seriesLabel);
            return segment
              ? {
                  value: segment.value,
                  itemStyle: {
                    color: segment.color,
                    borderRadius: segment.value >= 0 ? [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] : [0, 0, CHART_BAR_RADIUS, CHART_BAR_RADIUS],
                  },
                }
              : 0;
          }),
        })),
        {
          name: "__total_labels__",
          type: "bar",
          silent: true,
          barWidth: topLabelBarWidth,
          barGap: "-100%",
          z: 20,
          itemStyle: {
            color: "rgba(0,0,0,0)",
          },
          tooltip: { show: false },
          data: normalizedBars.map((bar) => ({
            value: bar.totalValue,
            itemStyle: { color: "rgba(0,0,0,0)" },
            label: {
              show: true,
              position: bar.totalValue >= 0 ? "top" : "bottom",
              distance: 14,
              formatter: `${bar.totalValue >= 0 ? "" : "-"}${unitLabel} ${valueFormatter(Math.abs(bar.totalValue))}`,
              backgroundColor: "#0f172a",
              color: "#ffffff",
              borderRadius: 14,
              padding: isMobileViewport ? [10, 12] : [12, 16],
              fontSize: isMobileViewport ? 11 : 12,
              fontWeight: 900,
            },
          })),
        },
      ],
    }),
    [categories, clickTargetData, isMobileViewport, normalizedBars, onSelectBar, topLabelBarWidth, uniqueSeries, unitLabel, valueFormatter],
  );
  const chartEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        if (params.seriesName === "__total_labels__") return;
        onSelectBar?.(normalizedBars[params.dataIndex]);
      },
    }),
    [normalizedBars, onSelectBar],
  );

  return (
    <article className="price-comp-pane">
      <div className="price-comp-vertical-chart">
        <ReactECharts option={option} onEvents={chartEvents} style={{ height: isMobileViewport ? 280 : 320, width: "100%" }} opts={{ renderer: "svg" }} />
      </div>
    </article>
  );
}

function PriceCompositionHorizontalChart({ title, rows, unitLabel, onSelectRow, onSelectSegment }) {
  const positiveMax = Math.max(
    1,
    ...rows.map((row) => row.segments.filter((segment) => segment.value > 0).reduce((sum, segment) => sum + segment.value, 0)),
  );
  const negativeMax = Math.max(
    1,
    ...rows.map((row) => Math.abs(row.segments.filter((segment) => segment.value < 0).reduce((sum, segment) => sum + segment.value, 0))),
  );

  return (
    <article className="price-comp-pane">
      <div className="price-comp-pane-title">
        <span>{title}</span>
        <small>{unitLabel}</small>
      </div>
      <div className="price-comp-horizontal-chart">
        {rows.map((row) => {
          let rightCursor = 50;
          let leftCursor = 50;
          return (
            <div key={row.label} className="price-comp-h-row">
              <div className="price-comp-h-label">{row.label}</div>
              <button
                type="button"
                className={`price-comp-h-track${onSelectRow ? " is-clickable" : ""}`}
                onClick={() => onSelectRow?.(row)}
              >
                <div className="price-comp-h-zero" />
                {row.segments.map((segment) => {
                  const width = `${(Math.abs(segment.value) / (segment.value >= 0 ? positiveMax : negativeMax)) * 46}%`;
                  if (segment.value >= 0) {
                    const style = { left: `${rightCursor}%`, width, background: segment.color };
                    rightCursor += Number.parseFloat(width);
                    return (
                      <div
                        key={`${row.label}-${segment.label}`}
                        className="price-comp-h-segment"
                        style={style}
                        title={`${segment.label}: ${formatCurrency2(segment.value)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectSegment?.(row, segment);
                        }}
                      />
                    );
                  }
                  const widthValue = (Math.abs(segment.value) / negativeMax) * 46;
                  leftCursor -= widthValue;
                  const style = { left: `${leftCursor}%`, width: `${widthValue}%`, background: segment.color };
                  return (
                    <div
                      key={`${row.label}-${segment.label}`}
                      className="price-comp-h-segment"
                      style={style}
                      title={`${segment.label}: ${formatCurrency2(segment.value)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectSegment?.(row, segment);
                      }}
                    />
                  );
                })}
              </button>
              <div className="price-comp-h-total">
                {row.total >= 0 ? "" : "-"}
                {unitLabel} {formatCurrency2(Math.abs(row.total))}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function PriceCompositionDashboard({ dashboardFilter, chartEngine = "custom" }) {
  const { matchesDashboardFilter } = useDashboardFilter();
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);
  const [physicalQuotes, setPhysicalQuotes] = useState([]);
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [currencyMode, setCurrencyMode] = useState("AMBOS_R$");
  const [adjustmentMode, setAdjustmentMode] = useState("ALL");
  const [soldVolumeInput, setSoldVolumeInput] = useState("");
  const [hasManualVolume, setHasManualVolume] = useState(false);
  const [resourceTableModal, setResourceTableModal] = useState(null);
  const [includeClosedDerivatives, setIncludeClosedDerivatives] = useState(true);
  const [includeOpenDerivatives, setIncludeOpenDerivatives] = useState(true);
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales: physicalSales,
    setSales: setPhysicalSales,
    derivatives,
    setDerivatives,
  });
  const openPriceCompositionOperation = useCallback((row) => {
    setResourceTableModal(null);
    openOperationForm(row);
  }, [openOperationForm]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("crop-boards"),
      resourceService.listAll("physical-quotes"),
      resourceService.listTradingviewQuotes().catch(() => []),
    ]).then(([physicalSalesResponse, derivativesResponse, cropBoardsResponse, quotesResponse, tradingviewResponse]) => {
      if (!isMounted) return;
      setPhysicalSales(physicalSalesResponse || []);
      setDerivatives(derivativesResponse || []);
      setCropBoards(cropBoardsResponse || []);
      setPhysicalQuotes(quotesResponse || []);
      setTradingviewQuotes(Array.isArray(tradingviewResponse) ? tradingviewResponse : []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSales = useMemo(
    () => physicalSales.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, matchesDashboardFilter, physicalSales],
  );

  const filteredDerivatives = useMemo(
    () =>
      derivatives.filter((item) => {
        const baseMatch = rowMatchesDashboardFilter(
          item,
          { ...dashboardFilter, cultura: [] },
          {
            cultureKeys: [],
          },
        );
        if (!baseMatch) {
          return false;
        }

        const derivativeKind = item.moeda_ou_cmdtye;
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: derivativeKind === "Moeda" ? ["destino_cultura"] : ["ativo"],
        });
      }),
    [dashboardFilter, derivatives],
  );

  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter, matchesDashboardFilter],
  );

  const filteredQuotes = useMemo(
    () => physicalQuotes.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, matchesDashboardFilter, physicalQuotes],
  );

  const usdRate = useMemo(() => {
    const candidates = filteredSales
      .map((item) => Number(item.dolar_de_venda || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (candidates.length) {
      return candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    }
    return 5.5;
  }, [filteredSales]);

  const usdBrlQuote = useMemo(() => {
    const directMatch = (tradingviewQuotes || []).find(
      (item) => String(item?.ticker || "").trim().toUpperCase() === "USDBRL",
    );
    const directValue = Number(directMatch?.price || 0);
    return Number.isFinite(directValue) && directValue > 0 ? directValue : 0;
  }, [tradingviewQuotes]);

  const derivativeQuotesByTicker = useMemo(
    () =>
      (tradingviewQuotes || []).reduce((acc, item) => {
        const ticker = String(item?.ticker || "").trim();
        if (!ticker) {
          return acc;
        }
        acc[ticker] = parseLocalizedNumber(item?.price);
        return acc;
      }, {}),
    [tradingviewQuotes],
  );

  const quoteAvgBrl = useMemo(() => {
    const values = filteredQuotes
      .filter((item) => normalizeText(item.moeda_unidade).includes("r$/sc"))
      .map((item) => Number(item.cotacao || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }, [filteredQuotes]);

  const quoteAvgUsd = useMemo(() => {
    const values = filteredQuotes
      .filter((item) => normalizeText(item.moeda_unidade).includes("u$/sc"))
      .map((item) => Number(item.cotacao || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }, [filteredQuotes]);

  const productionTotal = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0),
    [filteredCropBoards],
  );

  const salesSummary = useMemo(() => {
    const summary = {
      totalVolume: 0,
      totalRevenueBrl: 0,
      totalRevenueUsd: 0,
      basisWeighted: 0,
      dollarWeighted: 0,
      brlVolume: 0,
      usdVolume: 0,
      brlRevenue: 0,
      usdRevenue: 0,
      brlPriceWeighted: 0,
      usdPriceWeighted: 0,
    };

    filteredSales.forEach((item) => {
      const volume = Math.abs(Number(item.volume_fisico || 0));
      const price = Number(item.preco || 0);
      const dollar = Number(item.dolar_de_venda || usdRate || 0);
      const isUsd = isUsdCurrency(item.moeda_contrato);
      const revenueBrl = isUsd ? volume * price * dollar : volume * price;
      const revenueUsd = isUsd ? volume * price : dollar > 0 ? (volume * price) / dollar : 0;
      const basis = Number(item.basis_valor || 0);

      summary.totalVolume += volume;
      summary.totalRevenueBrl += revenueBrl;
      summary.totalRevenueUsd += revenueUsd;
      summary.basisWeighted += basis * volume;
      summary.dollarWeighted += dollar * volume;

      if (isUsd) {
        summary.usdVolume += volume;
        summary.usdRevenue += revenueUsd;
        summary.usdPriceWeighted += price * volume;
      } else {
        summary.brlVolume += volume;
        summary.brlRevenue += revenueBrl;
        summary.brlPriceWeighted += price * volume;
      }
    });

    return summary;
  }, [filteredSales, usdRate]);

  const getPhysicalContractDisplayValue = useCallback((item) => {
    const contractRevenue =
      Math.abs(Number(item.faturamento_total_contrato || 0)) ||
      Math.abs(Number(item.preco || 0) * Number(item.volume_fisico || 0));
    const isUsdContract = isUsdCurrency(item.moeda_contrato);

    if (currencyMode === "R$") {
      return isUsdContract ? 0 : contractRevenue;
    }

    if (currencyMode === "U$") {
      return isUsdContract ? contractRevenue : 0;
    }

    const today = startOfDashboardDay(new Date());
    const paymentDate = startOfDashboardDay(item.data_pagamento);
    const usesSpotQuote = paymentDate && today ? paymentDate.getTime() >= today.getTime() : false;

    if (currencyMode === "AMBOS_U$") {
      if (isUsdContract) return contractRevenue;
      // BRL contract: convert to USD using dolar_de_venda or spot rate
      const fxRate = usesSpotQuote ? usdBrlQuote : Number(item.dolar_de_venda || 0);
      return fxRate > 0 ? contractRevenue / fxRate : 0;
    }

    // AMBOS_R$: convert USD contracts to BRL
    if (!isUsdContract) {
      return contractRevenue;
    }

    const fxRate = usesSpotQuote ? usdBrlQuote : Number(item.dolar_de_venda || 0);
    return fxRate > 0 ? contractRevenue * fxRate : 0;
  }, [currencyMode, usdBrlQuote]);

  const physicalChartRevenueValue = useMemo(() => {
    return filteredSales.reduce((sum, item) => sum + getPhysicalContractDisplayValue(item), 0);
  }, [filteredSales, getPhysicalContractDisplayValue]);

  const filteredSalesForChart = useMemo(
    () => filteredSales.filter((item) => getPhysicalContractDisplayValue(item) > 0),
    [filteredSales, getPhysicalContractDisplayValue],
  );

  const defaultSoldVolume = useMemo(() => {
    if (currencyMode === "R$") return salesSummary.brlVolume;
    if (currencyMode === "U$") return salesSummary.usdVolume;
    return salesSummary.totalVolume;
  }, [currencyMode, salesSummary.brlVolume, salesSummary.totalVolume, salesSummary.usdVolume]);


  const selectedCurrencyLabel = (currencyMode === "U$" || currencyMode === "AMBOS_U$") ? "U$" : "R$";

  useEffect(() => {
    if (!hasManualVolume) {
      setSoldVolumeInput(formatInputInt(defaultSoldVolume));
    }
  }, [defaultSoldVolume, hasManualVolume]);

  const selectedDivisor = useMemo(
    () => Math.max(parseLocalizedInputNumber(soldVolumeInput) || defaultSoldVolume || 1, 1),
    [defaultSoldVolume, soldVolumeInput],
  );

  const normalizedDerivatives = useMemo(() => {
    const today = startOfDashboardDay(new Date());

    return filteredDerivatives
      .map((item) => {
        const isMoedaItem = normalizeText(item.moeda_ou_cmdtye) === "moeda";
        const originalValueBrl = Number((isMoedaItem ? item.ajustes_totais_usd : item.ajustes_totais_brl) || 0);
        const fallbackUsd = usdRate > 0 ? originalValueBrl / usdRate : 0;
        const originalValueUsd =
          Number(item.ajustes_totais_moeda_original || item.ajustes_totais_usd || item.volume_financeiro_valor_moeda_original || 0) ||
          fallbackUsd;
        const derivativeCurrency = isUsdCurrency(item.volume_financeiro_moeda || item.moeda_unidade || item.moeda_contrato) ? "U$" : "R$";
        const liquidationDate = startOfDashboardDay(item.data_liquidacao);
        const usesSpotQuote = liquidationDate && today ? liquidationDate.getTime() >= today.getTime() : false;
        const brlToUsdRate = usesSpotQuote ? usdBrlQuote : Number(item.dolar_ptax_vencimento || 0);
        const strikeMtm = derivativeQuotesByTicker[item.contrato_derivativo] ?? 0;
        const mtm = calculatePriceCompositionDerivativeMtm(item, strikeMtm, usdBrlQuote);

        let amount = 0;
        if (currencyMode === "AMBOS_R$") {
          amount = adjustmentMode === "ALL" ? mtm.brl : originalValueBrl;
        } else if (currencyMode === "AMBOS_U$") {
          // All derivatives converted to USD: R$ adjustments divided by rate, U$ adjustments as-is
          if (adjustmentMode === "ALL") {
            amount = mtm.usd;
          } else if (derivativeCurrency === "U$") {
            amount = originalValueUsd;
          } else {
            amount = brlToUsdRate > 0 ? originalValueBrl / brlToUsdRate : 0;
          }
        } else if (currencyMode === "R$") {
          if (adjustmentMode === "ALL") {
            amount = originalValueBrl;
          } else {
            amount = derivativeCurrency === "R$" ? originalValueBrl : 0;
          }
        } else if (currencyMode === "U$") {
          if (adjustmentMode === "MATCH") {
            amount = derivativeCurrency === "U$" ? originalValueUsd : 0;
          } else if (derivativeCurrency === "U$") {
            amount = originalValueUsd;
          } else {
            amount = brlToUsdRate > 0 ? originalValueBrl / brlToUsdRate : 0;
          }
        }

        const classification = getPriceCompositionDerivativeKind(item);
        const status = getPriceCompositionDerivativeStatus(item);
        return {
          id: item.id,
          classificacao: classification,
          status,
          currency: derivativeCurrency,
          sourceKey: item.bolsa_ref || item.ctrbolsa || item.instituicao || item.operation,
          amount,
          strike: Number(item.strike_montagem || item.strike_liquidacao || 0),
          volume: getDerivativeVolumeValue(item),
          institution: item.instituicao || item.bolsa_ref || "—",
          operation: item.nome_da_operacao || item.tipo_derivativo || "Derivativo",
        };
      })
      .filter((item) => {
        if (currencyMode === "AMBOS_R$" || currencyMode === "AMBOS_U$") return true;
        return adjustmentMode === "ALL" || item.currency === currencyMode;
      });
  }, [adjustmentMode, currencyMode, derivativeQuotesByTicker, filteredDerivatives, usdBrlQuote, usdRate]);

  const derivativeSourceIdsForChart = useMemo(
    () => new Set(normalizedDerivatives.map((item) => item.id)),
    [normalizedDerivatives],
  );

  const derivativeSummary = useMemo(() => {
    const summary = {
      open: 0,
      closed: 0,
      byClass: {
        Bolsa: { open: 0, closed: 0, openRows: [], closedRows: [] },
        Cambio: { open: 0, closed: 0, openRows: [], closedRows: [] },
      },
    };

    normalizedDerivatives.forEach((item) => {
      if (!item.classificacao) return;
      const bucket = summary.byClass[item.classificacao] || summary.byClass.Bolsa;
      if (item.status === "Encerrado") {
        summary.closed += item.amount;
        bucket.closed += item.amount;
        bucket.closedRows.push(item);
      } else {
        summary.open += item.amount;
        bucket.open += item.amount;
        bucket.openRows.push(item);
      }
    });

    return summary;
  }, [normalizedDerivatives]);

  const buildDerivativeSegmentsForClass = (classification, includeOpen, includeClosed, divisor = 1) => {
    const relevantRows = normalizedDerivatives.filter((item) => {
      if (item.classificacao !== classification) return false;
      if (item.status === "Encerrado") return includeClosed;
      return includeOpen;
    });

    const grouped = new Map();
    relevantRows.forEach((item) => {
      const key = `${item.sourceKey || "Sem bolsa"}||${item.status}`;
      const current = grouped.get(key) || {
        sourceKey: item.sourceKey || "Sem bolsa",
        status: item.status,
        value: 0,
      };
      current.value += divisor > 0 ? Number(item.amount || 0) / divisor : Number(item.amount || 0);
      grouped.set(key, current);
    });

    const orderedSources = [...new Set(relevantRows.map((item) => item.sourceKey || "Sem bolsa"))];
    return [...grouped.values()]
      .sort((left, right) => {
        const sourceDiff = orderedSources.indexOf(left.sourceKey) - orderedSources.indexOf(right.sourceKey);
        if (sourceDiff !== 0) return sourceDiff;
        if (left.status === right.status) return 0;
        return left.status === "Em aberto" ? -1 : 1;
      })
      .map((item, index) => ({
        label: `${item.sourceKey} · ${item.status === "Encerrado" ? "Liquidado" : "Aberto"}`,
        value: item.value,
        color: pickPriceCompositionColor(classification, index, item.status),
      }));
  };

  const getDerivativeSourceRows = useCallback((classification, includeOpen, includeClosed) =>
    filteredDerivatives.filter((item) => {
      if (!derivativeSourceIdsForChart.has(item.id)) {
        return false;
      }
      const itemClassification = getPriceCompositionDerivativeKind(item);
      if (classification && itemClassification !== classification) return false;
      const isClosed = getPriceCompositionDerivativeStatus(item) === "Encerrado";
      if (isClosed) return includeClosed;
      return includeOpen;
    }),
  [derivativeSourceIdsForChart, filteredDerivatives]);

  const openVerticalDetail = (groupKey, row) => {
    if (groupKey === "G1") {
      if (row.label === "Fisico") {
        setResourceTableModal({
          title: `Fisico (a termo) (${selectedCurrencyLabel})`,
          definition: resourceDefinitions.physicalSales,
          rows: filteredSalesForChart,
        });
        return;
      }
      if (row.label === "Bolsa") {
        setResourceTableModal({
          title: `Derivativos Bolsa (${selectedCurrencyLabel})`,
          definition: resourceDefinitions.derivativeOperations,
          rows: getDerivativeSourceRows("Bolsa", includeOpenDerivatives, includeClosedDerivatives),
        });
        return;
      }
      if (row.label === "Cambio") {
        setResourceTableModal({
          title: `Derivativos Cambio (${selectedCurrencyLabel})`,
          definition: resourceDefinitions.derivativeOperations,
          rows: getDerivativeSourceRows("Cambio", includeOpenDerivatives, includeClosedDerivatives),
        });
        return;
      }
      return;
    }

    if (row.label === "Fisico") {
      setResourceTableModal({
        title: `Fisico vendido (${selectedCurrencyLabel})`,
        definition: resourceDefinitions.physicalSales,
        rows: filteredSalesForChart,
      });
      return;
    }
    if (row.label === "Bolsa") {
      setResourceTableModal({
        title: `Derivativos Bolsa (${selectedCurrencyLabel})`,
        definition: resourceDefinitions.derivativeOperations,
        rows: getDerivativeSourceRows("Bolsa", includeOpenDerivatives, includeClosedDerivatives),
      });
      return;
    }
    if (row.label === "Cambio") {
      setResourceTableModal({
        title: `Derivativos Cambio (${selectedCurrencyLabel})`,
        definition: resourceDefinitions.derivativeOperations,
        rows: getDerivativeSourceRows("Cambio", includeOpenDerivatives, includeClosedDerivatives),
      });
      return;
    }
  };

  const soldAveragePrice = selectedDivisor > 0 ? physicalChartRevenueValue / selectedDivisor : 0;
  const basisAverage = salesSummary.totalVolume > 0 ? salesSummary.basisWeighted / salesSummary.totalVolume : 0;
  const dollarAverage = salesSummary.totalVolume > 0 ? salesSummary.dollarWeighted / salesSummary.totalVolume : usdRate;
  const premiumAverage = selectedDivisor > 0 ? derivativeSummary.closed / selectedDivisor : 0;

  const g1BolsaOpenValue = includeOpenDerivatives ? Number(derivativeSummary.byClass.Bolsa.open || 0) / selectedDivisor : 0;
  const g1BolsaClosedValue = includeClosedDerivatives ? Number(derivativeSummary.byClass.Bolsa.closed || 0) / selectedDivisor : 0;
  const g1CambioOpenValue = includeOpenDerivatives ? Number(derivativeSummary.byClass.Cambio.open || 0) / selectedDivisor : 0;
  const g1CambioClosedValue = includeClosedDerivatives ? Number(derivativeSummary.byClass.Cambio.closed || 0) / selectedDivisor : 0;
  const g5BolsaOpenValue = includeOpenDerivatives ? Number(derivativeSummary.byClass.Bolsa.open || 0) : 0;
  const g5BolsaClosedValue = includeClosedDerivatives ? Number(derivativeSummary.byClass.Bolsa.closed || 0) : 0;
  const g5CambioOpenValue = includeOpenDerivatives ? Number(derivativeSummary.byClass.Cambio.open || 0) : 0;
  const g5CambioClosedValue = includeClosedDerivatives ? Number(derivativeSummary.byClass.Cambio.closed || 0) : 0;
  const g1BolsaValue = g1BolsaOpenValue + g1BolsaClosedValue;
  const g1CambioValue = g1CambioOpenValue + g1CambioClosedValue;
  const g5BolsaValue = g5BolsaOpenValue + g5BolsaClosedValue;
  const g5CambioValue = g5CambioOpenValue + g5CambioClosedValue;
  const physicalTotalRevenueValue = physicalChartRevenueValue;
  const totalRevenueValue = physicalTotalRevenueValue + g5BolsaValue + g5CambioValue;

  const verticalRowsG1 = [
    { label: "Fisico", value: soldAveragePrice, color: getSignedPriceCompositionColor(soldAveragePrice) },
    {
      label: "Bolsa",
      segments: [
        { label: "Bolsa aberto", value: g1BolsaOpenValue, color: getSignedPriceCompositionColor(g1BolsaOpenValue) },
        { label: "Bolsa liquidado", value: g1BolsaClosedValue, color: getSignedPriceCompositionColor(g1BolsaClosedValue, "soft") },
      ],
    },
    {
      label: "Cambio",
      segments: [
        { label: "Cambio aberto", value: g1CambioOpenValue, color: getSignedPriceCompositionColor(g1CambioOpenValue) },
        { label: "Cambio liquidado", value: g1CambioClosedValue, color: getSignedPriceCompositionColor(g1CambioClosedValue, "soft") },
      ],
    },
    { label: "Total", value: soldAveragePrice + g1BolsaValue + g1CambioValue, color: getSignedPriceCompositionColor(soldAveragePrice + g1BolsaValue + g1CambioValue) },
  ];

  const verticalRowsG5 = [
    { label: "Fisico", value: physicalTotalRevenueValue, color: getSignedPriceCompositionColor(physicalTotalRevenueValue) },
    {
      label: "Bolsa",
      segments: [
        { label: "Bolsa aberto", value: g5BolsaOpenValue, color: getSignedPriceCompositionColor(g5BolsaOpenValue) },
        { label: "Bolsa liquidado", value: g5BolsaClosedValue, color: getSignedPriceCompositionColor(g5BolsaClosedValue, "soft") },
      ],
    },
    {
      label: "Cambio",
      segments: [
        { label: "Cambio aberto", value: g5CambioOpenValue, color: getSignedPriceCompositionColor(g5CambioOpenValue) },
        { label: "Cambio liquidado", value: g5CambioClosedValue, color: getSignedPriceCompositionColor(g5CambioClosedValue, "soft") },
      ],
    },
    { label: "Total", value: totalRevenueValue, color: getSignedPriceCompositionColor(totalRevenueValue) },
  ];

  const derivativeTableRows = ["Bolsa", "Cambio"].map((label) => {
    const bucket = derivativeSummary.byClass[label];
    const allRows = [...(bucket?.openRows || []), ...(bucket?.closedRows || [])];
    const volume = allRows.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const weightedStrike =
      volume > 0 ? allRows.reduce((sum, item) => sum + Number(item.strike || 0) * Number(item.volume || 0), 0) / volume : 0;
    return {
      label,
      open: bucket?.open || 0,
      closed: bucket?.closed || 0,
      strike: weightedStrike,
      volume,
    };
  });
  const VerticalChartComponent = chartEngine === "echarts" ? PriceCompositionVerticalEChart : PriceCompositionVerticalChart;

  return (
    <section className="price-comp-shell">
      <section className="stats-grid">
        <article className="card stat-card summary-insight-card">
          <SummaryInsightButton
            title="Preço final sem derivativos"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O valor de ${selectedCurrencyLabel} ${formatCurrency2(soldAveragePrice)} representa o preço médio final da operação física sem somar resultado de derivativos.`,
                  "Ele é a referência base para comparar o impacto adicional de bolsa e câmbio sobre o preço final capturado.",
                ]}
              />
            }
          />
          <span>Preco final sem derivativos</span>
          <strong>{selectedCurrencyLabel} {formatCurrency2(soldAveragePrice)}</strong>
        </article>
        <article className="card stat-card summary-insight-card">
          <SummaryInsightButton
            title="Preço físico final + derivativos"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O valor de ${selectedCurrencyLabel} ${formatCurrency2(soldAveragePrice + g1BolsaValue + g1CambioValue)} soma o preço físico final com o efeito dos derivativos considerados.`,
                  `Nesse cálculo, bolsa contribui com ${selectedCurrencyLabel} ${formatCurrency2(g1BolsaValue)} e câmbio com ${selectedCurrencyLabel} ${formatCurrency2(g1CambioValue)} no divisor selecionado.`,
                ]}
              />
            }
          />
          <span>Preco fisico final + Derivativos</span>
          <strong>{selectedCurrencyLabel} {formatCurrency2(soldAveragePrice + g1BolsaValue + g1CambioValue)}</strong>
        </article>
        <article className="card stat-card summary-insight-card">
          <SummaryInsightButton
            title="Basis médio"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O basis médio atual é ${basisAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                  "Esse número representa o desvio médio entre a referência internacional e o preço físico efetivamente observado nas operações filtradas.",
                ]}
              />
            }
          />
          <span>Basis medio</span>
          <strong>{basisAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </article>
        <article className="card stat-card summary-insight-card">
          <SummaryInsightButton
            title="Câmbio médio"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O câmbio médio considerado nas operações está em ${dollarAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                  "Ele é usado para converter preços e resultados quando a composição final precisa ser comparada na mesma moeda.",
                ]}
              />
            }
          />
          <span>Cambio medio</span>
          <strong>{dollarAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </article>
      </section>

      <section className="price-comp-toolbar card">
        <div className="price-comp-controls">
          <label className="price-comp-field">
            <span>Moeda</span>
            <select value={currencyMode} onChange={(event) => setCurrencyMode(event.target.value)}>
              <option value="AMBOS_R$">Ambos (convertido em R$)</option>
              <option value="AMBOS_U$">Ambos (convertido em U$)</option>
              <option value="R$">R$</option>
              <option value="U$">U$</option>
            </select>
          </label>
          <label className="price-comp-field">
            <span>Fisico vendido (scs)</span>
            <input
              value={soldVolumeInput}
              onChange={(event) => {
                setHasManualVolume(true);
                setSoldVolumeInput(event.target.value);
              }}
            />
          </label>
          <label className="price-comp-field">
            <span>Ajustes considerados</span>
            <select value={adjustmentMode} onChange={(event) => setAdjustmentMode(event.target.value)}>
              <option value="ALL">Considere todos os ajustes</option>
              <option value="MATCH">Considerar ajustes dessa moeda</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => {
            setHasManualVolume(false);
            setSoldVolumeInput(formatInputInt(defaultSoldVolume));
          }}>
            Resetar volume
          </button>
        </div>
        <div className="price-comp-toggle-row price-comp-toggle-row--shared">
          <label className="price-comp-toggle">
            <input type="checkbox" checked={includeClosedDerivatives} onChange={(event) => setIncludeClosedDerivatives(event.target.checked)} />
            <span>Considerar derivativos liquidados</span>
          </label>
          <label className="price-comp-toggle">
            <input type="checkbox" checked={includeOpenDerivatives} onChange={(event) => setIncludeOpenDerivatives(event.target.checked)} />
            <span>Considerar derivativos em aberto</span>
          </label>
        </div>
      </section>

      <div className="price-comp-main-grid">
        <section className="price-comp-pair-card card summary-insight-card">
          <SummaryInsightButton
            title="Preço por saca"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `Este gráfico decompõe o preço por saca. A barra física mostra ${selectedCurrencyLabel} ${formatCurrency2(soldAveragePrice)}, e o total incorpora os efeitos de bolsa e câmbio para chegar ao preço final por unidade.`,
                  "Cada segmento mostra quanto cada classe contribui positiva ou negativamente para o resultado final por saca.",
                ]}
              />
            }
          />
          <div className="price-comp-pair-row">
            <VerticalChartComponent
              bars={verticalRowsG1}
              unitLabel={selectedCurrencyLabel}
              onSelectBar={(row) => openVerticalDetail("G1", row)}
            />
          </div>
        </section>

        <section className="price-comp-pair-card card summary-insight-card">
          <SummaryInsightButton
            title="Receita total"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `Este gráfico mostra a composição da receita total. O físico soma ${selectedCurrencyLabel} ${formatCurrency2(physicalTotalRevenueValue)} e o total consolidado chega a ${selectedCurrencyLabel} ${formatCurrency2(totalRevenueValue)}.`,
                  "Aqui os segmentos representam o impacto financeiro agregado das classes sobre a receita total, não apenas sobre o preço unitário.",
                ]}
              />
            }
          />
          <div className="price-comp-pair-row">
            <VerticalChartComponent
              bars={verticalRowsG5}
              unitLabel={selectedCurrencyLabel}
              onSelectBar={(row) => openVerticalDetail("G5", row)}
              valueFormatter={formatNumber0}
            />
          </div>
        </section>
      </div>

      <section className="price-comp-bottom-grid">
        <article className="price-comp-summary-card card summary-insight-card">
          <SummaryInsightButton
            title="Resumo físico"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O bloco físico resume ${formatNumber0(salesSummary.totalVolume)} sc vendidos, com faturamento de R$ ${formatCurrency2(salesSummary.brlRevenue)} e U$ ${formatCurrency2(salesSummary.usdRevenue)}.`,
                  `Os níveis médios mostram o preço ponderado das operações em reais e dólares, enquanto o MTM médio indica a referência atual para a parcela não travada.`,
                ]}
              />
            }
          />
          <div className="price-comp-summary-header">
            <div>1. Fisico</div>
            <span>{formatNumber0(salesSummary.totalVolume)} sc</span>
          </div>
          <table className="price-comp-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>R$/sc</th>
                <th>U$/sc</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Volume vendido</td>
                <td>{formatNumber0(salesSummary.brlVolume)} sc</td>
                <td>{formatNumber0(salesSummary.usdVolume)} sc</td>
              </tr>
              <tr>
                <td>Nivel medio</td>
                <td>R$ {formatCurrency2(salesSummary.brlVolume > 0 ? salesSummary.brlPriceWeighted / salesSummary.brlVolume : 0)}</td>
                <td>U$ {formatCurrency2(salesSummary.usdVolume > 0 ? salesSummary.usdPriceWeighted / salesSummary.usdVolume : 0)}</td>
              </tr>
              <tr>
                <td>Faturamento</td>
                <td>R$ {formatCurrency2(salesSummary.brlRevenue)}</td>
                <td>U$ {formatCurrency2(salesSummary.usdRevenue)}</td>
              </tr>
              <tr>
                <td>MTM medio</td>
                <td>R$ {formatCurrency2(quoteAvgBrl)}</td>
                <td>U$ {formatCurrency2(quoteAvgUsd)}</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article className="price-comp-summary-card card summary-insight-card">
          <SummaryInsightButton
            title="Resumo de derivativos"
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `Este bloco resume ${normalizedDerivatives.length} operações em derivativos. Para cada classe, os números de aberto e encerrado mostram o resultado financeiro acumulado na moeda selecionada.`,
                  "O strike médio é ponderado pelo volume e ajuda a entender em que nível as operações foram montadas.",
                ]}
              />
            }
          />
          <div className="price-comp-summary-header">
            <div>2. Derivativos</div>
            <span>{normalizedDerivatives.length} ops</span>
          </div>
          <table className="price-comp-table">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Aberto</th>
                <th>Encerrado</th>
                <th>Strike medio</th>
              </tr>
            </thead>
            <tbody>
              {derivativeTableRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{selectedCurrencyLabel} {formatCurrency2(row.open)}</td>
                  <td>{selectedCurrencyLabel} {formatCurrency2(row.closed)}</td>
                  <td>{formatCurrency2(row.strike)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>

      {resourceTableModal ? (
        <DashboardResourceTableModal
          title={resourceTableModal.title}
          definition={resourceTableModal.definition}
          rows={resourceTableModal.rows}
          onClose={() => setResourceTableModal(null)}
          onEdit={(row) => openPriceCompositionOperation({
            ...row,
            recordId: row.id,
            resourceKey: resourceTableModal.definition.resource,
          })}
        />
      ) : null}
      {editorNode}
    </section>
  );
}

const normalizeTriggerLookupKey = (value) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");

const resolveTriggerTypeValue = (trigger) => String(trigger?.tipo || trigger?.tipo_fis_der || "").trim();
const resolveTriggerStatusValue = (trigger) => String(trigger?.status || trigger?.status_gatilho || "").trim();
const resolveTriggerContractValue = (trigger) =>
  String(trigger?.contrato_derivativo || trigger?.contrato_bolsa || trigger?.codigo_derivativo || "").trim();
const resolveTriggerStrikeValue = (trigger) => parseLocalizedNumber(trigger?.strike ?? trigger?.strike_alvo);
const resolveTriggerVolumeTargetValue = (trigger) => parseLocalizedNumber(trigger?.volume_objetivo ?? trigger?.volume);
const resolveTriggerExchangeValue = (trigger) => String(trigger?.bolsa || trigger?.produto_bolsa || "").trim();
const resolveTriggerDirectionValue = (trigger) => String(trigger?.acima_abaixo || "").trim();
const resolveTriggerPositionValue = (trigger) => String(trigger?.posicao || "").trim();
const resolveTriggerPriceUnitValue = (trigger) =>
  String(trigger?.moeda_unidade || trigger?.strike_moeda_unidade || trigger?.unidade || "").trim();
const readRelationLabel = (value, keys = []) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  for (const key of keys) {
    if (value?.[key]) {
      return String(value[key]).trim();
    }
  }
  return String(value?.label || value?.nome || value?.descricao || "").trim();
};

const collectRelationLabels = (row, pluralKey, singularKey, labelKeys = []) => {
  const pluralValues = Array.isArray(row?.[pluralKey]) ? row[pluralKey] : [];
  const values = pluralValues.length ? pluralValues : row?.[singularKey] ? [row[singularKey]] : [];
  return values
    .map((entry) => readRelationLabel(entry, labelKeys))
    .filter(Boolean);
};

const formatCompactRelationList = (labels = [], emptyLabel) => {
  if (!labels.length) return emptyLabel;
  return labels.join(", ");
};

const findMatchingDerivativeQuote = (trigger, quotes = []) => {
  const contractKey = normalizeTriggerLookupKey(resolveTriggerContractValue(trigger));
  if (!contractKey) {
    return null;
  }

  const exchangeKey = normalizeTriggerLookupKey(resolveTriggerExchangeValue(trigger));

  const exactMatch = quotes.find((quote) => {
    const tickerKey = normalizeTriggerLookupKey(quote?.ticker || quote?.symbol);
    if (tickerKey !== contractKey) {
      return false;
    }
    if (!exchangeKey) {
      return true;
    }
    const sectionKey = normalizeTriggerLookupKey(quote?.section_name);
    const descriptionKey = normalizeTriggerLookupKey(quote?.description);
    return sectionKey.includes(exchangeKey) || descriptionKey.includes(exchangeKey);
  });
  if (exactMatch) {
    return exactMatch;
  }

  return quotes.find((quote) => {
    const candidates = [
      quote?.ticker,
      quote?.symbol,
      quote?.description,
      quote?.section_name,
    ].map(normalizeTriggerLookupKey);

    const matchesContract = candidates.some((candidate) => candidate && (candidate.includes(contractKey) || contractKey.includes(candidate)));
    if (!matchesContract) {
      return false;
    }
    if (!exchangeKey) {
      return true;
    }
    return candidates.some((candidate) => candidate && candidate.includes(exchangeKey));
  }) || null;
};

const formatTriggerMarketValue = (value) =>
  Number.isFinite(value) && value > 0
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "—";

const formatTriggerPercentDistance = (currentPrice, strike) => {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(strike) || strike <= 0) {
    return "";
  }

  const percent = ((currentPrice - strike) / strike) * 100;
  const direction = percent >= 0 ? "acima" : "abaixo";
  return `${Math.abs(percent).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}% ${direction} do strike`;
};

const formatTriggerTargetDistance = ({ currentPrice, strike, directionLabel, isHit }) => {
  if (isHit) {
    return "Alvo atingido";
  }
  if (!Number.isFinite(currentPrice) || !Number.isFinite(strike) || strike <= 0) {
    return "Sem percentual";
  }

  const percent = Math.abs(((currentPrice - strike) / strike) * 100);
  const normalizedDirection = normalizeText(directionLabel);
  const relativeLabel = normalizedDirection.includes("abaixo") ? "acima" : "abaixo";
  return `${percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}% ${relativeLabel} do alvo`;
};

const getTriggerPercentDistanceValue = (currentPrice, strike) => {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(strike) || strike <= 0) {
    return Number.NaN;
  }
  return ((currentPrice - strike) / strike) * 100;
};

const buildDuplicatePayloadFromDefinition = (definition, item) =>
  Object.fromEntries(
    (definition?.fields || []).map((field) => {
      const rawValue = item?.[field.name];
      if (field.type === "relation") {
        return [field.name, typeof rawValue === "object" ? rawValue?.id ?? null : rawValue ?? null];
      }
      if (field.type === "multirelation") {
        const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
        return [
          field.name,
          values
            .map((entry) => (typeof entry === "object" ? entry?.id : entry))
            .filter((entry) => entry !== undefined && entry !== null && entry !== ""),
        ];
      }
      return [field.name, rawValue];
    }),
  );

function StrategiesTriggersDashboard({ dashboardFilter }) {
  const [strategies, setStrategies] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState([]);
  const [selectedTriggerStatus, setSelectedTriggerStatus] = useState("");
  const [selectedTriggerExchange, setSelectedTriggerExchange] = useState("");
  const [activeStrategyForm, setActiveStrategyForm] = useState(null);
  const [activeTriggerForm, setActiveTriggerForm] = useState(null);
  const [strategyFormError, setStrategyFormError] = useState("");
  const [triggerFormError, setTriggerFormError] = useState("");

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("strategies").catch(() => []),
      resourceService.listAll("strategy-triggers").catch(() => []),
      resourceService.listTradingviewQuotes({ force: true }).catch(() => []),
      resourceService.listAll("exchanges").catch(() => []),
    ]).then(([strategiesResponse, triggersResponse, quotesResponse, exchangesResponse]) => {
      if (!isMounted) return;
      setStrategies(Array.isArray(strategiesResponse) ? strategiesResponse : []);
      setTriggers(Array.isArray(triggersResponse) ? triggersResponse : []);
      setQuotes(Array.isArray(quotesResponse) ? quotesResponse : []);
      setExchanges(Array.isArray(exchangesResponse) ? exchangesResponse : []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const exchangePriceUnitMap = useMemo(
    () =>
      new Map(
        (Array.isArray(exchanges) ? exchanges : [])
          .filter((item) => item?.nome)
          .map((item) => [String(item.nome).trim(), String(item.moeda_unidade_padrao || "").trim()]),
      ),
    [exchanges],
  );

  const filteredStrategies = useMemo(
    () =>
      strategies.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          groupKeys: ["grupo", "grupos"],
          subgroupKeys: ["subgrupo", "subgrupos"],
        }),
      ),
    [dashboardFilter, strategies],
  );
  const filteredTriggers = useMemo(
    () =>
      triggers.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          groupKeys: ["grupo", "grupos"],
          subgroupKeys: ["subgrupo", "subgrupos"],
          cultureKeys: ["cultura"],
        }),
      ),
    [dashboardFilter, triggers],
  );

  const evaluatedTriggers = useMemo(
    () =>
      filteredTriggers
        .map((trigger) => {
          const tipo = resolveTriggerTypeValue(trigger) || "Sem tipo";
          const statusLabel = resolveTriggerStatusValue(trigger) || "Sem status";
          const contractLabel = resolveTriggerContractValue(trigger);
          const strike = resolveTriggerStrikeValue(trigger);
          const volumeObjetivo = resolveTriggerVolumeTargetValue(trigger);
          const direction = resolveTriggerDirectionValue(trigger);
          const position = resolveTriggerPositionValue(trigger);
          const priceUnit = resolveTriggerPriceUnitValue(trigger);
          const quote = normalizeText(tipo) === "derivativo" ? findMatchingDerivativeQuote(trigger, quotes) : null;
          const currentPrice = quote ? parseLocalizedNumber(quote?.price) : Number.NaN;

          let derivedSituation = "manual";
          let isHit = false;
          if (normalizeText(tipo) === "derivativo") {
            if (quote && Number.isFinite(currentPrice) && strike > 0) {
              isHit = normalizeText(direction).includes("abaixo") ? currentPrice <= strike : currentPrice >= strike;
              derivedSituation = isHit ? "atingido" : "monitorando";
            } else {
              derivedSituation = "sem_cotacao";
            }
          } else if (normalizeText(statusLabel).includes("ating")) {
            derivedSituation = "atingido";
            isHit = true;
          } else if (normalizeText(statusLabel).includes("inativ")) {
            derivedSituation = "inativo";
          }

          const strategyLabel =
            trigger?.estrategia?.descricao_estrategia ||
            trigger?.estrategia_descricao ||
            (trigger?.estrategia ? `Estratégia ${trigger.estrategia}` : "");

	          return {
	            ...trigger,
            tipoLabel: tipo,
            statusLabel,
            hasStrategy: Boolean(trigger?.estrategia),
            strategyLabel: strategyLabel || "Sem estratégia",
            contractLabel: contractLabel || "Sem contrato",
            strike,
            volumeObjetivo,
            directionLabel: direction || "Sem direção",
            positionLabel: position || "Sem posição",
            priceUnitLabel: priceUnit,
            quote,
	            currentPrice,
	            percentDistanceValue: getTriggerPercentDistanceValue(currentPrice, strike),
	            percentDistanceLabel: formatTriggerPercentDistance(currentPrice, strike),
	            isHit,
            derivedSituation,
            quoteLabel: quote?.ticker || quote?.symbol || "Sem cotação",
            exchangeLabel: resolveTriggerExchangeValue(trigger) || "Sem bolsa",
            cultureLabel: readCultureLabel(trigger?.cultura),
            exchangeAndContractLabel: [resolveTriggerExchangeValue(trigger), contractLabel].filter(Boolean).join(" | ") || "Sem bolsa | Sem contrato",
          };
        })
        .sort((left, right) => {
          const leftScore = left.isHit ? 3 : left.derivedSituation === "monitorando" ? 2 : left.derivedSituation === "sem_cotacao" ? 1 : 0;
          const rightScore = right.isHit ? 3 : right.derivedSituation === "monitorando" ? 2 : right.derivedSituation === "sem_cotacao" ? 1 : 0;
          if (leftScore !== rightScore) {
            return rightScore - leftScore;
          }
          return String(left.contractLabel).localeCompare(String(right.contractLabel));
        }),
    [filteredTriggers, quotes],
  );

  const activeStrategies = filteredStrategies.filter((item) => !normalizeText(item.status).includes("inativ")).length;
  const activeTriggers = evaluatedTriggers.filter((item) => !normalizeText(item.statusLabel).includes("inativ")).length;
  const openTriggers = evaluatedTriggers.filter((item) => item.derivedSituation === "monitorando").length;
  const hitDerivativeTriggers = evaluatedTriggers.filter((item) => item.derivedSituation === "atingido" && normalizeText(item.tipoLabel) === "derivativo").length;
  const unlinkedTriggers = evaluatedTriggers.filter((item) => !item.hasStrategy).length;
  const quoteCoverage = evaluatedTriggers.filter((item) => item.quote).length;
  const monitoredCrops = new Set(evaluatedTriggers.map((item) => item.cultureLabel).filter((value) => value && normalizeText(value) !== "sem ativo")).size;
  const nextExpiringStrategies = [...filteredStrategies]
    .filter((item) => parseDashboardDate(item.data_validade))
    .sort((left, right) => parseDashboardDate(left.data_validade) - parseDashboardDate(right.data_validade))
    .slice(0, 6);

  const strategyCoverageRows = useMemo(() => {
    const triggerCountByStrategy = evaluatedTriggers.reduce((acc, item) => {
      const key = item?.estrategia?.id || item?.estrategia;
      if (!key) {
        return acc;
      }
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    return filteredStrategies
      .map((strategy) => ({
        id: strategy.id,
        descricao: strategy.descricao_estrategia || `Estratégia ${strategy.id}`,
        status: strategy.status || "Sem status",
        validade: strategy.data_validade,
        triggerCount: triggerCountByStrategy.get(strategy.id) || 0,
      }))
      .sort((left, right) => right.triggerCount - left.triggerCount || String(left.descricao).localeCompare(String(right.descricao)))
      .slice(0, 6);
  }, [evaluatedTriggers, filteredStrategies]);

  const strategyFilterRows = useMemo(
    () =>
      filteredStrategies
        .map((strategy) => {
          const groupLabels = collectRelationLabels(strategy, "grupos", "grupo", ["grupo", "nome"]);
          const subgroupLabels = collectRelationLabels(strategy, "subgrupos", "subgrupo", ["subgrupo", "nome"]);
          const totalTriggers = evaluatedTriggers.filter((item) => String(item?.estrategia || item?.estrategia?.id || "") === String(strategy.id)).length;
          const hitTriggers = evaluatedTriggers.filter(
            (item) =>
              String(item?.estrategia || item?.estrategia?.id || "") === String(strategy.id) && item.derivedSituation === "atingido",
          ).length;
          return {
            ...strategy,
            totalTriggers,
            hitTriggers,
            groupLabels,
            subgroupLabels,
            groupSummary: formatCompactRelationList(groupLabels, "Sem grupos"),
            subgroupSummary: formatCompactRelationList(subgroupLabels, "Sem subgrupos"),
          };
        })
        .sort((left, right) => right.totalTriggers - left.totalTriggers || String(left.descricao_estrategia || "").localeCompare(String(right.descricao_estrategia || ""))),
    [evaluatedTriggers, filteredStrategies],
  );

  const strategyScopedEvaluatedTriggers = useMemo(() => {
    if (!selectedStrategyIds.length) {
      return evaluatedTriggers;
    }
    const selectedIds = new Set(selectedStrategyIds.map(String));
    return evaluatedTriggers.filter((item) => selectedIds.has(String(item?.estrategia || item?.estrategia?.id || "")));
  }, [evaluatedTriggers, selectedStrategyIds]);

  const visibleEvaluatedTriggers = useMemo(
    () =>
      strategyScopedEvaluatedTriggers.filter((item) => {
        if (selectedTriggerStatus && item.derivedSituation !== selectedTriggerStatus) {
          return false;
        }
        if (selectedTriggerExchange && item.exchangeLabel !== selectedTriggerExchange) {
          return false;
        }
        return true;
      }),
    [selectedTriggerExchange, selectedTriggerStatus, strategyScopedEvaluatedTriggers],
  );

  const triggerTypeSlices = useMemo(() => {
    const fisico = visibleEvaluatedTriggers.filter((item) => normalizeText(item.tipoLabel) === "fisico").length;
    const derivativo = visibleEvaluatedTriggers.filter((item) => normalizeText(item.tipoLabel) === "derivativo").length;
    const semTipo = visibleEvaluatedTriggers.filter((item) => !["fisico", "derivativo"].includes(normalizeText(item.tipoLabel))).length;
    const items = [
      { label: "Fisico", value: fisico, color: "#2563eb" },
      { label: "Derivativo", value: derivativo, color: "#0f766e" },
      { label: "Sem tipo", value: semTipo, color: "#94a3b8" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem gatilhos", value: 1, color: "#cbd5e1" }];
  }, [visibleEvaluatedTriggers]);

  const strategyAssociationSlices = useMemo(() => {
    const linked = visibleEvaluatedTriggers.filter((item) => item.hasStrategy).length;
    const unlinked = visibleEvaluatedTriggers.length - linked;
    const items = [
      { label: "Com estratégia", value: linked, color: "#0f766e" },
      { label: "Sem estratégia", value: unlinked, color: "#f59e0b" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem gatilhos", value: 1, color: "#cbd5e1" }];
  }, [visibleEvaluatedTriggers]);

  const closestTriggerBars = useMemo(
    () =>
      visibleEvaluatedTriggers
        .filter((item) => Number.isFinite(item.percentDistanceValue))
        .sort((left, right) => Math.abs(left.percentDistanceValue) - Math.abs(right.percentDistanceValue))
        .slice(0, 5)
        .map((item, index) => ({
          label: item.contractLabel,
          value: Math.max(0.01, 100 - Math.min(100, Math.abs(item.percentDistanceValue))),
          formatted: item.percentDistanceLabel,
          color: item.isHit
            ? "#f59e0b"
            : index === 0
              ? "#dc2626"
              : index === 1
                ? "#ea580c"
                : "#2563eb",
        })),
    [visibleEvaluatedTriggers],
  );

  const associationRows = useMemo(() => {
    const strategyLabelToRows = visibleEvaluatedTriggers.reduce((acc, item) => {
      const key = item.hasStrategy ? item.strategyLabel : "Sem estratégia";
      const current = acc.get(key) || {
        label: key,
        total: 0,
        hit: 0,
        monitoring: 0,
        noQuote: 0,
      };
      current.total += 1;
      if (item.derivedSituation === "atingido") current.hit += 1;
      if (item.derivedSituation === "monitorando") current.monitoring += 1;
      if (item.derivedSituation === "sem_cotacao") current.noQuote += 1;
      acc.set(key, current);
      return acc;
    }, new Map());

    return Array.from(strategyLabelToRows.values())
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
      .slice(0, 6);
  }, [visibleEvaluatedTriggers]);

  const triggerStatusSlices = useMemo(() => {
    const waiting = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "monitorando").length;
    const triggered = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "atingido").length;
    const inactive = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "inativo").length;
    const noQuote = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "sem_cotacao").length;
    const items = [
      { label: "Monitorando", value: waiting, color: "#0f766e" },
      { label: "Atingidos", value: triggered, color: "#f59e0b" },
      { label: "Sem cotação", value: noQuote, color: "#2563eb" },
      { label: "Inativos", value: inactive, color: "#94a3b8" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem gatilhos", value: 1, color: "#cbd5e1" }];
  }, [visibleEvaluatedTriggers]);
  const triggerCultureBars = useMemo(() => {
    const map = new Map();
    visibleEvaluatedTriggers.forEach((item) => {
      const label = item.cultureLabel;
      if (!label || normalizeText(label) === "sem ativo") return;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, value], index) => ({
        label,
        value,
        formatted: `${value} gatilhos`,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
  }, [visibleEvaluatedTriggers]);

  const strategyDefinition = resourceDefinitions.strategies;
  const triggerDefinition = resourceDefinitions.strategyTriggers;

  const openCreateStrategy = () => {
    setStrategyFormError("");
    setActiveStrategyForm({});
  };

  const openEditStrategy = (strategy) => {
    setStrategyFormError("");
    setActiveStrategyForm(strategy);
  };

  const closeStrategyForm = () => {
    setActiveStrategyForm(null);
    setStrategyFormError("");
  };

  const openCreateTrigger = () => {
    setTriggerFormError("");
    setActiveTriggerForm({});
  };

  const openCreateTriggerForStrategy = (strategy) => {
    setTriggerFormError("");
    setActiveTriggerForm({
      estrategia: strategy?.id || "",
    });
  };

  const openEditTrigger = (trigger) => {
    setTriggerFormError("");
    setActiveTriggerForm(trigger);
  };

  const closeTriggerForm = () => {
    setActiveTriggerForm(null);
    setTriggerFormError("");
  };

  const saveStrategyRecord = async (payload) => {
    try {
      const saved = activeStrategyForm?.id
        ? await resourceService.update(strategyDefinition.resource, activeStrategyForm.id, payload)
        : await resourceService.create(strategyDefinition.resource, payload);

      setStrategies((current) => {
        const index = current.findIndex((item) => String(item.id) === String(saved.id));
        if (index >= 0) {
          const next = [...current];
          next[index] = saved;
          return next;
        }
        return [saved, ...current];
      });
      closeStrategyForm();
    } catch (error) {
      setStrategyFormError(error?.response?.data?.detail || "Nao foi possivel salvar a estrategia.");
    }
  };

  const saveTriggerRecord = async (payload) => {
    try {
      const saved = activeTriggerForm?.id
        ? await resourceService.update(triggerDefinition.resource, activeTriggerForm.id, payload)
        : await resourceService.create(triggerDefinition.resource, payload);

      setTriggers((current) => {
        const index = current.findIndex((item) => String(item.id) === String(saved.id));
        if (index >= 0) {
          const next = [...current];
          next[index] = saved;
          return next;
        }
        return [saved, ...current];
      });
      closeTriggerForm();
    } catch (error) {
      setTriggerFormError(error?.response?.data?.detail || "Nao foi possivel salvar o gatilho.");
    }
  };

  const toggleStrategyFilter = (strategyId) => {
    setSelectedStrategyIds((current) => {
      const normalizedId = String(strategyId);
      return current.some((item) => String(item) === normalizedId)
        ? current.filter((item) => String(item) !== normalizedId)
        : [...current, strategyId];
    });
  };

  const duplicateStrategyRecord = async (strategy) => {
    try {
      const payload = buildDuplicatePayloadFromDefinition(strategyDefinition, strategy);
      payload.descricao_estrategia = `${strategy?.descricao_estrategia || `Estrategia ${strategy?.id || ""}`}`.trim() + " (copia)";
      const saved = await resourceService.create(strategyDefinition.resource, payload);
      setStrategies((current) => [saved, ...current]);
    } catch (error) {
      setStrategyFormError(error?.response?.data?.detail || "Nao foi possivel duplicar a estrategia.");
    }
  };

  const removeStrategyRecord = async (strategy) => {
    const strategyLabel = strategy?.descricao_estrategia || `Estratégia ${strategy?.id || ""}`;
    if (!window.confirm(`Excluir a estratégia "${strategyLabel}"?`)) {
      return;
    }

    try {
      await resourceService.remove(strategyDefinition.resource, strategy.id);
      setStrategies((current) => current.filter((item) => String(item.id) !== String(strategy.id)));
      setSelectedStrategyIds((current) => current.filter((item) => String(item) !== String(strategy.id)));
      if (String(activeStrategyForm?.id || "") === String(strategy.id)) {
        closeStrategyForm();
      }
    } catch (error) {
      setStrategyFormError(error?.response?.data?.detail || "Nao foi possivel excluir a estrategia.");
    }
  };

  const duplicateTriggerRecord = async (trigger) => {
    try {
      const payload = buildDuplicatePayloadFromDefinition(triggerDefinition, trigger);
      payload.obs = `${payload.obs || ""}`.trim();
      const saved = await resourceService.create(triggerDefinition.resource, payload);
      setTriggers((current) => [saved, ...current]);
    } catch (error) {
      setTriggerFormError(error?.response?.data?.detail || "Nao foi possivel duplicar o gatilho.");
    }
  };

  const removeTriggerRecord = async (trigger) => {
    const triggerLabel = trigger?.contractLabel || trigger?.contrato_derivativo || trigger?.contrato_bolsa || `Gatilho ${trigger?.id || ""}`;
    if (!window.confirm(`Excluir o gatilho "${triggerLabel}"?`)) {
      return;
    }

    try {
      await resourceService.remove(triggerDefinition.resource, trigger.id);
      setTriggers((current) => current.filter((item) => String(item.id) !== String(trigger.id)));
      if (String(activeTriggerForm?.id || "") === String(trigger.id)) {
        closeTriggerForm();
      }
    } catch (error) {
      setTriggerFormError(error?.response?.data?.detail || "Nao foi possivel excluir o gatilho.");
    }
  };

  const strategyCardRows = useMemo(
    () =>
      strategyFilterRows.map((strategy) => {
        const linkedTriggers = evaluatedTriggers
          .filter((item) => String(item?.estrategia || item?.estrategia?.id || "") === String(strategy.id))
          .map((item) => ({
            id: item.id,
            label: item.contractLabel,
            status: item.derivedSituation,
            directionLabel: item.directionLabel,
            strikeLabel: formatTriggerMarketValue(item.strike),
          }));
        return {
          ...strategy,
          linkedTriggers,
        };
      }),
    [evaluatedTriggers, strategyFilterRows],
  );

  const triggerRowsByExchange = useMemo(() => {
    const exchangeMap = new Map();
    visibleEvaluatedTriggers.forEach((item) => {
      const key = item.exchangeLabel || "Sem bolsa";
      exchangeMap.set(key, (exchangeMap.get(key) || 0) + 1);
    });
    return Array.from(exchangeMap.entries())
      .map(([label, value], index) => ({
        label,
        value,
        formatted: `${value} gatilho(s)`,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);
  }, [visibleEvaluatedTriggers]);

  const strategyLoadBars = useMemo(() => {
    const aggregated = new Map();
    strategyCardRows.forEach((item) => {
      const label = item.descricao_estrategia || `Estratégia ${item.id}`;
      aggregated.set(label, (aggregated.get(label) || 0) + (item.totalTriggers || 0));
    });
    return Array.from(aggregated.entries())
      .sort(([, left], [, right]) => right - left)
      .slice(0, 6)
      .map(([label, total], index) => ({
        label,
        value: total || 0.01,
        formatted: `${total} gatilho(s)`,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }));
  }, [strategyCardRows]);

  const hitVsMonitoringBars = useMemo(() => {
    const hit = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "atingido").length;
    const monitoring = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "monitorando").length;
    const noQuote = visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "sem_cotacao").length;
    return [
      { label: "Atingidos", value: hit || 0.01, formatted: `${hit} gatilho(s)`, color: "#f59e0b" },
      { label: "Monitorando", value: monitoring || 0.01, formatted: `${monitoring} gatilho(s)`, color: "#0f766e" },
      { label: "Sem cotação", value: noQuote || 0.01, formatted: `${noQuote} gatilho(s)`, color: "#2563eb" },
    ];
  }, [visibleEvaluatedTriggers]);

  const triggerTopStatusRows = useMemo(
    () => [
      { label: "Cadastrados", value: strategyScopedEvaluatedTriggers.length, filterValue: "", isActive: selectedTriggerStatus === "" },
      { label: "Atingidos", value: strategyScopedEvaluatedTriggers.filter((item) => item.derivedSituation === "atingido").length, filterValue: "atingido", isActive: selectedTriggerStatus === "atingido" },
      { label: "Monitorando", value: strategyScopedEvaluatedTriggers.filter((item) => item.derivedSituation === "monitorando").length, filterValue: "monitorando", isActive: selectedTriggerStatus === "monitorando" },
      { label: "Sem cotação", value: strategyScopedEvaluatedTriggers.filter((item) => item.derivedSituation === "sem_cotacao").length, filterValue: "sem_cotacao", isActive: selectedTriggerStatus === "sem_cotacao" },
    ],
    [selectedTriggerStatus, strategyScopedEvaluatedTriggers],
  );

  const triggerTopExchangeRows = useMemo(
    () =>
      triggerRowsByExchange.length
        ? [{ label: "Todas", value: `${strategyScopedEvaluatedTriggers.length} gatilho(s)`, filterValue: "", isActive: selectedTriggerExchange === "" }, ...triggerRowsByExchange.slice(0, 4).map((item) => ({
            label: item.label,
            value: item.formatted,
            filterValue: item.label,
            isActive: selectedTriggerExchange === item.label,
          }))]
        : [{ label: "Todas", value: "0 gatilhos", filterValue: "", isActive: true }],
    [selectedTriggerExchange, strategyScopedEvaluatedTriggers.length, triggerRowsByExchange],
  );

  const triggerTopClosestRows = useMemo(
    () =>
      visibleEvaluatedTriggers
        .slice()
        .sort((left, right) => {
          const leftDistance = Number.isFinite(left.percentDistanceValue) ? Math.abs(left.percentDistanceValue) : Number.POSITIVE_INFINITY;
          const rightDistance = Number.isFinite(right.percentDistanceValue) ? Math.abs(right.percentDistanceValue) : Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }
          return String(left.contractLabel).localeCompare(String(right.contractLabel));
        })
        .map((item) => ({
          id: item.id,
          label: `${item.directionLabel ? `${String(item.directionLabel).trim()} de` : "Sem direção"} ${formatTriggerMarketValue(item.strike)}${
            (exchangePriceUnitMap.get(item.exchangeLabel) || item.priceUnitLabel) ? ` ${exchangePriceUnitMap.get(item.exchangeLabel) || item.priceUnitLabel}` : ""
          }`.trim(),
          exchange: item.exchangeAndContractLabel,
          distance: formatTriggerTargetDistance(item),
          tone: item.isHit ? "is-hit" : Number.isFinite(item.percentDistanceValue) ? "is-open" : "is-missing",
        })),
    [exchangePriceUnitMap, visibleEvaluatedTriggers],
  );

  return (
    <section className="risk-kpi-shell">
      <section className="strategy-actions-row">
        <button type="button" className="btn btn-secondary" onClick={openCreateStrategy}>
          Nova estratégia
        </button>
        <button type="button" className="btn btn-primary" onClick={openCreateTrigger}>
          Novo gatilho
        </button>
      </section>

      <section className="strategy-top-summary-grid">
        <article className="chart-card strategy-top-summary-card">
          <div className="chart-card-header">
            <div>
              <h3>Resumo dos gatilhos</h3>
              <p className="muted">Leitura rápida do total cadastrado e do status operacional atual.</p>
            </div>
          </div>
          <div className="strategy-top-summary-stack">
            {triggerTopStatusRows.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`strategy-top-summary-row${item.isActive ? " is-active" : ""}`}
                onClick={() => setSelectedTriggerStatus(item.filterValue)}
              >
                <span>{item.label}</span>
                <strong>{formatNumber0(item.value)}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="chart-card strategy-top-summary-card">
          <div className="chart-card-header">
            <div>
              <h3>Bolsas dos gatilhos</h3>
              <p className="muted">Concentração dos gatilhos por bolsa dentro do filtro atual.</p>
            </div>
          </div>
          <div className="strategy-top-summary-stack">
            {triggerTopExchangeRows.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`strategy-top-summary-row${item.isActive ? " is-active" : ""}`}
                onClick={() => setSelectedTriggerExchange(item.filterValue)}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="chart-card strategy-top-summary-card is-table">
          <div className="chart-card-header">
            <div>
              <h3>Mais próximos do alvo</h3>
              <p className="muted">Mini-tabela dos gatilhos mais próximos do strike em percentual.</p>
            </div>
          </div>
          <div className="strategy-top-table">
            <div className="strategy-top-table-head">
              <span>Bolsa</span>
              <span>Gatilho</span>
            </div>
            {triggerTopClosestRows.length ? (
              triggerTopClosestRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="strategy-top-table-row"
                  onClick={() => {
                    const row = visibleEvaluatedTriggers.find((trigger) => String(trigger.id) === String(item.id));
                    if (row) {
                      openEditTrigger(row);
                    }
                  }}
                >
                  <span>{item.exchange}</span>
                  <span>{item.label}</span>
                  <strong className={item.tone}>{item.distance}</strong>
                </button>
              ))
            ) : (
              <div className="strategy-top-table-empty">Sem gatilhos com percentual calculado.</div>
            )}
          </div>
        </article>
      </section>

      <section className="strategy-primary-grid">
        <article className="chart-card summary-insight-card">
          <div className="chart-card-header">
            <div>
              <h3>Estratégias</h3>
              <p className="muted">Clique na estratégia para editar. Use o botão lateral para filtrar os gatilhos relacionados.</p>
            </div>
            <div className="strategy-card-summary">
              <strong>{formatNumber0(filteredStrategies.length)}</strong>
              <span>{formatNumber0(activeStrategies)} ativas</span>
            </div>
          </div>
          <div className="strategy-collection-list">
            {strategyCardRows.length ? (
              strategyCardRows.map((strategy) => {
                const isFiltered = selectedStrategyIds.some((item) => String(item) === String(strategy.id));
                return (
                  <article
                    key={strategy.id}
                    className={`strategy-entity-card${isFiltered ? " is-filtered" : ""}`}
                    onClick={() => openEditStrategy(strategy)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEditStrategy(strategy);
                      }
                    }}
                  >
                    <div className="strategy-entity-header">
                      <div>
                        <strong>{strategy.descricao_estrategia || `Estratégia ${strategy.id}`}</strong>
                        <span>{`${strategy.totalTriggers} gatilho(s) | ${strategy.hitTriggers} atingido(s)`}</span>
                      </div>
                      <div className="strategy-entity-actions">
                        <button
                          type="button"
                          className={`strategy-filter-chip${isFiltered ? " active" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleStrategyFilter(strategy.id);
                          }}
                        >
                          Filtrar
                        </button>
                        <button
                          type="button"
                          className="strategy-trigger-inline-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            duplicateStrategyRecord(strategy);
                          }}
                        >
                          Duplicar
                        </button>
                      </div>
                    </div>
                    <div className="strategy-entity-meta">
                      <span>{strategy.status || "Sem status"}</span>
                      <span>{strategy.data_validade ? formatBrazilianDate(strategy.data_validade) : "Sem validade"}</span>
                      <span>{`${strategy.totalTriggers} gatilho(s)`}</span>
                      <span>{strategy.groupSummary}</span>
                      <span>{strategy.subgroupSummary}</span>
                    </div>
                    <div className="strategy-linked-trigger-table">
                      {strategy.linkedTriggers.length ? (
                        strategy.linkedTriggers.map((trigger) => (
                          <div key={trigger.id} className="strategy-linked-trigger-row">
                            <span className="strategy-linked-trigger-name">{trigger.label}</span>
                            <span className={`strategy-linked-trigger-state strategy-linked-trigger-${trigger.status}`}>{trigger.status === "atingido" ? "Atingido" : trigger.status === "monitorando" ? "Monitorando" : trigger.status === "sem_cotacao" ? "Sem cotação" : "Manual"}</span>
                            <span className="strategy-linked-trigger-rule">{`${trigger.directionLabel} ${trigger.strikeLabel}`}</span>
                          </div>
                        ))
                      ) : (
                        <span className="strategy-linked-trigger-empty">Sem gatilhos cadastrados</span>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="muted">Sem estratégias no filtro atual.</p>
            )}
          </div>
        </article>

        <article className="chart-card summary-insight-card">
          <div className="chart-card-header">
            <div>
              <h3>Gatilhos</h3>
              <p className="muted">Visual detalhado dos gatilhos monitorados. Clique no item para editar e use duplicar para replicar rapidamente.</p>
            </div>
            <div className="strategy-card-summary">
              <strong>{formatNumber0(visibleEvaluatedTriggers.length)}</strong>
              <span>{formatNumber0(visibleEvaluatedTriggers.filter((item) => item.derivedSituation === "atingido").length)} atingidos</span>
            </div>
          </div>
          <div className="strategy-trigger-detail-list">
            {visibleEvaluatedTriggers.length ? (
              visibleEvaluatedTriggers.map((item) => (
                <article
                  key={item.id}
                  className="strategy-trigger-detail-card"
                  onClick={() => openEditTrigger(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEditTrigger(item);
                    }
                  }}
                >
                  <div className="strategy-trigger-detail-top">
                    <div className="strategy-trigger-detail-heading">
                      <strong>{item.contractLabel}</strong>
                      <span>{`${item.tipoLabel} | ${item.exchangeLabel} | ${item.cultureLabel}`}</span>
                    </div>
                  </div>
                  <div className="strategy-trigger-detail-body">
                    <div className="strategy-trigger-detail-actions">
                      <span className={`strategy-trigger-status is-${item.derivedSituation}`}>
                        {item.derivedSituation === "atingido"
                          ? "Atingido"
                          : item.derivedSituation === "monitorando"
                            ? "Monitorando"
                            : item.derivedSituation === "sem_cotacao"
                              ? "Sem cotação"
                              : item.statusLabel || "Manual"}
                      </span>
                      <button
                        type="button"
                        className="strategy-trigger-inline-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          duplicateTriggerRecord(item);
                        }}
                      >
                        Duplicar
                      </button>
                    </div>
                    <div className="strategy-trigger-compact-grid">
                      <span><b>Estratégia:</b> {item.hasStrategy ? item.strategyLabel : "Sem estratégia"}</span>
                      <span><b>Regra:</b> {`${item.directionLabel} de ${formatTriggerMarketValue(item.strike)}`}</span>
                      <span><b>Cotação:</b> {`${formatTriggerMarketValue(item.currentPrice)}${item.quoteLabel ? ` | ${item.quoteLabel}` : ""}`}</span>
                      <span><b>Volume:</b> {item.volumeObjetivo > 0 ? `${formatNumber0(item.volumeObjetivo)} ${item.unidade || ""}`.trim() : "—"}</span>
                    </div>
                  </div>
                  {item.percentDistanceLabel ? (
                    <div className={`strategy-trigger-distance-row${!item.isHit ? " is-alert" : ""}`}>
                      {item.percentDistanceLabel}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="muted">Sem gatilhos para o filtro atual.</p>
            )}
          </div>
        </article>
      </section>

      <section className="strategy-analytics-grid">
        <DonutChart
          centerLabel="Status"
          centerValue={`${visibleEvaluatedTriggers.length}`}
          slices={triggerStatusSlices}
          insightTitle="Status dos gatilhos"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Distribuição dos gatilhos entre atingidos, monitorando, sem cotação e inativos.",
                "Serve para entender rapidamente o estado operacional da carteira filtrada.",
              ]}
            />
          }
        />
        <DonutChart
          centerLabel="Tipos"
          centerValue={`${visibleEvaluatedTriggers.length}`}
          slices={triggerTypeSlices}
          insightTitle="Fisico x derivativo"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Separa os gatilhos por natureza operacional.",
                "Ajuda a medir o peso do que depende de API versus acompanhamento manual.",
              ]}
            />
          }
        />
        <DonutChart
          centerLabel="Vínculo"
          centerValue={`${visibleEvaluatedTriggers.length}`}
          slices={strategyAssociationSlices}
          insightTitle="Com e sem estratégia"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Mostra a proporção entre gatilhos associados a estratégias e gatilhos independentes.",
                "Ajuda a entender o quanto o monitoramento está estruturado por estratégia.",
              ]}
            />
          }
        />
        <ScenarioBars
          data={closestTriggerBars.length ? closestTriggerBars : [{ label: "Sem dados", value: 1, formatted: "Sem distância calculada", color: "#cbd5e1" }]}
          insightTitle="Mais próximos do strike"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Prioriza os gatilhos mais próximos de bater a condição.",
                "Quanto menor a distância, maior a urgência operacional.",
              ]}
            />
          }
        />
        <ScenarioBars
          data={triggerCultureBars.length ? triggerCultureBars : [{ label: "Sem dados", value: 1, formatted: "0 gatilhos", color: "#cbd5e1" }]}
          insightTitle="Gatilhos por ativo"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Concentração de gatilhos por ativo monitorado.",
                "Ajuda a identificar onde a mesa está mais exposta em termos de atenção.",
              ]}
            />
          }
        />
        <ScenarioBars
          data={strategyLoadBars.length ? strategyLoadBars : [{ label: "Sem dados", value: 1, formatted: "0 gatilhos", color: "#cbd5e1" }]}
          insightTitle="Estratégias com mais gatilhos"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Ranking das estratégias com mais gatilhos cadastrados.",
                "Bom para identificar estruturas mais complexas ou mais acompanhadas.",
              ]}
            />
          }
        />
        <ScenarioBars
          data={triggerRowsByExchange.length ? triggerRowsByExchange : [{ label: "Sem dados", value: 1, formatted: "0 gatilhos", color: "#cbd5e1" }]}
          insightTitle="Gatilhos por bolsa"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Mostra em quais bolsas os gatilhos estão concentrados.",
                "Ajuda a enxergar foco de monitoramento por mercado.",
              ]}
            />
          }
        />
        <ScenarioBars
          data={hitVsMonitoringBars}
          insightTitle="Atingidos x monitorando"
          insightMessage={
            <SummaryInsightCopy
              paragraphs={[
                "Comparativo direto entre o que já atingiu, o que ainda monitora e o que está sem cotação.",
                "Funciona como leitura rápida de produtividade operacional do monitoramento.",
              ]}
            />
          }
        />
      </section>

      {activeStrategyForm !== null ? (
        <ResourceForm
          title={activeStrategyForm?.id ? "Editar Estratégia" : "Nova Estratégia"}
          fields={strategyDefinition.fields}
          initialValues={activeStrategyForm}
          submitLabel={activeStrategyForm?.id ? "Salvar estratégia" : "Criar estratégia"}
          beforeContent={
            <div className="strategy-form-shortcut">
              {activeStrategyForm?.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openCreateTriggerForStrategy(activeStrategyForm)}
                  >
                    Cadastrar gatilho desta estratégia
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => removeStrategyRecord(activeStrategyForm)}
                  >
                    Excluir estratégia
                  </button>
                </>
              ) : (
                <div className="field-help">
                  Salve a estratégia primeiro para cadastrar um gatilho já vinculado a ela.
                </div>
              )}
            </div>
          }
          error={strategyFormError}
          onClose={closeStrategyForm}
          onSubmit={saveStrategyRecord}
        />
      ) : null}

      {activeTriggerForm !== null ? (
        <ResourceForm
          title={activeTriggerForm?.id ? "Editar Gatilho" : "Novo Gatilho"}
          fields={triggerDefinition.fields}
          initialValues={activeTriggerForm}
          submitLabel={activeTriggerForm?.id ? "Salvar gatilho" : "Criar gatilho"}
          beforeContent={
            activeTriggerForm?.id ? (
              <div className="strategy-form-shortcut">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => removeTriggerRecord(activeTriggerForm)}
                >
                  Excluir gatilho
                </button>
              </div>
            ) : null
          }
          error={triggerFormError}
          onClose={closeTriggerForm}
          onSubmit={saveTriggerRecord}
        />
      ) : null}
    </section>
  );
}

const CLIENT_RANKING_COLORS = ["#0f766e", "#2563eb", "#ea580c", "#dc2626", "#0891b2", "#65a30d", "#9333ea", "#d97706"];
const CLIENT_RANKING_TOP_LIMIT = 10;

const readClientRankingRelationId = (value) => {
  if (value && typeof value === "object" && value.id != null) return String(value.id);
  if (value !== null && value !== undefined && value !== "") return String(value);
  return "";
};

const readClientRankingRelationLabel = (value, labelKeys = []) => {
  if (!value || typeof value !== "object") return "";
  for (const key of labelKeys) {
    const label = value?.[key];
    if (label !== null && label !== undefined && String(label).trim()) {
      return String(label).trim();
    }
  }
  return "";
};

const buildRelationLookup = (rows = [], labelKeys = []) =>
  new Map(
    (Array.isArray(rows) ? rows : [])
      .map((item) => {
        const id = readClientRankingRelationId(item?.id);
        const label = readClientRankingRelationLabel(item, labelKeys) || id;
        return id ? [id, label] : null;
      })
      .filter(Boolean),
  );

const resolveClientFromGroup = (row, groupLookup) => {
  const groupId = readClientRankingRelationId(row?.grupo);
  const groupLabel =
    readClientRankingRelationLabel(row?.grupo, ["grupo", "name", "nome", "label"]) ||
    row?.grupo_name ||
    groupLookup.get(groupId) ||
    "";
  return {
    id: groupId || "__sem_cliente__",
    label: groupLabel || "Sem cliente",
  };
};

const resolveClientFromSubgroup = (row, subgroupLookup) => {
  const subgroupId = readClientRankingRelationId(row?.subgrupo);
  const subgroupLabel =
    readClientRankingRelationLabel(row?.subgrupo, ["subgrupo", "name", "nome", "label"]) ||
    row?.subgrupo_name ||
    subgroupLookup.get(subgroupId) ||
    "";
  return {
    id: subgroupId || "__sem_subgrupo__",
    label: subgroupLabel || "Sem subgrupo",
  };
};

const resolveDerivativeOperationLabel = (item) =>
  String(
    item?.nome_da_operacao ||
      `${item?.posicao || ""} ${item?.tipo_derivativo || ""}`.trim() ||
      item?.cod_operacao_mae ||
      `Operacao ${item?.id || ""}`,
  ).trim() || "Operacao sem nome";

const formatClientRankingBrl = (value) => `R$ ${formatCurrency2(value)}`;
const formatClientRankingUsd = (value) => `U$ ${formatCurrency2(value)}`;
const formatClientRankingSignedBrl = (value) => {
  const numericValue = Number(value || 0);
  const prefix = numericValue > 0 ? "+R$ " : numericValue < 0 ? "-R$ " : "R$ ";
  return `${prefix}${formatCurrency2(Math.abs(numericValue))}`;
};

const formatClientRankingCompactCurrency = (value) => {
  const numericValue = Number(value || 0);
  const prefix = numericValue > 0 ? "+R$ " : numericValue < 0 ? "-R$ " : "R$ ";
  const absoluteValue = Math.abs(numericValue);
  if (absoluteValue >= 1000000) return `${prefix}${formatNumber(absoluteValue / 1000000, " mi")}`;
  if (absoluteValue >= 1000) return `${prefix}${formatNumber(absoluteValue / 1000, " mil")}`;
  return `${prefix}${formatNumber0(absoluteValue)}`;
};

const formatClientRankingCompactNumber = (value, suffix = "") => {
  const absoluteValue = Math.abs(Number(value || 0));
  if (absoluteValue >= 1000000) return `${formatNumber(absoluteValue / 1000000, " mi")}${suffix}`;
  if (absoluteValue >= 1000) return `${formatNumber(absoluteValue / 1000, " mil")}${suffix}`;
  return `${formatNumber0(absoluteValue)}${suffix}`;
};

const createClientRankingHorizontalOption = ({
  rows,
  valueKey = "value",
  color = "#0f766e",
  signed = false,
  valueFormatter = formatClientRankingCompactCurrency,
  seriesName = "Valor",
}) => {
  const chartRows = rows;
  const values = chartRows.map((item) => Number(item?.[valueKey] || 0));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const resolveColor = signed
    ? ({ value }) => (Number(value) >= 0 ? "#16a34a" : "#dc2626")
    : color;
  return {
    animationDuration: 220,
    grid: { left: 116, right: 22, top: 14, bottom: 24 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) =>
        params
          .map((item) => `${item.marker}${item.name}: ${valueFormatter(item.value)}`)
          .join("<br/>"),
    },
    xAxis: {
      type: "value",
      min: minValue < 0 ? minValue : 0,
      max: maxValue > 0 ? undefined : 0,
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: chartRows.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: "#334155",
        fontWeight: 700,
        overflow: "truncate",
        width: 104,
      },
    },
    series: [
      {
        name: seriesName,
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { color: resolveColor, borderRadius: CHART_BAR_RADIUS },
        label: {
          show: true,
          position: ({ value }) => (Number(value || 0) >= 0 ? "right" : "left"),
          color: "#0f172a",
          fontWeight: 700,
          fontSize: 11,
          formatter: ({ value }) => (Number(value || 0) ? valueFormatter(value) : ""),
        },
        data: values,
      },
    ],
  };
};

const createClientRankingVerticalOption = ({
  rows,
  valueKey = "value",
  color = "#2563eb",
  valueFormatter = (value) => formatNumber0(value),
  seriesName = "Total",
}) => {
  const chartRows = rows;
  return {
    animationDuration: 220,
    grid: { left: 18, right: 16, top: 18, bottom: 56, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) =>
        params
          .map((item) => `${item.marker}${item.name}: ${valueFormatter(item.value)}`)
          .join("<br/>"),
    },
    xAxis: {
      type: "category",
      data: chartRows.map((item) => item.label),
      axisTick: { show: false },
      axisLabel: { color: "#475569", interval: 0, rotate: 22, overflow: "truncate", width: 78 },
    },
    yAxis: {
      type: "value",
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    series: [
      {
        name: seriesName,
        type: "bar",
        barMaxWidth: 30,
        itemStyle: { color, borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
        label: {
          show: true,
          position: "top",
          color: "#0f172a",
          fontWeight: 700,
          fontSize: 11,
          formatter: ({ value }) => (Number(value || 0) ? valueFormatter(value) : ""),
        },
        data: chartRows.map((item) => Number(item?.[valueKey] || 0)),
      },
    ],
  };
};

const createClientRankingStackedOption = ({ rows, series, valueFormatter = (value) => formatNumber0(value) }) => {
  const chartRows = rows;
  return {
    animationDuration: 220,
    color: series.map((item) => item.color),
    grid: { left: 22, right: 16, top: 40, bottom: 48, containLabel: true },
    legend: { top: 0, left: 0, textStyle: { color: "#475569", fontWeight: 700 } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) =>
        params
          .map((item) => `${item.marker}${item.seriesName}: ${valueFormatter(item.value)}`)
          .join("<br/>"),
    },
    xAxis: {
      type: "category",
      data: chartRows.map((item) => item.label),
      axisTick: { show: false },
      axisLabel: { color: "#475569", interval: 0, rotate: 22, overflow: "truncate", width: 80 },
    },
    yAxis: {
      type: "value",
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    series: series.map((item) => ({
      name: item.label,
      type: "bar",
      stack: "total",
      barMaxWidth: 32,
      itemStyle: { borderRadius: CHART_BAR_RADIUS },
      label: {
        show: true,
        position: "inside",
        color: "#fff",
        fontWeight: 800,
        formatter: ({ value }) => (Number(value || 0) > 0 ? valueFormatter(value) : ""),
      },
      data: chartRows.map((row) => Number(row?.[item.key] || 0)),
    })),
  };
};

const createClientRankingDonutOption = ({
  rows,
  valueKey = "value",
  valueFormatter = formatClientRankingCompactCurrency,
  centerLabel = "Top clientes",
}) => {
  const chartRows = rows;
  const total = chartRows.reduce((sum, item) => sum + Math.abs(Number(item?.[valueKey] || 0)), 0);
  const data = chartRows.map((item, index) => ({
    name: item.label,
    value: Math.abs(Number(item?.[valueKey] || 0)),
    itemStyle: { color: CLIENT_RANKING_COLORS[index % CLIENT_RANKING_COLORS.length] },
  }));
  return {
    animationDuration: 220,
    tooltip: {
      trigger: "item",
      formatter: ({ marker, name, value }) => `${marker}${name}: ${valueFormatter(value)}`,
    },
    legend: {
      bottom: 0,
      textStyle: { color: "#475569", fontSize: 11, fontWeight: 700 },
    },
    series: [
      {
        type: "pie",
        radius: ["50%", "74%"],
        center: ["50%", "42%"],
        minAngle: 8,
        avoidLabelOverlap: true,
        labelLine: { show: false },
        label: {
          show: true,
          position: "inside",
          color: "#fff",
          fontWeight: 800,
          formatter: ({ percent }) => (Number(percent || 0) >= 12 ? `${Math.round(percent)}%` : ""),
        },
        data,
      },
    ],
    graphic: [
      {
        type: "text",
        left: "center",
        top: "34%",
        style: {
          text: valueFormatter(total),
          fill: "#0f172a",
          fontSize: 19,
          fontWeight: 900,
          textAlign: "center",
        },
      },
      {
        type: "text",
        left: "center",
        top: "49%",
        style: {
          text: centerLabel,
          fill: "#64748b",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
        },
      },
    ],
  };
};

function ClientRankingTable({ columns, rows, emptyLabel = "Nenhum dado no recorte atual." }) {
  return (
    <div className="client-ranking-table-wrap">
      <table className="client-ranking-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === "right" ? "is-number" : ""}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row.key || row.id || `${row.label}-${index}`}>
                {columns.map((column) => {
                  let signClass = "";
                  if (column.signed) {
                    const raw = Number(row[column.signedKey ?? column.key] ?? 0);
                    if (raw > 0) signClass = " is-positive";
                    else if (raw < 0) signClass = " is-negative";
                  }
                  return (
                    <td key={`${row.key || row.id || row.label}-${column.key}`} className={`${column.align === "right" ? "is-number" : ""}${signClass}`}>
                      {column.render ? column.render(row, index) : row[column.key]}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="client-ranking-empty-cell">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClientRankingMetric({ title, description, option, chartHeight = 318, tableColumns, tableRows, tableEmptyLabel }) {
  return (
    <section className="client-ranking-metric">
      <div className="client-ranking-metric-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="client-ranking-metric-body">
        <div className="client-ranking-chart" aria-label={title}>
          <ReactECharts option={option} style={{ height: chartHeight, width: "100%" }} opts={{ renderer: "svg" }} />
        </div>
        <ClientRankingTable columns={tableColumns} rows={tableRows} emptyLabel={tableEmptyLabel} />
      </div>
    </section>
  );
}

function ClientRankingDashboard({ dashboardFilter }) {
  const [data, setData] = useState({
    groups: [],
    subgroups: [],
    derivatives: [],
    physicalSales: [],
    physicalPayments: [],
    cashPayments: [],
    otherEntries: [],
    otherCashOutflows: [],
    hedgePolicies: [],
    cropBoards: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState("grupo");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    Promise.all([
      resourceService.listAll("groups").catch(() => []),
      resourceService.listAll("subgroups").catch(() => []),
      resourceService.listAll("derivative-operations").catch(() => []),
      resourceService.listAll("physical-sales").catch(() => []),
      resourceService.listAll("physical-payments").catch(() => []),
      resourceService.listAll("cash-payments").catch(() => []),
      resourceService.listAll("other-entries").catch(() => []),
      resourceService.listAll("other-cash-outflows").catch(() => []),
      resourceService.listAll("hedge-policies").catch(() => []),
      resourceService.listAll("crop-boards").catch(() => []),
    ])
      .then(([groups, subgroups, derivatives, physicalSales, physicalPayments, cashPayments, otherEntries, otherCashOutflows, hedgePolicies, cropBoards]) => {
        if (!isMounted) return;
        setData({
          groups: Array.isArray(groups) ? groups : [],
          subgroups: Array.isArray(subgroups) ? subgroups : [],
          derivatives: Array.isArray(derivatives) ? derivatives : [],
          physicalSales: Array.isArray(physicalSales) ? physicalSales : [],
          physicalPayments: Array.isArray(physicalPayments) ? physicalPayments : [],
          cashPayments: Array.isArray(cashPayments) ? cashPayments : [],
          otherEntries: Array.isArray(otherEntries) ? otherEntries : [],
          otherCashOutflows: Array.isArray(otherCashOutflows) ? otherCashOutflows : [],
          hedgePolicies: Array.isArray(hedgePolicies) ? hedgePolicies : [],
          cropBoards: Array.isArray(cropBoards) ? cropBoards : [],
        });
      })
      .catch(() => {
        if (isMounted) setError("Nao foi possivel carregar todos os dados do ranking.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const [selectedExchanges, setSelectedExchanges] = useState([]);

  const groupLookup = useMemo(() => buildRelationLookup(data.groups, ["grupo", "name", "nome", "label"]), [data.groups]);
  const subgroupLookup = useMemo(() => buildRelationLookup(data.subgroups, ["subgrupo", "name", "nome", "label"]), [data.subgroups]);
  const resolveClient = useCallback(
    (row) => groupBy === "subgrupo" ? resolveClientFromSubgroup(row, subgroupLookup) : resolveClientFromGroup(row, groupLookup),
    [groupBy, groupLookup, subgroupLookup],
  );

  const filteredDerivatives = data.derivatives;

  const availableExchanges = useMemo(() => {
    const labels = new Set();
    filteredDerivatives.forEach((item) => {
      const label = item?.bolsa_ref || item?.ctrbolsa || item?.bolsa?.nome || item?.bolsa || null;
      if (label) labels.add(String(label).trim());
    });
    return Array.from(labels).sort();
  }, [filteredDerivatives]);

  const exchangeFilteredDerivatives = useMemo(
    () =>
      selectedExchanges.length === 0
        ? filteredDerivatives
        : filteredDerivatives.filter((item) => {
            const label = item?.bolsa_ref || item?.ctrbolsa || item?.bolsa?.nome || item?.bolsa || null;
            return label && selectedExchanges.includes(String(label).trim());
          }),
    [filteredDerivatives, selectedExchanges],
  );

  const filteredPhysicalSales = data.physicalSales;

  const filteredPhysicalPayments = data.physicalPayments;

  const filteredCashPayments = data.cashPayments;

  const filteredOtherEntries = data.otherEntries;

  const filteredOtherCashOutflows = data.otherCashOutflows;

  const derivativeRows = useMemo(
    () =>
      exchangeFilteredDerivatives.map((item) => {
        const client = resolveClient(item);
        const settlementDate = parseDashboardDate(item?.data_liquidacao || item?.data_vencimento || item?.vencimento);
        const statusLabel = normalizeText(item?.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";
        const daysToSettlement = settlementDate
          ? Math.round((startOfDashboardDay(settlementDate) - startOfDashboardDay(new Date())) / (1000 * 60 * 60 * 24))
          : null;
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          operationLabel: resolveDerivativeOperationLabel(item),
          adjustmentBrl: normalizeText(item?.moeda_ou_cmdtye) === "moeda"
            ? parseLocalizedNumber(item?.ajustes_totais_usd)
            : parseLocalizedNumber(item?.ajustes_totais_brl),
          adjustmentUsd: parseLocalizedNumber(item?.ajustes_totais_usd),
          financialVolume: Math.abs(parseLocalizedNumber(item?.volume_financeiro_valor || item?.volume_financeiro_valor_moeda_original)),
          physicalVolume: Math.abs(parseLocalizedNumber(item?.volume_fisico_valor || item?.volume || item?.quantidade_derivativos)),
          lots: Math.abs(parseLocalizedNumber(item?.numero_lotes || item?.quantidade_derivativos)),
          statusLabel,
          settlementDate,
          daysToSettlement,
        };
      }),
    [exchangeFilteredDerivatives, resolveClient],
  );

  const physicalSaleRows = useMemo(
    () =>
      filteredPhysicalSales.map((item) => {
        const client = resolveClient(item);
        const volume = Math.abs(parseLocalizedNumber(item?.volume_fisico));
        const price = parseLocalizedNumber(item?.preco);
        const revenue = parseLocalizedNumber(item?.faturamento_total_contrato) || volume * price;
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          volume,
          price,
          revenue,
          currency: String(item?.moeda_contrato || item?.moeda_unidade || "R$").trim() || "R$",
        };
      }),
    [filteredPhysicalSales, resolveClient],
  );

  const physicalPaymentRows = useMemo(
    () =>
      filteredPhysicalPayments.map((item) => {
        const client = resolveClient(item);
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          volume: Math.abs(parseLocalizedNumber(item?.volume)),
        };
      }),
    [filteredPhysicalPayments, resolveClient],
  );

  const cashPaymentRows = useMemo(
    () =>
      filteredCashPayments.map((item) => {
        const client = resolveClient(item);
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          value: Math.abs(parseLocalizedNumber(item?.valor || item?.volume || item?.volume_total_operacao)),
        };
      }),
    [filteredCashPayments, resolveClient],
  );

  const otherEntryRows = useMemo(
    () =>
      filteredOtherEntries.map((item) => {
        const client = resolveClient(item);
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          value: Math.abs(parseLocalizedNumber(item?.valor)),
        };
      }),
    [filteredOtherEntries, resolveClient],
  );

  const otherCashOutflowRows = useMemo(
    () =>
      filteredOtherCashOutflows.map((item) => {
        const client = resolveClient(item);
        return {
          ...item,
          clientId: client.id,
          clientLabel: client.label,
          value: Math.abs(parseLocalizedNumber(item?.valor)),
        };
      }),
    [filteredOtherCashOutflows, resolveClient],
  );

  const adjustmentRows = useMemo(() => {
    const map = new Map();
    derivativeRows.forEach((item) => {
      const current = map.get(item.clientId) || {
        key: item.clientId,
        label: item.clientLabel,
        value: 0,
        usd: 0,
        count: 0,
        operationMap: new Map(),
      };
      current.value += item.adjustmentBrl;
      current.usd += item.adjustmentUsd;
      current.count += 1;
      current.operationMap.set(item.operationLabel, (current.operationMap.get(item.operationLabel) || 0) + 1);
      map.set(item.clientId, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        mainOperation:
          Array.from(item.operationMap.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "Sem operacao",
      }))
      .sort((left, right) => right.value - left.value);
  }, [derivativeRows]);

  const operationRows = useMemo(() => {
    const map = new Map();
    derivativeRows.forEach((item) => {
      const current = map.get(item.operationLabel) || {
        key: item.operationLabel,
        label: item.operationLabel,
        value: 0,
        usd: 0,
        count: 0,
        clients: new Set(),
      };
      current.value += item.adjustmentBrl;
      current.usd += item.adjustmentUsd;
      current.count += 1;
      current.clients.add(item.clientLabel);
      map.set(item.operationLabel, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        clientCount: item.clients.size,
        clientList: Array.from(item.clients).slice(0, 3).join(", "),
      }))
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || right.count - left.count);
  }, [derivativeRows]);

  const operationCountRows = useMemo(() => {
    const map = new Map();
    const ensure = (clientId, clientLabel) => {
      const current = map.get(clientId) || {
        key: clientId,
        label: clientLabel,
        derivatives: 0,
        physicalSales: 0,
        physicalPayments: 0,
        cashPayments: 0,
        otherEntries: 0,
        otherCashOutflows: 0,
      };
      map.set(clientId, current);
      return current;
    };

    derivativeRows.forEach((item) => { ensure(item.clientId, item.clientLabel).derivatives += 1; });
    physicalSaleRows.forEach((item) => { ensure(item.clientId, item.clientLabel).physicalSales += 1; });
    physicalPaymentRows.forEach((item) => { ensure(item.clientId, item.clientLabel).physicalPayments += 1; });
    cashPaymentRows.forEach((item) => { ensure(item.clientId, item.clientLabel).cashPayments += 1; });
    otherEntryRows.forEach((item) => { ensure(item.clientId, item.clientLabel).otherEntries += 1; });
    otherCashOutflowRows.forEach((item) => { ensure(item.clientId, item.clientLabel).otherCashOutflows += 1; });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        value:
          item.derivatives +
          item.physicalSales +
          item.physicalPayments +
          item.cashPayments +
          item.otherEntries +
          item.otherCashOutflows,
      }))
      .sort((left, right) => right.value - left.value);
  }, [cashPaymentRows, derivativeRows, otherCashOutflowRows, otherEntryRows, physicalPaymentRows, physicalSaleRows]);

  const physicalVolumeRows = useMemo(() => {
    const map = new Map();
    const ensure = (clientId, clientLabel) => {
      const current = map.get(clientId) || {
        key: clientId,
        label: clientLabel,
        value: 0,
        salesVolume: 0,
        derivativeVolume: 0,
        salesCount: 0,
        derivativeCount: 0,
      };
      map.set(clientId, current);
      return current;
    };
    physicalSaleRows.forEach((item) => {
      const current = ensure(item.clientId, item.clientLabel);
      current.salesVolume += item.volume;
      current.salesCount += 1;
    });
    derivativeRows.forEach((item) => {
      const current = ensure(item.clientId, item.clientLabel);
      current.derivativeVolume += item.physicalVolume;
      current.derivativeCount += 1;
    });
    return Array.from(map.values())
      .map((item) => ({ ...item, value: item.salesVolume + item.derivativeVolume }))
      .sort((left, right) => right.value - left.value);
  }, [derivativeRows, physicalSaleRows]);

  const revenueRows = useMemo(() => {
    const map = new Map();
    physicalSaleRows.forEach((item) => {
      const current = map.get(item.clientId) || {
        key: item.clientId,
        label: item.clientLabel,
        value: 0,
        volume: 0,
        count: 0,
        currencyMap: new Map(),
      };
      current.value += item.revenue;
      current.volume += item.volume;
      current.count += 1;
      current.currencyMap.set(item.currency, (current.currencyMap.get(item.currency) || 0) + item.revenue);
      map.set(item.clientId, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        averagePrice: item.volume ? item.value / item.volume : 0,
        currencyBreakdown: Array.from(item.currencyMap.entries())
          .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
          .map(([currency, value]) => `${currency} ${formatCurrency2(value)}`)
          .join(" | "),
      }))
      .sort((left, right) => right.value - left.value);
  }, [physicalSaleRows]);

  const openExposureRows = useMemo(() => {
    const map = new Map();
    derivativeRows
      .filter((item) => item.statusLabel === "Em aberto")
      .forEach((item) => {
        const current = map.get(item.clientId) || {
          key: item.clientId,
          label: item.clientLabel,
          value: 0,
          openCount: 0,
          due30: 0,
          due7: 0,
          adjustment: 0,
        };
        current.value += item.financialVolume;
        current.openCount += 1;
        current.adjustment += item.adjustmentBrl;
        if (item.daysToSettlement != null && item.daysToSettlement >= 0 && item.daysToSettlement <= 30) current.due30 += 1;
        if (item.daysToSettlement != null && item.daysToSettlement >= 0 && item.daysToSettlement <= 7) current.due7 += 1;
        map.set(item.clientId, current);
      });
    return Array.from(map.values()).sort((left, right) => right.value - left.value || right.openCount - left.openCount);
  }, [derivativeRows]);

  const hedgeComplianceRows = useMemo(() => {
    if (!data.hedgePolicies.length) return [];

    // ── Helpers ─────────────────────────────────────────────────────────────
    const toYM = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const nextYM = (ym) => {
      const [y, m] = ym.split("-").map(Number);
      return toYM(new Date(y, m, 1)); // m já é o próximo mês (0-indexado)
    };
    const monthDiff = (a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return (by - ay) * 12 + (bm - am);
    };
    const lerpRatio = (a, b, t) =>
      a != null && b != null ? a + (b - a) * t : (a ?? b);

    // ── Label map ────────────────────────────────────────────────────────────
    const labelMap = new Map();
    [...physicalSaleRows, ...derivativeRows].forEach((r) => {
      if (r.clientId && r.clientLabel) labelMap.set(r.clientId, r.clientLabel);
    });

    // ── Produção total por grupo (maior crop board) ──────────────────────────
    // readClientRankingRelationId trata tanto inteiro quanto objeto {id:...}
    const producaoByGroup = new Map();
    (data.cropBoards || []).forEach((cb) => {
      const gId = readClientRankingRelationId(
        groupBy === "subgrupo" ? cb.subgrupo : cb.grupo,
      );
      if (!gId) return;
      const val = Number(cb.producao_total || 0);
      if (val > (producaoByGroup.get(gId) || 0)) producaoByGroup.set(gId, val);
    });

    // ── Volume físico cumulativo por cliente/mês ─────────────────────────────
    // Fallbacks: data_negociacao → data_entrega → data_pagamento → created_at
    const physMonthsByClient = new Map();
    physicalSaleRows.forEach((row) => {
      const dateStr =
        row?.data_negociacao ||
        row?.data_entrega ||
        row?.data_pagamento ||
        row?.created_at;
      const date = startOfDashboardDay(dateStr);
      if (!date) return;
      const ym = toYM(date);
      if (!physMonthsByClient.has(row.clientId))
        physMonthsByClient.set(row.clientId, new Map());
      const m = physMonthsByClient.get(row.clientId);
      m.set(ym, (m.get(ym) || 0) + (row.volume || 0));
    });

    // ── Derivativos: ativo no mês M se settlementDate >= início do mês M ────
    // Não precisa de data de contratação — qualquer derivativo cuja liquidação
    // ainda está no futuro em relação ao mês M é considerado ativo.
    const dersByClient = new Map();
    derivativeRows.forEach((row) => {
      const vol = row.physicalVolume || 0;
      if (!vol || !row.settlementDate) return;
      const settleYM = toYM(row.settlementDate);
      if (!dersByClient.has(row.clientId)) dersByClient.set(row.clientId, []);
      dersByClient.get(row.clientId).push({ settleYM, vol });
    });

    // ── Políticas por cliente ────────────────────────────────────────────────
    const policiesByClient = new Map();
    data.hedgePolicies.forEach((policy) => {
      if (!policy.mes_ano) return;
      const minRatio = normalizePolicyRatio(policy.vendas_x_prod_total_minimo);
      const maxRatio = normalizePolicyRatio(policy.vendas_x_prod_total_maximo);
      if (minRatio == null && maxRatio == null) return;
      const date = startOfDashboardDay(policy.mes_ano);
      if (!date) return;
      const ym = toYM(date);
      const clientIds = (
        groupBy === "subgrupo"
          ? Array.isArray(policy.subgrupos) ? policy.subgrupos : []
          : Array.isArray(policy.grupos) ? policy.grupos : []
      ).map(readClientRankingRelationId).filter(Boolean);
      clientIds.forEach((cId) => {
        if (!policiesByClient.has(cId)) policiesByClient.set(cId, []);
        policiesByClient.get(cId).push({ ym, minRatio, maxRatio });
      });
    });

    // ── Cálculo de aderência por cliente ────────────────────────────────────
    const result = new Map();

    policiesByClient.forEach((rawPolicies, cId) => {
      const producao = producaoByGroup.get(cId) || 0;
      if (!producao) return;

      const sorted = [...rawPolicies].sort((a, b) => a.ym.localeCompare(b.ym));
      const firstYM = sorted[0].ym;
      const lastYM = sorted[sorted.length - 1].ym;

      // Volume físico cumulativo
      const physMonthMap = physMonthsByClient.get(cId) || new Map();
      const physMonths = Array.from(physMonthMap.keys()).sort();
      let physIdx = 0;
      let cumulativePhys = 0;

      // Derivativos ativos neste mês (settlementDate >= cursor)
      const ders = dersByClient.get(cId) || [];

      let totalMonths = 0;
      let compliantMonths = 0;
      let cursor = firstYM;

      while (cursor <= lastYM) {
        // Avança volume físico cumulativo
        while (physIdx < physMonths.length && physMonths[physIdx] <= cursor) {
          cumulativePhys += physMonthMap.get(physMonths[physIdx]) || 0;
          physIdx++;
        }

        // Soma derivativos cuja liquidação ainda não ocorreu neste mês
        const activeDer = ders.reduce(
          (sum, d) => (d.settleYM >= cursor ? sum + d.vol : sum),
          0,
        );

        // Interpola limites da política para este mês
        let lower = null;
        let upper = null;
        for (const p of sorted) {
          if (p.ym <= cursor) lower = p;
          if (p.ym >= cursor && upper == null) upper = p;
        }

        let minRatio, maxRatio;
        if (lower && upper && lower.ym === upper.ym) {
          minRatio = lower.minRatio;
          maxRatio = lower.maxRatio;
        } else if (lower && upper) {
          const span = monthDiff(lower.ym, upper.ym);
          const t = span > 0 ? monthDiff(lower.ym, cursor) / span : 0;
          minRatio = lerpRatio(lower.minRatio, upper.minRatio, t);
          maxRatio = lerpRatio(lower.maxRatio, upper.maxRatio, t);
        } else {
          cursor = nextYM(cursor);
          continue;
        }

        const ratio = (cumulativePhys + activeDer) / producao;
        const inPolicy =
          (minRatio == null || ratio >= minRatio) &&
          (maxRatio == null || ratio <= maxRatio);

        totalMonths++;
        if (inPolicy) compliantMonths++;
        cursor = nextYM(cursor);
      }

      if (totalMonths === 0) return;
      result.set(cId, {
        key: cId,
        label: labelMap.get(cId) || `Cliente ${cId}`,
        totalMonths,
        compliantMonths,
        value: Math.round((compliantMonths / totalMonths) * 100),
      });
    });

    return Array.from(result.values()).sort((a, b) => b.value - a.value);
  }, [data.hedgePolicies, data.cropBoards, physicalSaleRows, derivativeRows, groupBy]);

  const volumeMixRows = useMemo(() => {
    const map = new Map();
    physicalSaleRows.forEach((row) => {
      const curr = map.get(row.clientId) || { key: row.clientId, label: row.clientLabel, physVol: 0, derVol: 0 };
      curr.physVol += row.volume || 0;
      map.set(row.clientId, curr);
    });
    derivativeRows.forEach((row) => {
      const curr = map.get(row.clientId) || { key: row.clientId, label: row.clientLabel, physVol: 0, derVol: 0 };
      curr.derVol += row.physicalVolume || 0;
      map.set(row.clientId, curr);
    });
    return Array.from(map.values())
      .map((item) => {
        const total = item.physVol + item.derVol;
        return {
          ...item,
          value: total,
          physPct: total > 0 ? Math.round((item.physVol / total) * 100) : 0,
          derPct: total > 0 ? Math.round((item.derVol / total) * 100) : 0,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [physicalSaleRows, derivativeRows]);

  const settlementConcentrationRows = useMemo(() => {
    const map = new Map();
    derivativeRows
      .filter((row) => row.statusLabel === "Em aberto")
      .forEach((row) => {
        const curr = map.get(row.clientId) || {
          key: row.clientId,
          label: row.clientLabel,
          d30: 0,
          d90: 0,
          d180: 0,
          dOver: 0,
          value: 0,
        };
        curr.value += 1;
        const d = row.daysToSettlement;
        if (d != null && d >= 0 && d <= 30) curr.d30 += 1;
        else if (d != null && d > 30 && d <= 90) curr.d90 += 1;
        else if (d != null && d > 90 && d <= 180) curr.d180 += 1;
        else curr.dOver += 1;
        map.set(row.clientId, curr);
      });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [derivativeRows]);

  const summary = useMemo(() => {
    const clientIds = new Set([
      ...derivativeRows.map((item) => item.clientId),
      ...physicalSaleRows.map((item) => item.clientId),
      ...physicalPaymentRows.map((item) => item.clientId),
      ...cashPaymentRows.map((item) => item.clientId),
      ...otherEntryRows.map((item) => item.clientId),
      ...otherCashOutflowRows.map((item) => item.clientId),
    ]);
    return {
      clients: clientIds.size,
      totalAdjustment: derivativeRows.reduce((sum, item) => sum + item.adjustmentBrl, 0),
      totalOperations: operationCountRows.reduce((sum, item) => sum + item.value, 0),
      totalVolume: physicalVolumeRows.reduce((sum, item) => sum + item.value, 0),
    };
  }, [cashPaymentRows, derivativeRows, operationCountRows, otherCashOutflowRows, otherEntryRows, physicalPaymentRows, physicalSaleRows, physicalVolumeRows]);

  const clientColLabel = groupBy === "subgrupo" ? "Subgrupo" : "Cliente";

  const metrics = useMemo(
    () => [
      {
        key: "adjustments",
        title: groupBy === "subgrupo" ? "Ajustes de derivativos por subgrupo" : "Ajustes de derivativos por cliente",
        description: "Soma dos ajustes totais em BRL e USD por grupo operacional.",
        chartHeight: Math.max(280, adjustmentRows.length * 30 + 40),
        option: createClientRankingHorizontalOption({
          rows: adjustmentRows,
          signed: true,
          valueFormatter: formatClientRankingCompactCurrency,
          seriesName: "Ajustes BRL",
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Ajustes BRL", align: "right", signed: true, render: (row) => formatClientRankingSignedBrl(row.value) },
          { key: "usd", label: "Ajustes USD", align: "right", signed: true, render: (row) => formatClientRankingUsd(row.usd) },
          { key: "count", label: "Ops", align: "right", render: (row) => formatNumber0(row.count) },
          { key: "mainOperation", label: "Operacao mais frequente" },
        ],
        rows: adjustmentRows,
      },
      {
        key: "operation-count",
        title: "Numero de operações realizadas",
        description: "Quantidade de lançamentos por cliente, separando derivativos, físico, pagamentos e caixa.",
        chartHeight: Math.max(280, Math.min(420, operationCountRows.length * 22 + 120)),
        option: createClientRankingStackedOption({
          rows: operationCountRows,
          valueFormatter: (value) => formatNumber0(value),
          series: [
            { key: "derivatives", label: "Derivativos", color: "#0f766e" },
            { key: "physicalSales", label: "Vendas fisico", color: "#2563eb" },
            { key: "physicalPayments", label: "Pgtos fisico", color: "#ea580c" },
            { key: "cashPayments", label: "Caixa", color: "#dc2626" },
            { key: "otherEntries", label: "Entradas", color: "#0891b2" },
            { key: "otherCashOutflows", label: "Saidas", color: "#65a30d" },
          ],
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Total", align: "right", render: (row) => `${formatNumber0(row.value)} ops` },
          { key: "derivatives", label: "Deriv.", align: "right", render: (row) => formatNumber0(row.derivatives) },
          { key: "physicalSales", label: "Vendas", align: "right", render: (row) => formatNumber0(row.physicalSales) },
          { key: "cashPayments", label: "Caixa", align: "right", render: (row) => formatNumber0(row.cashPayments + row.otherEntries + row.otherCashOutflows) },
        ],
        rows: operationCountRows,
      },
      {
        key: "physical-volume",
        title: groupBy === "subgrupo" ? "Volume físico negociado por subgrupo" : "Volume físico negociado por cliente",
        description: "Soma de volume físico em vendas e volume físico informado nos derivativos.",
        chartHeight: Math.max(280, physicalVolumeRows.length * 30 + 40),
        option: createClientRankingHorizontalOption({
          rows: physicalVolumeRows,
          color: "#ea580c",
          valueFormatter: (value) => formatClientRankingCompactNumber(value, " sc"),
          seriesName: "Volume",
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Volume total", align: "right", render: (row) => `${formatNumber0(row.value)} sc` },
          { key: "salesVolume", label: "Vendas", align: "right", render: (row) => `${formatNumber0(row.salesVolume)} sc` },
          { key: "derivativeVolume", label: "Derivativos", align: "right", render: (row) => `${formatNumber0(row.derivativeVolume)} sc` },
          { key: "count", label: "Ops", align: "right", render: (row) => formatNumber0(row.salesCount + row.derivativeCount) },
        ],
        rows: physicalVolumeRows,
      },
      {
        key: "revenue",
        title: groupBy === "subgrupo" ? "Faturamento físico por subgrupo" : "Faturamento físico por cliente",
        description: "Valor total informado nas vendas físicas, com preço médio simples ponderado por volume.",
        chartHeight: Math.max(360, revenueRows.length * 22 + 120),
        option: createClientRankingDonutOption({
          rows: revenueRows,
          valueKey: "value",
          valueFormatter: formatClientRankingCompactCurrency,
          centerLabel: "Faturamento",
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Faturamento", align: "right", render: (row) => formatClientRankingBrl(row.value) },
          { key: "volume", label: "Volume", align: "right", render: (row) => `${formatNumber0(row.volume)} sc` },
          { key: "averagePrice", label: "Preco medio", align: "right", render: (row) => formatClientRankingBrl(row.averagePrice) },
          { key: "currencyBreakdown", label: "Moedas" },
        ],
        rows: revenueRows,
      },
      {
        key: "open-exposure",
        title: "Exposição aberta em derivativos",
        description: "Volume financeiro em aberto por cliente, com vencimentos curtos destacados na tabela.",
        chartHeight: Math.max(280, openExposureRows.length * 30 + 40),
        option: createClientRankingHorizontalOption({
          rows: openExposureRows,
          color: "#dc2626",
          valueFormatter: formatClientRankingCompactCurrency,
          seriesName: "Volume financeiro",
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Volume aberto", align: "right", render: (row) => formatClientRankingBrl(row.value) },
          { key: "openCount", label: "Abertas", align: "right", render: (row) => formatNumber0(row.openCount) },
          { key: "due30", label: "Vence 30d", align: "right", render: (row) => formatNumber0(row.due30) },
          { key: "adjustment", label: "Ajuste aberto", align: "right", signed: true, render: (row) => formatClientRankingSignedBrl(row.adjustment) },
        ],
        rows: openExposureRows,
      },
      {
        key: "hedge-compliance",
        title: "Aderência à política de hedge",
        description: "Percentual de meses em que o cliente ficou com o volume vendido dentro da faixa definida na política de hedge (vendas x produção total).",
        chartHeight: Math.max(280, hedgeComplianceRows.length * 30 + 40),
        option: createClientRankingHorizontalOption({
          rows: hedgeComplianceRows,
          color: "#7c3aed",
          valueFormatter: (value) => `${formatNumber0(value)}%`,
          seriesName: "Aderência",
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Aderência", align: "right", render: (row) => `${formatNumber0(row.value)}%` },
          { key: "compliantMonths", label: "Meses dentro", align: "right", render: (row) => formatNumber0(row.compliantMonths) },
        ],
        rows: hedgeComplianceRows,
      },
      {
        key: "volume-mix",
        title: "Mix físico vs. derivativo por cliente",
        description: "Proporção do volume total negociado dividido entre vendas físicas e derivativos.",
        chartHeight: Math.max(280, Math.min(420, volumeMixRows.length * 22 + 120)),
        option: createClientRankingStackedOption({
          rows: volumeMixRows,
          valueFormatter: (value) => `${formatNumber0(value)} sc`,
          series: [
            { key: "physVol", label: "Fisico (sc)", color: "#2563eb" },
            { key: "derVol", label: "Derivativo (sc)", color: "#0f766e" },
          ],
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Total (sc)", align: "right", render: (row) => `${formatNumber0(row.value)} sc` },
          { key: "physPct", label: "% Fisico", align: "right", render: (row) => `${formatNumber0(row.physPct)}%` },
          { key: "derPct", label: "% Derivativo", align: "right", render: (row) => `${formatNumber0(row.derPct)}%` },
        ],
        rows: volumeMixRows,
      },
      {
        key: "settlement-concentration",
        title: "Concentração de vencimentos em aberto",
        description: "Posições abertas em derivativos agrupadas por prazo de vencimento: até 30, 90, 180 dias e acima.",
        chartHeight: Math.max(280, Math.min(420, settlementConcentrationRows.length * 22 + 120)),
        option: createClientRankingStackedOption({
          rows: settlementConcentrationRows,
          valueFormatter: (value) => formatNumber0(value),
          series: [
            { key: "d30", label: "Até 30d", color: "#dc2626" },
            { key: "d90", label: "31–90d", color: "#ea580c" },
            { key: "d180", label: "91–180d", color: "#2563eb" },
            { key: "dOver", label: ">180d", color: "#0f766e" },
          ],
        }),
        columns: [
          { key: "rank", label: "#", render: (_row, index) => index + 1 },
          { key: "label", label: clientColLabel },
          { key: "value", label: "Total aberto", align: "right", render: (row) => formatNumber0(row.value) },
          { key: "d30", label: "Até 30d", align: "right", render: (row) => formatNumber0(row.d30) },
          { key: "d90", label: "31–90d", align: "right", render: (row) => formatNumber0(row.d90) },
          { key: "d180", label: "91–180d", align: "right", render: (row) => formatNumber0(row.d180) },
          { key: "dOver", label: ">180d", align: "right", render: (row) => formatNumber0(row.dOver) },
        ],
        rows: settlementConcentrationRows,
      },
    ],
    [adjustmentRows, clientColLabel, groupBy, hedgeComplianceRows, openExposureRows, operationCountRows, physicalVolumeRows, revenueRows, settlementConcentrationRows, volumeMixRows],
  );

  return (
    <section className="client-ranking-shell">
      {error ? <div className="client-ranking-alert">{error}</div> : null}
      {loading ? <div className="client-ranking-loading">Carregando ranking de clientes...</div> : null}
      <div className="client-ranking-toolbar">
        <div className="client-ranking-toggle-group" role="group" aria-label="Agrupar por">
          <span className="client-ranking-toggle-label">Agrupar por:</span>
          <button
            type="button"
            className={`client-ranking-toggle-btn${groupBy === "grupo" ? " is-active" : ""}`}
            onClick={() => setGroupBy("grupo")}
          >
            Grupo
          </button>
          <button
            type="button"
            className={`client-ranking-toggle-btn${groupBy === "subgrupo" ? " is-active" : ""}`}
            onClick={() => setGroupBy("subgrupo")}
          >
            Subgrupo
          </button>
        </div>
        {availableExchanges.length > 0 ? (
          <div className="client-ranking-toggle-group" role="group" aria-label="Filtrar por bolsa">
            <span className="client-ranking-toggle-label">Bolsa:</span>
            {availableExchanges.map((exchange) => (
              <button
                key={exchange}
                type="button"
                className={`client-ranking-toggle-btn${selectedExchanges.includes(exchange) ? " is-active" : ""}`}
                onClick={() =>
                  setSelectedExchanges((prev) =>
                    prev.includes(exchange) ? prev.filter((e) => e !== exchange) : [...prev, exchange],
                  )
                }
              >
                {exchange}
              </button>
            ))}
            {selectedExchanges.length > 0 ? (
              <button
                type="button"
                className="client-ranking-toggle-btn client-ranking-toggle-clear"
                onClick={() => setSelectedExchanges([])}
              >
                Limpar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <section className="client-ranking-stats" aria-label="Resumo do ranking">
        <article className="client-ranking-stat">
          <span>Clientes no recorte</span>
          <strong>{formatNumber0(summary.clients)}</strong>
        </article>
        <article className="client-ranking-stat">
          <span>Ajustes derivativos</span>
          <strong>{formatClientRankingSignedBrl(summary.totalAdjustment)}</strong>
        </article>
        <article className="client-ranking-stat">
          <span>Operações consideradas</span>
          <strong>{formatNumber0(summary.totalOperations)}</strong>
        </article>
        <article className="client-ranking-stat">
          <span>Volume físico</span>
          <strong>{formatClientRankingCompactNumber(summary.totalVolume, " sc")}</strong>
        </article>
      </section>
      <section className="client-ranking-grid">
        {metrics.map((metric) => (
          <ClientRankingMetric
            key={metric.key}
            title={metric.title}
            description={metric.description}
            option={metric.option}
            chartHeight={metric.chartHeight}
            tableColumns={metric.columns}
            tableRows={metric.rows}
            tableEmptyLabel="Sem registros para este ranking no filtro atual."
          />
        ))}
      </section>
    </section>
  );
}

function MtmDashboard({ dashboardFilter }) {
  const [derivatives, setDerivatives] = useState([]);
  const [physicalSales, setPhysicalSales] = useState([]);
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [resourceTableModal, setResourceTableModal] = useState(null);
  const [mtmScope, setMtmScope] = useState("all");
  const [mtmFacet, setMtmFacet] = useState("all");
  const [operationFilterOpen, setOperationFilterOpen] = useState(false);
  const [selectedOperationNames, setSelectedOperationNames] = useState([]);
  const [mtmTimelineSliderStart, setMtmTimelineSliderStart] = useState(null);
  const [mtmTimelineSliderEnd, setMtmTimelineSliderEnd] = useState(null);
  const operationFilterRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("derivative-operations").catch(() => []),
      resourceService.listAll("exchanges").catch(() => []),
      resourceService.listAll("physical-sales").catch(() => []),
      resourceService.listAll("tradingview-watchlist-quotes").catch(() => []),
    ]).then(([derivativeResponse, exchangeResponse, physicalSalesResponse, quotesResponse]) => {
      if (!isMounted) return;
      setDerivatives(
        (Array.isArray(derivativeResponse) ? derivativeResponse : []).map((item) => ({
          ...item,
          __exchangeRows: Array.isArray(exchangeResponse) ? exchangeResponse : [],
        })),
      );
      setPhysicalSales(Array.isArray(physicalSalesResponse) ? physicalSalesResponse : []);
      setTradingviewQuotes(Array.isArray(quotesResponse) ? quotesResponse : []);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const mtmFilter = useMemo(
    () => ({
      ...dashboardFilter,
      cultura: [],
    }),
    [dashboardFilter],
  );

  const usdBrlQuote = useMemo(() => {
    const directMatch = (tradingviewQuotes || []).find(
      (item) => String(item?.ticker || "").trim().toUpperCase() === "USDBRL",
    );
    const directValue = Number(directMatch?.price || 0);
    return Number.isFinite(directValue) && directValue > 0 ? directValue : 0;
  }, [tradingviewQuotes]);

  const derivativeQuotesByTicker = useMemo(
    () =>
      (tradingviewQuotes || []).reduce((acc, item) => {
        const ticker = String(item?.ticker || "").trim();
        if (!ticker) return acc;
        acc[ticker] = parseLocalizedNumber(item?.price);
        return acc;
      }, {}),
    [tradingviewQuotes],
  );

  const allNormalizedRows = useMemo(() => {
    const rows = derivatives
      .filter((item) =>
        rowMatchesDashboardFilter(item, mtmFilter, {
          cultureKeys: [],
        }),
      )
      .map((item) => {
        const strikeMtm = derivativeQuotesByTicker[item?.contrato_derivativo] ?? 0;
        const mtm = calculatePriceCompositionDerivativeMtm(item, strikeMtm, usdBrlQuote);
        const exchangeLabel =
          item.bolsa_ref ||
          item.ctrbolsa ||
          item.instituicao ||
          item.bolsa?.nome ||
          item.bolsa ||
          "Sem bolsa";
        const statusLabel = normalizeText(item?.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";
        const mtmBrl = mtm.brl;
        const mtmUsd = mtm.usd;
        const standardVolume = getDerivativeVolumeInStandardUnit(item, item.__exchangeRows || []);
        const rawVolume = resolvePriceCompositionDerivativeVolume(item) || getDerivativeVolumeValue(item);
        const lots = parseLocalizedNumber(item?.numero_lotes || item?.quantidade_derivativos);
        const strike = parseLocalizedNumber(item?.strike_liquidacao || item?.strike_montagem);
        const negotiationDate = parseDashboardDate(item?.data_contratacao || item?.data_negociacao);
        const settlementDate = parseDashboardDate(item?.data_liquidacao || item?.data_vencimento || item?.vencimento);
        const operationName =
          item?.nome_da_operacao ||
          `${item?.posicao || ""} ${item?.tipo_derivativo || ""}`.trim() ||
          item?.cod_operacao_mae ||
          `Operação ${item?.id}`;
        const derivativeType =
          item?.tipo_derivativo ||
          (normalizeText(operationName).includes("call")
            ? "Call"
            : normalizeText(operationName).includes("put")
              ? "Put"
              : normalizeText(operationName).includes("ndf")
                ? "NDF"
                : "Outros");
        const direction = mtmBrl > 0 ? "positive" : mtmBrl < 0 ? "negative" : "neutral";
        const daysToSettlement = settlementDate
          ? Math.round((startOfDashboardDay(settlementDate) - startOfDashboardDay(new Date())) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...item,
          exchangeLabel,
          statusLabel,
          mtmBrl,
          mtmUsd,
          strikeMtm,
          standardVolume,
          rawVolume,
          lots,
          strike,
          negotiationDate,
          settlementDate,
          operationName,
          derivativeType: derivativeType || "Outros",
          direction,
          daysToSettlement,
        };
      });

    return rows.sort((left, right) => Math.abs(right.mtmBrl) - Math.abs(left.mtmBrl));
  }, [derivativeQuotesByTicker, derivatives, mtmFilter, usdBrlQuote]);

  const normalizedRows = useMemo(() => {
    const scopeRows =
      mtmScope === "open"
        ? allNormalizedRows.filter((item) => item.statusLabel === "Em aberto")
        : mtmScope === "closed"
          ? allNormalizedRows.filter((item) => item.statusLabel === "Encerrado")
          : allNormalizedRows;

    if (mtmFacet === "all") {
      return scopeRows;
    }

    return scopeRows.filter((item) => {
      if (mtmScope === "all") {
        if (mtmFacet === "positive") return item.direction === "positive";
        if (mtmFacet === "negative") return item.direction === "negative";
        if (mtmFacet === "neutral") return item.direction === "neutral";
      }

      if (mtmScope === "open") {
        if (mtmFacet === "open_all") return item.statusLabel === "Em aberto";
        if (mtmFacet === "due7") return item.daysToSettlement != null && item.daysToSettlement >= 0 && item.daysToSettlement <= 7;
        if (mtmFacet === "due30") return item.daysToSettlement != null && item.daysToSettlement >= 0 && item.daysToSettlement <= 30;
      }

      if (mtmScope === "closed") {
        if (mtmFacet === "closed_all") return item.statusLabel === "Encerrado";
        if (mtmFacet === "positive") return item.direction === "positive";
        if (mtmFacet === "negative") return item.direction === "negative";
      }

      return true;
    });
  }, [allNormalizedRows, mtmFacet, mtmScope]);

  const operationOptions = useMemo(
    () =>
      [...new Set(normalizedRows.map((item) => String(item.operationName || "").trim()).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, "pt-BR"),
      ),
    [normalizedRows],
  );

  useEffect(() => {
    setSelectedOperationNames((current) => {
      if (!operationOptions.length) {
        return [];
      }
      if (!current.length) {
        return operationOptions;
      }
      const next = current.filter((item) => operationOptions.includes(item));
      return next.length ? next : operationOptions;
    });
  }, [operationOptions]);

  useEffect(() => {
    if (!operationFilterOpen) {
      return undefined;
    }
    const handlePointerDown = (event) => {
      if (!operationFilterRef.current?.contains(event.target)) {
        setOperationFilterOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [operationFilterOpen]);

  const summarizeMtmRows = useCallback((rows) => {
    const totals = rows.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.netBrl += item.mtmBrl;
        acc.netUsd += item.mtmUsd;
        acc.totalVolume += item.standardVolume || item.rawVolume || 0;
        acc.totalLots += item.lots || 0;
        acc.totalStrikeWeighted += (item.rawVolume || 0) * (item.strike || 0);
        acc.totalStrikeWeight += item.rawVolume || 0;
        if (item.statusLabel === "Em aberto") {
          acc.open += 1;
          acc.openNetBrl += item.mtmBrl;
        } else {
          acc.closed += 1;
          acc.closedNetBrl += item.mtmBrl;
        }
        if (item.direction === "positive") {
          acc.positive += 1;
          acc.positiveBrl += item.mtmBrl;
        } else if (item.direction === "negative") {
          acc.negative += 1;
          acc.negativeBrl += Math.abs(item.mtmBrl);
        } else {
          acc.neutral += 1;
        }
        if (item.daysToSettlement != null && item.daysToSettlement <= 30) acc.due30 += 1;
        if (item.daysToSettlement != null && item.daysToSettlement <= 7) acc.due7 += 1;
        return acc;
      },
      {
        total: 0,
        open: 0,
        closed: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        netBrl: 0,
        netUsd: 0,
        openNetBrl: 0,
        closedNetBrl: 0,
        positiveBrl: 0,
        negativeBrl: 0,
        totalVolume: 0,
        totalLots: 0,
        totalStrikeWeighted: 0,
        totalStrikeWeight: 0,
        due30: 0,
        due7: 0,
      },
    );
    const bestOperation = rows
      .filter((item) => item.mtmBrl > 0)
      .sort((left, right) => right.mtmBrl - left.mtmBrl)[0] || null;
    const worstOperation = rows
      .filter((item) => item.mtmBrl < 0)
      .sort((left, right) => left.mtmBrl - right.mtmBrl)[0] || null;
    return {
      ...totals,
      exchanges: new Set(rows.map((item) => item.exchangeLabel)).size,
      averageMtmBrl: totals.total ? totals.netBrl / totals.total : 0,
      avgStrike: totals.totalStrikeWeight > 0 ? totals.totalStrikeWeighted / totals.totalStrikeWeight : 0,
      bestOperation,
      worstOperation,
    };
  }, []);

  const summary = useMemo(() => {
    return summarizeMtmRows(normalizedRows);
  }, [normalizedRows, summarizeMtmRows]);

  const allSummary = useMemo(() => summarizeMtmRows(allNormalizedRows), [allNormalizedRows, summarizeMtmRows]);
  const openSummary = useMemo(
    () => summarizeMtmRows(allNormalizedRows.filter((item) => item.statusLabel === "Em aberto")),
    [allNormalizedRows, summarizeMtmRows],
  );
  const closedSummary = useMemo(
    () => summarizeMtmRows(allNormalizedRows.filter((item) => item.statusLabel === "Encerrado")),
    [allNormalizedRows, summarizeMtmRows],
  );

  const openRowsInView = useMemo(
    () => normalizedRows.filter((item) => item.statusLabel === "Em aberto"),
    [normalizedRows],
  );
  const closedRowsInView = useMemo(
    () => normalizedRows.filter((item) => item.statusLabel === "Encerrado"),
    [normalizedRows],
  );

  const normalizedSales = useMemo(() => {
    return (physicalSales || [])
      .filter((item) =>
        rowMatchesDashboardFilter(item, mtmFilter, {
          cultureKeys: [],
        }),
      )
      .map((item) => ({
        ...item,
        exchangeLabel: item?.bolsa_ref || "Sem bolsa",
        contractLabel: item?.contrato_bolsa || "Sem contrato",
        cultureLabel: item?.cultura_produto || "Sem cultura",
        basisValue: parseLocalizedNumber(item?.basis_valor),
        priceValue: parseLocalizedNumber(item?.preco),
        volumeValue: Math.abs(parseLocalizedNumber(item?.volume_fisico)),
        settlementDate: parseDashboardDate(item?.data_vencimento || item?.data_fixacao || item?.data_contratacao || item?.created_at),
      }));
  }, [mtmFilter, physicalSales]);

  const exchangeRows = useMemo(() => {
    const exchangeMap = new Map();
    normalizedRows.forEach((item) => {
      const current = exchangeMap.get(item.exchangeLabel) || {
        label: item.exchangeLabel,
        total: 0,
        open: 0,
        closed: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        netBrl: 0,
        positiveBrl: 0,
        negativeBrl: 0,
        volume: 0,
        lots: 0,
        strikeWeighted: 0,
        strikeWeight: 0,
        rows: [],
      };
      current.total += 1;
      current.netBrl += item.mtmBrl;
      current.volume += item.standardVolume || item.rawVolume || 0;
      current.lots += item.lots || 0;
      current.strikeWeighted += (item.rawVolume || 0) * (item.strike || 0);
      current.strikeWeight += item.rawVolume || 0;
      current.rows.push(item);
      if (item.statusLabel === "Em aberto") current.open += 1;
      else current.closed += 1;
      if (item.direction === "positive") {
        current.positive += 1;
        current.positiveBrl += item.mtmBrl;
      } else if (item.direction === "negative") {
        current.negative += 1;
        current.negativeBrl += Math.abs(item.mtmBrl);
      } else {
        current.neutral += 1;
      }
      exchangeMap.set(item.exchangeLabel, current);
    });

    return Array.from(exchangeMap.values())
      .map((item, index) => ({
        ...item,
        avgStrike: item.strikeWeight > 0 ? item.strikeWeighted / item.strikeWeight : 0,
        avgMtm: item.total ? item.netBrl / item.total : 0,
        best: [...item.rows].sort((left, right) => right.mtmBrl - left.mtmBrl)[0] || null,
        worst: [...item.rows].sort((left, right) => left.mtmBrl - right.mtmBrl)[0] || null,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }))
      .sort((left, right) => Math.abs(right.netBrl) - Math.abs(left.netBrl));
  }, [normalizedRows]);

  const cardFilteredRows = useMemo(() => {
    if (!selectedOperationNames.length) {
      return normalizedRows;
    }
    return normalizedRows.filter((item) => selectedOperationNames.includes(String(item.operationName || "").trim()));
  }, [normalizedRows, selectedOperationNames]);

  const exchangeCardRows = useMemo(() => {
    const exchangeMap = new Map();
    cardFilteredRows.forEach((item) => {
      const current = exchangeMap.get(item.exchangeLabel) || {
        label: item.exchangeLabel,
        total: 0,
        open: 0,
        closed: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        netBrl: 0,
        positiveBrl: 0,
        negativeBrl: 0,
        volume: 0,
        lots: 0,
        strikeWeighted: 0,
        strikeWeight: 0,
        rows: [],
      };
      current.total += 1;
      current.netBrl += item.mtmBrl;
      current.volume += item.standardVolume || item.rawVolume || 0;
      current.lots += item.lots || 0;
      current.strikeWeighted += (item.rawVolume || 0) * (item.strike || 0);
      current.strikeWeight += item.rawVolume || 0;
      current.rows.push(item);
      if (item.statusLabel === "Em aberto") current.open += 1;
      else current.closed += 1;
      if (item.direction === "positive") {
        current.positive += 1;
        current.positiveBrl += item.mtmBrl;
      } else if (item.direction === "negative") {
        current.negative += 1;
        current.negativeBrl += Math.abs(item.mtmBrl);
      } else {
        current.neutral += 1;
      }
      exchangeMap.set(item.exchangeLabel, current);
    });

    return Array.from(exchangeMap.values())
      .map((item, index) => ({
        ...item,
        avgStrike: item.strikeWeight > 0 ? item.strikeWeighted / item.strikeWeight : 0,
        avgMtm: item.total ? item.netBrl / item.total : 0,
        best: [...item.rows].sort((left, right) => right.mtmBrl - left.mtmBrl)[0] || null,
        worst: [...item.rows].sort((left, right) => left.mtmBrl - right.mtmBrl)[0] || null,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      }))
      .sort((left, right) => Math.abs(right.netBrl) - Math.abs(left.netBrl));
  }, [cardFilteredRows]);

  const operationFilterLabel = useMemo(() => {
    if (!operationOptions.length) {
      return "Operações";
    }
    if (selectedOperationNames.length === operationOptions.length) {
      return "Operações: todas";
    }
    return `Operações: ${selectedOperationNames.length}`;
  }, [operationOptions, selectedOperationNames]);

  const exchangeRowsWithTotal = useMemo(() => {
    const baseRows = [...exchangeRows]
      .sort((left, right) => left.netBrl - right.netBrl)
      .slice(0, 8);
    if (!baseRows.length) return [];
    return [
      ...baseRows,
      {
        label: "TOTAL CARTEIRA",
        total: summary.total,
        open: summary.open,
        closed: summary.closed,
        positive: summary.positive,
        negative: summary.negative,
        neutral: summary.neutral,
        netBrl: summary.netBrl,
        positiveBrl: summary.positiveBrl,
        negativeBrl: summary.negativeBrl,
        volume: summary.totalVolume,
        lots: summary.totalLots,
        avgStrike: summary.avgStrike,
        avgMtm: summary.averageMtmBrl,
        rows: normalizedRows,
        color: "#1d4ed8",
      },
    ];
  }, [exchangeRows, normalizedRows, summary]);

  const exchangeRowsWithTotalSortedByNet = useMemo(() => {
    const totalRow = exchangeRowsWithTotal.find((item) => item.label === "TOTAL CARTEIRA") || null;
    const exchangeOnlyRows = exchangeRowsWithTotal
      .filter((item) => item.label !== "TOTAL CARTEIRA")
      .sort((left, right) => right.netBrl - left.netBrl);
    return totalRow ? [totalRow, ...exchangeOnlyRows] : exchangeOnlyRows;
  }, [exchangeRowsWithTotal]);

  const weeklySettlementBuckets = useMemo(() => {
    const exchanges = exchangeRows.slice(0, 12).map((item) => item.label);
    const buckets = Array.from({ length: 13 }, (_, index) => {
      const start = index * 7;
      const end = Math.min(90, start + 6);
      return {
        key: `w${index + 1}`,
        shortLabel: `S${index + 1}`,
        label: `${start}-${end}d`,
        start,
        end,
        exchanges: new Map(exchanges.map((exchangeLabel) => [exchangeLabel, {
          label: exchangeLabel,
          volume: 0,
          mtmBrl: 0,
          rows: [],
        }])),
      };
    });

    normalizedRows
      .filter((item) => item.statusLabel === "Em aberto" && item.daysToSettlement != null && item.daysToSettlement >= 0 && item.daysToSettlement <= 90)
      .forEach((item) => {
        const bucketIndex = Math.min(Math.floor(item.daysToSettlement / 7), buckets.length - 1);
        const bucket = buckets[bucketIndex];
        const exchangeNode = bucket.exchanges.get(item.exchangeLabel) || {
          label: item.exchangeLabel,
          volume: 0,
          mtmBrl: 0,
          rows: [],
        };
        exchangeNode.volume += item.standardVolume || item.rawVolume || 0;
        exchangeNode.mtmBrl += item.mtmBrl;
        exchangeNode.rows.push(item);
        bucket.exchanges.set(item.exchangeLabel, exchangeNode);
      });

    return buckets.map((bucket) => ({
      ...bucket,
      exchanges: Array.from(bucket.exchanges.values()),
    }));
  }, [exchangeRows, normalizedRows]);

  // === MTM Timeline: 180-day range chart with date labels and slider ===
  const MTM_TIMELINE_HALF = 52; // ±52 weeks available for slider
  const mtmTimelineAllBuckets = useMemo(() => {
    const totalBuckets = MTM_TIMELINE_HALF * 2;
    const exchanges = exchangeRows.slice(0, 12).map((item) => item.label);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets = Array.from({ length: totalBuckets }, (_, index) => {
      const weekOffset = index - MTM_TIMELINE_HALF;
      const startDays = weekOffset * 7;
      const startDate = new Date(today.getTime() + startDays * 24 * 3600 * 1000);
      const label = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      return {
        key: `t${weekOffset >= 0 ? "+" : ""}${weekOffset}`,
        label,
        weekOffset,
        startDays,
        endDays: startDays + 6,
        exchanges: new Map(exchanges.map((exLabel) => [exLabel, { label: exLabel, volume: 0, mtmBrl: 0, rows: [] }])),
      };
    });

    allNormalizedRows
      .filter((item) => item.daysToSettlement != null)
      .forEach((item) => {
        const weekOffset = Math.floor(item.daysToSettlement / 7);
        const bucketIndex = weekOffset + MTM_TIMELINE_HALF;
        if (bucketIndex < 0 || bucketIndex >= totalBuckets) return;
        const bucket = buckets[bucketIndex];
        const exNode = bucket.exchanges.get(item.exchangeLabel) || { label: item.exchangeLabel, volume: 0, mtmBrl: 0, rows: [] };
        exNode.volume += item.standardVolume || item.rawVolume || 0;
        exNode.mtmBrl += item.mtmBrl;
        exNode.rows.push(item);
        bucket.exchanges.set(item.exchangeLabel, exNode);
      });

    return buckets.map((bucket) => ({
      ...bucket,
      exchanges: Array.from(bucket.exchanges.values()),
    }));
  }, [allNormalizedRows, exchangeRows]);

  useEffect(() => {
    if (!mtmTimelineAllBuckets.length) return;
    const defaultStart = mtmTimelineAllBuckets.findIndex((b) => b.weekOffset === -13);
    const defaultEnd = mtmTimelineAllBuckets.findIndex((b) => b.weekOffset === 13);
    setMtmTimelineSliderStart(defaultStart >= 0 ? defaultStart : MTM_TIMELINE_HALF - 13);
    setMtmTimelineSliderEnd(defaultEnd >= 0 ? defaultEnd : MTM_TIMELINE_HALF + 13);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mtmTimelineAllBuckets.length]);

  const mtmTimelineEffStart = mtmTimelineSliderStart ?? (MTM_TIMELINE_HALF - 13);
  const mtmTimelineEffEnd = mtmTimelineSliderEnd ?? (MTM_TIMELINE_HALF + 13);

  const mtmTimelineBuckets = useMemo(
    () => mtmTimelineAllBuckets.slice(mtmTimelineEffStart, mtmTimelineEffEnd + 1),
    [mtmTimelineAllBuckets, mtmTimelineEffStart, mtmTimelineEffEnd],
  );

  const mtmTimelineExchangeLabels = useMemo(
    () => [...new Set(mtmTimelineBuckets.flatMap((b) => b.exchanges.map((e) => e.label)))],
    [mtmTimelineBuckets],
  );

  const mtmTimelineExchangePalette = useMemo(
    () => Object.fromEntries(
      exchangeRows.slice(0, 12).map((item, index) => [item.label, COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length]]),
    ),
    [exchangeRows],
  );

  const derivativeTypeRows = useMemo(() => {
    const typeMap = new Map();
    normalizedRows.forEach((item) => {
      const positionLabel = item?.posicao ? String(item.posicao).trim() : "Sem posicao";
      const typeLabel = item.derivativeType || "Outros";
      const label = `${positionLabel} ${typeLabel}`.trim();
      const current = typeMap.get(label) || {
        label,
        total: 0,
        netBrl: 0,
        open: 0,
        closed: 0,
        volume: 0,
        lots: 0,
        strikeWeighted: 0,
        strikeWeight: 0,
        rows: [],
      };
      current.total += 1;
      current.netBrl += item.mtmBrl;
      current.volume += item.standardVolume || item.rawVolume || 0;
      current.lots += item.lots || 0;
      current.strikeWeighted += (item.rawVolume || 0) * (item.strike || 0);
      current.strikeWeight += item.rawVolume || 0;
      current.rows.push(item);
      if (item.statusLabel === "Em aberto") current.open += 1;
      else current.closed += 1;
      typeMap.set(label, current);
    });
    return Array.from(typeMap.values())
      .map((item) => ({
        ...item,
        avgStrike: item.strikeWeight > 0 ? item.strikeWeighted / item.strikeWeight : 0,
      }))
      .sort((left, right) => right.total - left.total);
  }, [normalizedRows]);

  const getDerivativePositionTypeLabel = useCallback((item) => {
    const positionLabel = item?.posicao ? String(item.posicao).trim() : "Sem posicao";
    const typeLabel = item?.derivativeType || "Outros";
    return `${positionLabel} ${typeLabel}`.trim();
  }, []);

  const heatmapSource = useMemo(() => {
    const exchanges = exchangeRows.slice(0, 8).map((item) => item.label);
    const types = derivativeTypeRows.slice(0, 6).map((item) => item.label);
    const data = [];
    types.forEach((typeLabel, typeIndex) => {
      exchanges.forEach((exchangeLabel, exchangeIndex) => {
        const value = normalizedRows.filter((item) => item.exchangeLabel === exchangeLabel && getDerivativePositionTypeLabel(item) === typeLabel).length;
        data.push([exchangeIndex, typeIndex, value]);
      });
    });
    return { exchanges, types, data };
  }, [derivativeTypeRows, exchangeRows, getDerivativePositionTypeLabel, normalizedRows]);

  const heatmapMtmSource = useMemo(() => {
    const exchanges = exchangeRows.slice(0, 8).map((item) => item.label);
    const types = derivativeTypeRows.slice(0, 6).map((item) => item.label);
    const data = [];
    types.forEach((typeLabel, typeIndex) => {
      exchanges.forEach((exchangeLabel, exchangeIndex) => {
        const rows = normalizedRows.filter((item) => item.exchangeLabel === exchangeLabel && getDerivativePositionTypeLabel(item) === typeLabel);
        const value = rows.reduce((sum, item) => sum + item.mtmBrl, 0);
        data.push([exchangeIndex, typeIndex, value]);
      });
    });
    const maxAbs = Math.max(...data.map((item) => Math.abs(Number(item[2] || 0))), 1);
    return { exchanges, types, data, maxAbs };
  }, [derivativeTypeRows, exchangeRows, getDerivativePositionTypeLabel, normalizedRows]);

  const topPositiveRows = useMemo(
    () => [...normalizedRows].filter((item) => item.mtmBrl > 0).sort((left, right) => right.mtmBrl - left.mtmBrl).slice(0, 8),
    [normalizedRows],
  );
  const topNegativeRows = useMemo(
    () => [...normalizedRows].filter((item) => item.mtmBrl < 0).sort((left, right) => left.mtmBrl - right.mtmBrl).slice(0, 8),
    [normalizedRows],
  );
  const spotlightRows = useMemo(
    () => [...normalizedRows].sort((left, right) => Math.abs(right.mtmBrl) - Math.abs(left.mtmBrl)).slice(0, 12),
    [normalizedRows],
  );

  const formatMtmCompactLabel = (value) => {
    const numericValue = Number(value || 0);
    const prefix = numericValue < 0 ? "-R$ " : "R$ ";
    const absoluteValue = Math.abs(numericValue);
    if (absoluteValue >= 1000) {
      return `${prefix}${Math.round(absoluteValue / 1000).toLocaleString("pt-BR")} mil`;
    }
    return `${prefix}${Math.round(absoluteValue).toLocaleString("pt-BR")}`;
  };

  const formatSignedMtmCompactLabel = (value) => {
    const numericValue = Number(value || 0);
    const prefix = numericValue > 0 ? "+ R$ " : numericValue < 0 ? "- R$ " : "R$ ";
    const absoluteValue = Math.abs(numericValue);
    if (absoluteValue >= 1000) {
      return `${prefix}${Math.round(absoluteValue / 1000).toLocaleString("pt-BR")} mil`;
    }
    return `${prefix}${Math.round(absoluteValue).toLocaleString("pt-BR")}`;
  };

  const formatMtmIntegerValue = (value) =>
    Math.round(Math.abs(Number(value || 0))).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    });

  const formatMtmIntegerLabel = (value) => `${Number(value || 0) < 0 ? "-R$ " : "R$ "}${formatMtmIntegerValue(value)}`;

  const formatOpsLabel = (value) => `${formatNumber0(value)} ops`;
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    derivatives,
    setDerivatives,
  });

  const openMtmOperation = useCallback((row) => {
    setResourceTableModal(null);
    openOperationForm(row);
  }, [openOperationForm]);

  const openMtmRowsModal = useCallback((title, rows, definition = resourceDefinitions.derivativeOperations) => {
    setResourceTableModal({
      title,
      definition,
      rows,
    });
  }, []);

  const createMiniVerticalBarOption = useCallback(
    ({ rows, color = "#2563eb", valueFormatter = (value) => formatNumber0(value) }) => ({
      animationDuration: 180,
      grid: { left: 18, right: 14, top: 18, bottom: 42, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) =>
          params
            .map((item) => `${item.marker}${item.name}: ${valueFormatter(item.value)}`)
            .join("<br/>"),
      },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      },
      yAxis: {
        type: "value",
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 28,
          itemStyle: { color, borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
          label: {
            show: true,
            position: "insideTop",
            color: "#ffffff",
            fontWeight: 800,
            formatter: ({ value }) => (Number(value || 0) > 0 ? valueFormatter(value) : ""),
          },
          data: rows.map((item) => item.value),
        },
      ],
    }),
    [],
  );

  const createMiniLineOption = useCallback(
    ({ rows, color = "#0f766e", valueFormatter = formatMtmCompactLabel }) => ({
      animationDuration: 180,
      grid: { left: 18, right: 16, top: 18, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (params) =>
          params
            .map((item) => `${item.marker}${item.name}: ${valueFormatter(item.value)}`)
            .join("<br/>"),
      },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLabel: { color: "#475569", interval: 0, rotate: 20 },
      },
      yAxis: {
        type: "value",
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { color, width: 3 },
          itemStyle: { color },
          label: {
            show: true,
            position: "top",
            color: color,
            fontWeight: 800,
            formatter: ({ value }) => (Math.abs(Number(value || 0)) > 0 ? valueFormatter(value) : ""),
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}33` },
                { offset: 1, color: `${color}05` },
              ],
            },
          },
          data: rows.map((item) => item.value),
        },
      ],
    }),
    [],
  );

  const createMiniDonutOption = useCallback(
    ({ rows, centerLabel = "", centerValue = "", valueFormatter = (value) => formatNumber0(value) }) => ({
      animationDuration: 180,
      tooltip: {
        trigger: "item",
        formatter: ({ name, value }) => `${name}: ${valueFormatter(value)}`,
      },
      legend: {
        bottom: 0,
        textStyle: { color: "#475569", fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["50%", "74%"],
          center: ["50%", "42%"],
          avoidLabelOverlap: true,
          minAngle: 10,
          labelLine: { show: false },
          label: {
            show: true,
            position: "inside",
            color: "#0f172a",
            fontWeight: 800,
            fontSize: 11,
            formatter: ({ percent }) => (Number(percent || 0) >= 16 ? `${Math.round(percent)}%` : ""),
          },
          data: rows,
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "34%",
          style: {
            text: centerValue,
            fill: "#0f172a",
            fontSize: 22,
            fontWeight: 900,
            textAlign: "center",
          },
        },
        {
          type: "text",
          left: "center",
          top: "49%",
          style: {
            text: centerLabel,
            fill: "#64748b",
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
          },
        },
      ],
    }),
    [],
  );

  const contractRows = useMemo(() => {
    const map = new Map();
    normalizedRows.forEach((item) => {
      const label = item?.contrato_derivativo || item?.operationName || `#${item.id}`;
      const current = map.get(label) || { label, total: 0, netBrl: 0, volume: 0, rows: [] };
      current.total += 1;
      current.netBrl += item.mtmBrl;
      current.volume += item.standardVolume || item.rawVolume || 0;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.netBrl) - Math.abs(left.netBrl));
  }, [normalizedRows]);

  const openRiskRows = useMemo(
    () => normalizedRows.filter((item) => item.statusLabel === "Em aberto").sort((left, right) => left.mtmBrl - right.mtmBrl).slice(0, 8),
    [normalizedRows],
  );
  const closedPositiveRows = useMemo(
    () => normalizedRows.filter((item) => item.statusLabel === "Encerrado" && item.mtmBrl > 0).sort((left, right) => right.mtmBrl - left.mtmBrl).slice(0, 8),
    [normalizedRows],
  );
  const closedNegativeRows = useMemo(
    () => normalizedRows.filter((item) => item.statusLabel === "Encerrado" && item.mtmBrl < 0).sort((left, right) => left.mtmBrl - right.mtmBrl).slice(0, 8),
    [normalizedRows],
  );

  const openSettlementBandRows = useMemo(() => {
    const bands = [
      { label: "0-7d", match: (value) => value != null && value >= 0 && value <= 7 },
      { label: "8-15d", match: (value) => value != null && value >= 8 && value <= 15 },
      { label: "16-30d", match: (value) => value != null && value >= 16 && value <= 30 },
      { label: "31-60d", match: (value) => value != null && value >= 31 && value <= 60 },
      { label: "61-90d", match: (value) => value != null && value >= 61 && value <= 90 },
      { label: "90d+", match: (value) => value != null && value > 90 },
    ];

    return bands.map((band) => {
      const rows = openRowsInView.filter((item) => band.match(item.daysToSettlement));
      return { label: band.label, value: rows.length, rows };
    });
  }, [openRowsInView]);

  const closedSettlementMonthRows = useMemo(() => {
    const map = new Map();
    closedRowsInView.forEach((item) => {
      if (!item.settlementDate) return;
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(item.settlementDate).replace(".", "");
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).slice(-8);
  }, [closedRowsInView]);

  const closedDirectionSlices = useMemo(() => ([
    { name: "Positivas", value: closedRowsInView.filter((item) => item.direction === "positive").length, itemStyle: { color: "#16a34a" } },
    { name: "Negativas", value: closedRowsInView.filter((item) => item.direction === "negative").length, itemStyle: { color: "#dc2626" } },
    { name: "Neutras", value: closedRowsInView.filter((item) => item.direction === "neutral").length, itemStyle: { color: "#94a3b8" } },
  ]).filter((item) => item.value > 0), [closedRowsInView]);

  const monthlyContractRows = useMemo(() => {
    const map = new Map();
    normalizedRows.forEach((item) => {
      if (!item.negotiationDate) return;
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(item.negotiationDate).replace(".", "");
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += 1;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).slice(-8);
  }, [normalizedRows]);

  const monthlySettlementRows = useMemo(() => {
    const map = new Map();
    normalizedRows.forEach((item) => {
      if (!item.settlementDate) return;
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(item.settlementDate).replace(".", "");
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).slice(-8);
  }, [normalizedRows]);

  const salesExchangeRows = useMemo(() => {
    const map = new Map();
    normalizedSales.forEach((item) => {
      const current = map.get(item.exchangeLabel) || {
        label: item.exchangeLabel,
        total: 0,
        volume: 0,
        basisWeighted: 0,
        priceWeighted: 0,
        rows: [],
      };
      current.total += 1;
      current.volume += item.volumeValue;
      current.basisWeighted += item.basisValue * item.volumeValue;
      current.priceWeighted += item.priceValue * item.volumeValue;
      current.rows.push(item);
      map.set(item.exchangeLabel, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        basisAvg: item.volume > 0 ? item.basisWeighted / item.volume : 0,
        priceAvg: item.volume > 0 ? item.priceWeighted / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [normalizedSales]);

  const salesCultureRows = useMemo(() => {
    const map = new Map();
    normalizedSales.forEach((item) => {
      const current = map.get(item.cultureLabel) || { label: item.cultureLabel, volume: 0, basisWeighted: 0, rows: [] };
      current.volume += item.volumeValue;
      current.basisWeighted += item.basisValue * item.volumeValue;
      current.rows.push(item);
      map.set(item.cultureLabel, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        basisAvg: item.volume > 0 ? item.basisWeighted / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [normalizedSales]);

  const extraInsightCards = useMemo(() => {
    const cards = [
      {
        key: "basis-mtm-scatter",
        title: "Basis x MTM por bolsa",
        subtitle: "Cruza basis físico e saldo derivativo por bolsa.",
        option: {
          animationDuration: 180,
          grid: { left: 56, right: 16, top: 18, bottom: 48 },
          tooltip: {
            formatter: (params) => {
              const point = salesExchangeRows.find((item) => item.label === params.name);
              return point
                ? `${point.label}<br/>Basis: ${formatNumber2(point.basisAvg)}<br/>MTM: ${formatMtmIntegerLabel(exchangeRows.find((row) => row.label === point.label)?.netBrl || 0)}`
                : params.name;
            },
          },
          xAxis: {
            type: "value",
            name: "Basis médio",
            nameLocation: "middle",
            nameGap: 28,
            nameTextStyle: { color: "#475569", fontWeight: 700, fontSize: 12 },
            axisLabel: { color: "#475569", formatter: (value) => formatNumber2(value) },
            splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
          },
          yAxis: {
            type: "value",
            name: "MTM R$",
            nameLocation: "middle",
            nameGap: 44,
            nameTextStyle: { color: "#475569", fontWeight: 700, fontSize: 12 },
            axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
            splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
          },
          series: [
            {
              type: "scatter",
              symbolSize: (value) => Math.max(14, Math.min(34, (value[2] || 0) / 15000)),
              label: { show: true, position: "top", color: "#334155", fontWeight: 800, formatter: ({ name }) => name },
              data: salesExchangeRows.slice(0, 6).map((item) => [
                item.basisAvg,
                exchangeRows.find((row) => row.label === item.label)?.netBrl || 0,
                item.volume,
                item.label,
              ]),
              itemStyle: { color: "#f97316", shadowBlur: 10, shadowColor: "rgba(249, 115, 22, 0.28)" },
            },
          ],
        },
      },
      {
        key: "open-risk-table",
        title: "Risco aberto prioritário",
        subtitle: "Operações em aberto com maior pressão negativa.",
        table: {
          columns: ["Operação", "Bolsa", "MTM"],
          rows: openRiskRows.map((item) => ({
            key: item.id,
            cells: [item.operationName, item.exchangeLabel, formatMtmIntegerLabel(item.mtmBrl)],
            tone: "negative",
            onClick: () => openMtmRowsModal(`Operação ${item.operationName}`, [item]),
          })),
        },
      },
      {
        key: "closed-positive-table",
        title: "Encerradas com melhor resultado",
        subtitle: "As maiores capturas positivas já realizadas.",
        table: {
          columns: ["Operação", "Bolsa", "MTM"],
          rows: closedPositiveRows.map((item) => ({
            key: item.id,
            cells: [item.operationName, item.exchangeLabel, formatMtmIntegerLabel(item.mtmBrl)],
            tone: "positive",
            onClick: () => openMtmRowsModal(`Operação ${item.operationName}`, [item]),
          })),
        },
      },
      {
        key: "basis-culture-table",
        title: "Basis por cultura",
        subtitle: "Quais culturas estão com melhor ou pior basis médio.",
        table: {
          columns: ["Cultura", "Basis", "Volume"],
          rows: salesCultureRows.slice(0, 6).map((item) => ({
            key: item.label,
            cells: [item.label, formatNumber2(item.basisAvg), `${formatNumber0(item.volume)} sc`],
            onClick: () => openMtmRowsModal(`Vendas físicas · ${item.label}`, item.rows, resourceDefinitions.physicalSales),
          })),
        },
      },
    ];
    return cards;
  }, [
    closedPositiveRows,
    contractRows,
    createMiniLineOption,
    exchangeRows,
    monthlyContractRows,
    monthlySettlementRows,
    openMtmRowsModal,
    openRiskRows,
    salesCultureRows,
    salesExchangeRows,
  ]);

  const weeklyVolumeByExchangeOption = useMemo(() => {
    const exchangePalette = Object.fromEntries(
      exchangeRows.slice(0, 12).map((item, index) => [item.label, COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length]]),
    );
    const exchangeLabels = [...new Set(weeklySettlementBuckets.flatMap((bucket) => bucket.exchanges.map((item) => item.label)))];

    return {
      animationDuration: 220,
      grid: { left: 66, right: 24, top: 72, bottom: 72, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const bucket = weeklySettlementBuckets.find((item) => item.shortLabel === params?.[0]?.axisValue);
          const header = bucket ? `Semana ${bucket.shortLabel.slice(1)} · ${bucket.label}` : params?.[0]?.axisValue || "";
          const lines = params
            .filter((item) => Number(item.value || 0) !== 0)
            .map((item) => `${item.marker}${item.seriesName}: ${formatNumber0(item.value)} sc`);
          return [header, ...lines].join("<br/>");
        },
      },
      legend: {
        top: 8,
        itemWidth: 18,
        itemHeight: 12,
        textStyle: { color: "#475569", fontSize: 13, fontWeight: 700 },
      },
      xAxis: {
        type: "category",
        data: weeklySettlementBuckets.map((item) => item.shortLabel),
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          interval: 0,
          fontSize: 12,
          fontWeight: 700,
          margin: 14,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
          formatter: (value) => `${Number(value).toLocaleString("pt-BR", { notation: "compact" })} sc`,
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      series: exchangeLabels.map((exchangeLabel) => ({
        name: exchangeLabel,
        type: "bar",
        barMaxWidth: 24,
        barGap: "18%",
        barCategoryGap: "30%",
        itemStyle: {
          color: exchangePalette[exchangeLabel] || "#94a3b8",
          borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
        },
        label: {
          show: true,
          position: "top",
          distance: 6,
          color: "#334155",
          fontSize: 12,
          fontWeight: 800,
          formatter: ({ value }) => (Number(value || 0) >= 120000 ? `${formatNumber0(value)} sc` : ""),
        },
        data: weeklySettlementBuckets.map((bucket) => bucket.exchanges.find((item) => item.label === exchangeLabel)?.volume || 0),
      })),
    };
  }, [exchangeRows, weeklySettlementBuckets]);

  const weeklyVolumeByExchangeEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const bucket = weeklySettlementBuckets.find((item) => item.shortLabel === params.name);
        if (!bucket) return;
        const exchangeNode = bucket.exchanges.find((item) => item.label === params.seriesName);
        if (!exchangeNode) return;
        openMtmRowsModal(`Volume ${bucket.label} · ${params.seriesName}`, exchangeNode.rows);
      },
    }),
    [openMtmRowsModal, weeklySettlementBuckets],
  );

  const weeklyMtmByExchangeOption = useMemo(() => {
    const exchangePalette = Object.fromEntries(
      exchangeRows.slice(0, 12).map((item, index) => [item.label, COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length]]),
    );
    const exchangeLabels = [...new Set(weeklySettlementBuckets.flatMap((bucket) => bucket.exchanges.map((item) => item.label)))];

    return {
      animationDuration: 220,
      grid: { left: 72, right: 24, top: 72, bottom: 72, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const bucket = weeklySettlementBuckets.find((item) => item.shortLabel === params?.[0]?.axisValue);
          const header = bucket ? `Semana ${bucket.shortLabel.slice(1)} · ${bucket.label}` : params?.[0]?.axisValue || "";
          const lines = params
            .filter((item) => Number(item.value || 0) !== 0)
            .map((item) => `${item.marker}${item.seriesName}: ${formatMtmCompactLabel(item.value)}`);
          return [header, ...lines].join("<br/>");
        },
      },
      legend: {
        top: 8,
        itemWidth: 18,
        itemHeight: 12,
        textStyle: { color: "#475569", fontSize: 13, fontWeight: 700 },
      },
      xAxis: {
        type: "category",
        data: weeklySettlementBuckets.map((item) => item.shortLabel),
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          interval: 0,
          fontSize: 12,
          fontWeight: 700,
          margin: 14,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
          formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}`,
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      series: exchangeLabels.map((exchangeLabel) => ({
        name: exchangeLabel,
        type: "bar",
        barMaxWidth: 24,
        barGap: "18%",
        barCategoryGap: "30%",
        itemStyle: {
          color: exchangePalette[exchangeLabel] || "#94a3b8",
          borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
        },
        label: {
          show: true,
          position: ({ value }) => (Number(value || 0) >= 0 ? "top" : "bottom"),
          distance: 6,
          color: "#334155",
          fontSize: 12,
          fontWeight: 800,
          formatter: ({ value }) => (Math.abs(Number(value || 0)) >= 25000 ? formatMtmCompactLabel(value) : ""),
        },
        data: weeklySettlementBuckets.map((bucket) => bucket.exchanges.find((item) => item.label === exchangeLabel)?.mtmBrl || 0),
      })),
    };
  }, [exchangeRows, weeklySettlementBuckets]);

  const weeklyMtmByExchangeEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const bucket = weeklySettlementBuckets.find((item) => item.shortLabel === params.name);
        if (!bucket) return;
        const exchangeNode = bucket.exchanges.find((item) => item.label === params.seriesName);
        if (!exchangeNode) return;
        openMtmRowsModal(`MTM ${bucket.label} · ${params.seriesName}`, exchangeNode.rows);
      },
    }),
    [openMtmRowsModal, weeklySettlementBuckets],
  );

  const mtmTimelineOption = useMemo(() => {
    const todayBucketIdx = mtmTimelineBuckets.findIndex((b) => b.weekOffset === 0);
    const labelInterval = Math.max(0, Math.floor(mtmTimelineBuckets.length / 14) - 1);
    return {
      animationDuration: 220,
      grid: { left: 72, right: 24, top: 72, bottom: 56, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const bucket = mtmTimelineBuckets.find((b) => b.label === params?.[0]?.axisValue);
          const header = bucket ? bucket.label : params?.[0]?.axisValue || "";
          const lines = params
            .filter((item) => Number(item.value || 0) !== 0)
            .map((item) => `${item.marker}${item.seriesName}: ${formatMtmCompactLabel(item.value)}`);
          return [header, ...lines].join("<br/>");
        },
      },
      legend: {
        top: 8,
        itemWidth: 18,
        itemHeight: 12,
        textStyle: { color: "#475569", fontSize: 13, fontWeight: 700 },
      },
      xAxis: {
        type: "category",
        data: mtmTimelineBuckets.map((b) => b.label),
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontSize: 11,
          fontWeight: 700,
          rotate: 35,
          interval: labelInterval,
          margin: 14,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
          formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}`,
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      series: mtmTimelineExchangeLabels.map((exLabel, seriesIdx) => ({
        name: exLabel,
        type: "bar",
        barMaxWidth: 24,
        barGap: "18%",
        barCategoryGap: "30%",
        itemStyle: {
          color: mtmTimelineExchangePalette[exLabel] || "#94a3b8",
          borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
        },
        label: {
          show: true,
          position: ({ value }) => (Number(value || 0) >= 0 ? "top" : "bottom"),
          distance: 6,
          color: "#334155",
          fontSize: 11,
          fontWeight: 800,
          formatter: ({ value }) => (Math.abs(Number(value || 0)) >= 25000 ? formatMtmCompactLabel(value) : ""),
        },
        data: mtmTimelineBuckets.map((b) => b.exchanges.find((e) => e.label === exLabel)?.mtmBrl || 0),
        ...(seriesIdx === 0 && todayBucketIdx >= 0
          ? {
              markLine: {
                silent: true,
                symbol: "none",
                lineStyle: { color: "#1d4ed8", type: "dashed", width: 2 },
                label: {
                  show: true,
                  formatter: "Hoje",
                  color: "#1d4ed8",
                  fontWeight: 800,
                  position: "insideStartTop",
                },
                data: [{ xAxis: mtmTimelineBuckets[todayBucketIdx].label }],
              },
            }
          : {}),
      })),
    };
  }, [mtmTimelineBuckets, mtmTimelineExchangeLabels, mtmTimelineExchangePalette]);

  const mtmTimelineEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const bucket = mtmTimelineBuckets.find((b) => b.label === params.name);
        if (!bucket) return;
        const exNode = bucket.exchanges.find((e) => e.label === params.seriesName);
        if (!exNode) return;
        openMtmRowsModal(`MTM ${bucket.label} · ${params.seriesName}`, exNode.rows);
      },
    }),
    [mtmTimelineBuckets, openMtmRowsModal],
  );

  const statusDonutOption = {
    animationDuration: 220,
    tooltip: { trigger: "item", formatter: ({ name, value }) => `${name}: ${formatNumber0(value)} ops` },
    legend: { bottom: 0, textStyle: { color: "#475569", fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["52%", "76%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        minAngle: 8,
        labelLine: { show: false },
        label: {
          show: true,
          position: "inside",
          color: "#0f172a",
          fontWeight: 800,
          fontSize: 12,
          formatter: ({ name, value, percent }) => (Number(percent || 0) >= 18 ? `${name}\n${formatNumber0(value)}` : ""),
        },
        itemStyle: { borderColor: "#fff7ed", borderWidth: 4 },
        data: [
          { name: "Positivas", value: summary.positive, itemStyle: { color: "#16a34a" } },
          { name: "Negativas", value: summary.negative, itemStyle: { color: "#dc2626" } },
          { name: "Neutras", value: summary.neutral, itemStyle: { color: "#94a3b8" } },
        ],
      },
    ],
  };

  const openClosedDonutOption = {
    animationDuration: 220,
    tooltip: { trigger: "item", formatter: ({ name, value }) => `${name}: ${formatNumber0(value)} ops` },
    legend: { bottom: 0, textStyle: { color: "#475569", fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["52%", "76%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        minAngle: 8,
        labelLine: { show: false },
        label: {
          show: true,
          position: "inside",
          color: "#0f172a",
          fontWeight: 800,
          fontSize: 12,
          formatter: ({ name, value, percent }) => (Number(percent || 0) >= 20 ? `${name}\n${formatNumber0(value)}` : ""),
        },
        itemStyle: { borderColor: "#fff7ed", borderWidth: 4 },
        data: [
          { name: "Em aberto", value: summary.open, itemStyle: { color: "#2563eb" } },
          { name: "Encerradas", value: summary.closed, itemStyle: { color: "#7c3aed" } },
        ],
      },
    ],
  };

  const exchangeMtmMaxSeriesValue = Math.max(
    ...exchangeRowsWithTotal.flatMap((item) => [item.positiveBrl, item.negativeBrl]),
    1,
  );
  const exchangeMtmAxisPadding = Math.max(exchangeMtmMaxSeriesValue * 0.08, 1200);

  const exchangeMtmOption = {
    animationDuration: 220,
    grid: { left: 168, right: 22, top: 18, bottom: 18 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) =>
        params
            .map((item) => `${item.marker}${item.seriesName}: ${formatMtmIntegerLabel(item.value)}`)
            .join("<br/>"),
    },
    legend: {
      top: 0,
      data: ["Positivo", "Negativo"],
      textStyle: { color: "#475569", fontSize: 11 },
    },
    xAxis: {
      type: "value",
      min: -exchangeMtmMaxSeriesValue - exchangeMtmAxisPadding,
      max: exchangeMtmMaxSeriesValue + exchangeMtmAxisPadding,
      axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      axisLine: { lineStyle: { color: "rgba(71, 85, 105, 0.38)" } },
    },
    yAxis: {
      type: "category",
      axisLabel: {
        color: "#0f172a",
        fontWeight: 700,
        formatter: (value) => {
          const row = exchangeRowsWithTotal.find((item) => item.label === value);
          const titleToken = value === "TOTAL CARTEIRA" ? "total" : "name";
          const valueToken = row?.netBrl < 0 ? "saldoNegative" : row?.netBrl > 0 ? "saldoPositive" : "saldoNeutral";
          if (!row) return value;
          return `{${titleToken}|${value}}\n{${valueToken}|${formatSignedMtmCompactLabel(row.netBrl)}}`;
        },
        rich: {
          name: {
            color: "#0f172a",
            fontWeight: 800,
            fontSize: 13,
            lineHeight: 20,
          },
          total: {
            color: "#0f172a",
            fontWeight: 900,
            fontSize: 13,
            lineHeight: 20,
          },
          saldoPositive: {
            color: "#16a34a",
            fontWeight: 800,
            fontSize: 14,
            lineHeight: 22,
          },
          saldoNegative: {
            color: "#dc2626",
            fontWeight: 800,
            fontSize: 14,
            lineHeight: 22,
          },
          saldoNeutral: {
            color: "#475569",
            fontWeight: 800,
            fontSize: 14,
            lineHeight: 22,
          },
        },
      },
      data: exchangeRowsWithTotal.map((item) => item.label),
    },
    series: [
      {
        name: "Positivo",
        type: "bar",
        stack: "mtm",
        barMaxWidth: 30,
        itemStyle: { color: "#16a34a", borderRadius: [0, CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0] },
        label: { show: false },
        data: exchangeRowsWithTotal.map((item) => item.positiveBrl),
      },
      {
        name: "Negativo",
        type: "bar",
        stack: "mtm",
        barMaxWidth: 30,
        itemStyle: { color: "#dc2626", borderRadius: [CHART_BAR_RADIUS, 0, 0, CHART_BAR_RADIUS] },
        label: { show: false },
        data: exchangeRowsWithTotal.map((item) => -item.negativeBrl),
      },
    ],
  };

  const exchangeNetOption = useMemo(
    () => ({
      animationDuration: 220,
      grid: { left: 88, right: 28, top: 22, bottom: 24 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) =>
          params
            .map((item) => `${item.marker}${item.name}: ${formatMtmCompactLabel(item.value)}`)
            .join("<br/>"),
      },
      xAxis: {
        type: "value",
        axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      },
      yAxis: {
        type: "category",
        data: exchangeRowsWithTotalSortedByNet.map((item) => item.label),
        axisTick: { show: false },
        axisLabel: {
          color: "#0f172a",
          fontWeight: 700,
          formatter: (value) => (value === "TOTAL CARTEIRA" ? "{total|TOTAL CARTEIRA}" : value),
          rich: {
            total: {
              color: "#1d4ed8",
              fontWeight: 900,
            },
          },
        },
      },
      series: [
        {
          name: "Saldo líquido",
          type: "bar",
          barMaxWidth: 28,
          itemStyle: {
            color: (params) => (Number(params.value || 0) >= 0 ? "#2563eb" : "#1e3a8a"),
            borderRadius: CHART_BAR_RADIUS,
          },
          label: {
            show: true,
            position: ({ value }) => (Number(value || 0) >= 0 ? "insideRight" : "insideLeft"),
            color: "#eff6ff",
            fontWeight: 800,
            formatter: ({ value }) => formatMtmCompactLabel(value),
          },
          data: exchangeRowsWithTotalSortedByNet.map((item) => item.netBrl),
        },
      ],
    }),
    [exchangeRowsWithTotalSortedByNet],
  );

  const exchangeGroupedOption = useMemo(
    () => ({
      animationDuration: 220,
      grid: { left: 58, right: 20, top: 30, bottom: 54 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) =>
          params
            .filter((item) => Number(item.value || 0) !== 0)
            .map((item) => `${item.marker}${item.seriesName}: ${formatMtmCompactLabel(item.value)}`)
            .join("<br/>"),
      },
      legend: { top: 0, textStyle: { color: "#475569", fontSize: 11 } },
      xAxis: {
        type: "category",
        data: exchangeRowsWithTotal.map((item) => item.label),
        axisTick: { show: false },
        axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      },
      series: [
        {
          name: "Positivo",
          type: "bar",
          barMaxWidth: 24,
          itemStyle: { color: "#16a34a", borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
          label: {
            show: true,
            position: "insideTop",
            color: "#ecfdf5",
            fontWeight: 800,
            formatter: ({ value }) => (Number(value || 0) >= 70000 ? formatMtmCompactLabel(value) : ""),
          },
          data: exchangeRowsWithTotal.map((item) => item.positiveBrl),
        },
        {
          name: "Negativo",
          type: "bar",
          barMaxWidth: 24,
          itemStyle: { color: "#dc2626", borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
          label: {
            show: true,
            position: "insideTop",
            color: "#fef2f2",
            fontWeight: 800,
            formatter: ({ value }) => (Number(value || 0) >= 70000 ? formatMtmCompactLabel(-value) : ""),
          },
          data: exchangeRowsWithTotal.map((item) => item.negativeBrl),
        },
        {
          name: "Saldo",
          type: "bar",
          barMaxWidth: 24,
          itemStyle: {
            color: (params) => (Number(params.value || 0) >= 0 ? "#2563eb" : "#1e3a8a"),
            borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
          },
          label: {
            show: true,
            position: ({ value }) => (Number(value || 0) >= 0 ? "insideTop" : "insideBottom"),
            color: "#eff6ff",
            fontWeight: 800,
            formatter: ({ value }) => formatMtmCompactLabel(value),
          },
          data: exchangeRowsWithTotal.map((item) => item.netBrl),
        },
      ],
    }),
    [exchangeRowsWithTotal],
  );

  const exchangeWaterfallRows = useMemo(() => {
    let running = 0;
    return exchangeRows.map((item) => {
      const start = running;
      running += item.netBrl;
      return {
        ...item,
        start,
        end: running,
      };
    });
  }, [exchangeRows]);

  const exchangeWaterfallOption = useMemo(
    () => ({
      animationDuration: 220,
      grid: { left: 58, right: 26, top: 24, bottom: 54 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const row = exchangeWaterfallRows.find((item) => item.label === params[0]?.name);
          if (!row) return "";
          return `${row.label}<br/>Contribuição: ${formatMtmCompactLabel(row.netBrl)}<br/>Acumulado: ${formatMtmCompactLabel(row.end)}`;
        },
      },
      xAxis: {
        type: "category",
        data: exchangeWaterfallRows.map((item) => item.label),
        axisTick: { show: false },
        axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      },
      series: [
        {
          type: "bar",
          stack: "waterfall",
          silent: true,
          itemStyle: { color: "transparent" },
          emphasis: { disabled: true },
          data: exchangeWaterfallRows.map((item) => item.start),
        },
        {
          name: "Contribuição",
          type: "bar",
          stack: "waterfall",
          barMaxWidth: 30,
          itemStyle: {
            color: (params) => (Number(params.value || 0) >= 0 ? "#0f766e" : "#b91c1c"),
            borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0],
          },
          label: {
            show: true,
            position: ({ value }) => (Number(value || 0) >= 0 ? "insideTop" : "insideBottom"),
            color: "#ffffff",
            fontWeight: 800,
            formatter: ({ value }) => (Math.abs(Number(value || 0)) >= 70000 ? formatMtmCompactLabel(value) : ""),
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#1d4ed8", type: "dashed", width: 2 },
            label: {
              show: true,
              formatter: `Total ${formatMtmCompactLabel(summary.netBrl)}`,
              color: "#1d4ed8",
              fontWeight: 800,
            },
            data: [{ yAxis: summary.netBrl }],
          },
          data: exchangeWaterfallRows.map((item) => item.netBrl),
        },
      ],
    }),
    [exchangeWaterfallRows, summary.netBrl],
  );

  const exchangeStatusOption = {
    animationDuration: 220,
    grid: { left: 56, right: 20, top: 26, bottom: 48 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, textStyle: { color: "#475569", fontSize: 11 } },
    xAxis: {
      type: "category",
      data: exchangeRows.slice(0, 8).map((item) => item.label),
      axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#475569" },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    series: [
      {
        name: "Em aberto",
        type: "bar",
        stack: "status",
        itemStyle: { color: "#2563eb", borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
        label: {
          show: true,
          position: "insideTop",
          color: "#eff6ff",
          fontWeight: 800,
          formatter: ({ value }) => (Number(value || 0) >= 2 ? formatNumber0(value) : ""),
        },
        data: exchangeRows.slice(0, 8).map((item) => item.open),
      },
      {
        name: "Encerradas",
        type: "bar",
        stack: "status",
        itemStyle: { color: "#7c3aed", borderRadius: [CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0] },
        label: {
          show: true,
          position: "insideTop",
          color: "#f5f3ff",
          fontWeight: 800,
          formatter: ({ value }) => (Number(value || 0) >= 2 ? formatNumber0(value) : ""),
        },
        data: exchangeRows.slice(0, 8).map((item) => item.closed),
      },
    ],
  };

  const typePerformanceOption = {
    animationDuration: 220,
    grid: { left: 60, right: 28, top: 26, bottom: 28 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    yAxis: {
      type: "category",
      axisLabel: { color: "#0f172a", fontWeight: 700 },
      data: derivativeTypeRows.map((item) => item.label),
    },
    series: [
      {
        type: "bar",
        label: {
          show: true,
          position: "insideRight",
          color: "#f8fafc",
          fontWeight: 800,
          formatter: ({ value }) => {
            const resolved = typeof value === "object" ? value.value : value;
            return Math.abs(Number(resolved || 0)) >= 90000 ? formatMtmCompactLabel(resolved) : "";
          },
        },
        data: derivativeTypeRows.map((item) => ({
          value: item.netBrl,
          itemStyle: { color: item.netBrl >= 0 ? "#0f766e" : "#ef4444", borderRadius: CHART_BAR_RADIUS },
        })),
      },
    ],
  };

  const topPositiveOption = {
    animationDuration: 220,
    grid: { left: 80, right: 20, top: 26, bottom: 26 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    yAxis: {
      type: "category",
      axisLabel: { color: "#0f172a", fontWeight: 700, formatter: (value) => value.slice(0, 18) },
      data: topPositiveRows.map((item) => item.operationName),
    },
    series: [
      {
        type: "bar",
        itemStyle: { color: "#16a34a", borderRadius: CHART_BAR_RADIUS },
        label: {
          show: true,
          position: "insideRight",
          color: "#ecfdf5",
          fontWeight: 800,
          formatter: ({ value }) => (Math.abs(Number(value || 0)) >= 120000 ? formatMtmCompactLabel(value) : ""),
        },
        data: topPositiveRows.map((item) => item.mtmBrl),
      },
    ],
  };

  const topNegativeOption = {
    animationDuration: 220,
    grid: { left: 80, right: 20, top: 26, bottom: 26 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      axisLabel: { color: "#475569", formatter: (value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}` },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
    },
    yAxis: {
      type: "category",
      axisLabel: { color: "#0f172a", fontWeight: 700, formatter: (value) => value.slice(0, 18) },
      data: topNegativeRows.map((item) => item.operationName),
    },
    series: [
      {
        type: "bar",
        itemStyle: { color: "#dc2626", borderRadius: CHART_BAR_RADIUS },
        label: {
          show: true,
          position: "insideLeft",
          color: "#fef2f2",
          fontWeight: 800,
          formatter: ({ value }) => (Math.abs(Number(value || 0)) >= 120000 ? formatMtmCompactLabel(value) : ""),
        },
        data: topNegativeRows.map((item) => item.mtmBrl),
      },
    ],
  };

  const _heatmapMaxCount = Math.max(...heatmapSource.data.map((item) => item[2]), 1);
  const heatmapOption = {
    animationDuration: 220,
    tooltip: {
      formatter: (params) => {
        if (!Array.isArray(params.value)) return "";
        const exchangeLabel = heatmapSource.exchanges[params.value[0]];
        const typeLabel = heatmapSource.types[params.value[1]];
        return `${exchangeLabel}<br/>${typeLabel}<br/>${params.value[2]} ops`;
      },
    },
    grid: { left: 120, right: 20, top: 18, bottom: 24 },
    xAxis: {
      type: "category",
      data: heatmapSource.exchanges,
      splitArea: { show: true },
      axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: heatmapSource.types,
      splitArea: { show: true },
      axisLabel: { color: "#475569" },
      axisTick: { show: false },
    },
    series: [
      {
        type: "scatter",
        data: heatmapSource.data.filter((d) => d[2] > 0),
        symbolSize: (val) => Math.max(14, Math.sqrt(val[2] / _heatmapMaxCount) * 72),
        itemStyle: { color: "#f97316" },
        label: {
          show: true,
          position: "inside",
          color: "#431407",
          fontWeight: 800,
          formatter: ({ value }) => value[2],
        },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(15, 23, 42, 0.15)" } },
      },
    ],
  };

  const heatmapMtmOption = {
    animationDuration: 220,
    tooltip: {
      formatter: (params) => {
        if (!Array.isArray(params.value)) return "";
        const exchangeLabel = heatmapMtmSource.exchanges[params.value[0]];
        const typeLabel = heatmapMtmSource.types[params.value[1]];
        return `${exchangeLabel}<br/>${typeLabel}<br/>MTM: ${formatMtmCompactLabel(params.value[2])}`;
      },
    },
    grid: { left: 120, right: 20, top: 18, bottom: 24 },
    xAxis: {
      type: "category",
      data: heatmapMtmSource.exchanges,
      splitArea: { show: true },
      axisLabel: { color: "#475569", interval: 0, rotate: 18 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: heatmapMtmSource.types,
      splitArea: { show: true },
      axisLabel: { color: "#475569" },
      axisTick: { show: false },
    },
    series: [
      {
        type: "scatter",
        name: "positive",
        data: heatmapMtmSource.data.filter((d) => d[2] > 0),
        symbolSize: (val) => Math.max(14, Math.sqrt(Math.abs(val[2]) / heatmapMtmSource.maxAbs) * 72),
        itemStyle: { color: "#15803d" },
        label: {
          show: true,
          position: "inside",
          color: "#0f172a",
          fontWeight: 800,
          formatter: ({ value }) => formatMtmCompactLabel(value[2]),
        },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(15, 23, 42, 0.15)" } },
      },
      {
        type: "scatter",
        name: "negative",
        data: heatmapMtmSource.data.filter((d) => d[2] < 0),
        symbolSize: (val) => Math.max(14, Math.sqrt(Math.abs(val[2]) / heatmapMtmSource.maxAbs) * 72),
        itemStyle: { color: "#dc2626" },
        label: {
          show: true,
          position: "inside",
          color: "#0f172a",
          fontWeight: 800,
          formatter: ({ value }) => formatMtmCompactLabel(value[2]),
        },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(15, 23, 42, 0.15)" } },
      },
    ],
  };

  const openExchangeModal = useCallback((exchangeLabel) => {
    const rows = cardFilteredRows.filter((item) => item.exchangeLabel === exchangeLabel);
    openMtmRowsModal(`${exchangeLabel} · Operações de derivativos`, rows);
  }, [cardFilteredRows, openMtmRowsModal]);

  const heroCards = useMemo(
    () => {
      const cards = [
        {
          key: "all",
          label: "MTM líquido consolidado",
          value: formatMtmIntegerLabel(allSummary.netBrl),
          help: "Soma dos ajustes MTM R$ de toda a carteira.",
          className: allSummary.netBrl >= 0 ? "is-positive" : allSummary.netBrl < 0 ? "is-negative" : "is-neutral",
          rows: allNormalizedRows,
          title: "MTM consolidado · Todas as operações",
          metaItems: [
            { key: "positive", label: "Positivas", value: formatNumber0(allSummary.positive) },
            { key: "negative", label: "Negativas", value: formatNumber0(allSummary.negative) },
            { key: "neutral", label: "Neutras", value: formatNumber0(allSummary.neutral) },
          ],
        },
        {
          key: "open",
          label: "Operações em aberto",
          value: formatMtmIntegerLabel(openSummary.netBrl),
          help: "Soma dos ajustes MTM R$ das operações em aberto.",
          className: openSummary.netBrl >= 0 ? "is-positive" : openSummary.netBrl < 0 ? "is-negative" : "is-neutral",
          rows: allNormalizedRows.filter((item) => item.statusLabel === "Em aberto"),
          title: "MTM · Operações em aberto",
          metaItems: [
            { key: "open_all", label: "Ativas", value: formatNumber0(openSummary.open) },
            { key: "due7", label: "Vencem em 7 dias", value: formatNumber0(openSummary.due7) },
            { key: "due30", label: "Vencem em 30 dias", value: formatNumber0(openSummary.due30) },
          ],
        },
        {
          key: "closed",
          label: "Operações encerradas",
          value: formatMtmIntegerLabel(closedSummary.netBrl),
          help: "Soma dos ajustes em R$ das operações encerradas.",
          className: closedSummary.netBrl >= 0 ? "is-positive" : closedSummary.netBrl < 0 ? "is-negative" : "is-neutral",
          rows: allNormalizedRows.filter((item) => item.statusLabel === "Encerrado"),
          title: "MTM · Operações encerradas",
          metaItems: [
            { key: "closed_all", label: "Encerradas", value: formatNumber0(closedSummary.closed) },
            { key: "positive", label: "Positivas", value: formatNumber0(closedSummary.positive) },
            { key: "negative", label: "Negativas", value: formatNumber0(closedSummary.negative) },
          ],
        },
      ];

      return cards.map((card) => ({
        ...card,
        isActive: mtmScope === card.key,
      }));
    },
    [allNormalizedRows, allSummary, closedSummary, mtmScope, openSummary],
  );

  const exchangeMtmEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const exchangeLabel = params.name;
        if (!exchangeLabel) return;
        if (exchangeLabel === "TOTAL CARTEIRA") {
          openMtmRowsModal("TOTAL CARTEIRA · Operações de derivativos", normalizedRows);
          return;
        }
        openExchangeModal(exchangeLabel);
      },
    }),
    [normalizedRows, openExchangeModal, openMtmRowsModal],
  );

  const exchangeStatusEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const exchangeLabel = params.name;
        if (!exchangeLabel) return;
        const rows = normalizedRows.filter((item) => {
          if (item.exchangeLabel !== exchangeLabel) return false;
          if (params.seriesName === "Em aberto") return item.statusLabel === "Em aberto";
          if (params.seriesName === "Encerradas") return item.statusLabel === "Encerrado";
          return true;
        });
        openMtmRowsModal(`${exchangeLabel} · ${params.seriesName}`, rows);
      },
    }),
    [normalizedRows, openMtmRowsModal],
  );

  const exchangeNetEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const exchangeLabel = params.name;
        if (!exchangeLabel) return;
        if (exchangeLabel === "TOTAL CARTEIRA") {
          openMtmRowsModal("TOTAL CARTEIRA · Saldo líquido", normalizedRows);
          return;
        }
        openExchangeModal(exchangeLabel);
      },
    }),
    [normalizedRows, openExchangeModal, openMtmRowsModal],
  );

  const exchangeGroupedEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const exchangeLabel = params.name;
        if (!exchangeLabel) return;
        let rows = exchangeLabel === "TOTAL CARTEIRA" ? normalizedRows : normalizedRows.filter((item) => item.exchangeLabel === exchangeLabel);
        if (params.seriesName === "Positivo") rows = rows.filter((item) => item.direction === "positive");
        if (params.seriesName === "Negativo") rows = rows.filter((item) => item.direction === "negative");
        openMtmRowsModal(`${exchangeLabel} · ${params.seriesName}`, rows);
      },
    }),
    [normalizedRows, openMtmRowsModal],
  );

  const exchangeWaterfallEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const exchangeLabel = params.name;
        if (!exchangeLabel) return;
        openExchangeModal(exchangeLabel);
      },
    }),
    [openExchangeModal],
  );

  const typePerformanceEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const typeLabel = params.name;
        if (!typeLabel) return;
        const row = derivativeTypeRows.find((item) => item.label === typeLabel);
        if (!row) return;
        openMtmRowsModal(`Estrutura ${typeLabel} · Operações`, row.rows);
      },
    }),
    [derivativeTypeRows, openMtmRowsModal],
  );

  const topPositiveEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = topPositiveRows.find((item) => item.operationName === params.name);
        if (!row) return;
        openMtmRowsModal(`Top ganho · ${row.operationName}`, [row]);
      },
    }),
    [openMtmRowsModal, topPositiveRows],
  );

  const topNegativeEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = topNegativeRows.find((item) => item.operationName === params.name);
        if (!row) return;
        openMtmRowsModal(`Top perda · ${row.operationName}`, [row]);
      },
    }),
    [openMtmRowsModal, topNegativeRows],
  );

  const heatmapEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series" || !Array.isArray(params.value)) return;
        const exchangeLabel = heatmapSource.exchanges[params.value[0]];
        const typeLabel = heatmapSource.types[params.value[1]];
        if (!exchangeLabel || !typeLabel) return;
        const rows = normalizedRows.filter((item) => item.exchangeLabel === exchangeLabel && getDerivativePositionTypeLabel(item) === typeLabel);
        openMtmRowsModal(`${exchangeLabel} · ${typeLabel}`, rows);
      },
    }),
    [getDerivativePositionTypeLabel, heatmapSource.exchanges, heatmapSource.types, normalizedRows, openMtmRowsModal],
  );

  const statusDonutEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const rows =
          params.name === "Positivas"
            ? normalizedRows.filter((item) => item.direction === "positive")
            : params.name === "Negativas"
              ? normalizedRows.filter((item) => item.direction === "negative")
              : normalizedRows.filter((item) => item.direction === "neutral");
        openMtmRowsModal(`Sinal do MTM · ${params.name}`, rows);
      },
    }),
    [normalizedRows, openMtmRowsModal],
  );

  const openClosedDonutEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const rows = normalizedRows.filter((item) => (params.name === "Em aberto" ? item.statusLabel === "Em aberto" : item.statusLabel === "Encerrado"));
        openMtmRowsModal(`Status · ${params.name}`, rows);
      },
    }),
    [normalizedRows, openMtmRowsModal],
  );

  const openSettlementBandEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = openSettlementBandRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Em aberto · Vencimento ${row.label}`, row.rows);
      },
    }),
    [openMtmRowsModal, openSettlementBandRows],
  );

  const closedSettlementMonthEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = closedSettlementMonthRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Encerrado · Liquidação ${row.label}`, row.rows);
      },
    }),
    [closedSettlementMonthRows, openMtmRowsModal],
  );

  const closedDirectionEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const direction =
          params.name === "Positivas" ? "positive" : params.name === "Negativas" ? "negative" : "neutral";
        openMtmRowsModal(`Encerrado · ${params.name}`, closedRowsInView.filter((item) => item.direction === direction));
      },
    }),
    [closedRowsInView, openMtmRowsModal],
  );

  const activeScopeMeta = {
    all: {
      title: "Consolidado",
      description: "Visão geral da carteira, reunindo o saldo total, a distribuição operacional e as leituras comparativas mais importantes.",
    },
    open: {
      title: "Em aberto",
      description: "Recorte focado apenas nas posições ainda ativas, com prioridade para vencimento próximo, exposição e monitoramento do resultado vivo.",
    },
    closed: {
      title: "Encerrado",
      description: "Recorte focado apenas nas operações encerradas e nas maiores contribuições efetivas do período filtrado.",
    },
  }[mtmScope];

  const renderHeroCard = (card) => (
    <button
      type="button"
      key={card.label}
      className={`card mtm-hero-card ${card.className}${card.isActive ? " is-active" : ""}`}
      aria-pressed={card.isActive}
      onClick={() => {
        setMtmScope(card.key);
        setMtmFacet("all");
      }}
    >
      <span>{card.label}</span>
      <strong>{card.value}</strong>
      {card.metaItems?.length ? (
        <div className="mtm-hero-metrics">
          {card.metaItems.map((item) => (
            <div
              role="button"
              tabIndex={0}
              key={`${card.label}-${item.label}`}
              className={`mtm-hero-metric${card.isActive && mtmFacet === item.key ? " is-active" : ""}`}
              aria-pressed={card.isActive && mtmFacet === item.key}
              onClick={(event) => {
                event.stopPropagation();
                setMtmScope(card.key);
                setMtmFacet(item.key);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setMtmScope(card.key);
                  setMtmFacet(item.key);
                }
              }}
            >
              <small>{item.label}</small>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      ) : null}
      <small>{card.help}</small>
    </button>
  );

  return (
    <section className="mtm-shell">
      <section className="mtm-phase-section">
        <div className="mtm-filter-note">
          Os cards grandes e os mini cards abaixo funcionam como filtros do dashboard.
        </div>
        <div className="mtm-hero-grid">
          {heroCards.map((card) => renderHeroCard(card))}
        </div>
        <div className="mtm-phase-head">
          <h2>{activeScopeMeta.title}</h2>
          <p>{activeScopeMeta.description}</p>
        </div>
        <section className="mtm-top-insight-grid">
          <article className="card mtm-chart-card mtm-chart-card--donuts">
            <div className="mtm-dual-donuts">
              <div>
                <div className="mtm-chart-head">
                  <h3>Sinal do MTM</h3>
                  <p>Positivas, negativas e neutras.</p>
                </div>
                <ReactECharts option={statusDonutOption} onEvents={statusDonutEvents} style={{ height: 240, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
              <div>
                <div className="mtm-chart-head">
                  <h3>Abertas x encerradas</h3>
                  <p>Mix operacional do book.</p>
                </div>
                <ReactECharts option={openClosedDonutOption} onEvents={openClosedDonutEvents} style={{ height: 240, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
            </div>
          </article>
        </section>
        <section className="mtm-chart-grid">
          <article className="card mtm-chart-card" style={{ gridColumn: "1 / -1" }}>
            <div className="mtm-dual-charts">
              <div>
                <div className="mtm-chart-head">
                  <h3>MTM por bolsa</h3>
                  <p>Bloco positivo versus pressão negativa por bolsa.</p>
                </div>
                <ReactECharts option={exchangeMtmOption} onEvents={exchangeMtmEvents} style={{ height: 260, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
              <div>
                <div className="mtm-chart-head">
                  <h3>Status por bolsa</h3>
                  <p>Distribuição de operações em aberto e encerradas.</p>
                </div>
                <ReactECharts option={exchangeStatusOption} onEvents={exchangeStatusEvents} style={{ height: 260, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
            </div>
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Matriz bolsa x tipo</h3>
              <p>Concentração operacional por tipo de derivativo. Tamanho da bolha proporcional ao número de operações.</p>
            </div>
            <ReactECharts option={heatmapOption} onEvents={heatmapEvents} style={{ height: 300, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Matriz MTM R$ x tipo</h3>
              <p>Ajustes MTM em R$ por bolsa e estrutura. Verde = positivo, vermelho = negativo. Tamanho proporcional ao valor absoluto.</p>
            </div>
            <ReactECharts option={heatmapMtmOption} onEvents={heatmapEvents} style={{ height: 300, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
        </section>
        <section className="mtm-exchange-section">
          <div className="mtm-section-head">
            <div>
              <h3>Cards por bolsa</h3>
             
            </div>
            <div className="mtm-operation-filter" ref={operationFilterRef}>
              <button
                type="button"
                className={`mtm-operation-filter-toggle${operationFilterOpen ? " is-open" : ""}`}
                onClick={() => setOperationFilterOpen((current) => !current)}
              >
                <span>{operationFilterLabel}</span>
                <strong>{selectedOperationNames.length || 0}</strong>
              </button>
              {operationFilterOpen ? (
                <div className="mtm-operation-filter-panel">
                  <div className="mtm-operation-filter-actions">
                    <button type="button" onClick={() => setSelectedOperationNames(operationOptions)}>Selecionar todas</button>
                    <button type="button" onClick={() => setSelectedOperationNames([])}>Limpar</button>
                  </div>
                  <div className="mtm-operation-filter-list">
                    {operationOptions.map((operationName) => {
                      const checked = selectedOperationNames.includes(operationName);
                      return (
                        <label key={operationName} className="mtm-operation-filter-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedOperationNames((current) =>
                                current.includes(operationName)
                                  ? current.filter((item) => item !== operationName)
                                  : [...current, operationName],
                              );
                            }}
                          />
                          <span>{operationName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mtm-exchange-grid">
            {exchangeCardRows.map((exchange) => {
              const exchangeBarBase = Math.max(Math.abs(exchange.netBrl), exchange.positiveBrl, exchange.negativeBrl, 1);

              return (
                <button
                  type="button"
                  key={exchange.label}
                  className="card mtm-exchange-card"
                  onClick={() => openExchangeModal(exchange.label)}
                >
                  <div className="mtm-exchange-head">
                    <div>
                      <strong>{exchange.label}</strong>
                      <span>{`${formatNumber0(exchange.total)} operações`}</span>
                    </div>
                  </div>
                  <div className="mtm-exchange-stats">
                    <div><span>Em aberto</span><strong>{formatNumber0(exchange.open)}</strong></div>
                    <div><span>Encerradas</span><strong>{formatNumber0(exchange.closed)}</strong></div>
                    <div><span>Positivas</span><strong>{formatNumber0(exchange.positive)}</strong></div>
                    <div><span>Negativas</span><strong>{formatNumber0(exchange.negative)}</strong></div>
                    <div><span>Volume</span><strong>{`${formatNumber0(exchange.volume)} sc`}</strong></div>
                    <div><span>Strike médio</span><strong>{exchange.avgStrike ? formatCurrency2(exchange.avgStrike) : "—"}</strong></div>
                  </div>
                  <div className="mtm-exchange-bars">
                    <div className="mtm-exchange-bar-row">
                      <span>Total</span>
                      <div className="mtm-exchange-bar-track">
                        <div
                          className={`mtm-exchange-bar-fill ${exchange.netBrl >= 0 ? "is-total-positive" : "is-total-negative"}`}
                          style={{ width: `${(Math.abs(exchange.netBrl) / exchangeBarBase) * 100}%` }}
                        />
                      </div>
                      <strong className={exchange.netBrl >= 0 ? "is-positive" : "is-negative"}>{formatMtmIntegerLabel(exchange.netBrl)}</strong>
                    </div>
                    <div className="mtm-exchange-bar-row">
                      <span>Ganho bruto</span>
                      <div className="mtm-exchange-bar-track">
                        <div
                          className="mtm-exchange-bar-fill is-positive"
                          style={{ width: `${(exchange.positiveBrl / exchangeBarBase) * 100}%` }}
                        />
                      </div>
                      <strong>{formatMtmIntegerLabel(exchange.positiveBrl)}</strong>
                    </div>
                    <div className="mtm-exchange-bar-row">
                      <span>Perda bruta</span>
                      <div className="mtm-exchange-bar-track">
                        <div
                          className="mtm-exchange-bar-fill is-negative"
                          style={{ width: `${(exchange.negativeBrl / exchangeBarBase) * 100}%` }}
                        />
                      </div>
                      <strong>{formatMtmIntegerLabel(exchange.negativeBrl)}</strong>
                    </div>
                  </div>
                  <div className="mtm-exchange-foot">
                    <small>{exchange.best ? `Melhor: ${exchange.best.operationName} (${formatMtmIntegerLabel(exchange.best.mtmBrl)})` : "Sem ganho relevante"}</small>
                    <small>{exchange.worst ? `Pior: ${exchange.worst.operationName} (${formatMtmIntegerLabel(exchange.worst.mtmBrl)})` : "Sem perda relevante"}</small>
                  </div>
                </button>
              );
            })}
            {!exchangeCardRows.length ? (
              <article className="card mtm-empty-card">
                <strong>Sem operações para os cards selecionados.</strong>
                <p>Ajuste o filtro de `Nome da operação` para voltar a exibir os cards por bolsa.</p>
              </article>
            ) : null}
          </div>
        </section>
        <section className="mtm-extra-section">
          <div className="mtm-section-head">
            <h3>Mais Insights</h3>
                    </div>
          <div className="mtm-extra-grid">
            {extraInsightCards.map((card) => (
              <article key={card.key} className="card mtm-mini-card">
                <div className="mtm-mini-card-head">
                  <h4>{card.title}</h4>
                  <p>{card.subtitle}</p>
                </div>
                {card.option ? (
                  <ReactECharts option={card.option} onEvents={card.events} style={{ height: 290, width: "100%" }} opts={{ renderer: "svg" }} />
                ) : null}
                {card.table ? (
                  <div className="mtm-mini-table-wrap">
                    <table className="mtm-mini-table">
                      <thead>
                        <tr>
                          {card.table.columns.map((column) => (
                            <th key={`${card.key}-${column}`}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {card.table.rows.map((row) => (
                          <tr key={row.key} className={row.tone ? `is-${row.tone}` : ""} onClick={row.onClick}>
                            {row.cells.map((cell, index) => (
                              <td key={`${row.key}-${index}`}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>

      {openRowsInView.length ? (
      <section className="mtm-phase-section">
        <div className="mtm-phase-head">
          <h2>Em aberto</h2>
          
        </div>
        <article className="card mtm-chart-card" style={{ gridColumn: "1 / -1" }}>
          <div className="mtm-chart-head">
            <h3>MTM R$ por data de vencimento · 180d</h3>
            <p>Janela padrão de 180 dias (90d passados + 90d futuros), colunas por bolsa, agrupadas semanalmente. Use o seletor abaixo para ampliar o período.</p>
          </div>
          <ReactECharts option={mtmTimelineOption} onEvents={mtmTimelineEvents} style={{ height: 340, width: "100%" }} opts={{ renderer: "svg" }} />
          {mtmTimelineAllBuckets.length > 2 ? (() => {
            const totalCount = mtmTimelineAllBuckets.length;
            const startPct = (mtmTimelineEffStart / Math.max(totalCount - 1, 1)) * 100;
            const endPct = (mtmTimelineEffEnd / Math.max(totalCount - 1, 1)) * 100;
            return (
              <div className="hedge-slider-wrap">
                <div className="hedge-slider-dates">
                  <span>{mtmTimelineAllBuckets[mtmTimelineEffStart]?.label || ""}</span>
                  <span>{mtmTimelineAllBuckets[mtmTimelineEffEnd]?.label || ""}</span>
                </div>
                <div className="hedge-slider-track">
                  <div className="hedge-slider-track-bg" />
                  <div className="hedge-slider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
                  <input
                    type="range"
                    className="hedge-slider-input"
                    min={0}
                    max={totalCount - 1}
                    value={mtmTimelineEffStart}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v < mtmTimelineEffEnd) setMtmTimelineSliderStart(v);
                    }}
                  />
                  <input
                    type="range"
                    className="hedge-slider-input"
                    min={0}
                    max={totalCount - 1}
                    value={mtmTimelineEffEnd}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v > mtmTimelineEffStart) setMtmTimelineSliderEnd(v);
                    }}
                  />
                </div>
              </div>
            );
          })() : null}
          <div className="hedge-legend">
            {mtmTimelineExchangeLabels.map((exLabel) => (
              <span key={exLabel} className="hedge-legend-item">
                <span
                  className="hedge-legend-swatch"
                  style={{ background: mtmTimelineExchangePalette[exLabel] || "#94a3b8" }}
                />
                {exLabel}
              </span>
            ))}
          </div>
        </article>
      </section>
      ) : null}

      {closedRowsInView.length ? (
      <section className="mtm-phase-section">
        <div className="mtm-phase-head">
          <h2>Encerrado</h2>
          
        </div>
        <section className="card mtm-spotlight-card">
          <div className="mtm-section-head">
            <h3>Spotlight das operações</h3>
            <p>As 12 operações com maior impacto absoluto no MTM, para leitura rápida e corte manual depois.</p>
          </div>
          <div className="mtm-spotlight-table-wrap">
            <table className="mtm-spotlight-table">
              <thead>
                <tr>
                  <th>Operação</th>
                  <th>Bolsa</th>
                  <th>Status</th>
                  <th>Tipo</th>
                  <th>Strike</th>
                  <th>Volume</th>
                  <th>Liquidação</th>
                  <th>MTM BRL</th>
                </tr>
              </thead>
              <tbody>
                {spotlightRows.map((item) => (
                  <tr key={item.id} onClick={() => openMtmRowsModal(`Operação · ${item.operationName}`, [item])}>
                    <td>{item.operationName}</td>
                    <td>{item.exchangeLabel}</td>
                    <td>{item.statusLabel}</td>
                    <td>{item.derivativeType}</td>
                    <td>{item.strike ? formatCurrency2(item.strike) : "—"}</td>
                    <td>{item.standardVolume || item.rawVolume ? `${formatNumber0(item.standardVolume || item.rawVolume)} sc` : "—"}</td>
                    <td>{item.settlementDate ? formatShortBrazilianDate(item.settlementDate) : "—"}</td>
                    <td className={item.mtmBrl >= 0 ? "is-positive" : "is-negative"}>{formatMtmIntegerLabel(item.mtmBrl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      ) : null}

      {resourceTableModal ? (
        <DashboardResourceTableModal
          title={resourceTableModal.title}
          definition={resourceTableModal.definition}
          rows={resourceTableModal.rows}
          onClose={() => setResourceTableModal(null)}
          onEdit={(row) => openMtmOperation({
            ...row,
            recordId: row.id,
            resourceKey: resourceTableModal.definition.resource,
          })}
        />
      ) : null}
      {editorNode}
    </section>
  );
}

const dashboardContent = {
  cashflow: {
    title: "Fluxo de Caixa - Hedge",
    description: "Visao consolidada de entradas, saidas, vencimentos e pressao financeira por grupo e subgrupo.",
    stats: [
      { label: "Entradas previstas", value: "R$ 18,6 mi" },
      { label: "Saidas previstas", value: "R$ 11,2 mi" },
      { label: "Saldo projetado", value: "R$ 7,4 mi" },
      { label: "Compromissos", value: "26" },
    ],
    charts: {
      main: (
        <AreaTrendChart
          color="#ea580c"
          data={[
            { label: "Abr", value: 6.2 },
            { label: "Mai", value: 7.9 },
            { label: "Jun", value: 5.4 },
            { label: "Jul", value: 8.1 },
            { label: "Ago", value: 9.3 },
            { label: "Set", value: 7.4 },
          ]}
        />
      ),
      sideA: (
        <DonutChart
          centerLabel="Saldo"
          centerValue="40%"
          slices={[
            { label: "Recebimentos", value: 46, color: "#ea580c" },
            { label: "Custos", value: 33, color: "#0f766e" },
            { label: "Financeiro", value: 21, color: "#0369a1" },
          ]}
        />
      ),
      sideB: (
        <ScenarioBars
          data={[
            { label: "Abr-Jun", value: 7.4, formatted: "R$ 7,4 mi", color: "#ea580c" },
            { label: "Jul-Set", value: 5.8, formatted: "R$ 5,8 mi", color: "#fb923c" },
            { label: "Out-Dez", value: 4.6, formatted: "R$ 4,6 mi", color: "#fdba74" },
          ]}
        />
      ),
    },
  },
  cashflowDaily: {
    title: "Fluxo de Caixa - Diario",
    description: "Tabela diária com saldo inicial, entradas de vendas físico e saídas de pagamentos de caixa.",
  },
  hedgePolicy: {
    title: "Politica de Hedge",
    description: "Monitoramento das faixas minimas e maximas de cobertura, margem e travamento por cultura e safra.",
    stats: [
      { label: "Cobertura media", value: "61,8%" },
      { label: "Politicas ativas", value: "12" },
      { label: "Fora da faixa", value: "3" },
      { label: "Margem alvo", value: "18,4%" },
    ],
    charts: {
      main: (
        <StackedBarsChart
          data={[
            { label: "Soja", parts: [{ label: "Min", value: 18, color: "#e2e8f0" }, { label: "Atual", value: 34, color: "#0f766e" }, { label: "Max", value: 12, color: "#14b8a6" }] },
            { label: "Milho", parts: [{ label: "Min", value: 15, color: "#e2e8f0" }, { label: "Atual", value: 29, color: "#0f766e" }, { label: "Max", value: 18, color: "#14b8a6" }] },
            { label: "Trigo", parts: [{ label: "Min", value: 12, color: "#e2e8f0" }, { label: "Atual", value: 20, color: "#0f766e" }, { label: "Max", value: 22, color: "#14b8a6" }] },
            { label: "Cafe", parts: [{ label: "Min", value: 10, color: "#e2e8f0" }, { label: "Atual", value: 16, color: "#0f766e" }, { label: "Max", value: 26, color: "#14b8a6" }] },
          ]}
        />
      ),
      sideA: (
        <DonutChart
          centerLabel="Dentro"
          centerValue="75%"
          slices={[
            { label: "Dentro da faixa", value: 75, color: "#0f766e" },
            { label: "Abaixo", value: 15, color: "#f59e0b" },
            { label: "Acima", value: 10, color: "#dc2626" },
          ]}
        />
      ),
      sideB: (
        <ScenarioBars
          data={[
            { label: "Rever travas", value: 3, formatted: "3 casos", color: "#dc2626" },
            { label: "Montar adicional", value: 7, formatted: "7 casos", color: "#ea580c" },
            { label: "Sem acao", value: 12, formatted: "12 casos", color: "#0f766e" },
          ]}
        />
      ),
    },
  },
  priceComposition: {
    title: "Composicao de Precos",
    description: "Leitura da formacao de preco entre bolsa, basis, cambio, premios, frete e demais componentes.",
    stats: [
      { label: "Preco medio", value: "R$ 132,40" },
      { label: "Basis medio", value: "-0,85" },
      { label: "Cambio medio", value: "5,74" },
      { label: "Premio medio", value: "0,42" },
    ],
    charts: {
      main: (
        <StackedBarsChart
          data={[
            { label: "Contrato A", parts: [{ label: "Bolsa", value: 48, color: "#0f766e" }, { label: "Basis", value: 18, color: "#0369a1" }, { label: "Cambio", value: 22, color: "#ea580c" }] },
            { label: "Contrato B", parts: [{ label: "Bolsa", value: 44, color: "#0f766e" }, { label: "Basis", value: 14, color: "#0369a1" }, { label: "Cambio", value: 28, color: "#ea580c" }] },
            { label: "Contrato C", parts: [{ label: "Bolsa", value: 41, color: "#0f766e" }, { label: "Basis", value: 19, color: "#0369a1" }, { label: "Cambio", value: 24, color: "#ea580c" }] },
          ]}
        />
      ),
      sideA: (
        <DonutChart
          centerLabel="Basis"
          centerValue="-0,85"
          slices={[
            { label: "Bolsa", value: 52, color: "#0f766e" },
            { label: "Cambio", value: 27, color: "#ea580c" },
            { label: "Basis/Premio", value: 21, color: "#0369a1" },
          ]}
        />
      ),
      sideB: (
        <ScenarioBars
          data={[
            { label: "Bolsa +5%", value: 6.4, formatted: "+R$ 6,4", color: "#0f766e" },
            { label: "Cambio +3%", value: 4.1, formatted: "+R$ 4,1", color: "#0369a1" },
            { label: "Basis -0,2", value: 2.3, formatted: "-R$ 2,3", color: "#ea580c" },
          ]}
        />
      ),
    },
  },
  componentSales: {
    title: "Venda de Componentes",
    description: "",
  },
  commercialRisk: {
    title: "Resumo",
    description: "",
  },
  clientRanking: {
    title: "Ranking Clientes",
    description: "Rankings por cliente com ajustes de derivativos, operacoes, volumes, faturamento e exposicao em aberto.",
  },
  strategiesTriggers: {
    title: "Estratégias e Gatilhos",
    description: "Visão consolidada das estratégias cadastradas, gatilhos monitorados e vencimentos prioritários.",
  },
  currencyExposure: {
    title: "Exposição e Hedge cambial",
    description: "Leitura consolidada da exposição cambial, hedge realizado, saldo e overhedge.",
  },
  simulations: {
    title: "Simulacoes",
    description: "Cenarios de mercado, hedge e caixa para testar variacoes de preco, volume, basis e dolar.",
    stats: [
      { label: "Cenarios salvos", value: "9" },
      { label: "Melhor margem", value: "R$ 14,1 mi" },
      { label: "Pior margem", value: "R$ 8,3 mi" },
      { label: "Stress FX", value: "+7,5%" },
    ],
    charts: {
      main: (
        <AreaTrendChart
          color="#0369a1"
          data={[
            { label: "Base", value: 9.4 },
            { label: "Leve alta", value: 10.8 },
            { label: "Alta forte", value: 14.1 },
            { label: "Stress basis", value: 8.3 },
            { label: "Stress FX", value: 8.9 },
          ]}
        />
      ),
      sideA: (
        <ScenarioBars
          data={[
            { label: "Base", value: 10.2, formatted: "R$ 10,2 mi", color: "#0f766e" },
            { label: "Otimista", value: 14.1, formatted: "R$ 14,1 mi", color: "#0369a1" },
            { label: "Estresse", value: 8.3, formatted: "R$ 8,3 mi", color: "#ea580c" },
          ]}
        />
      ),
      sideB: (
        <DonutChart
          centerLabel="Risco"
          centerValue="Moderado"
          slices={[
            { label: "Volume", value: 35, color: "#ea580c" },
            { label: "Cambio", value: 28, color: "#0369a1" },
            { label: "Basis", value: 22, color: "#0f766e" },
            { label: "Frete", value: 15, color: "#64748b" },
          ]}
        />
      ),
    },
  },
  mtm: {
    title: "MTM Derivativos",
    description: "Mark-to-market consolidado das posicoes fisicas e derivativas, com leitura de ganho, perda e exposicao aberta.",
    stats: [
      { label: "MTM total", value: "R$ 12,4 mi" },
      { label: "MTM fisico", value: "R$ 7,9 mi" },
      { label: "MTM derivativos", value: "R$ 4,5 mi" },
      { label: "Posicoes abertas", value: "18" },
    ],
    charts: {
      main: (
        <AreaTrendChart
          color="#0f766e"
          data={[
            { label: "Seg", value: 8.1 },
            { label: "Ter", value: 9.6 },
            { label: "Qua", value: 10.3 },
            { label: "Qui", value: 11.1 },
            { label: "Sex", value: 12.4 },
          ]}
        />
      ),
      sideA: (
        <DonutChart
          centerLabel="Carteira"
          centerValue="18 pos."
          slices={[
            { label: "Fisico", value: 64, color: "#0f766e" },
            { label: "Derivativos", value: 36, color: "#ea580c" },
          ]}
        />
      ),
      sideB: (
        <ScenarioBars
          data={[
            { label: "Soja", value: 5.2, formatted: "R$ 5,2 mi", color: "#0f766e" },
            { label: "Milho", value: 3.8, formatted: "R$ 3,8 mi", color: "#0369a1" },
            { label: "Cafe", value: 2.1, formatted: "R$ 2,1 mi", color: "#ea580c" },
          ]}
        />
      ),
    },
  },
};

const getDashboardSelectedLabel = (items = [], selectedValues = [], labelGetter = (item) => item?.label) => {
  const selectedIds = (selectedValues || []).map(String);
  if (!selectedIds.length) return "";
  const selectedItems = selectedIds
    .map((selectedId) => (items || []).find((item) => String(item?.id) === selectedId))
    .filter(Boolean);
  if (!selectedItems.length) return "";
  const firstLabel = labelGetter(selectedItems[0]) || String(selectedItems[0]?.id || "");
  return selectedItems.length > 1 ? `${firstLabel} +${selectedItems.length - 1}` : firstLabel;
};

export function DashboardPage({ kind = "cashflow", chartEngine }) {
  const content = dashboardContent[kind] || dashboardContent.cashflow;
  const { filter, options } = useDashboardFilter();
  const cashflowFilter = useMemo(
    () => ({
      ...filter,
      cultura: [],
      safra: [],
    }),
    [filter],
  );
  const commercialRiskTitle = useMemo(() => {
    if (kind !== "commercialRisk") return content.title;
    const cultureLabel = getDashboardSelectedLabel(
      [...(options.cropBoardCrops || []), ...(options.crops || [])],
      filter?.cultura,
      (item) => item?.cultura || item?.ativo || item?.nome || item?.label || item?.descricao,
    );
    const seasonLabel = getDashboardSelectedLabel(
      [...(options.cropBoardSeasons || []), ...(options.seasons || [])],
      filter?.safra,
      (item) => item?.safra || item?.nome || item?.label || item?.descricao,
    );
    const suffix = [cultureLabel, seasonLabel].filter(Boolean).join(" ");
    return suffix ? `${content.title} - ${suffix}` : content.title;
  }, [content.title, filter?.cultura, filter?.safra, kind, options.cropBoardCrops, options.cropBoardSeasons, options.crops, options.seasons]);

  const commercialRiskHint = useMemo(() => {
    if (kind !== "commercialRisk") return "";
    const groupLabel = getDashboardSelectedLabel(
      options.groups || [],
      filter?.grupo,
      (item) => item?.grupo || item?.nome || item?.label,
    );
    const subgroupLabel = getDashboardSelectedLabel(
      options.subgroups || [],
      filter?.subgrupo,
      (item) => item?.subgrupo || item?.nome || item?.label,
    );
    const cultureLabel = getDashboardSelectedLabel(
      [...(options.cropBoardCrops || []), ...(options.crops || [])],
      filter?.cultura,
      (item) => item?.cultura || item?.ativo || item?.nome || item?.label || item?.descricao,
    );
    const seasonLabel = getDashboardSelectedLabel(
      [...(options.cropBoardSeasons || []), ...(options.seasons || [])],
      filter?.safra,
      (item) => item?.safra || item?.nome || item?.label || item?.descricao,
    );
    const parts = [groupLabel, subgroupLabel && groupLabel ? `(${subgroupLabel})` : subgroupLabel, cultureLabel, seasonLabel].filter(Boolean);
    return parts.join(" ");
  }, [filter?.cultura, filter?.grupo, filter?.safra, filter?.subgrupo, kind, options.cropBoardCrops, options.cropBoardSeasons, options.crops, options.groups, options.seasons, options.subgroups]);

  if (kind === "cashflow") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <CashflowDashboard dashboardFilter={cashflowFilter} compact />
      </div>
    );
  }

  if (kind === "cashflowDaily") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <CashflowDailyDashboard dashboardFilter={cashflowFilter} />
      </div>
    );
  }

  if (kind === "componentSales") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <ComponentSalesDashboard dashboardFilter={filter} />
      </div>
    );
  }

  if (kind === "commercialRisk") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} hint={commercialRiskHint} description={content.description} />
        <CommercialRiskDashboard dashboardFilter={filter} />
      </div>
    );
  }

  if (kind === "clientRanking") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <ClientRankingDashboard dashboardFilter={filter} />
      </div>
    );
  }

  if (kind === "strategiesTriggers") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <StrategiesTriggersDashboard dashboardFilter={filter} />
      </div>
    );
  }

  if (kind === "simulations") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <SimulationsMatrixDashboard dashboardFilter={filter} filterOptions={options} />
      </div>
    );
  }

  if (kind === "hedgePolicy") {
    return (
      <div className="resource-page dashboard-page hedge-policy-fullscreen-page">
        <HedgePolicyDashboard dashboardFilter={filter} />
      </div>
    );
  }

  if (kind === "currencyExposure") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <CurrencyExposureDashboard dashboardFilter={filter} filterOptions={options} />
      </div>
    );
  }

  if (kind === "priceComposition") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <PriceCompositionDashboard dashboardFilter={filter} chartEngine={chartEngine} />
      </div>
    );
  }

  if (kind === "mtm") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <MtmDashboard dashboardFilter={filter} />
      </div>
    );
  }

  return (
    <div className="resource-page dashboard-page">
      <PageHeader title={content.title} description={content.description} />
      <section className="stats-grid">
        {content.stats.map((stat) => (
          <article key={stat.label} className="card stat-card">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        {content.charts.main}
        {content.charts.sideA}
        {content.charts.sideB}
      </section>
    </div>
  );
}
