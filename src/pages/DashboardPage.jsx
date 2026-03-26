import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import ReactECharts from "echarts-for-react";
import { useNavigate } from "react-router-dom";

import { DatePickerField } from "../components/DatePickerField";
import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { ResourceForm } from "../components/ResourceForm";
import { rowMatchesDashboardFilter, useDashboardFilter } from "../contexts/DashboardFilterContext";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate } from "../utils/date";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
  ChartDataLabels,
);

const formatNumber = (value, suffix = "") => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`;
const COMMERCIAL_RISK_DERIVATIVE_COLORS = ["#0f766e", "#2563eb", "#ea580c", "#7c3aed", "#dc2626", "#0891b2", "#65a30d", "#d97706"];
const CASHFLOW_DEFAULT_PAST_DAYS = 15;
const CASHFLOW_DEFAULT_FUTURE_DAYS = 180;

const shiftDateByDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const formatIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const buildCashflowDefaultDateRange = (today = new Date()) => ({
  fromBrazilian: formatBrazilianDate(shiftDateByDays(today, -CASHFLOW_DEFAULT_PAST_DAYS)),
  toBrazilian: formatBrazilianDate(shiftDateByDays(today, CASHFLOW_DEFAULT_FUTURE_DAYS)),
  startIso: formatIsoDate(shiftDateByDays(today, -CASHFLOW_DEFAULT_PAST_DAYS)),
  endIso: formatIsoDate(shiftDateByDays(today, CASHFLOW_DEFAULT_FUTURE_DAYS)),
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

function CommercialRiskQuotesSummaryCard({ rows, onOpen }) {
  const marqueeRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const marqueeSequenceRef = useRef(null);
  const marqueeDragStateRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });
  const [isMarqueeInteracting, setIsMarqueeInteracting] = useState(false);
  const [isMarqueeHovered, setIsMarqueeHovered] = useState(false);
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
  const marqueeRows = carouselRows.length > 1 ? [carouselRows, carouselRows, carouselRows] : [carouselRows];

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

    while (container.scrollLeft >= loopWidth * 2) {
      container.scrollLeft -= loopWidth;
    }

    while (container.scrollLeft < loopWidth) {
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
    setIsMarqueeHovered(false);
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

    let animationFrameId = 0;
    let lastTimestamp = 0;
    const speedPxPerSecond = 28;

    const step = (timestamp) => {
      if (!container) {
        return;
      }

      if (!lastTimestamp) {
        lastTimestamp = timestamp;
      }

      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      if (!marqueeDragStateRef.current.active && !isMarqueeHovered) {
        container.scrollLeft += (delta * speedPxPerSecond) / 1000;
        normalizeMarqueeScroll();
      }

      animationFrameId = window.requestAnimationFrame(step);
    };

    const handleResize = () => {
      normalizeMarqueeScroll();
    };

    const loopWidth = getMarqueeLoopWidth();
    if (loopWidth && container.scrollLeft < loopWidth) {
      container.scrollLeft = loopWidth;
    }
    normalizeMarqueeScroll();
    animationFrameId = window.requestAnimationFrame(step);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [carouselRows.length, isMarqueeHovered]);

  return (
    <section className="resource-filter-panel risk-kpi-quotes-strip">
      {carouselRows.length ? (
        <div
          ref={marqueeRef}
          className={`resource-filter-marquee risk-kpi-quotes-strip-marquee${isMarqueeInteracting ? " is-interacting" : ""}`}
          onMouseDown={handleMarqueeMouseDown}
          onMouseMove={handleMarqueeMouseMove}
          onMouseUp={stopMarqueeInteraction}
          onMouseEnter={() => setIsMarqueeHovered(true)}
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

function CommercialRiskNewsSummaryCard({ rows, onOpen }) {
  const latestPosts = useMemo(() => {
    const published = (Array.isArray(rows) ? rows : []).filter((item) => item?.status_artigo !== "draft");
    const source = published.length ? published : (Array.isArray(rows) ? rows : []);
    return [...source]
      .sort((left, right) => new Date(right?.data_publicacao || right?.created_at || 0) - new Date(left?.data_publicacao || left?.created_at || 0))
      .slice(0, 12);
  }, [rows]);

  return (
    <div
      className="card stat-card risk-kpi-news-stat-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="stat-card-primary-title">Blog/News</span>
      <div className="risk-kpi-news-stat-list">
        {latestPosts.length ? (
          latestPosts.map((post) => (
            <article className="risk-kpi-news-stat-item" key={post.id}>
              <div className="risk-kpi-news-date">{formatCompactPostDate(post.data_publicacao || post.created_at) || "Sem data"}</div>
              <div className="risk-kpi-news-stat-content">
                <strong>{post.titulo || "Sem título"}</strong>
              </div>
            </article>
          ))
        ) : (
          <div className="risk-kpi-link-card-empty">Nenhum post disponível no momento.</div>
        )}
      </div>
    </div>
  );
}

function UpcomingMaturitiesCard({ rows, onOpenItem }) {
  return (
    <article className="card stat-card risk-kpi-maturity-card">
      <span className="stat-card-primary-title">Proximos vencimentos</span>
      <div className="risk-kpi-maturity-list">
        {rows.length ? (
          rows.map((item, index) => (
            <article
              className="risk-kpi-maturity-item"
              key={`${item.app}-${item.dateKey}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (item.recordId && onOpenItem) {
                  onOpenItem(item);
                }
              }}
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
                <b>{item.valueLabel}</b>
              </div>
            </article>
          ))
        ) : (
          <div className="risk-kpi-link-card-empty">Nenhum vencimento futuro encontrado.</div>
        )}
      </div>
    </article>
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
      itemStyle: { color: item.color, borderRadius: [10, 10, 0, 0] },
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

function DonutChart({ slices, centerLabel, centerValue }) {
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

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>Distribuicao</h3>
          <p className="muted">Participacao relativa dos principais grupos.</p>
        </div>
      </div>
      <div className="donut-wrap">
        <ReactECharts option={option} style={{ height: 220, width: 220 }} opts={{ renderer: "svg" }} />
        <MiniLegend items={slices} />
      </div>
    </div>
  );
}

function ScenarioBars({ data }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>Cenarios comparados</h3>
          <p className="muted">Leitura rapida entre base, otimismo e estresse.</p>
        </div>
      </div>
      <div className="scenario-list">
        {data.map((item) => (
          <div key={item.label} className="scenario-row">
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
                      backgroundStyle: { color: "rgba(148, 163, 184, 0.12)", borderRadius: 999 },
                      itemStyle: { borderRadius: 999 },
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
        items={options.subgroups}
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
      <FilterChipGroup
        title="Localidade de Referência"
        items={options.localities || []}
        selectedValues={filter.localidade}
        labelKey="label"
        onToggle={(value) => toggleFilterValue("localidade", value)}
        onClear={() => updateFilter("localidade", [])}
      />
    </section>
  );
}

function CommercialRiskLongShortChart({ rows, cultureButtons = [], selectedCultureIds = [], onToggleCulture, onClearCultures }) {
  if (!rows.length) {
    return (
      <article className="chart-card chart-card-large risk-kpi-long-short-card">
        <div className="chart-card-header">
          <div>
            <h3>Long &amp; Short por cultura</h3>
            <p className="muted">Leitura direta do volume coberto e do volume ainda livre por cultura.</p>
          </div>
        </div>
        <p className="muted">Sem dados suficientes para montar o Long &amp; Short com o filtro atual.</p>
      </article>
    );
  }

  const orderedSeries = [
    { key: "nadaFeito", label: "Nada feito", color: "#ff6a2a" },
    { key: "derivatives", label: "Vendas via Derivativos", color: "#b8efb7" },
    { key: "physical", label: "Vendas via Físico (a termo)", color: "#48bf3b" },
    { key: "barter", label: "Barter", color: "#567552" },
    { key: "paymentTerras", label: "Pagamento Terras", color: "#1d221d" },
    { key: "arrendamento", label: "Arrendamento", color: "#355c35" },
  ];

  const option = {
    animationDuration: 250,
    grid: { top: 18, right: 18, bottom: 28, left: 18, containLabel: true },
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
        position: "inside",
        color: "#0f172a",
        fontWeight: 900,
        fontSize: 11,
        formatter: ({ value, dataIndex }) => {
          const numericValue = Number(value || 0);
          if (!numericValue) return "";
          const production = rows[dataIndex]?.production || 0;
          const percent = production > 0 ? Math.round((numericValue / production) * 100) : 0;
          if (percent < 6 && numericValue < 5000) return "";
          return `${formatNumber0(numericValue)} (${percent}%)`;
        },
      },
      emphasis: { focus: "series" },
      data: rows.map((item) => {
        const value = Number(item[series.key] || 0);
        return value > 0 ? value : null;
      }),
    })),
  };

  return (
    <article className="chart-card chart-card-large risk-kpi-long-short-card">
      <div className="chart-card-header">
        <div>
          <h3>Long &amp; Short por cultura</h3>
          <p className="muted">Leitura direta do volume coberto e do volume ainda livre por cultura.</p>
        </div>
      </div>
      <div className="risk-kpi-chart-filter-row">
        {cultureButtons.map((item) => {
          const isActive = selectedCultureIds.includes(String(item.id));
          return (
            <button
              key={`culture-filter-${item.id}`}
              type="button"
              className={`dashboard-chip${isActive ? " active" : ""}`}
              onClick={() => onToggleCulture?.(String(item.id))}
            >
              {item.ativo || item.cultura}
            </button>
          );
        })}
        {selectedCultureIds.length ? (
          <button type="button" className="dashboard-chip dashboard-chip-clear-inline" onClick={onClearCultures}>
            Mostrar tudo
          </button>
        ) : null}
      </div>
      <ReactECharts option={option} style={{ height: Math.max(280, rows.length * 62 + 84) }} opts={{ renderer: "svg" }} />
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
  physicalRows = [],
  derivativeRows = [],
  policies = [],
  derivativeVolumeGetter = getDerivativeVolumeValue,
  onOpenHedgePolicy,
}) {
  const safeValue = (value) => Math.max(0, Math.min(Number(value || 0), 100));
  const totalValue = safeValue(totalPercent);
  const derivativeValue = safeValue(derivativePercent);
  const physicalValue = safeValue(physicalPercent);
  const hasPolicyBand = Number.isFinite(policyMinPercent) && Number.isFinite(policyMaxPercent);
  const minBand = hasPolicyBand ? safeValue(Math.min(policyMinPercent, policyMaxPercent)) : null;
  const maxBand = hasPolicyBand ? safeValue(Math.max(policyMinPercent, policyMaxPercent)) : null;
  const policyDelta = hasPolicyBand
    ? totalValue < minBand
      ? totalValue - minBand
      : totalValue > maxBand
        ? totalValue - maxBand
        : 0
    : 0;
  const policyStepDelta = Math.abs(policyDelta) / 5;
  const policyStatusText = hasPolicyBand
    ? policyDelta < 0
      ? `Abaixo da politica em ${policyStepDelta.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x 5 p.p.`
      : policyDelta > 0
        ? `Acima da politica em ${policyStepDelta.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x 5 p.p.`
        : "Dentro da politica"
    : "Politica nao definida";
  const totalAxisColors = hasPolicyBand
    ? [
        [Math.max(minBand / 100, 0), "#ff1a1a"],
        [Math.max((minBand + maxBand) / 200, Math.max(minBand / 100, 0)), "#f5b82e"],
        [Math.max(maxBand / 100, Math.max((minBand + maxBand) / 200, 0)), "#0b7a0a"],
        [1, "#ff1a1a"],
      ]
    : [
        [1, "#9ca3af"],
      ];
  const distributionSlices = [
    { label: "Derivativos", value: Number(derivativeValue || 0), scPerHa: derivativeScPerHa, color: "#f59e0b" },
    { label: "Físico", value: Number(physicalValue || 0), scPerHa: physicalScPerHa, color: "#16a34a" },
  ].filter((item) => item.value > 0);
  const distributionOption = {
    animationDuration: 250,
    tooltip: {
      trigger: "item",
      formatter: ({ name, value }) => `${name}: ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    },
    legend: { show: false },
    series: [
      {
        type: "pie",
        radius: ["54%", "76%"],
        center: ["50%", "46%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 4 },
        label: {
          show: true,
          position: "outside",
          alignTo: "none",
          edgeDistance: 0,
          bleedMargin: 2,
          color: "#0f172a",
          fontWeight: 800,
          fontSize: 10,
          lineHeight: 15,
          formatter: ({ value, data }) =>
            `${data?.name || ""}\n${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%\n${formatNumber2(data?.scPerHa || 0)} scs/ha`,
        },
        labelLine: {
          show: true,
          length: 12,
          length2: 8,
          lineStyle: { color: "#94a3b8", width: 1.5 },
        },
        data: (distributionSlices.length ? distributionSlices : [{ label: "Sem dados", value: 100, color: "#cbd5e1", scPerHa: 0 }]).map((slice) => ({
          name: slice.label,
          value: slice.value,
          scPerHa: slice.scPerHa,
          itemStyle: { color: slice.color },
        })),
      },
    ],
    graphic: distributionSlices.length
      ? [
          { type: "text", left: "center", top: "39%", style: { text: "Mix", fill: "#64748b", fontSize: 12, fontWeight: 700 } },
          {
            type: "text",
            left: "center",
            top: "47%",
            style: {
              text: `${Number(totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
              fill: "#0f172a",
              fontSize: 20,
              fontWeight: 900,
            },
          },
        ]
      : [],
  };
  const policyOption = {
    animationDuration: 220,
    tooltip: { show: false },
    grid: { top: 16, right: 12, bottom: 10, left: 12, containLabel: false },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      data: ["Politica"],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    series: [
      {
        type: "bar",
        data: [100],
        barWidth: 18,
        itemStyle: {
          color: "rgba(226, 232, 240, 0.9)",
          borderRadius: 999,
        },
        silent: true,
        z: 1,
      },
      {
        type: "bar",
        data: [maxBand || 0],
        barWidth: 18,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: minBand != null ? "rgba(226, 232, 240, 0)" : "rgba(226, 232, 240, 0)" },
              { offset: minBand != null ? minBand / 100 : 0, color: "rgba(226, 232, 240, 0)" },
              { offset: minBand != null ? minBand / 100 : 0, color: "#16a34a" },
              { offset: maxBand != null ? maxBand / 100 : 1, color: "#16a34a" },
              { offset: maxBand != null ? maxBand / 100 : 1, color: "rgba(226, 232, 240, 0)" },
              { offset: 1, color: "rgba(226, 232, 240, 0)" },
            ],
          },
          borderRadius: 999,
        },
        silent: true,
        z: 2,
      },
      {
        type: "scatter",
        symbol: "circle",
        symbolSize: 16,
        data: [[totalValue, 0]],
        itemStyle: {
          color: "#ea580c",
          borderColor: "#fff",
          borderWidth: 3,
        },
        z: 3,
        silent: true,
      },
    ],
    graphic: hasPolicyBand
      ? [
          {
            type: "text",
            left: 12,
            top: 0,
            style: {
              text: `${minBand.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% - ${maxBand.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
              fill: "#64748b",
              fontSize: 11,
              fontWeight: 700,
            },
          },
          {
            type: "text",
            right: 12,
            top: 0,
            style: {
              text: `${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
              fill: "#0f172a",
              fontSize: 11,
              fontWeight: 800,
            },
          },
        ]
      : [],
  };
  const mainOption = {
    series: [
      {
        type: "gauge",
        startAngle: 225,
        endAngle: -45,
        min: 0,
        max: 100,
        center: ["50%", "66%"],
        radius: "88%",
        axisLine: {
          lineStyle: {
            width: 16,
            color: totalAxisColors,
          },
        },
        splitLine: {
          distance: -20,
          length: 12,
          lineStyle: { color: "#111827", width: 1.5 },
        },
        axisTick: {
          distance: -20,
          splitNumber: 2,
          length: 5,
          lineStyle: { color: "#a3a3a3", width: 1.1 },
        },
        axisLabel: {
          distance: 0,
          color: "#7c7c7c",
          fontSize: 10,
          formatter: (value) => (value % 10 === 0 ? `${value}` : ""),
        },
        pointer: {
          icon: "path://M2 -80 L-2 -80 L-6 0 L6 0 Z",
          length: "68%",
          width: 9,
          itemStyle: { color: "#111827" },
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 12,
          itemStyle: { color: "#fff", borderColor: "#111827", borderWidth: 2.5 },
        },
        title: { show: false },
        detail: { show: false },
        data: [{ value: totalValue }],
      },
    ],
  };

  return (
    <section className="risk-kpi-gauge-grid">
      <div className="risk-kpi-policy-slot">
        <HedgePolicyChart
          title="Hedge produção liquida (sc)"
          unit="SC"
          frequency="monthly"
          baseValue={productionBase}
          physicalRows={physicalRows}
          derivativeRows={derivativeRows}
          policies={policies}
          physicalValueGetter={getPhysicalVolumeValue}
          derivativeValueGetter={derivativeVolumeGetter}
          derivativeVolumeGetter={derivativeVolumeGetter}
          onFocusToggle={onOpenHedgePolicy || (() => {})}
        />
      </div>

      <article className="chart-card risk-kpi-gauge-card">
        <div className="risk-kpi-gauge-main">
          <div className="risk-kpi-gauge-main-title">Vendas Realizadas</div>
          <div className="risk-kpi-gauge-main-subtitle">{formatNumber2(totalScPerHa)} scs/ha</div>
          <ReactECharts option={mainOption} style={{ height: 156, width: "100%" }} opts={{ renderer: "svg" }} />
          <div className="risk-kpi-gauge-main-value">
            {Number(totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </div>
        </div>
      </article>

      <article className="chart-card risk-kpi-mini-gauge-card risk-kpi-distribution-card">
        <div className="risk-kpi-mini-gauge-title">Distribuição</div>
        <ReactECharts option={distributionOption} style={{ height: 156, width: "100%" }} opts={{ renderer: "svg" }} />
      </article>
    </section>
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

const normalizeDashboardLocality = (value) => {
  if (value == null) return "";
  const parts =
    typeof value === "object"
      ? [value.uf || value.sigla || "", value.cidade || value.nome || ""]
      : String(value)
          .split("/")
          .map((part) => part.trim());

  return parts
    .filter(Boolean)
    .map((part) => normalizeText(part))
    .sort()
    .join("|");
};

const COMPONENT_DATASETS = [
  { key: "Venda Físico em U$", baseKey: "Venda Físico em U$", color: "#1B8A3B", stack: "stack_fisico_bolsa" },
  { key: "Bolsa (Futuros) · Compra Put", baseKey: "Bolsa (Futuros)", color: "#F8AE31", stack: "stack_fisico_bolsa" },
  { key: "Bolsa (Futuros) · Venda NDF", baseKey: "Bolsa (Futuros)", color: "#F59E0B", stack: "stack_fisico_bolsa" },
  { key: "Dólar · Compra Put", baseKey: "Dólar", color: "#4A6CFF", stack: "stack_dolar" },
  { key: "Dólar · Venda NDF", baseKey: "Dólar", color: "#0D40F7", stack: "stack_dolar" },
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
  const original = Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0));
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

const formatMoneyByCurrency = (value, currencyLabel) =>
  `${currencyLabel} ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CASHFLOW_CURRENCY_CONFIGS = [
  { key: "USD", label: "U$", title: "Fluxo de Caixa em U$", matcher: isUsdCurrency },
  { key: "EUR", label: "€", title: "Fluxo de Caixa em €", matcher: isEuroCurrency },
  { key: "BRL", label: "R$", title: "Fluxo de Caixa em R$", matcher: isBrlCurrency },
];

const CASHFLOW_SERIES_DEFS = [
  { key: "payments", label: "Pagamentos", color: "#ef4444", stack: "cashflow" },
  { key: "purchaseDerivatives", label: "Compra via Derivativos", color: "#f59e0b", stack: "cashflow" },
  { key: "physicalSales", label: "Vendas", color: "#16a34a", stack: "cashflow" },
  { key: "saleDerivatives", label: "Vendas via Derivativos", color: "#86efac", stack: "cashflow" },
];

const convertValueToBrl = (value, currency, usdBrlRate) => {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return 0;
  if (!isUsdCurrency(currency)) return amount;
  return Number.isFinite(usdBrlRate) && usdBrlRate > 0 ? amount * usdBrlRate : amount;
};

const getPhysicalCostValue = (item, usdBrlRate) =>
  convertValueToBrl(
    Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0),
    item.moeda_contrato,
    usdBrlRate,
  );

const getPhysicalVolumeValue = (item) => Math.abs(Number(item.volume_fisico || 0));

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
      const compraVenda = normalizeText(item.grupo_montagem);
      const tipoDerivativo = normalizeText(item.tipo_derivativo);
      return (
        (compraVenda === "compra" && tipoDerivativo === "put") ||
        (compraVenda === "venda" && tipoDerivativo === "ndf")
      );
    })
    .map((item) => {
      const date = parseDate(item.data_liquidacao);
      if (!date) return null;
      const compraVenda = normalizeText(item.grupo_montagem);
      const tipoDerivativo = normalizeText(item.tipo_derivativo);
      const operationLabel = compraVenda === "compra" && tipoDerivativo === "put" ? "Compra Put" : "Venda NDF";
      const marketLabel = normalizeText(item.moeda_ou_cmdtye) === "cmdtye" ? "Bolsa (Futuros)" : "Dólar";
      return {
        categoria: `${marketLabel} · ${operationLabel}`,
        categoriaBase: marketLabel,
        subcategoria: item.nome_da_operacao || "Outros",
        data: formatBrazilianDate(item.data_liquidacao || date),
        date,
        valor: Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)),
        volume: Number(item.volume || item.volume_fisico || item.numero_lotes || 0),
        strike: Number(item.strike_montagem || 0),
        unidade: item.unidade || "",
        moeda_unidade: item.moeda_unidade || "",
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
    if (Number.isFinite(item.strike)) {
      node.wStrikeNum += (Number(item.strike) || 0) * Math.abs(Number(item.valor) || 0);
      node.wStrikeDen += Math.abs(Number(item.valor) || 0);
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
    { label: "Venda Físico em U$", keys: ["Venda Físico em U$"] },
    { label: "Bolsa (Futuros)", keys: ["Bolsa (Futuros) · Compra Put", "Bolsa (Futuros) · Venda NDF"] },
    { label: "Dólar", keys: ["Dólar · Compra Put", "Dólar · Venda NDF"] },
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
    const fisico = Math.abs(aggregate[label]?.["Venda Físico em U$"]?.sumValor || 0);
    const bolsaCompraPut = Math.abs(aggregate[label]?.["Bolsa (Futuros) · Compra Put"]?.sumValor || 0);
    const bolsaVendaNdf = Math.abs(aggregate[label]?.["Bolsa (Futuros) · Venda NDF"]?.sumValor || 0);
    const dolarCompraPut = Math.abs(aggregate[label]?.["Dólar · Compra Put"]?.sumValor || 0);
    const dolarVendaNdf = Math.abs(aggregate[label]?.["Dólar · Venda NDF"]?.sumValor || 0);
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

  return { labels, datasets, metaMap, opsIndex, totalsByCategory, periods };
};

function useComponentSalesSource(dashboardFilter, dateFrom, dateTo) {
  const { matchesDashboardFilter } = useDashboardFilter();
  const [sales, setSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [counterparties, setCounterparties] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("counterparties"),
    ]).then(([salesResponse, derivativesResponse, counterpartiesResponse]) => {
      if (!isMounted) return;
      setSales(salesResponse || []);
      setDerivatives(derivativesResponse || []);
      setCounterparties(counterpartiesResponse || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );

  return useMemo(
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
}

function ComponentSalesDetailsPopup({ selectedBar, onClose }) {
  const popupSummary = useMemo(() => {
    if (!selectedBar?.ops?.length) return null;
    const totalValor = selectedBar.ops.reduce((sum, item) => sum + Math.abs(Number(item.valor) || 0), 0);
    const totalVolume = selectedBar.ops.reduce((sum, item) => sum + (Number(item.volume) || 0), 0);
    const wDen = selectedBar.ops.reduce((sum, item) => sum + Math.abs(Number(item.valor) || 0), 0);
    const wNum = selectedBar.ops.reduce((sum, item) => sum + (Number(item.strike) || 0) * Math.abs(Number(item.valor) || 0), 0);
    const wAvgStrike = wDen > 0 ? wNum / wDen : null;
    return { totalValor, totalVolume, wAvgStrike };
  }, [selectedBar]);

  if (!selectedBar) {
    return null;
  }

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

const stackTotalsPlugin = {
  id: "componentStackTotals",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const labels = chart.data.labels || [];
    if (!labels.length) return;

    ["stack_fisico_bolsa", "stack_dolar"].forEach((stackId) => {
      labels.forEach((_, dataIndex) => {
        const datasetIndexes = chart.data.datasets
          .map((dataset, index) => ({ dataset, index }))
          .filter(({ dataset, index }) => dataset.stack === stackId && chart.isDatasetVisible(index))
          .map(({ index }) => index);

        if (!datasetIndexes.length) return;

        const total = datasetIndexes.reduce((sum, datasetIndex) => sum + (Number(chart.data.datasets[datasetIndex].data?.[dataIndex]) || 0), 0);
        if (!total) return;

        const topDatasetIndex = datasetIndexes[datasetIndexes.length - 1];
        const element = chart.getDatasetMeta(topDatasetIndex)?.data?.[dataIndex];
        if (!element) return;

        const text = `Total: ${formatCurrency2(total)}`;
        const x = element.x;
        const y = element.y - 8;
        const padX = 8;
        const height = 28;
        const radius = 8;

        ctx.save();
        ctx.font = "700 12px Arial";
        const width = ctx.measureText(text).width + padX * 2;
        const left = x - width / 2;
        const top = y - height;

        ctx.beginPath();
        ctx.moveTo(left + radius, top);
        ctx.lineTo(left + width - radius, top);
        ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
        ctx.lineTo(left + width, top + height - radius);
        ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
        ctx.lineTo(left + radius, top + height);
        ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
        ctx.lineTo(left, top + radius);
        ctx.quadraticCurveTo(left, top, left + radius, top);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111827";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x, top + height / 2);
        ctx.restore();
      });
    });
  },
};

const hedgeTodayLinePlugin = {
  id: "hedgeTodayLine",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const todayIndex = Number(pluginOptions?.index);
    if (!Number.isInteger(todayIndex) || todayIndex < 0) return;

    const xScale = chart.scales?.x;
    const { ctx, chartArea } = chart;
    if (!xScale || !chartArea) return;

    const x = xScale.getPixelForValue(todayIndex);
    if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

Chart.register(stackTotalsPlugin, hedgeTodayLinePlugin);

function ComponentSalesDashboard({ dashboardFilter }) {
  const defaultDateRange = useMemo(() => buildCashflowDefaultDateRange(), []);

  const [interval, setInterval] = useState("daily");
  const [dateFrom, setDateFrom] = useState(defaultDateRange.fromBrazilian);
  const [dateTo, setDateTo] = useState(defaultDateRange.toBrazilian);
  const [selectedBar, setSelectedBar] = useState(null);
  const [datasetVisibility, setDatasetVisibility] = useState(() =>
    Object.fromEntries(COMPONENT_DATASETS.map((dataset) => [dataset.key, true])),
  );
  const rows = useComponentSalesSource(dashboardFilter, dateFrom, dateTo);
  const chartState = useMemo(
    () => buildComponentSalesChartState(rows, interval, datasetVisibility),
    [datasetVisibility, interval, rows],
  );
  const chartOption = useMemo(() => ({
    animationDuration: 250,
    grid: { top: 28, right: 18, bottom: 10, left: 18, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const rowsHtml = params
          .map((item) => {
            const meta = chartState.metaMap.get(`${item.axisValue}||${item.seriesName}`);
            const strike = meta?.wAvgStrike
              ? `<br/>Strike medio: ${Number(meta.wAvgStrike).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${meta.moeda_unidade ? ` ${meta.moeda_unidade}` : ""}`
              : "";
            return `${item.marker}${item.seriesName} — U$ ${Number(item.value || 0).toLocaleString("pt-BR")}${strike}`;
          })
          .join("<br/>");
        return `<strong>${params[0]?.axisValue || ""}</strong><br/>${rowsHtml}`;
      },
    },
    legend: { show: false },
    xAxis: {
      type: "category",
      data: chartState.labels,
      axisTick: { show: false },
      axisLabel: { color: "#475569", fontWeight: 700, fontSize: 12 },
      axisLine: { lineStyle: { color: "rgba(15,23,42,0.18)" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      name: "U$",
      nameTextStyle: { color: "#475569", fontSize: 10, fontWeight: 700 },
      axisLabel: { color: "#475569", fontSize: 11, formatter: (value) => Number(value).toLocaleString("pt-BR") },
      splitLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
    },
    series: chartState.datasets.map((dataset) => ({
      name: dataset.label,
      type: "bar",
      stack: "component-sales",
      barMaxWidth: 52,
      itemStyle: { color: dataset.backgroundColor, borderRadius: [10, 10, 0, 0] },
      label: {
        show: true,
        position: "inside",
        color: "#ffffff",
        fontSize: 11,
        fontWeight: 700,
        formatter: ({ value }) => (Number(value) > 0 ? Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : ""),
      },
      data: dataset.data,
    })),
  }), [chartState]);
  const chartEvents = useMemo(() => ({
    click: (params) => {
      if (params.componentType !== "series") return;
      const period = chartState.labels[params.dataIndex];
      const key = `${period}||${params.seriesName}`;
      setSelectedBar({
        category: params.seriesName,
        period,
        ops: chartState.opsIndex.get(key) || [],
        meta: chartState.metaMap.get(key) || null,
        color: params.color,
      });
    },
  }), [chartState]);

  return (
    <section className="component-sales-shell">
      <section className="stats-grid">
        {chartState.totalsByCategory.map((item) => (
          <article key={item.label} className="card stat-card component-summary-card">
            <span className="component-summary-label">
              <span
                className="component-summary-dot"
                style={{ background: COMPONENT_DATASETS.find((dataset) => dataset.baseKey === item.label)?.color || "#64748b" }}
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

    <div className="chart-card component-chartjs-card cashflow-chart-card">
        <div className="chart-card-header">
          <div>
            <h3>Venda de Componentes</h3>
            <p className="muted">Consolidado por periodo. Clique na barra para abrir os detalhes.</p>
          </div>
          <div className="chart-toolbar">
            {[
              ["daily", "Diario"],
              ["weekly", "Semanal"],
              ["monthly", "Mensal"],
              ["geral", "Geral"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chart-period-btn${interval === value ? " active" : ""}`}
                onClick={() => setInterval(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chart-date-filters">
            <label className="chart-date-filter">
              <span>De:</span>
              <DatePickerField value={dateFrom} onChange={setDateFrom} />
            </label>
            <label className="chart-date-filter">
              <span>Até:</span>
              <DatePickerField value={dateTo} onChange={setDateTo} />
            </label>
          </div>
        </div>

        <div className="component-chartjs-wrap">
          <ReactECharts option={chartOption} onEvents={chartEvents} style={{ height: "100%" }} opts={{ renderer: "svg" }} />
        </div>
      </div>

      <ComponentSalesDetailsPopup selectedBar={selectedBar} onClose={() => setSelectedBar(null)} />
    </section>
  );
}

function ComponentSalesNativeDashboard({ dashboardFilter }) {
  const defaultDateRange = useMemo(() => buildCashflowDefaultDateRange(), []);
  const [interval, setInterval] = useState("monthly");
  const [dateFrom, setDateFrom] = useState(defaultDateRange.fromBrazilian);
  const [dateTo, setDateTo] = useState(defaultDateRange.toBrazilian);
  const [selectedBar, setSelectedBar] = useState(null);

  const rows = useComponentSalesSource(dashboardFilter, dateFrom, dateTo);
  const chartState = useMemo(() => buildComponentSalesChartState(rows, interval), [interval, rows]);

  const strongestPeriod = useMemo(() => {
    const periods = chartState.periods || [];
    if (!periods.length) {
      return null;
    }
    return periods.reduce((best, item) => (item.strongestValue > (best?.strongestValue || 0) ? item : best), periods[0]);
  }, [chartState.periods]);

  const totals = useMemo(() => {
    const fisico = chartState.totalsByCategory.find((item) => item.label === "Venda Físico em U$")?.value || 0;
    const bolsa = chartState.totalsByCategory.find((item) => item.label === "Bolsa (Futuros)")?.value || 0;
    const dolar = chartState.totalsByCategory.find((item) => item.label === "Dólar")?.value || 0;
    const geral = fisico + bolsa + dolar;
    return {
      fisico,
      bolsa,
      dolar,
      geral,
      fisicoPct: geral ? (fisico / geral) * 100 : 0,
      bolsaPct: geral ? (bolsa / geral) * 100 : 0,
      dolarPct: geral ? (dolar / geral) * 100 : 0,
    };
  }, [chartState.totalsByCategory]);

  const maxValue = useMemo(
    () => Math.max(...(chartState.periods || []).map((item) => Math.max(item.stackTotal, item.dolar)), 1),
    [chartState.periods],
  );
  const barAreaHeight = 320;

  return (
    <section className="component-sales-shell component-native-shell">
      <section className="component-native-hero">
        <article className="card component-native-hero-card">
          <span className="component-native-kicker">Visão consolidada</span>
          <strong>{formatCurrency0(totals.geral)}</strong>
          <p className="muted">Leitura nativa entre venda física, bolsa e dólar no período filtrado.</p>
        </article>
        <article className="card component-native-mix-card">
          <div className="component-native-mix-head">
            <strong>Mix atual</strong>
            <span className="muted">{strongestPeriod?.label || "Sem dados"}</span>
          </div>
          <div className="component-native-mix-list">
            {[
              { label: "Venda Físico em U$", value: totals.fisicoPct, color: COMPONENT_COLORS["Venda Fisico em U$"] },
              { label: "Bolsa (Futuros)", value: totals.bolsaPct, color: COMPONENT_COLORS["Bolsa (Futuros)"] },
              { label: "Dólar", value: totals.dolarPct, color: COMPONENT_COLORS.Dolar },
            ].map((item) => (
              <div key={item.label} className="component-native-mix-row">
                <div className="component-native-mix-label">
                  <span className="component-summary-dot" style={{ background: item.color }} />
                  <span>{item.label}</span>
                </div>
                <strong>{item.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="component-native-stats">
        {chartState.totalsByCategory.map((item) => (
          <article key={item.label} className="card stat-card component-summary-card">
            <span className="component-summary-label">
              <span
                className="component-summary-dot"
                style={{ background: COMPONENT_DATASETS.find((dataset) => dataset.baseKey === item.label)?.color || "#64748b" }}
              />
              {item.label}
            </span>
            <strong>{formatCurrency0(item.value)}</strong>
          </article>
        ))}
      </section>

      <div className="chart-card component-native-chart-card">
        <div className="chart-card-header component-native-chart-header">
          <div>
            <h3>Venda de Componentes (novo)</h3>
            <p className="muted">Stack nativo para venda física + bolsa e coluna isolada para dólar.</p>
          </div>
          <div className="chart-toolbar">
            {[
              ["daily", "Diario"],
              ["weekly", "Semanal"],
              ["monthly", "Mensal"],
              ["geral", "Geral"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chart-period-btn${interval === value ? " active" : ""}`}
                onClick={() => setInterval(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chart-date-filters">
            <label className="chart-date-filter">
              <span>De:</span>
              <DatePickerField value={dateFrom} onChange={setDateFrom} />
            </label>
            <label className="chart-date-filter">
              <span>Até:</span>
              <DatePickerField value={dateTo} onChange={setDateTo} />
            </label>
          </div>
        </div>

        <div className="component-native-legend">
          {COMPONENT_DATASETS.map((item) => (
            <div key={item.key} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: item.color }} />
              <span>{item.key}</span>
            </div>
          ))}
        </div>

        <div className="component-native-chart">
          <div className="component-native-grid">
            {[0, 1, 2, 3].map((line) => (
              <div key={line} className="component-native-grid-line" style={{ bottom: `${(line / 3) * 100}%` }} />
            ))}
          </div>
          <div className="component-native-columns">
            {(chartState.periods || []).map((period) => {
              const stackHeightPx = Math.max((period.stackTotal / maxValue) * barAreaHeight, 0);
              const dollarHeightPx = Math.max((period.dolar / maxValue) * barAreaHeight, 0);
              const fisicoHeightPx = period.stackTotal ? (period.fisico / period.stackTotal) * stackHeightPx : 0;
              const bolsaHeightPx = period.stackTotal ? (period.bolsa / period.stackTotal) * stackHeightPx : 0;

              return (
                <div key={period.label} className="component-native-slot">
                  <div className="component-native-values">
                    {period.stackTotal > 0 ? <span>{formatCurrency0(period.stackTotal)}</span> : <span />}
                    {period.dolar > 0 ? <span>{formatCurrency0(period.dolar)}</span> : <span />}
                  </div>
                  <div className="component-native-bars">
                    <button
                      type="button"
                      className="component-native-bar-stack"
                      onClick={() =>
                        setSelectedBar({
                          category: COMPONENT_STACK_LABEL,
                          color: "#f97316",
                          period: period.label,
                          ops: [
                            ...(chartState.opsIndex.get(`${period.label}||Venda Físico em U$`) || []),
                            ...(chartState.opsIndex.get(`${period.label}||Bolsa (Futuros)`) || []),
                          ],
                        })
                      }
                    >
                      <div className="component-native-bar-shell" style={{ height: `${stackHeightPx}px` }}>
                        {period.bolsa > 0 ? (
                          <span className="component-native-segment" style={{ height: `${bolsaHeightPx}px`, background: COMPONENT_COLORS["Bolsa (Futuros)"] }} />
                        ) : null}
                        {period.fisico > 0 ? (
                          <span className="component-native-segment" style={{ height: `${fisicoHeightPx}px`, background: COMPONENT_COLORS["Venda Fisico em U$"] }} />
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="component-native-bar-single"
                      onClick={() =>
                        setSelectedBar({
                          category: "Dólar",
                          color: COMPONENT_COLORS.Dolar,
                          period: period.label,
                          ops: chartState.opsIndex.get(`${period.label}||Dólar`) || [],
                        })
                      }
                    >
                      <div className="component-native-bar-shell component-native-bar-dollar" style={{ height: `${dollarHeightPx}px` }} />
                    </button>
                  </div>
                  <div className="component-native-period-label">{period.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ComponentSalesDetailsPopup selectedBar={selectedBar} onClose={() => setSelectedBar(null)} />
    </section>
  );
}

const buildCashflowRows = ({
  sales,
  cashPayments,
  derivatives,
  counterpartyMap,
  dashboardFilter,
  currencyConfig,
}) => {
  const parseDate = (value) => {
    if (!value) return null;
    if (String(value).includes("/")) {
      const [day, month, year] = String(value).split("/");
      return new Date(Number(year), Number(month) - 1, Number(day));
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
    .filter((item) => currencyConfig.matcher(item.moeda))
    .map((item) => {
      const date = parseDate(item.data_pagamento);
      if (!date) return null;
      return {
        categoryKey: "payments",
        category: `Pagamentos em ${currencyConfig.label}`,
        date,
        data: formatBrazilianDate(item.data_pagamento || date),
        valor: -Math.abs(Number(item.volume || 0)),
        volume: Number(item.volume || 0),
        instituicao: counterpartyMap[String(item.contraparte)] || "",
        descricao: item.descricao || "",
      };
    })
    .filter(Boolean);

  const salesRows = sales
    .filter((item) => rowMatchesDashboardFilter(item, dashboardFilter))
    .filter((item) => currencyConfig.matcher(item.moeda_contrato))
    .map((item) => {
      const date = parseDate(item.data_pagamento || item.data_negociacao);
      if (!date) return null;
      return {
        categoryKey: "physicalSales",
        category: `Vendas em ${currencyConfig.label}`,
        date,
        data: formatBrazilianDate(item.data_pagamento || item.data_negociacao || date),
        valor: Math.abs(Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0)),
        volume: Number(item.volume_fisico || 0),
        preco: Number(item.preco || 0),
        moedaUnidade: item.moeda_contrato && item.unidade_contrato ? `${item.moeda_contrato}/${item.unidade_contrato}` : item.moeda_contrato || "",
        instituicao: counterpartyMap[String(item.contraparte)] || "",
      };
    })
    .filter(Boolean);

  const derivativeRows = derivatives
    .filter((item) =>
      rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: DERIVATIVE_CULTURE_KEYS,
      }),
    )
    .filter((item) => normalizeText(item.moeda_ou_cmdtye) === "moeda")
    .filter((item) => currencyConfig.matcher(item.volume_financeiro_moeda || item.moeda_unidade))
    .map((item) => {
      const date = parseDate(item.data_liquidacao || item.data_contratacao);
      if (!date) return null;
      const isPurchase = normalizeText(item.grupo_montagem) === "compra";
      return {
        categoryKey: isPurchase ? "purchaseDerivatives" : "saleDerivatives",
        category: `${isPurchase ? "Compra" : "Vendas"} em ${currencyConfig.label} via Derivativos`,
        date,
        data: formatBrazilianDate(item.data_liquidacao || item.data_contratacao || date),
        valor: Math.abs(Number(item.volume_financeiro_valor_moeda_original || 0)),
        volume: Number(item.volume || item.numero_lotes || 0),
        preco: Number(item.strike_montagem || item.strike_liquidacao || 0),
        moedaUnidade: item.moeda_unidade || item.volume_financeiro_moeda || "",
        instituicao: item.bolsa_ref || counterpartyMap[String(item.contraparte)] || "",
        tipo: item.tipo_derivativo || "",
      };
    })
    .filter(Boolean);

  return [...paymentRows, ...salesRows, ...derivativeRows];
};

const buildCashflowChartState = (rows, interval) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const period = buildComponentPeriodKey(row.date, interval);
    if (!grouped.has(period)) {
      grouped.set(period, Object.fromEntries(CASHFLOW_SERIES_DEFS.map((item) => [item.key, { total: 0, ops: [] }])));
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
  const datasets = CASHFLOW_SERIES_DEFS.map((seriesDef) => ({
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
    CASHFLOW_SERIES_DEFS.reduce((sum, item) => sum + Number(grouped.get(label)?.[item.key]?.total || 0), 0),
  );

  datasets.push({
    label: "Saldo",
    type: "line",
    data: saldoData,
    borderColor: "#64748b",
    backgroundColor: "#64748b",
    pointBackgroundColor: saldoData.map((value) => (Number(value || 0) < 0 ? "#ef4444" : "#16a34a")),
    tension: 0.35,
    pointRadius: 6,
    pointHoverRadius: 7,
    pointBorderWidth: 2,
    pointBorderColor: "#ffffff",
    yAxisID: "y",
    order: 0,
  });

  const totals = CASHFLOW_SERIES_DEFS.map((item) => ({
    label: item.label,
    value: labels.reduce((sum, label) => sum + Number(grouped.get(label)?.[item.key]?.total || 0), 0),
    color: item.color,
  }));
  const saldoTotal = saldoData.reduce((sum, value) => sum + Number(value || 0), 0);

  const periodSummaries = new Map(
    labels.map((label, index) => [
      label,
      {
        totals: CASHFLOW_SERIES_DEFS.map((item) => ({
          label: item.label,
          value: Number(grouped.get(label)?.[item.key]?.total || 0),
          color: item.color,
        })),
        saldo: Number(saldoData[index] || 0),
      },
    ]),
  );

  return { labels, datasets, opsIndex, totals, saldoData, saldoTotal, periodSummaries };
};

function CashflowOperationsPopup({ selectedItem, currencyLabel, onClose }) {
  const summary = useMemo(() => {
    if (!selectedItem?.ops?.length) return null;
    const totalValor = selectedItem.ops.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalVolume = selectedItem.ops.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    return { totalValor, totalVolume };
  }, [selectedItem]);

  if (!selectedItem) return null;

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>
          ×
        </button>
        <div className="component-popup-header">
          <span className="chart-legend-dot" style={{ background: selectedItem.color || "#64748b" }} />
          <strong>{selectedItem.category}</strong>
          <span className="muted">— {selectedItem.period}</span>
        </div>
        <table className="component-popup-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Valor</th>
              <th>Volume</th>
              <th>Preço / Strike</th>
              <th>Instituição</th>
            </tr>
          </thead>
          <tbody>
            {selectedItem.ops.map((item, index) => (
              <tr key={`${item.data}-${index}`}>
                <td>{item.data}</td>
                <td>{formatMoneyByCurrency(item.valor, currencyLabel)}</td>
                <td>{Number(item.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                <td>
                  {item.preco
                    ? `${formatCurrency2(item.preco)}${item.moedaUnidade ? ` ${item.moedaUnidade}` : ""}`
                    : "—"}
                </td>
                <td>{item.instituicao || "—"}</td>
              </tr>
            ))}
            {summary ? (
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>{formatMoneyByCurrency(summary.totalValor, currencyLabel)}</strong></td>
                <td><strong>{Number(summary.totalVolume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</strong></td>
                <td />
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashflowCurrencyChart({
  currencyConfig,
  rows,
  interval,
  compact = false,
  isExpanded = false,
  onToggleExpand,
}) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  const chartState = useMemo(() => buildCashflowChartState(rows, interval), [interval, rows]);
  const activeSummary = hoveredPeriod ? chartState.periodSummaries.get(hoveredPeriod) : null;
  const summaryCards = activeSummary?.totals || chartState.totals;
  const saldoSummary = activeSummary?.saldo ?? chartState.saldoTotal;
  const chartOption = useMemo(() => ({
    animationDuration: 250,
    grid: { top: 18, right: 18, bottom: 24, left: 18, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) =>
        `<strong>${params[0]?.axisValue || ""}</strong><br/>${params
          .map((item) => `${item.marker}${item.seriesName}: ${formatMoneyByCurrency(item.value, currencyConfig.label)}`)
          .join("<br/>")}`,
    },
    legend: { show: false },
    xAxis: {
      type: "category",
      data: chartState.labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
      axisLabel: { color: "#475569", fontWeight: 700, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        show: false,
        color: "#475569",
        formatter: (value) => formatMoneyByCurrency(value, currencyConfig.label),
      },
      splitLine: { lineStyle: { color: "rgba(15,23,42,0.1)" } },
    },
    series: chartState.datasets.map((dataset) => ({
      name: dataset.label,
      type: dataset.type === "line" ? "line" : "bar",
      stack: dataset.type === "line" ? undefined : "cashflow",
      smooth: false,
      symbol: dataset.type === "line" ? "circle" : "none",
      symbolSize: dataset.type === "line" ? 8 : 0,
      lineStyle: { color: dataset.borderColor || dataset.backgroundColor, width: dataset.type === "line" ? 3 : 2 },
      itemStyle: {
        color: dataset.borderColor || dataset.backgroundColor,
        borderRadius: dataset.type === "line" ? 0 : [10, 10, 0, 0],
      },
      areaStyle: dataset.type === "line" ? undefined : undefined,
      label: dataset.type === "line"
        ? { show: false }
        : {
            show: true,
            position: "top",
            color: "#111827",
            fontSize: 10,
            fontWeight: 700,
            formatter: ({ value }) => (Math.abs(Number(value || 0)) > 0 ? formatMoneyByCurrency(value, currencyConfig.label) : ""),
          },
      data: dataset.data,
      barMaxWidth: 44,
    })),
  }), [chartState, currencyConfig.label]);
  const chartEvents = useMemo(() => ({
    mouseover: (params) => {
      if (params.componentType !== "series") return;
      setHoveredPeriod(chartState.labels[params.dataIndex] || null);
    },
    globalout: () => setHoveredPeriod(null),
    click: (params) => {
      if (params.componentType !== "series") return;
      const period = chartState.labels[params.dataIndex];
      const category = String(params.seriesName || "");
      const categoryKey = CASHFLOW_SERIES_DEFS.find((item) => item.label === category)?.key;
      const ops =
        category === "Saldo"
          ? CASHFLOW_SERIES_DEFS.flatMap((item) => chartState.opsIndex.get(`${period}||${item.key}`) || [])
          : chartState.opsIndex.get(`${period}||${categoryKey}`) || [];
      setSelectedItem({
        category,
        period,
        ops,
        color: params.color,
      });
    },
  }), [chartState]);

  return (
      <div className={`chart-card component-chartjs-card cashflow-chart-card${compact ? " cashflow-chart-card--compact" : ""}${isExpanded ? " cashflow-chart-card--expanded" : ""}`}>
      <div className="chart-card-header cashflow-chart-header">
        <div>
          <h3>{currencyConfig.title}</h3>
          <p className="muted">Clique em qualquer barra ou no saldo para abrir o detalhamento do período.</p>
        </div>
        <div className="chart-toolbar cashflow-chart-toolbar">
          {onToggleExpand ? (
            <button
              key={`${currencyConfig.key}-expand`}
              type="button"
              className={`chart-period-btn cashflow-expand-btn${isExpanded ? " active" : ""}`}
              onClick={onToggleExpand}
            >
              {isExpanded ? "Reduzir" : "Maximizar"}
            </button>
          ) : null}
        </div>
      </div>
      <section className="stats-grid cashflow-summary-grid">
        {summaryCards.map((item) => (
          <article key={`${currencyConfig.key}-${item.label}`} className="card stat-card component-summary-card">
            <span className="component-summary-label">
              <span className="component-summary-dot" style={{ background: item.color }} />
              {item.label}
            </span>
            <strong>{formatMoneyByCurrency(item.value, currencyConfig.label)}</strong>
          </article>
        ))}
        <article className="card stat-card component-summary-card">
          <span className="component-summary-label">
            <span className="component-summary-dot" style={{ background: "#64748b" }} />
            Saldo
          </span>
          <strong>{formatMoneyByCurrency(saldoSummary, currencyConfig.label)}</strong>
        </article>
      </section>
      <div className={`component-chartjs-wrap cashflow-chartjs-wrap${compact ? " cashflow-chartjs-wrap--compact" : ""}${isExpanded ? " cashflow-chartjs-wrap--expanded" : ""}`}>
        <ReactECharts option={chartOption} onEvents={chartEvents} style={{ height: "100%" }} opts={{ renderer: "svg" }} />
      </div>
      <CashflowOperationsPopup selectedItem={selectedItem} currencyLabel={currencyConfig.label} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

function CashflowDashboard({ dashboardFilter, compact = false }) {
  const defaultDateRange = useMemo(() => buildCashflowDefaultDateRange(), []);
  const [interval, setInterval] = useState("monthly");
  const [expandedCurrencyKey, setExpandedCurrencyKey] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: defaultDateRange.startIso,
    end: defaultDateRange.endIso,
  });
  const [sales, setSales] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [counterparties, setCounterparties] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales"),
      resourceService.listAll("cash-payments"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("counterparties"),
    ]).then(([salesResponse, cashPaymentsResponse, derivativesResponse, counterpartiesResponse]) => {
      if (!isMounted) return;
      setSales(salesResponse || []);
      setCashPayments(cashPaymentsResponse || []);
      setDerivatives(derivativesResponse || []);
      setCounterparties(counterpartiesResponse || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );

  const currencyRows = useMemo(
    () =>
      Object.fromEntries(
        CASHFLOW_CURRENCY_CONFIGS.map((currencyConfig) => [
          currencyConfig.key,
          buildCashflowRows({
            sales,
            cashPayments,
            derivatives,
            counterpartyMap,
            dashboardFilter,
            currencyConfig,
          }).filter((row) => {
            const rowTime = row.date instanceof Date ? row.date.getTime() : null;
            if (!rowTime) return false;
            const startTime = dateRange.start ? new Date(`${dateRange.start}T00:00:00`).getTime() : null;
            const endTime = dateRange.end ? new Date(`${dateRange.end}T23:59:59`).getTime() : null;
            if (startTime && rowTime < startTime) return false;
            if (endTime && rowTime > endTime) return false;
            return true;
          }),
        ]),
      ),
    [cashPayments, counterpartyMap, dashboardFilter, dateRange.end, dateRange.start, derivatives, sales],
  );

  const visibleCurrencies = useMemo(
    () =>
      expandedCurrencyKey
        ? CASHFLOW_CURRENCY_CONFIGS.filter((currencyConfig) => currencyConfig.key === expandedCurrencyKey)
        : CASHFLOW_CURRENCY_CONFIGS,
    [expandedCurrencyKey],
  );

  return (
    <section className="component-sales-shell">
      {compact ? (
        <div className="cashflow-dashboard-toolbar">
          <div className="chart-date-filters cashflow-date-filters">
            <label className="chart-date-filter">
              De
              <input
                type="date"
                value={dateRange.start}
                onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
              />
            </label>
            <label className="chart-date-filter">
              Ate
              <input
                type="date"
                value={dateRange.end}
                onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
              />
            </label>
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
          </div>
        </div>
      ) : null}
      <section
        className={`cashflow-dashboard-shell${compact ? " cashflow-dashboard-shell--compact" : ""}${expandedCurrencyKey ? " cashflow-dashboard-shell--expanded" : ""}`}
      >
      {visibleCurrencies.map((currencyConfig) => (
        <CashflowCurrencyChart
          key={currencyConfig.key}
          currencyConfig={currencyConfig}
          rows={currencyRows[currencyConfig.key] || []}
          interval={interval}
          compact={compact}
          isExpanded={expandedCurrencyKey === currencyConfig.key}
          onToggleExpand={
            compact
              ? () => setExpandedCurrencyKey((current) => (current === currencyConfig.key ? null : currencyConfig.key))
              : undefined
          }
        />
      ))}
      </section>
    </section>
  );
}

const readCultureLabel = (value) => {
  if (!value) return "Sem ativo";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return readCultureLabel(value[0]);
  return value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
};

function CommercialRiskDashboard({ dashboardFilter }) {
  const navigate = useNavigate();
  const { filter, options, toggleFilterValue, updateFilter } = useDashboardFilter();
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);
  const [physicalQuotes, setPhysicalQuotes] = useState([]);
  const [hedgePolicies, setHedgePolicies] = useState([]);
  const [budgetCosts, setBudgetCosts] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [marketQuotes, setMarketQuotes] = useState([]);
  const [marketNewsPosts, setMarketNewsPosts] = useState([]);
  const [editingMaturityItem, setEditingMaturityItem] = useState(null);
  const [maturityAttachments, setMaturityAttachments] = useState([]);
  const [maturityFormError, setMaturityFormError] = useState("");

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales").catch(() => []),
      resourceService.listAll("derivative-operations").catch(() => []),
      resourceService.listAll("crop-boards").catch(() => []),
      resourceService.listAll("physical-quotes").catch(() => []),
      resourceService.listAll("hedge-policies").catch(() => []),
      resourceService.listAll("budget-costs").catch(() => []),
      resourceService.listAll("physical-payments").catch(() => []),
      resourceService.listAll("cash-payments").catch(() => []),
      resourceService.listTradingviewQuotes({ force: true }).catch(() => []),
      resourceService.listAll("market-news-posts").catch(() => []),
    ]).then(([
      salesResponse,
      derivativeResponse,
      cropBoardResponse,
      quotesResponse,
      policiesResponse,
      budgetResponse,
      physicalPaymentsResponse,
      cashPaymentsResponse,
      marketQuotesResponse,
      marketNewsPostsResponse,
    ]) => {
      if (!isMounted) return;
      setPhysicalSales(salesResponse || []);
      setDerivatives(derivativeResponse || []);
      setCropBoards(cropBoardResponse || []);
      setPhysicalQuotes(quotesResponse || []);
      setHedgePolicies(policiesResponse || []);
      setBudgetCosts(budgetResponse || []);
      setPhysicalPayments(physicalPaymentsResponse || []);
      setCashPayments(cashPaymentsResponse || []);
      setMarketQuotes(marketQuotesResponse || []);
      setMarketNewsPosts(marketNewsPostsResponse || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSales = useMemo(
    () => physicalSales.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, physicalSales],
  );
  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter],
  );
  const filteredQuotes = useMemo(
    () =>
      physicalQuotes.filter((item) =>
        rowMatchesDashboardFilter(item, dashboardFilter, {
          seasonKeys: ["safra"],
          localityKeys: ["localidade"],
        }),
      ),
    [dashboardFilter, physicalQuotes],
  );
  const filteredPolicies = useMemo(
    () => hedgePolicies.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, hedgePolicies],
  );
  const filteredBudgetCosts = useMemo(
    () => budgetCosts.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [budgetCosts, dashboardFilter],
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
  const resolveCultureLabel = (value) => {
    if (!value) return "Sem ativo";
    if (Array.isArray(value)) return resolveCultureLabel(value[0]);
    if (typeof value === "string" || typeof value === "number") {
      return cultureLabelById.get(String(value)) || String(value);
    }
    const nestedId = value.id != null ? cultureLabelById.get(String(value.id)) : null;
    return nestedId || value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
  };

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

  const openMaturityForm = (item) => {
    if (!item?.recordId || !item?.resourceKey) return;

    if (item.resourceKey === "derivative-operations") {
      const current = derivatives.find((row) => String(row.id) === String(item.recordId));
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
    const current = sourceRows.find((row) => String(row.id) === String(item.recordId));
    if (!current) return;
    setEditingMaturityItem({ ...current, resourceKey: item.resourceKey });
    setMaturityFormError("");
  };

  const replaceRowById = (items, updated) => items.map((row) => (String(row.id) === String(updated.id) ? updated : row));

  const productionTotal = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0),
    [filteredCropBoards],
  );
  const physicalSoldVolume = useMemo(
    () => filteredSales.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)), 0),
    [filteredSales],
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
  const derivativeCommodityVolume = useMemo(
    () => bolsaDerivatives.reduce((sum, item) => sum + derivativeStandardVolumeGetter(item), 0),
    [bolsaDerivatives, derivativeStandardVolumeGetter],
  );
  const derivativeCurrencyVolume = useMemo(
    () => currencyDerivatives.reduce((sum, item) => sum + getDerivativeVolumeValue(item), 0),
    [currencyDerivatives],
  );
  const basisContracts = useMemo(
    () => filteredSales.filter((item) => Math.abs(Number(item.basis_valor || 0)) > 0).length,
    [filteredSales],
  );
  const basisAverage = useMemo(
    () => averageOf(filteredSales.map((item) => item.basis_valor)) ?? 0,
    [filteredSales],
  );
  const hedgeSummaryToday = useMemo(() => startOfDashboardDay(new Date()), []);
  const activePhysicalSales = useMemo(
    () =>
      filteredSales.filter((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return saleDate && hedgeSummaryToday && saleDate <= hedgeSummaryToday;
      }),
    [filteredSales, hedgeSummaryToday],
  );
  const activeBolsaDerivatives = useMemo(
    () =>
      bolsaDerivatives.filter((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        return startDate && endDate && hedgeSummaryToday && startDate <= hedgeSummaryToday && hedgeSummaryToday < endDate;
      }),
    [bolsaDerivatives, hedgeSummaryToday],
  );
  const physicalPriceLines = useMemo(() => {
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
      .map((item) => ({
        ...item,
        averagePrice: item.volume > 0 ? item.weightedPrice / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [activePhysicalSales]);
  const derivativePriceLines = useMemo(() => {
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
      .map((item) => ({
        ...item,
        averageStrike: item.volume > 0 ? item.weightedStrike / item.volume : 0,
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [activeBolsaDerivatives, derivativeStandardVolumeGetter]);
  const quoteAverage = useMemo(
    () => averageOf(filteredQuotes.map((item) => item.cotacao)) ?? 0,
    [filteredQuotes],
  );
  const policyCount = filteredPolicies.length;
  const physicalPaymentVolume = useMemo(
    () => filteredPhysicalPayments.reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0),
    [filteredPhysicalPayments],
  );
  const netProductionBase = useMemo(
    () => getNetProductionValue(filteredCropBoards, filteredPhysicalPayments, (item) => item.producao_total, (item) => item.volume),
    [filteredCropBoards, filteredPhysicalPayments],
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
      }),
    [bolsaDerivatives, derivativeStandardVolumeGetter, filteredPolicies, filteredSales, netProductionBase],
  );
  const hedgeSummaryTodayIndex = useMemo(
    () => getHedgeTodayIndex(hedgeSummaryChartState.points),
    [hedgeSummaryChartState.points],
  );
  const hedgeSummaryActivePoint =
    hedgeSummaryChartState.points[hedgeSummaryTodayIndex] || hedgeSummaryChartState.points.at(-1) || null;
  const hedgeCardCommercializedVolume = hedgeSummaryActivePoint?.total || 0;
  const commercializationCoverage = netProductionBase > 0 ? hedgeCardCommercializedVolume / netProductionBase : 0;

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
  const totalCommercializedVolume = physicalSoldVolume + derivativeCommodityVolume;
  const netProductionVolume = netProductionBase;
  const totalSalesPercent = netProductionBase > 0 ? (totalCommercializedVolume / netProductionBase) * 100 : 0;
  const derivativeSalesPercent = netProductionBase > 0 ? (derivativeCommodityVolume / netProductionBase) * 100 : 0;
  const physicalSalesPercent = netProductionBase > 0 ? (physicalSoldVolume / netProductionBase) * 100 : 0;
  const totalScPerHa = totalArea > 0 ? totalCommercializedVolume / totalArea : 0;
  const derivativeScPerHa = totalArea > 0 ? derivativeCommodityVolume / totalArea : 0;
  const physicalScPerHa = totalArea > 0 ? physicalSoldVolume / totalArea : 0;
  const currentPolicyMinPercent = currentMonthPolicy?.minRatio != null ? currentMonthPolicy.minRatio * 100 : null;
  const currentPolicyMaxPercent = currentMonthPolicy?.maxRatio != null ? currentMonthPolicy.maxRatio * 100 : null;
  const formCompletionRows = useMemo(
    () => [
      { label: "Quadro Safra", count: filteredCropBoards.length, hint: "Base de produção e cobertura" },
      { label: "Vendas Físico", count: filteredSales.length, hint: "Contratos físicos negociados" },
      { label: "Derivativos", count: filteredDerivatives.length, hint: "Operações em bolsa e câmbio" },
      { label: "Cotações Físico", count: filteredQuotes.length, hint: "Referência de mercado / MTM" },
      { label: "Política de Hedge", count: filteredPolicies.length, hint: "Faixas e disciplina de risco" },
      { label: "Custo Orçamento", count: filteredBudgetCosts.length, hint: "Base de margem e cobertura" },
      { label: "Pgtos Físico", count: filteredPhysicalPayments.length, hint: "Fluxo operacional do físico" },
      { label: "Pgtos Caixa", count: filteredCashPayments.length, hint: "Fluxo financeiro consolidado" },
    ].map((item) => ({
      ...item,
      status: item.count > 0 ? "Preenchido" : "Pendente",
    })),
    [
      filteredBudgetCosts.length,
      filteredCashPayments.length,
      filteredCropBoards.length,
      filteredDerivatives.length,
      filteredPhysicalPayments.length,
      filteredPolicies.length,
      filteredQuotes.length,
      filteredSales.length,
    ],
  );
  const formCompletionSummary = useMemo(() => {
    const totalForms = formCompletionRows.length;
    const filledForms = formCompletionRows.filter((item) => item.count > 0).length;
    const pendingForms = totalForms - filledForms;
    const totalRecords = formCompletionRows.reduce((sum, item) => sum + item.count, 0);
    return { totalForms, filledForms, pendingForms, totalRecords };
  }, [formCompletionRows]);

  const longShortRows = useMemo(() => {
    const classifyPaymentBucket = (description) => {
      const normalized = normalizeText(description);
      if (normalized.includes("arrendamento")) return "arrendamento";
      if (normalized.includes("barter")) return "barter";
      if (normalized.includes("terra")) return "paymentTerras";
      return null;
    };

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
          barter: 0,
          paymentTerras: 0,
          arrendamento: 0,
        };
      map.set(label, current);
      return current;
    };

    filteredCropBoards.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_texto);
      if (!node) return;
      node.production += Math.abs(Number(item.producao_total || 0));
    });

    filteredSales.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_produto || item.cultura_texto);
      if (!node) return;
      node.physical += Math.abs(Number(item.volume_fisico || 0));
    });

    bolsaDerivatives.forEach((item) => {
      const node = ensureNode(getDerivativeCultureValue(item));
      if (!node) return;
      node.derivatives += derivativeStandardVolumeGetter(item);
    });

    filteredPhysicalPayments.forEach((item) => {
      const bucket = classifyPaymentBucket(item.descricao);
      if (!bucket) return;
      const node = ensureNode(item.fazer_frente_com || item.cultura || item.cultura_texto);
      if (!node) return;
      node[bucket] += Math.abs(Number(item.volume || 0));
    });

    filteredCashPayments.forEach((item) => {
      const bucket = classifyPaymentBucket(item.descricao);
      if (!bucket) return;
      const node = ensureNode(item.fazer_frente_com || item.cultura || item.cultura_texto);
      if (!node) return;
      node[bucket] += Math.abs(Number(item.volume || 0));
    });

    return Array.from(map.values())
      .map((item) => {
        const covered = item.physical + item.derivatives + item.barter + item.paymentTerras + item.arrendamento;
        const nothingDone = Math.max(item.production - covered, 0);
        const totalForShare = item.production > 0 ? item.production : covered;
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
  }, [bolsaDerivatives, derivativeStandardVolumeGetter, filteredCashPayments, filteredCropBoards, filteredPhysicalPayments, filteredSales, cultureLabelById]);

  const cultureRows = useMemo(() => {
    const map = new Map();

    filteredCropBoards.forEach((item) => {
      const label = resolveCultureLabel(item.cultura || item.cultura_texto);
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.production += Math.abs(Number(item.producao_total || 0));
      map.set(label, node);
    });

    filteredSales.forEach((item) => {
      const label = resolveCultureLabel(item.cultura || item.cultura_produto || item.cultura_texto);
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.physical += Math.abs(Number(item.volume_fisico || 0));
      map.set(label, node);
    });

    bolsaDerivatives.forEach((item) => {
      const label = resolveCultureLabel(getDerivativeCultureValue(item));
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.derivatives += derivativeStandardVolumeGetter(item);
      map.set(label, node);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        coverage: item.production > 0 ? (item.physical + item.derivatives) / item.production : 0,
      }))
      .sort((left, right) => right.coverage - left.coverage)
      .slice(0, 6);
  }, [bolsaDerivatives, derivativeStandardVolumeGetter, filteredCropBoards, filteredSales, cultureLabelById]);

  const upcomingMaturityRows = useMemo(() => {
    const today = startOfDashboardDay(new Date());
    if (!today) return [];

    const formatValueLabel = (value, unitLabel = "") => {
      const amount = Number(value || 0);
      const unit = String(unitLabel || "").trim();
      if (!Number.isFinite(amount) || amount === 0) {
        return unit || "—";
      }
      if (isUsdCurrency(unit)) {
        return `U$ ${formatCurrency2(amount)}`;
      }
      if (isEuroCurrency(unit)) {
        return `€ ${formatCurrency2(amount)}`;
      }
      if (isBrlCurrency(unit)) {
        return `R$ ${formatCurrency2(amount)}`;
      }
      return `${formatNumber0(amount)}${unit ? ` ${unit}` : ""}`;
    };

    const formatStrikeLabel = (value, unitLabel = "") => {
      const strike = Number(value || 0);
      if (!Number.isFinite(strike) || strike === 0) return "";
      const unit = String(unitLabel || "").trim();
      if (isUsdCurrency(unit)) {
        return `Strike ${formatCurrency2(strike)} U$`;
      }
      if (isEuroCurrency(unit)) {
        return `Strike ${formatCurrency2(strike)} €`;
      }
      if (isBrlCurrency(unit)) {
        return `Strike ${formatCurrency2(strike)} R$`;
      }
      return `Strike ${formatCurrency2(strike)}${unit ? ` ${unit}` : ""}`;
    };

    const salesRows = filteredSales
      .map((item) => {
        const dueDate = startOfDashboardDay(item.data_pagamento);
        if (!dueDate || dueDate < today) return null;
        return {
          recordId: item.id,
          resourceKey: "physical-sales",
          app: "Vendas Fisico",
          title: item.cultura_produto || resolveCultureLabel(item.cultura || item.cultura_texto) || "Contrato fisico",
          summaryLabel: item.cultura_produto || resolveCultureLabel(item.cultura || item.cultura_texto) || "Contrato fisico",
          dateLabel: "Pagamento",
          dateText: formatBrazilianDate(dueDate, "—"),
          dateKey: toIsoDate(dueDate),
          date: dueDate,
          valueLabel: formatValueLabel(
            Number(item.faturamento_total_contrato || 0) || Number(item.preco || 0) * Number(item.volume_fisico || 0),
            item.moeda_contrato || "",
          ),
        };
      })
      .filter(Boolean);

    const physicalPaymentRows = filteredPhysicalPayments
      .map((item) => {
        const dueDate = startOfDashboardDay(item.data_pagamento);
        if (!dueDate || dueDate < today) return null;
        return {
          recordId: item.id,
          resourceKey: "physical-payments",
          app: "Pgtos Fisico",
          title: item.descricao || resolveCultureLabel(item.fazer_frente_com || item.cultura || item.cultura_texto) || "Pagamento fisico",
          summaryLabel: item.descricao || resolveCultureLabel(item.fazer_frente_com || item.cultura || item.cultura_texto) || "Pagamento fisico",
          dateLabel: "Pagamento",
          dateText: formatBrazilianDate(dueDate, "—"),
          dateKey: toIsoDate(dueDate),
          date: dueDate,
          valueLabel: formatValueLabel(item.volume, item.unidade || ""),
        };
      })
      .filter(Boolean);

    const cashPaymentRows = filteredCashPayments
      .map((item) => {
        const dueDate = startOfDashboardDay(item.data_pagamento);
        if (!dueDate || dueDate < today) return null;
        return {
          recordId: item.id,
          resourceKey: "cash-payments",
          app: "Pgtos Caixa",
          title: item.descricao || resolveCultureLabel(item.fazer_frente_com || item.cultura || item.cultura_texto) || "Pagamento caixa",
          summaryLabel: item.descricao || resolveCultureLabel(item.fazer_frente_com || item.cultura || item.cultura_texto) || "Pagamento caixa",
          dateLabel: "Pagamento",
          dateText: formatBrazilianDate(dueDate, "—"),
          dateKey: toIsoDate(dueDate),
          date: dueDate,
          valueLabel: formatValueLabel(item.volume, item.moeda || ""),
        };
      })
      .filter(Boolean);

    const derivativeRows = filteredDerivatives
      .map((item) => {
        const dueDate = startOfDashboardDay(item.data_liquidacao);
        if (!dueDate || dueDate < today) return null;
        const operationLabel = item.nome_da_operacao || item.contrato_derivativo || item.cod_operacao_mae || "Operacao derivativa";
        const strikeLabel = formatStrikeLabel(
          item.strike_montagem || item.strike_liquidacao,
          item.volume_financeiro_moeda || item.moeda_unidade || "",
        );
        const institutionLabel =
          item.bolsa_ref ||
          item.ctrbolsa ||
          item.instituicao ||
          item.bolsa?.nome ||
          item.bolsa ||
          "";
        return {
          recordId: item.id,
          resourceKey: "derivative-operations",
          app: "Derivativos",
          title: operationLabel,
          summaryLabel: [operationLabel, institutionLabel, strikeLabel].filter(Boolean).join(" - "),
          dateLabel: "Liquidacao",
          dateText: formatBrazilianDate(dueDate, "—"),
          dateKey: toIsoDate(dueDate),
          date: dueDate,
          valueLabel: formatValueLabel(
            item.volume_financeiro_valor || item.volume_financeiro_valor_moeda_original || item.volume_fisico_valor || item.numero_lotes,
            item.volume_financeiro_moeda || item.volume_fisico_unidade || item.moeda_unidade || "",
          ),
        };
      })
      .filter(Boolean);

    return [...salesRows, ...physicalPaymentRows, ...cashPaymentRows, ...derivativeRows]
      .sort((left, right) => left.date - right.date)
      .slice(0, 8);
  }, [filteredCashPayments, filteredDerivatives, filteredPhysicalPayments, filteredSales]);

  const openQuotesPage = () => {
    window.location.href = "/mercado/cotacoes";
  };

  const openBlogNewsPage = () => {
    window.location.href = "/mercado/blog-news";
  };

  return (
    <section className="risk-kpi-shell">
      <CommercialRiskQuotesSummaryCard rows={marketQuotes} onOpen={openQuotesPage} />

      <section className="stats-grid risk-kpi-grid">
        <article className="card stat-card">
          <span className="stat-card-primary-title">Produção líquida</span>
          <strong>{formatNumber0(netProductionVolume)} sc</strong>
          <span className="stat-card-secondary-label">(-) Pgtos Físico</span>
          <strong className="stat-card-secondary-value">{formatNumber0(physicalPaymentVolume)} sc</strong>
          <span className="stat-card-secondary-label">Produção total</span>
          <strong className="stat-card-secondary-value">{formatNumber0(productionTotal)} sc</strong>
          <span className="stat-card-secondary-label">Área x Produtividade</span>
          <strong className="stat-card-secondary-value">{formatNumber2(totalArea)} ha | {formatNumber2(totalArea > 0 ? productionTotal / totalArea : 0)} sc/ha</strong>
        </article>
        <article className="card stat-card">
          <span className="stat-card-primary-title">Hedge</span>
          <strong>
            {formatPercent1(commercializationCoverage)}
            <span className="stat-card-primary-meta">({formatNumber0(hedgeCardCommercializedVolume)} sc)</span>
          </strong>
          <span className="stat-card-secondary-label">Venda física</span>
          <strong className="stat-card-secondary-value">
            {physicalPriceLines.length
              ? physicalPriceLines.map((item) => (
                  <span key={`physical-${item.unitLabel || "sem-unidade"}`} className="stat-card-secondary-line">
                    {formatNumber0(item.volume)} sc | {formatCurrency2(item.averagePrice)}
                    {item.unitLabel ? ` ${item.unitLabel}` : ""}
                  </span>
                ))
              : `${formatNumber0(hedgeSummaryActivePoint?.physicalRaw || 0)} sc`}
          </strong>
          <span className="stat-card-secondary-label">Hedge em bolsa</span>
          <strong className="stat-card-secondary-value">
            {derivativePriceLines.length
              ? derivativePriceLines.map((item) => (
                  <span key={`derivative-${item.unitLabel || "sem-unidade"}`} className="stat-card-secondary-line">
                    {formatNumber0(item.volume)} sc | Strike {formatCurrency2(item.averageStrike)}
                    {item.unitLabel ? ` ${item.unitLabel}` : ""}
                  </span>
                ))
              : `${formatNumber0(hedgeSummaryActivePoint?.derivativeRaw || 0)} sc`}
          </strong>
        </article>
        <UpcomingMaturitiesCard rows={upcomingMaturityRows} onOpenItem={openMaturityForm} />
        <CommercialRiskNewsSummaryCard rows={marketNewsPosts} onOpen={openBlogNewsPage} />
      </section>

      <CommercialRiskGaugePanel
        totalPercent={totalSalesPercent}
        totalScPerHa={totalScPerHa}
        derivativePercent={derivativeSalesPercent}
        derivativeScPerHa={derivativeScPerHa}
        physicalPercent={physicalSalesPercent}
        physicalScPerHa={physicalScPerHa}
        policyMinPercent={currentPolicyMinPercent}
        policyMaxPercent={currentPolicyMaxPercent}
        productionBase={netProductionBase}
        physicalRows={filteredSales}
        derivativeRows={bolsaDerivatives}
        policies={filteredPolicies}
        derivativeVolumeGetter={derivativeStandardVolumeGetter}
        onOpenHedgePolicy={() => navigate("/dashboard/politica-hedge")}
      />

      <section className="risk-kpi-long-short-grid">
        <CommercialRiskLongShortChart
          rows={longShortRows}
          cultureButtons={options.cropBoardCrops || []}
          selectedCultureIds={filter.cultura}
          onToggleCulture={(value) => toggleFilterValue("cultura", value)}
          onClearCultures={() => updateFilter("cultura", [])}
        />
      </section>

      <section className="risk-kpi-derivative-donuts">
        <DonutChart
          centerLabel="Derivativos"
          centerValue={`${filteredDerivatives.length} ops`}
          slices={derivativeExchangeSlices}
        />
        <DonutChart
          centerLabel="Em aberto"
          centerValue={`${filteredDerivatives.filter((item) => !normalizeText(item.status_operacao).includes("encerr")).length} ops`}
          slices={derivativeExchangeOpenSlices}
        />
        <DonutChart
          centerLabel="Encerrado"
          centerValue={`${filteredDerivatives.filter((item) => normalizeText(item.status_operacao).includes("encerr")).length} ops`}
          slices={derivativeExchangeClosedSlices}
        />
      </section>

      <section className="risk-kpi-forms-grid">
        <article className="chart-card risk-kpi-forms-card">
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
                  <strong>{item.label}</strong>
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

        <article className="chart-card risk-kpi-forms-summary-card">
          <div className="chart-card-header">
            <div>
              <h3>Resumo de preenchimento</h3>
              <p className="muted">Leitura rápida para orientar o usuário sobre a cobertura cadastral do sistema.</p>
            </div>
          </div>
          <div className="risk-kpi-forms-summary">
            <div className="risk-kpi-summary-item">
              <span>Formulários monitorados</span>
              <strong>{formCompletionSummary.totalForms}</strong>
            </div>
            <div className="risk-kpi-summary-item">
              <span>Já preenchidos</span>
              <strong>{formCompletionSummary.filledForms}</strong>
            </div>
            <div className="risk-kpi-summary-item">
              <span>Ainda pendentes</span>
              <strong>{formCompletionSummary.pendingForms}</strong>
            </div>
            <div className="risk-kpi-summary-item">
              <span>Total de registros</span>
              <strong>{formatNumber0(formCompletionSummary.totalRecords)}</strong>
            </div>
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

    return () => {
      isMounted = false;
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
      <div className="simulation-topbar card">
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

      <div className="simulation-summary card">
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

      <div className="simulation-grid-shell card custom-scrollbar">
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
  showPhysical = true,
  showDerivatives = true,
  simulatedIncrement = 0,
}) {
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

  const allDates = [
    ...policyRows.map((item) => item.monthDate),
    ...physicalSeries.map((item) => item.date),
    ...derivativeSeries.flatMap((item) => [item.startDate, item.endDate]),
  ].filter(Boolean);

  const today = startOfDashboardDay(new Date());
  const startDate = allDates.length ? new Date(Math.min(...allDates.map((item) => item.getTime()))) : today;
  const endDate = allDates.length ? new Date(Math.max(...allDates.map((item) => item.getTime()), today.getTime())) : today;
  const buckets = buildHedgeBuckets(startDate, endDate, frequency);

  let activePolicy = policyRows[0] || null;
  let activePolicyIndex = 0;
  let physicalPointer = 0;
  let physicalTotal = 0;

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

    const derivativeTotal = derivativeSeries.reduce((sum, item) => {
      const isActive = item.startDate <= bucket.date && bucket.date < item.endDate;
      return isActive ? sum + item.value : sum;
    }, 0);

    const visibleDerivative = showDerivatives ? derivativeTotal : 0;
    const visiblePhysical = showPhysical ? physicalTotal : 0;
    const total = visibleDerivative + visiblePhysical;
    const minValue = activePolicy?.minRatio != null ? activePolicy.minRatio * baseValue : null;
    const maxValue = activePolicy?.maxRatio != null ? activePolicy.maxRatio * baseValue : null;

    return {
      ...bucket,
      physicalRaw: physicalTotal,
      derivativeRaw: derivativeTotal,
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
    totalDataset,
    totalPctDataset: points.map((item) => item.totalPct * 100),
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
  physicalDetailValueGetter = physicalValueGetter,
  derivativeDetailValueGetter = derivativeValueGetter,
  physicalVolumeGetter = getPhysicalVolumeValue,
  derivativeVolumeGetter = getDerivativeVolumeValue,
  onFocusToggle,
  extraActions = null,
  simulatedIncrement = 0,
  simulatedLabel = null,
}) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailIndex, setDetailIndex] = useState(null);
  const [showPhysical, setShowPhysical] = useState(true);
  const [showDerivatives, setShowDerivatives] = useState(true);

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
        showPhysical,
        showDerivatives,
        simulatedIncrement,
      }),
    [
      baseValue,
      derivativeRows,
      derivativeValueGetter,
      frequency,
      physicalRows,
      physicalValueGetter,
      policies,
      simulatedIncrement,
      showDerivatives,
      showPhysical,
      unit,
    ],
  );
  const todayIndex = useMemo(() => getHedgeTodayIndex(chartState.points), [chartState.points]);

  useEffect(() => {
    if (!chartState.points.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(todayIndex);
  }, [chartState.points.length, frequency, todayIndex]);

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas || !chartState.points.length) return undefined;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const nextChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: chartState.labels,
        datasets: [
          {
            label: "Politica Minima",
            data: chartState.minDataset,
            borderColor: "#22c55e",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1.5,
            tension: 0,
            fill: false,
          },
          {
            label: "Politica Maxima",
            data: chartState.maxDataset,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34, 197, 94, 0.14)",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1.5,
            tension: 0,
            fill: "-1",
          },
          {
            label: "Hedge via Derivativos",
            data: chartState.derivativeDataset,
            borderColor: "rgba(71, 85, 105, 0.9)",
            backgroundColor: "rgba(251, 146, 60, 0.48)",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1.5,
            borderDash: [6, 4],
            tension: 0,
            fill: "origin",
          },
          {
            label: "Vendas via Fisico",
            data: chartState.physicalDataset,
            borderColor: "#0f172a",
            backgroundColor: "rgba(250, 204, 21, 0.18)",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1.8,
            tension: 0,
            fill: "-1",
          },
          {
            label: "Total Realizado",
            data: chartState.totalDataset,
            borderColor: "#111827",
            backgroundColor: "#111827",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 4,
            tension: 0,
            fill: false,
            datalabels: {
              display: (context) => {
                const totalPoints = chartState.points.length;
                return context.dataIndex % datalabelStep === 0 || context.dataIndex === totalPoints - 1;
              },
              align: (context) => (context.dataIndex % 2 === 0 ? "top" : "right"),
              anchor: "end",
              clip: false,
              clamp: true,
              backgroundColor: "rgba(255, 255, 255, 0.92)",
              borderRadius: 8,
              color: "#111827",
              font: { size: 10, weight: "700" },
              offset: 2,
              padding: { top: 3, bottom: 3, left: 6, right: 6 },
              formatter: (_, context) => {
                const point = chartState.points[context.dataIndex];
                const extra = context.dataIndex === chartState.points.length - 1 ? simulatedIncrement : 0;
                const pct = baseValue > 0 ? ((point?.total || 0) + extra) / baseValue : 0;
                return `${(pct * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}%`;
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 160 },
        interaction: { mode: "nearest", axis: "x", intersect: false },
        onClick: (_, elements) => {
          if (!elements?.[0]) return;
          setDetailIndex(elements[0].index);
        },
        onHover: (_, elements) => {
          if (elements?.[0]) {
            setActiveIndex(elements[0].index);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: { display: false },
          fundPositionZeroLineAndLabels: { enabled: false },
          fundPositionLastValueLabel: { enabled: false },
          hedgeTodayLine: { index: todayIndex },
        },
        layout: {
          padding: {
            top: 20,
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#475569",
              font: { size: 11, weight: "700" },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: frequency === "monthly" ? 7 : frequency === "weekly" ? 8 : 6,
            },
            grid: { color: "rgba(148, 163, 184, 0.18)" },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "#475569",
              font: { size: 11 },
              callback: (value) => formatHedgeAxisValue(value, unit),
            },
            grid: { color: "rgba(148, 163, 184, 0.18)" },
          },
        },
      },
    });

    const handleMouseLeave = () => {
      setActiveIndex(todayIndex);
    };
    canvas.addEventListener("mouseleave", handleMouseLeave);

    chartInstanceRef.current = nextChart;
    return () => {
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      nextChart.destroy();
    };
  }, [chartState, frequency, todayIndex, unit]);

  const activePoint = chartState.points[activeIndex] || chartState.points.at(-1) || null;
  const detailPoint = detailIndex != null ? chartState.points[detailIndex] || null : null;
  const activeSimulation = activeIndex === chartState.points.length - 1 ? simulatedIncrement : 0;
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
      text: `${((baseValue > 0 ? activeTotal / baseValue : 0) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}% dentro da politica`,
    };
  }, [activePoint, baseValue]);

  const datalabelStep = useMemo(() => {
    const totalPoints = chartState.points.length;
    if (frequency === "daily") return Math.max(12, Math.ceil(totalPoints / 2));
    if (frequency === "weekly") return Math.max(4, Math.ceil(totalPoints / 4));
    return Math.max(2, Math.ceil(totalPoints / 6));
  }, [chartState.points.length, frequency]);

  const detailRows = useMemo(() => {
    if (!detailPoint) return null;
    const selectedDate = detailPoint.date;

    const physical = (physicalRows || [])
      .filter((item) => {
        const itemDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return itemDate && itemDate <= selectedDate;
      })
      .map((item) => ({
        id: `physical-${item.id}`,
        dataInicio: formatBrazilianDate(item.data_negociacao, ""),
        dataPagamento: formatBrazilianDate(item.data_pagamento, ""),
        volume: physicalVolumeGetter(item),
        valor: physicalDetailValueGetter(item),
        preco: Number(item.preco || 0),
        moeda: item.moeda_contrato || "R$",
        unidade: item.unidade_contrato || "sc",
        localEntrega: item.data_entrega ? String(item.data_entrega) : "/",
        obs: item.obs || "",
      }));

    const derivativesIncluded = (derivativeRows || [])
      .filter((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        return startDate && endDate && startDate <= selectedDate && selectedDate <= endDate;
      })
      .map((item) => ({
        id: `derivative-${item.id}`,
        dataInicio: formatBrazilianDate(item.data_contratacao, ""),
        dataLiquidacao: formatBrazilianDate(item.data_liquidacao, ""),
        tipo: item.nome_da_operacao || item.tipo_derivativo || "Derivativo",
        volume: derivativeVolumeGetter(item),
        valor: derivativeDetailValueGetter(item),
        ajusteMtm: Number(item.ajustes_totais_brl || 0),
        strike: Number(item.strike_montagem || 0),
        unidade: unit === "SC" ? "sc" : item.unidade || item.volume_fisico_unidade || "",
        moedaUnidade: item.moeda_unidade || "",
        status: item.status_operacao || "",
        obs: item.obs || "",
      }));

    const physicalTotalVolume = physical.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const physicalTotalValue = physical.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const physicalWeightedPrice =
      physicalTotalVolume > 0
        ? physical.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.volume || 0), 0) / physicalTotalVolume
        : 0;

    const derivativeTotalVolume = derivativesIncluded.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const derivativeTotalValue = derivativesIncluded.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const derivativeTotalMtm = derivativesIncluded.reduce((sum, item) => sum + Number(item.ajusteMtm || 0), 0);
    const derivativeWeightedStrike =
      derivativeTotalVolume > 0
        ? derivativesIncluded.reduce((sum, item) => sum + Number(item.strike || 0) * Number(item.volume || 0), 0) / derivativeTotalVolume
        : 0;

    return {
      physical,
      derivatives: derivativesIncluded,
      physicalTotals: {
        volume: physicalTotalVolume,
        value: physicalTotalValue,
        price: physicalWeightedPrice,
      },
      derivativeTotals: {
        volume: derivativeTotalVolume,
        value: derivativeTotalValue,
        mtm: derivativeTotalMtm,
        strike: derivativeWeightedStrike,
      },
    };
  }, [derivativeDetailValueGetter, derivativeRows, derivativeVolumeGetter, detailPoint, physicalDetailValueGetter, physicalRows, physicalVolumeGetter]);

  return (
    <article className="hedge-chart-card">
      <div className="hedge-chart-card-header">
        <h3>{title}</h3>
        <div className="hedge-chart-actions">
          {extraActions}
          <button type="button" className="hedge-chart-icon-btn" onClick={onFocusToggle} title="Destacar gráfico">
            ⛶
          </button>
        </div>
      </div>

      {activePoint ? (
        <aside className="hedge-floating-card">
          <div className="hedge-floating-topline">
            <div className="hedge-floating-title">{formatHedgeTitleDate(activePoint.date)}</div>
          </div>
          <div className="hedge-floating-line">
            Politica Min.:{" "}
            {activePoint.minValue != null ? `${formatHedgePercentValue(activePoint.minValue, baseValue)} — ${formatHedgeTooltipValue(activePoint.minValue, unit)}` : "—"}
          </div>
          <div className="hedge-floating-line">
            Politica Max.:{" "}
            {activePoint.maxValue != null ? `${formatHedgePercentValue(activePoint.maxValue, baseValue)} — ${formatHedgeTooltipValue(activePoint.maxValue, unit)}` : "—"}
          </div>
          <div className={`hedge-floating-total-box ${statusSummary?.tone || "ok"}`}>
            <div className="hedge-floating-total-main">
              Total Realizado: {formatHedgePercentValue(activePoint.total + activeSimulation, baseValue)} —{" "}
              {formatHedgeTooltipValue(activePoint.total + activeSimulation, unit)}
            </div>
            <div className="hedge-floating-total-status">{statusSummary?.text || "—"}</div>
          </div>
          {activeSimulation > 0 && simulatedLabel ? (
            <div className="hedge-floating-line">
              Simulação: +{formatHedgeTooltipValue(activeSimulation, unit)} {simulatedLabel}
            </div>
          ) : null}
          <div className="hedge-floating-line">
            Vendas Fisico: {formatHedgePercentValue(activePoint.physicalRaw, baseValue)} —{" "}
            {formatHedgeTooltipValue(activePoint.physicalRaw, unit)}
          </div>
          <div className="hedge-floating-line">
            Derivativos: {formatHedgePercentValue(activePoint.derivativeRaw, baseValue)} —{" "}
            {formatHedgeTooltipValue(activePoint.derivativeRaw, unit)}
          </div>
        </aside>
      ) : null}

      <div className="hedge-chart-wrap">
        <canvas ref={chartRef} />
      </div>

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
            <section className="hedge-detail-section">
              <h4>Vendas Físico (≤ dia)</h4>
              <table className="hedge-detail-table">
                <thead>
                  <tr>
                    <th>Data Início</th>
                    <th>Data Pagamento</th>
                    <th>Volume</th>
                    <th>Valor</th>
                    <th>Preço/Moeda</th>
                    <th>Local Entrega</th>
                    <th>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.physical.length ? (
                    <>
                      {detailRows.physical.map((row) => (
                        <tr key={row.id}>
                          <td>{row.dataInicio || "—"}</td>
                          <td>{row.dataPagamento || "—"}</td>
                          <td>
                            {Number(row.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                            {row.unidade ? ` ${row.unidade}` : ""}
                          </td>
                          <td>R$ {formatCurrency2(row.valor)}</td>
                          <td>
                            {row.moeda} {Number(row.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            /{row.unidade}
                          </td>
                          <td>{row.localEntrega || "—"}</td>
                          <td>{row.obs || ""}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan="2"><strong>Total</strong></td>
                        <td>
                          <strong>
                            {Number(detailRows.physicalTotals.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} sc
                          </strong>
                        </td>
                        <td><strong>R$ {formatCurrency2(detailRows.physicalTotals.value)}</strong></td>
                        <td>
                          <strong>
                            R$ {Number(detailRows.physicalTotals.price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/sc
                          </strong>
                        </td>
                        <td colSpan="2" />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan="7">Nenhuma venda físico considerada nessa data.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="hedge-detail-section">
              <h4>Derivativos (dia entre início e liquidação — inclusivo)</h4>
              <table className="hedge-detail-table">
                <thead>
                  <tr>
                    <th>Data Início</th>
                    <th>Liquidação</th>
                    <th>tipo</th>
                    <th>Volume</th>
                    <th>Valor</th>
                    <th>Ajuste MTM (R$)</th>
                    <th>Strike</th>
                    <th>Status</th>
                    <th>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.derivatives.length ? (
                    <>
                      {detailRows.derivatives.map((row) => (
                        <tr key={row.id}>
                          <td>{row.dataInicio || "—"}</td>
                          <td>{row.dataLiquidacao || "—"}</td>
                          <td>{row.tipo}</td>
                          <td>
                            {Number(row.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                            {row.unidade ? ` ${row.unidade}` : ""}
                          </td>
                          <td>R$ {formatCurrency2(row.valor)}</td>
                          <td>R$ {formatCurrency2(row.ajusteMtm)}</td>
                          <td>
                            {Number(row.strike || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                            {row.moedaUnidade ? ` ${row.moedaUnidade}` : ""}
                          </td>
                          <td>{row.status || "—"}</td>
                          <td>{row.obs || ""}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan="3"><strong>Total</strong></td>
                        <td>
                          <strong>
                            {Number(detailRows.derivativeTotals.volume || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                            {detailRows.derivatives.find((row) => row.unidade)?.unidade ? ` ${detailRows.derivatives.find((row) => row.unidade)?.unidade}` : ""}
                          </strong>
                        </td>
                        <td><strong>R$ {formatCurrency2(detailRows.derivativeTotals.value)}</strong></td>
                        <td><strong>R$ {formatCurrency2(detailRows.derivativeTotals.mtm)}</strong></td>
                        <td>
                          <strong>
                            {Number(detailRows.derivativeTotals.strike || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </td>
                        <td colSpan="2" />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan="9">Nenhum derivativo considerado nessa data.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      ) : null}
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
          itemStyle: { color: "rgba(251, 146, 60, 0.85)", borderRadius: [10, 0, 0, 10] },
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
          itemStyle: { color: "rgba(250, 204, 21, 0.45)", borderRadius: [0, 10, 10, 0] },
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
        <h3>{title}</h3>
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
    <article className="hedge-chart-card">
      <div className="hedge-chart-card-header">
        <h3>{title}</h3>
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

function HedgePolicyDashboard({ dashboardFilter }) {
  const { matchesDashboardFilter, options } = useDashboardFilter();
  const [frequency, setFrequency] = useState("monthly");
  const [focusedChart, setFocusedChart] = useState(null);
  const [showSimulationBox, setShowSimulationBox] = useState(false);
  const [simulationVolume, setSimulationVolume] = useState("");
  const [simulationValue, setSimulationValue] = useState("");
  const [simulationCurrency, setSimulationCurrency] = useState("BRL");
  const [usdBrlRate, setUsdBrlRate] = useState(0);
  const [policies, setPolicies] = useState([]);
  const [physicalSales, setPhysicalSales] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [budgetCosts, setBudgetCosts] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("hedge-policies"),
      resourceService.listAll("physical-sales"),
      resourceService.listAll("physical-payments"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("budget-costs"),
      resourceService.listAll("crop-boards"),
      resourceService.fetchJsonCached("sheety-cotacoes-spot", SHEETY_QUOTES_URL).catch(() => ({ planilha1: [] })),
    ]).then(([
      policiesResponse,
      physicalResponse,
      physicalPaymentsResponse,
      derivativeResponse,
      budgetResponse,
      cropBoardResponse,
      sheetyResponse,
    ]) => {
      if (!isMounted) return;
      setPolicies(policiesResponse || []);
      setPhysicalSales(physicalResponse || []);
      setPhysicalPayments(physicalPaymentsResponse || []);
      setDerivatives(derivativeResponse || []);
      setBudgetCosts(budgetResponse || []);
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
  const filteredPhysicalSales = useMemo(
    () => physicalSales.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, physicalSales],
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
  const resolveCultureLabel = (value) => {
    if (!value) return "Sem ativo";
    if (Array.isArray(value)) return resolveCultureLabel(value[0]);
    if (typeof value === "string" || typeof value === "number") {
      return cultureLabelById.get(String(value)) || String(value);
    }
    const nestedId = value.id != null ? cultureLabelById.get(String(value.id)) : null;
    return nestedId || value.ativo || value.cultura || value.nome || value.label || value.descricao || "Sem ativo";
  };
  const derivativeStandardVolumeGetter = useMemo(
    () => (item) => getDerivativeVolumeInStandardUnit(item, options.exchanges || [], resolveCultureLabel),
    [options.exchanges, resolveCultureLabel],
  );
  const filteredCommodityDerivatives = useMemo(
    () => filteredDerivatives.filter((item) => normalizeText(item.moeda_ou_cmdtye) === "cmdtye"),
    [filteredDerivatives],
  );

  const parsedSimulationVolume = parseLocalizedInputNumber(simulationVolume) || 0;
  const parsedSimulationValue = parseLocalizedInputNumber(simulationValue) || 0;
  const hasSimulationValues = parsedSimulationVolume > 0 || parsedSimulationValue > 0;
  const simulatedCostValue =
    simulationCurrency === "USD" ? parsedSimulationValue * Math.max(usdBrlRate, 0) : parsedSimulationValue;
  const simulationLabel = simulationCurrency === "USD" ? "convertido em R$" : "adicionado em R$";

  const resetSimulation = () => {
    setSimulationVolume("");
    setSimulationValue("");
    setSimulationCurrency("BRL");
    setShowSimulationBox(false);
  };

  return (
    <section className="hedge-dashboard-shell">
      <div className="hedge-dashboard-toolbar">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
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
      <section className={`hedge-dashboard-grid${focusedChart ? " single-visible" : ""}`}>
        {(!focusedChart || focusedChart === "cost") ? (
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
            onFocusToggle={() => setFocusedChart((current) => (current === "cost" ? null : "cost"))}
            simulatedIncrement={simulatedCostValue}
            simulatedLabel={simulationLabel}
            extraActions={
              <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="hedge-chart-select">
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            }
          />
        ) : null}
        {(!focusedChart || focusedChart === "production") ? (
          <HedgePolicyChart
            title="Gráfico 2 — Hedge produção liquida (sc)"
            unit="SC"
            frequency={frequency}
            baseValue={productionBase}
            physicalRows={filteredPhysicalSales}
            derivativeRows={filteredCommodityDerivatives}
            policies={filteredPolicies}
            physicalValueGetter={getPhysicalVolumeValue}
            derivativeValueGetter={derivativeStandardVolumeGetter}
            derivativeVolumeGetter={derivativeStandardVolumeGetter}
            physicalDetailValueGetter={(item) => getPhysicalCostValue(item, usdBrlRate)}
            derivativeDetailValueGetter={(item) => getDerivativeCostValue(item, usdBrlRate)}
            onFocusToggle={() => setFocusedChart((current) => (current === "production" ? null : "production"))}
            simulatedIncrement={parsedSimulationVolume}
            simulatedLabel="adicionado em volume"
          />
        ) : null}
      </section>
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
      resourceService.listAll("crop-boards"),
      resourceService.listAll("physical-payments"),
      resourceService.listAll("cash-payments"),
      resourceService.listAll("physical-sales"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("physical-quotes"),
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
        const selectedLocalities = Array.isArray(dashboardFilter?.localidade) ? dashboardFilter.localidade : [];
        const quoteSeasonId =
          item?.safra && typeof item.safra === "object" && item.safra.id != null
            ? String(item.safra.id)
            : item?.safra != null
              ? String(item.safra)
              : "";
        const seasonMatches = !selectedSeasons.length || (quoteSeasonId && selectedSeasons.includes(quoteSeasonId));

        const normalizedQuoteLocality = normalizeDashboardLocality(item?.localidade);
        const localityMatches =
          !selectedLocalities.length ||
          selectedLocalities.some((value) => {
            const normalizedSelected = normalizeDashboardLocality(value);
            return normalizedSelected === normalizedQuoteLocality;
          });

        const cultureMatches =
          !selectedCropLabels.length ||
          selectedCropLabels.some((label) => normalizeText(item.cultura_texto).includes(label));

        return seasonMatches && localityMatches && cultureMatches;
      }),
    [dashboardFilter, physicalQuotes, selectedCropLabels],
  );

  const baseModel = useMemo(() => {
    const hasSeasonFilter = Array.isArray(dashboardFilter?.safra) && dashboardFilter.safra.length > 0;
    const hasLocalityFilter = Array.isArray(dashboardFilter?.localidade) && dashboardFilter.localidade.length > 0;
    const volumePgtoFisico = filteredPhysicalPayments.reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0);
    const productionTotal = filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0);
    const producaoLiquida = Math.max(productionTotal - volumePgtoFisico, 0);

    const compromissosUsd = filteredCashPayments
      .filter((item) => isUsdCurrency(item.moeda))
      .reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0);

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

      if (!hasSeasonFilter && !hasLocalityFilter) {
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
  }, [dashboardFilter?.localidade, dashboardFilter?.safra, filteredCashPayments, filteredCropBoards, filteredDerivatives, filteredPhysicalPayments, filteredPhysicalQuotes, filteredPhysicalSales]);

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

      <div className="currency-hedge-chart card">
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

function PriceCompositionVerticalChart({ title, bars, unitLabel, onSelectBar }) {
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
  const formatTooltipValue = (value) => `${value >= 0 ? "" : "-"}${unitLabel} ${formatCurrency2(Math.abs(value))}`;
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
                {unitLabel} {formatCurrency2(Math.abs(bar.totalValue))}
              </div>
            ))}
          </div>
          <div className="price-comp-y-axis" style={{ height: `${plotAreaHeight}px` }}>
            {tickValues.map((value) => (
              <div key={value} className="price-comp-y-tick" style={{ top: `${getVerticalPosition(value)}px` }}>
                {value < 0 ? "-" : ""}
                {unitLabel} {formatCurrency2(Math.abs(value))}
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
                            title={`${segment.label}: ${formatCurrency2(segment.value)}`}
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

function PriceCompositionVerticalEChart({ bars, unitLabel, onSelectBar }) {
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
  const seriesDefs = normalizedBars.flatMap((bar) => bar.segments.map((segment) => segment.label));
  const uniqueSeries = [...new Set(seriesDefs)];
  const option = useMemo(
    () => ({
      animationDuration: 250,
      grid: { top: 18, right: 12, bottom: 38, left: 56, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const index = params[0]?.dataIndex ?? 0;
          const bar = normalizedBars[index];
          const lines = bar.segments
            .map(
              (segment) =>
                `<span style="display:inline-block;margin-right:6px;border-radius:999px;width:8px;height:8px;background:${segment.color}"></span>${segment.label}: ${segment.value >= 0 ? "" : "-"}${unitLabel} ${formatCurrency2(Math.abs(segment.value))}`,
            )
            .join("<br/>");
          return `<strong>${bar.label}</strong><br/>Total: ${bar.totalValue >= 0 ? "" : "-"}${unitLabel} ${formatCurrency2(Math.abs(bar.totalValue))}${lines ? `<br/>${lines}` : ""}`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(100, 116, 139, 0.75)" } },
        axisLabel: { color: "#475569", fontWeight: 700, fontSize: 18, margin: 18 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
          formatter: (value) => `${value < 0 ? "-" : ""}${unitLabel} ${formatCurrency2(Math.abs(value))}`,
        },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
      },
      series: uniqueSeries.map((seriesLabel) => ({
        name: seriesLabel,
        type: "bar",
        stack: "price-comp",
        barWidth: "58%",
        emphasis: { focus: "series" },
        itemStyle: {
          borderRadius: [18, 18, 0, 0],
        },
        data: normalizedBars.map((bar) => {
          const segment = bar.segments.find((item) => item.label === seriesLabel);
          return segment
            ? {
                value: segment.value,
                itemStyle: {
                  color: segment.color,
                  borderRadius: segment.value >= 0 ? [18, 18, 0, 0] : [0, 0, 18, 18],
                },
              }
            : 0;
        }),
      })),
    }),
    [categories, normalizedBars, uniqueSeries, unitLabel],
  );
  const chartEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        onSelectBar?.(normalizedBars[params.dataIndex]);
      },
    }),
    [normalizedBars, onSelectBar],
  );

  return (
    <article className="price-comp-pane">
      <div className="price-comp-vertical-chart">
        <div className="price-comp-column-totals" style={{ gridTemplateColumns: `repeat(${normalizedBars.length}, minmax(0, 1fr))`, marginBottom: 12, marginLeft: 56 }}>
          {normalizedBars.map((bar) => (
            <div key={bar.label} className="price-comp-column-total">
              {bar.totalValue >= 0 ? "" : "-"}
              {unitLabel} {formatCurrency2(Math.abs(bar.totalValue))}
            </div>
          ))}
        </div>
        <ReactECharts option={option} onEvents={chartEvents} style={{ height: 320 }} opts={{ renderer: "svg" }} />
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
  const [currencyMode, setCurrencyMode] = useState("AMBOS_R$");
  const [adjustmentMode, setAdjustmentMode] = useState("ALL");
  const [soldVolumeInput, setSoldVolumeInput] = useState("");
  const [hasManualVolume, setHasManualVolume] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [includeClosedDerivatives, setIncludeClosedDerivatives] = useState(true);
  const [includeOpenDerivatives, setIncludeOpenDerivatives] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("crop-boards"),
      resourceService.listAll("physical-quotes"),
    ]).then(([physicalSalesResponse, derivativesResponse, cropBoardsResponse, quotesResponse]) => {
      if (!isMounted) return;
      setPhysicalSales(physicalSalesResponse || []);
      setDerivatives(derivativesResponse || []);
      setCropBoards(cropBoardsResponse || []);
      setPhysicalQuotes(quotesResponse || []);
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
    () => derivatives.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, derivatives, matchesDashboardFilter],
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

  const defaultSoldVolume = useMemo(() => {
    if (currencyMode === "R$") return salesSummary.brlVolume;
    if (currencyMode === "U$") return salesSummary.usdVolume;
    return salesSummary.totalVolume;
  }, [currencyMode, salesSummary.brlVolume, salesSummary.totalVolume, salesSummary.usdVolume]);

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
    return filteredDerivatives
      .map((item) => {
        const originalValue = Number(item.ajustes_totais_brl || 0);
        const fallbackUsd = usdRate > 0 ? originalValue / usdRate : 0;
        const originalUsd =
          Number(item.ajustes_totais_moeda_original || item.ajustes_totais_usd || item.volume_financeiro_valor_moeda_original || 0) ||
          fallbackUsd;
        const derivativeCurrency = isUsdCurrency(item.volume_financeiro_moeda || item.moeda_unidade || item.moeda_contrato) ? "U$" : "R$";
        const amount =
          currencyMode === "U$"
            ? originalUsd
            : currencyMode === "R$"
              ? originalValue
              : originalValue;
        const classification = normalizeText(item.moeda_ou_cmdtye) === "moeda" ? "Cambio" : "Bolsa";
        const status = normalizeText(item.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";
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
      .filter((item) => adjustmentMode === "ALL" || currencyMode === "AMBOS_R$" || item.currency === currencyMode);
  }, [adjustmentMode, currencyMode, filteredDerivatives, usdRate]);

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

  const getDerivativeRowsForDetail = (classification, includeOpen, includeClosed) =>
    derivativeOperationRows.filter((item) => {
      const classMatches = !classification || item.classificacao === classification;
      const statusMatches =
        (includeOpen && item.status !== "Encerrado") ||
        (includeClosed && item.status === "Encerrado");
      return classMatches && statusMatches;
    });

  const salesOperationRows = useMemo(
    () =>
      filteredSales.map((item) => ({
        id: `physical-${item.id}`,
        subgrupo:
          item.subgrupo?.subgrupo ||
          item.subgrupos?.map?.((entry) => entry?.subgrupo || entry).filter(Boolean).join(", ") ||
          "—",
        tipo: "Fisico",
        classificacao: "—",
        data: formatBrazilianDate(item.data_pagamento || item.data_entrega || item.data_negociacao, "—"),
        valor: currencyMode === "U$" ? Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0) : isUsdCurrency(item.moeda_contrato) ? Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0) * Number(item.dolar_de_venda || usdRate || 0) : Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0),
        volume: Math.abs(Number(item.volume_fisico || 0)),
        unidade: item.unidade_contrato || "sc",
        precoStrike: Number(item.preco || 0),
        instituicao: item.contraparte?.contraparte || item.contraparte?.obs || item.contraparte?.nome || "—",
        status: "—",
      })),
    [currencyMode, filteredSales, usdRate],
  );

  const derivativeOperationRows = useMemo(
    () =>
      normalizedDerivatives.map((item) => ({
        id: `derivative-${item.id}`,
        subgrupo: "—",
        tipo: "Derivativo",
        classificacao: item.classificacao,
        data: "—",
        valor: Number(item.amount || 0),
        volume: Number(item.volume || 0),
        unidade: "sc",
        precoStrike: Number(item.strike || 0),
        instituicao: item.institution,
        status: item.status,
        sourceKey: item.sourceKey || "Sem bolsa",
      })),
    [normalizedDerivatives],
  );

  const buildDetailModal = (title, rows) => {
    const totalValue = rows.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalVolume = rows.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const weightedStrike =
      totalVolume > 0 ? rows.reduce((sum, item) => sum + Number(item.precoStrike || 0) * Number(item.volume || 0), 0) / totalVolume : 0;
    setDetailModal({
      title,
      rows,
      totals: { totalValue, totalVolume, weightedStrike },
    });
  };

  const openVerticalDetail = (groupKey, row) => {
    if (groupKey === "G1") {
      if (row.label === "Fisico") {
        buildDetailModal(`Fisico (a termo) (${selectedCurrencyLabel})`, salesOperationRows);
        return;
      }
      if (row.label === "Bolsa") {
        buildDetailModal(`Derivativos Bolsa (${selectedCurrencyLabel})`, getDerivativeRowsForDetail("Bolsa", includeOpenDerivatives, includeClosedDerivatives));
        return;
      }
      if (row.label === "Cambio") {
        buildDetailModal(`Derivativos Cambio (${selectedCurrencyLabel})`, getDerivativeRowsForDetail("Cambio", includeOpenDerivatives, includeClosedDerivatives));
        return;
      }
      buildDetailModal(`TOTAL (${selectedCurrencyLabel})`, [...salesOperationRows, ...getDerivativeRowsForDetail(null, includeOpenDerivatives, includeClosedDerivatives)]);
      return;
    }

    if (row.label === "Fisico") {
      buildDetailModal(`Fisico vendido (${selectedCurrencyLabel})`, salesOperationRows);
      return;
    }
    if (row.label === "Bolsa") {
      buildDetailModal(`Derivativos Bolsa (${selectedCurrencyLabel})`, getDerivativeRowsForDetail("Bolsa", includeOpenDerivatives, includeClosedDerivatives));
      return;
    }
    if (row.label === "Cambio") {
      buildDetailModal(`Derivativos Cambio (${selectedCurrencyLabel})`, getDerivativeRowsForDetail("Cambio", includeOpenDerivatives, includeClosedDerivatives));
      return;
    }
    buildDetailModal(`TOTAL (${selectedCurrencyLabel})`, [...salesOperationRows, ...getDerivativeRowsForDetail(null, includeOpenDerivatives, includeClosedDerivatives)]);
  };

  const selectedCurrencyLabel = currencyMode === "U$" ? "U$" : "R$";
  const soldAveragePrice =
    currencyMode === "U$"
      ? salesSummary.usdVolume > 0
        ? salesSummary.usdPriceWeighted / salesSummary.usdVolume
        : 0
      : salesSummary.totalVolume > 0
        ? salesSummary.totalRevenueBrl / salesSummary.totalVolume
        : 0;
  const basisAverage = salesSummary.totalVolume > 0 ? salesSummary.basisWeighted / salesSummary.totalVolume : 0;
  const dollarAverage = salesSummary.totalVolume > 0 ? salesSummary.dollarWeighted / salesSummary.totalVolume : usdRate;
  const premiumAverage = selectedDivisor > 0 ? derivativeSummary.closed / selectedDivisor : 0;

  const mtmUnitValue = currencyMode === "U$" ? quoteAvgUsd : quoteAvgBrl;
  const soldRevenueValue = currencyMode === "U$" ? salesSummary.totalRevenueUsd : salesSummary.totalRevenueBrl;
  const unsoldVolume = Math.max(productionTotal - salesSummary.totalVolume, 0);
  const mtmRevenueValue = mtmUnitValue * unsoldVolume;
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
  const physicalTotalRevenueValue = soldRevenueValue + mtmRevenueValue;
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
        <article className="card stat-card">
          <span>Preco final sem derivativos</span>
          <strong>{selectedCurrencyLabel} {formatCurrency2(soldAveragePrice)}</strong>
        </article>
        <article className="card stat-card">
          <span>Preco fisico final + Derivativos</span>
          <strong>{selectedCurrencyLabel} {formatCurrency2(soldAveragePrice + g1BolsaValue + g1CambioValue)}</strong>
        </article>
        <article className="card stat-card">
          <span>Basis medio</span>
          <strong>{basisAverage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </article>
        <article className="card stat-card">
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
        <section className="price-comp-pair-card card">
          <div className="price-comp-pair-row">
            <VerticalChartComponent bars={verticalRowsG1} unitLabel={selectedCurrencyLabel} onSelectBar={(row) => openVerticalDetail("G1", row)} />
          </div>
        </section>

        <section className="price-comp-pair-card card">
          <div className="price-comp-pair-row">
            <VerticalChartComponent bars={verticalRowsG5} unitLabel={selectedCurrencyLabel} onSelectBar={(row) => openVerticalDetail("G5", row)} />
          </div>
        </section>
      </div>

      <section className="price-comp-bottom-grid">
        <article className="price-comp-summary-card card">
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

        <article className="price-comp-summary-card card">
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

      {detailModal ? (
        <div className="component-popup-backdrop" onClick={() => setDetailModal(null)}>
          <div className="component-popup price-comp-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="component-popup-close" onClick={() => setDetailModal(null)}>
              ×
            </button>
            <div className="component-popup-header">
              <strong>{detailModal.title}</strong>
            </div>
            <div className="price-comp-modal-body">
              <h3>Operacoes</h3>
              <table className="component-popup-table">
                <thead>
                  <tr>
                    <th>Subgrupo</th>
                    <th>Tipo</th>
                    <th>Classificacao</th>
                    <th>Data vencimento</th>
                    <th>Valor ({selectedCurrencyLabel})</th>
                    <th>Volume</th>
                    <th>Preco/Strike</th>
                    <th>Instituicao</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.rows.length ? (
                    <>
                      {detailModal.rows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.subgrupo || "—"}</td>
                          <td>{row.tipo}</td>
                          <td>{row.classificacao || "—"}</td>
                          <td>{row.data || "—"}</td>
                          <td>{selectedCurrencyLabel} {formatCurrency2(row.valor)}</td>
                          <td>{formatNumber0(row.volume)} {row.unidade || ""}</td>
                          <td>{formatCurrency2(row.precoStrike)}</td>
                          <td>{row.instituicao || "—"}</td>
                          <td>{row.status || "—"}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Total</strong></td>
                        <td />
                        <td />
                        <td />
                        <td><strong>{selectedCurrencyLabel} {formatCurrency2(detailModal.totals.totalValue)}</strong></td>
                        <td><strong>{formatNumber0(detailModal.totals.totalVolume)}</strong></td>
                        <td><strong>{formatCurrency2(detailModal.totals.weightedStrike)}</strong></td>
                        <td />
                        <td />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan="9">Nenhuma operacao encontrada para esta coluna.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StrategiesTriggersDashboard({ dashboardFilter }) {
  const [strategies, setStrategies] = useState([]);
  const [triggers, setTriggers] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([resourceService.listAll("strategies"), resourceService.listAll("strategy-triggers")]).then(([strategiesResponse, triggersResponse]) => {
      if (!isMounted) return;
      setStrategies(strategiesResponse || []);
      setTriggers(triggersResponse || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

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

  const activeStrategies = filteredStrategies.filter((item) => !normalizeText(item.status).includes("inativ")).length;
  const activeTriggers = filteredTriggers.filter((item) => !normalizeText(item.status_gatilho).includes("inativ")).length;
  const openTriggers = filteredTriggers.filter((item) => !normalizeText(item.status_gatilho).includes("dispar") && !normalizeText(item.status_gatilho).includes("encerr")).length;
  const monitoredCrops = new Set(filteredTriggers.map((item) => readCultureLabel(item.cultura)).filter((value) => value && normalizeText(value) !== "sem cultura")).size;
  const nextExpiringStrategies = [...filteredStrategies]
    .filter((item) => parseDashboardDate(item.data_validade))
    .sort((left, right) => parseDashboardDate(left.data_validade) - parseDashboardDate(right.data_validade))
    .slice(0, 6);
  const triggerStatusSlices = useMemo(() => {
    const waiting = filteredTriggers.filter((item) => normalizeText(item.status_gatilho).includes("monitor") || normalizeText(item.status_gatilho).includes("aberto")).length;
    const triggered = filteredTriggers.filter((item) => normalizeText(item.status_gatilho).includes("dispar") || normalizeText(item.status_gatilho).includes("acion")).length;
    const inactive = filteredTriggers.filter((item) => normalizeText(item.status_gatilho).includes("inativ") || normalizeText(item.status_gatilho).includes("encerr")).length;
    const items = [
      { label: "Monitorando", value: waiting, color: "#0f766e" },
      { label: "Disparados", value: triggered, color: "#f59e0b" },
      { label: "Inativos", value: inactive, color: "#94a3b8" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem gatilhos", value: 1, color: "#cbd5e1" }];
  }, [filteredTriggers]);
  const triggerCultureBars = useMemo(() => {
    const map = new Map();
    filteredTriggers.forEach((item) => {
      const label = readCultureLabel(item.cultura);
      if (!label || normalizeText(label) === "sem cultura") return;
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
  }, [filteredTriggers]);

  return (
    <section className="risk-kpi-shell">
      <section className="stats-grid risk-kpi-grid">
        <article className="card stat-card">
          <span>Estratégias</span>
          <strong>{formatNumber0(filteredStrategies.length)}</strong>
          <span className="stat-card-secondary-label">Ativas</span>
          <strong className="stat-card-secondary-value">{formatNumber0(activeStrategies)}</strong>
        </article>
        <article className="card stat-card">
          <span>Gatilhos</span>
          <strong>{formatNumber0(filteredTriggers.length)}</strong>
          <span className="stat-card-secondary-label">Em monitoramento</span>
          <strong className="stat-card-secondary-value">{formatNumber0(openTriggers)}</strong>
        </article>
        <article className="card stat-card">
          <span>Gatilhos ativos</span>
          <strong>{formatNumber0(activeTriggers)}</strong>
        </article>
        <article className="card stat-card">
          <span>Ativos monitorados</span>
          <strong>{formatNumber0(monitoredCrops)}</strong>
        </article>
      </section>

      <section className="content-grid">
        <div className="chart-card chart-card-large">
          <div className="chart-card-header">
            <div>
              <h3>Estratégias mais próximas do vencimento</h3>
              <p className="muted">Priorização rápida das estratégias que pedem revisão primeiro.</p>
            </div>
          </div>
          <div className="risk-kpi-list">
            {nextExpiringStrategies.length ? (
              nextExpiringStrategies.map((item) => (
                <div key={item.id} className="risk-kpi-row">
                  <div>
                    <strong>{item.descricao_estrategia || "Estratégia sem descrição"}</strong>
                    <span>{item.status || "Sem status"}</span>
                  </div>
                  <b>{formatBrazilianDate(item.data_validade)}</b>
                </div>
              ))
            ) : (
              <p className="muted">Sem estratégias com data de validade no filtro atual.</p>
            )}
          </div>
        </div>

        <DonutChart centerLabel="Gatilhos" centerValue={`${filteredTriggers.length}`} slices={triggerStatusSlices} />
        <ScenarioBars data={triggerCultureBars.length ? triggerCultureBars : [{ label: "Sem dados", value: 1, formatted: "0 gatilhos", color: "#cbd5e1" }]} />
      </section>
    </section>
  );
}

const dashboardContent = {
  cashflow: {
    title: "Fluxo de Caixa",
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
    description: "Leitura consolidada entre venda fisica em U$, bolsa e dolar com detalhamento por periodo.",
  },
  commercialRisk: {
    title: "Resumo",
    description: "",
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
    title: "MTM",
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

export function DashboardPage({ kind = "cashflow" }) {
  const content = dashboardContent[kind] || dashboardContent.cashflow;
  const { filter, options } = useDashboardFilter();
  const cashflowFilter = useMemo(
    () => ({
      ...filter,
      cultura: [],
      safra: [],
      localidade: [],
    }),
    [filter],
  );

  if (kind === "cashflow") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <CashflowDashboard dashboardFilter={cashflowFilter} compact />
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
        <PageHeader title={content.title} description={content.description} />
        <CommercialRiskDashboard dashboardFilter={filter} />
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
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
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
        <PriceCompositionDashboard dashboardFilter={filter} />
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
