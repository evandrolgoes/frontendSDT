import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ResourceTable } from "../components/ResourceTable";
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

function CommercialRiskQuotesSummaryCard({ rows, onOpen }) {
  const marqueeRepeatCount = 7;
  const marqueeCenterSequenceIndex = Math.floor(marqueeRepeatCount / 2);
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
    const startingScroll = loopWidth * marqueeCenterSequenceIndex;
    if (loopWidth && container.scrollLeft < loopWidth) {
      container.scrollLeft = startingScroll;
    }
    normalizeMarqueeScroll();
    animationFrameId = window.requestAnimationFrame(step);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [carouselRows.length, isMarqueeHovered, marqueeCenterSequenceIndex, marqueeRows.length]);

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

function CommercialRiskNewsSummaryCard({ rows, onOpen, onOpenPost }) {
  const latestPosts = useMemo(() => {
    const published = (Array.isArray(rows) ? rows : []).filter((item) => item?.status_artigo !== "draft");
    const source = published.length ? published : (Array.isArray(rows) ? rows : []);
    return [...source]
      .sort((left, right) => new Date(right?.data_publicacao || right?.created_at || 0) - new Date(left?.data_publicacao || left?.created_at || 0))
      .slice(0, 12);
  }, [rows]);

  return (
    <div className="card stat-card risk-kpi-news-stat-card">
      <button type="button" className="stat-card-primary-title risk-kpi-card-title risk-kpi-news-stat-title" onClick={onOpen}>
        Blog/News
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

const isMarketNewsImageAttachment = (attachment) => /\.(png|jpe?g|gif|webp|svg)$/i.test(getMarketNewsAttachmentUrl(attachment));

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

function UpcomingMaturitiesCard({ rows, onOpenItem }) {
  return (
    <article className="card stat-card risk-kpi-maturity-card">
      <h2 className="stat-card-primary-title risk-kpi-card-title">Próximos vencimentos</h2>
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

function DonutChart({ slices, centerLabel, centerValue, onSliceClick }) {
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
    <div className="chart-card">
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
          tableHeight="82vh"
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
          : cashPayments;
    const current = sourceRows.find((row) => String(row.id) === String(item.recordId));
    if (!current) return;
    setEditingOperationItem({ ...current, resourceKey: item.resourceKey });
    setOperationFormError("");
  }, [cashPayments, derivatives, physicalPayments, sales]);

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

function CommercialRiskLongShortChart({
  rows,
  cultureButtons = [],
  selectedCultureIds = [],
  onToggleCulture,
  onClearCultures,
  referenceDate = null,
  onOpenDetailTable,
}) {
  const orderedSeries = [
    { key: "nadaFeito", label: "Nada feito", color: "#ff6a2a", clickable: false },
    { key: "derivatives", label: "Vendas via Derivativos", color: "#b8efb7", clickable: true },
    { key: "physical", label: "Vendas via Físico (a termo)", color: "#48bf3b", clickable: true },
    { key: "physicalPayments", label: "Pgtos Físico", color: "#355c35", clickable: true },
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
        fontSize: 11,
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
}) {
  const summaryChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit: "SC",
        frequency: "monthly",
        baseValue: productionBase,
        physicalRows,
        derivativeRows,
        policies,
        physicalValueGetter: getPhysicalVolumeValue,
        derivativeValueGetter: derivativeVolumeGetter,
      }),
    [derivativeRows, derivativeVolumeGetter, physicalRows, policies, productionBase],
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
            derivativeVolumeGetter={derivativeVolumeGetter}
            onFocusToggle={onOpenHedgePolicy || (() => {})}
            showFloatingCard={false}
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
  ].filter((item) => item.value > 0);
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
  const distributionRows = distributionSlices.length
    ? distributionSlices
    : [
        { label: "Físico", value: 0, metricLabel: "—", color: "rgba(250, 204, 21, 0.75)" },
        { label: "Derivativos", value: 0, metricLabel: "—", color: "rgba(251, 146, 60, 0.85)" },
      ];
  const physicalRow = distributionRows.find((item) => item.label === "Físico") || distributionRows[0];
  const derivativeRow = distributionRows.find((item) => item.label === "Derivativos") || distributionRows.at(-1);

  return (
    <>
      <article className="chart-card risk-kpi-gauge-card">
        <div className="risk-kpi-chart-card-head">
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

      <article className="chart-card risk-kpi-mini-gauge-card risk-kpi-distribution-card">
        <div className="risk-kpi-chart-card-head">
          <h2 className="risk-kpi-chart-card-title risk-kpi-card-title">Distribuição</h2>
        </div>
        <div className="risk-kpi-distribution-shell">
          <div className="risk-kpi-distribution-meta risk-kpi-distribution-meta--left">
            <strong>{physicalRow?.label || "Físico"}</strong>
            <span>{Number(physicalRow?.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
            <span>{physicalRow?.metricLabel || "—"}</span>
            {physicalDetailLines.map((line, index) => (
              <small key={`physical-detail-${index}`}>{line}</small>
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
                strokeDashoffset={-physicalArc - 6}
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
            <span>{Number(derivativeRow?.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
            <span>{derivativeRow?.metricLabel || "—"}</span>
            {derivativeDetailLines.map((line, index) => (
              <small key={`derivative-detail-${index}`}>{line}</small>
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
  rows = [],
}) {
  return (
    <article className={`chart-card risk-kpi-hedge-summary-card is-${tone}`}>
      <div className="chart-card-header">
        <div>
          <h3 className="risk-kpi-card-title">{title}</h3>
        </div>
      </div>
      <div className="risk-kpi-hedge-summary-lines">
        <div className={`risk-kpi-hedge-summary-total ${tone}`}>{summaryLine}</div>
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
    const wDen = selectedBar.ops.reduce((sum, item) => sum + Math.abs(Number(item.valor) || 0), 0);
    const wNum = selectedBar.ops.reduce((sum, item) => sum + (Number(item.strike) || 0) * Math.abs(Number(item.valor) || 0), 0);
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

Chart.register(stackTotalsPlugin);

function ComponentSalesDashboard({ dashboardFilter }) {
  const defaultDateRange = useMemo(() => buildCashflowDefaultDateRange(), []);

  const [interval, setInterval] = useState("daily");
  const [dateFrom, setDateFrom] = useState(defaultDateRange.fromBrazilian);
  const [dateTo, setDateTo] = useState(defaultDateRange.toBrazilian);
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [datasetVisibility, setDatasetVisibility] = useState(() =>
    Object.fromEntries(COMPONENT_DATASETS.map((dataset) => [dataset.key, true])),
  );
  const {
    rows,
    sales,
    setSales,
    derivatives,
    setDerivatives,
  } = useComponentSalesSource(dashboardFilter, dateFrom, dateTo);
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales,
    setSales,
    derivatives,
    setDerivatives,
  });
  const chartState = useMemo(
    () => buildComponentSalesChartState(rows, interval, datasetVisibility),
    [datasetVisibility, interval, rows],
  );
  const openTableModal = useCallback((period, seriesName) => {
    const selectedOps = chartState.opsIndex.get(`${period}||${seriesName}`) || [];
    const definition = seriesName.startsWith("Venda Físico")
      ? resourceDefinitions.physicalSales
      : resourceDefinitions.derivativeOperations;
    const sourceRows = definition?.resource === "physical-sales" ? sales : derivatives;
    const ids = new Set(
      selectedOps
        .map((item) => item.recordId)
        .filter(Boolean)
        .map(String),
    );
    const operationCodes = new Set(
      selectedOps
        .map((item) => item.operationCode)
        .filter(Boolean)
        .map(String),
    );
    const filteredRows = sourceRows.filter((row) =>
      ids.has(String(row.id)) || operationCodes.has(String(row.cod_operacao_mae || "")),
    );
    if (!selectedOps.length && !filteredRows.length) return;
    setSelectedTableModal({
      title: `${seriesName} — ${period}`,
      definition,
      rows: filteredRows,
    });
  }, [chartState.opsIndex, derivatives, sales]);
  const chartOption = useMemo(() => ({
    animationDuration: 250,
    grid: { top: 28, right: 18, bottom: 56, left: 18, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const grouped = new Map();
        params
          .filter((item) => Number(item.value || 0) > 0)
          .forEach((item) => {
            const definition = COMPONENT_DATASETS.find((dataset) => dataset.key === item.seriesName);
            const baseKey = definition?.baseKey || item.seriesName;
            const meta = chartState.metaMap.get(`${item.axisValue}||${item.seriesName}`);
            const current = grouped.get(baseKey) || {
              marker: `<span style="display:inline-block;margin-right:6px;border-radius:999px;width:10px;height:10px;background:${COMPONENT_CATEGORY_GROUPS.find((group) => group.label === baseKey)?.color || item.color};"></span>`,
              value: 0,
              weightedStrikeNum: 0,
              weightedStrikeDen: 0,
              unit: "",
            };
            const value = Number(item.value || 0);
            current.value += value;
            if (meta?.wAvgStrike != null && value > 0) {
              current.weightedStrikeNum += Number(meta.wAvgStrike) * value;
              current.weightedStrikeDen += value;
              if (!current.unit && meta.moeda_unidade) current.unit = meta.moeda_unidade;
            }
            grouped.set(baseKey, current);
          });
        const rowsHtml = Array.from(grouped.entries())
          .map(([label, item]) => {
            const strike = item.weightedStrikeDen > 0
              ? `<br/>Strike medio: ${Number(item.weightedStrikeNum / item.weightedStrikeDen).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${item.unit ? ` ${item.unit}` : ""}`
              : "";
            return `${item.marker}${label} — U$ ${Number(item.value || 0).toLocaleString("pt-BR")}${strike}`;
          })
          .join("<br/>");
        if (!rowsHtml) return "";
        return `<strong>${params[0]?.axisValue || ""}</strong><br/>${rowsHtml}`;
      },
    },
    legend: { show: false },
    xAxis: {
      type: "category",
      data: chartState.labels,
      triggerEvent: true,
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
    series: (() => {
      const visibleDatasets = chartState.datasets.filter((dataset) => dataset.hidden !== true);
      const lastVisibleByStack = visibleDatasets.reduce((acc, dataset) => ({ ...acc, [dataset.stack]: dataset.label }), {});
      const totalsByLabel = new Map((chartState.periods || []).map((period) => [period.label, period]));

      return chartState.datasets.map((dataset) => ({
        name: dataset.label,
        type: "bar",
        stack: dataset.stack,
        barMaxWidth: 52,
        cursor: "pointer",
        itemStyle: { color: dataset.backgroundColor, borderRadius: [10, 10, 0, 0] },
        label: {
          show: true,
          position: lastVisibleByStack[dataset.stack] === dataset.label ? "top" : "inside",
          color: lastVisibleByStack[dataset.stack] === dataset.label ? "#111827" : "#ffffff",
          fontSize: 11,
          fontWeight: 700,
          backgroundColor: lastVisibleByStack[dataset.stack] === dataset.label ? "#ffffff" : "transparent",
          borderColor: lastVisibleByStack[dataset.stack] === dataset.label ? "rgba(15, 23, 42, 0.35)" : "transparent",
          borderWidth: lastVisibleByStack[dataset.stack] === dataset.label ? 1 : 0,
          borderRadius: lastVisibleByStack[dataset.stack] === dataset.label ? 8 : 0,
          padding: lastVisibleByStack[dataset.stack] === dataset.label ? [4, 8] : 0,
          formatter: ({ name, value }) => {
            const numericValue = Number(value || 0);
            if (!(numericValue > 0)) return "";
            if (lastVisibleByStack[dataset.stack] !== dataset.label) {
              return Number(numericValue).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
            }
            const period = totalsByLabel.get(name);
            const total = dataset.stack === "stack_dolar" ? period?.dolar || 0 : period?.stackTotal || 0;
            return total > 0 ? `Total: ${formatCurrency2(total)}` : "";
          },
        },
        data: dataset.data,
      }));
    })(),
  }), [chartState]);
  const chartEvents = useMemo(() => ({
    click: (params) => {
      if (!params?.seriesName || params?.dataIndex == null) return;
      if (!(Number(params.value || 0) > 0)) return;
      const period = chartState.labels[params.dataIndex];
      openTableModal(period, params.seriesName);
    },
  }), [chartState.labels, openTableModal]);

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

        <div className="component-chart-legend-bottom">
          {COMPONENT_CATEGORY_GROUPS.map((item) => (
            <div key={item.label} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
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

function ComponentSalesNativeDashboard({ dashboardFilter }) {
  const defaultDateRange = useMemo(() => buildCashflowDefaultDateRange(), []);
  const [interval, setInterval] = useState("daily");
  const [dateFrom, setDateFrom] = useState(defaultDateRange.fromBrazilian);
  const [dateTo, setDateTo] = useState(defaultDateRange.toBrazilian);
  const [selectedTableModal, setSelectedTableModal] = useState(null);

  const {
    rows,
    sales,
    setSales,
    derivatives,
    setDerivatives,
  } = useComponentSalesSource(dashboardFilter, dateFrom, dateTo);
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales,
    setSales,
    derivatives,
    setDerivatives,
  });
  const chartState = useMemo(() => buildComponentSalesChartState(rows, interval), [interval, rows]);
  const openTableModal = useCallback((period, seriesName) => {
    const selectedOps = chartState.opsIndex.get(`${period}||${seriesName}`) || [];
    const definition = seriesName === "Venda Físico em U$"
      ? resourceDefinitions.physicalSales
      : resourceDefinitions.derivativeOperations;
    const sourceRows = definition.resource === "physical-sales" ? sales : derivatives;
    const ids = new Set(selectedOps.map((item) => item.recordId).filter(Boolean).map(String));
    const operationCodes = new Set(selectedOps.map((item) => item.operationCode).filter(Boolean).map(String));
    const filteredRows = sourceRows.filter((row) =>
      ids.has(String(row.id)) || operationCodes.has(String(row.cod_operacao_mae || "")),
    );
    if (!filteredRows.length) return;
    setSelectedTableModal({
      title: `${seriesName} — ${period}`,
      definition,
      rows: filteredRows,
    });
  }, [chartState.opsIndex, derivatives, sales]);

  const maxValue = useMemo(
    () => Math.max(...(chartState.periods || []).map((item) => Math.max(item.stackTotal, item.dolar)), 1),
    [chartState.periods],
  );
  const barAreaHeight = 320;

  return (
    <section className="component-sales-shell component-native-shell">
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
            <h3>Venda de Componentes</h3>
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
          {COMPONENT_CATEGORY_GROUPS.map((item) => (
            <div key={item.label} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: item.color }} />
              <span>{item.label}</span>
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
                    <div className="component-native-bar-stack">
                      <div className="component-native-bar-shell" style={{ height: `${stackHeightPx}px` }}>
                        {period.bolsa > 0 ? (
                          <button
                            type="button"
                            className="component-native-segment"
                            style={{ height: `${bolsaHeightPx}px`, background: COMPONENT_COLORS["Bolsa (Futuros)"] }}
                            onClick={() => openTableModal(period.label, "Bolsa (Futuros)")}
                          />
                        ) : null}
                        {period.fisico > 0 ? (
                          <button
                            type="button"
                            className="component-native-segment"
                            style={{ height: `${fisicoHeightPx}px`, background: COMPONENT_COLORS["Venda Fisico em U$"] }}
                            onClick={() => openTableModal(period.label, "Venda Físico em U$")}
                          />
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="component-native-bar-single"
                      onClick={() => openTableModal(period.label, "Dólar")}
                      disabled={period.dolar <= 0}
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
        recordId: item.id,
        resourceKey: "cash-payments",
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
        recordId: item.id,
        resourceKey: "physical-sales",
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
        recordId: item.id,
        resourceKey: "derivative-operations",
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

function CashflowOperationsPopup({ selectedItem, currencyLabel, onClose, onOpenOperation }) {
  const summary = useMemo(() => {
    if (!selectedItem?.ops?.length) return null;
    const totalValor = selectedItem.ops.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalVolume = selectedItem.ops.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    return { totalValor, totalVolume };
  }, [selectedItem]);

  if (!selectedItem) return null;

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
          <span className="chart-legend-dot" style={{ background: selectedItem.color || "#64748b" }} />
          <strong>{selectedItem.category}</strong>
          <span className="muted">— {selectedItem.period}</span>
        </div>
        <table className="component-popup-table">
          <thead>
            <tr>
              <th className="component-popup-action-col" />
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
                <td className="component-popup-action-cell">
                  {item.recordId ? <ComponentPopupEyeButton onClick={() => handleOpenOperation(item)} /> : null}
                </td>
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
                <td />
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
  onOpenOperation,
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
      <CashflowOperationsPopup
        selectedItem={selectedItem}
        currencyLabel={currencyConfig.label}
        onClose={() => setSelectedItem(null)}
        onOpenOperation={onOpenOperation}
      />
    </div>
  );
}

function CashflowDashboard({ dashboardFilter, compact = false }) {
  const isMobileViewport = useViewportMatch("(max-width: 768px)");
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
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales,
    setSales,
    derivatives,
    setDerivatives,
    cashPayments,
    setCashPayments,
  });

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
      compact && isMobileViewport
        ? CASHFLOW_CURRENCY_CONFIGS
        : expandedCurrencyKey
        ? CASHFLOW_CURRENCY_CONFIGS.filter((currencyConfig) => currencyConfig.key === expandedCurrencyKey)
        : CASHFLOW_CURRENCY_CONFIGS,
    [compact, expandedCurrencyKey, isMobileViewport],
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
        className={`cashflow-dashboard-shell${compact ? " cashflow-dashboard-shell--compact" : ""}${expandedCurrencyKey ? " cashflow-dashboard-shell--expanded" : ""}${compact && isMobileViewport ? " cashflow-dashboard-shell--mobile-stacked" : ""}`}
      >
      {visibleCurrencies.map((currencyConfig) => (
        <CashflowCurrencyChart
          key={currencyConfig.key}
          currencyConfig={currencyConfig}
          rows={currencyRows[currencyConfig.key] || []}
          interval={interval}
          compact={compact}
          isExpanded={compact && isMobileViewport ? true : expandedCurrencyKey === currencyConfig.key}
          onOpenOperation={openOperationForm}
          onToggleExpand={
            compact && !isMobileViewport
              ? () => setExpandedCurrencyKey((current) => (current === currencyConfig.key ? null : currencyConfig.key))
              : undefined
          }
        />
      ))}
      {editorNode}
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

      <section className="risk-kpi-derivative-donuts">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={`risk-donut-skeleton-${index}`} className="chart-card risk-kpi-skeleton-card risk-kpi-skeleton-donut-card">
            <div className="risk-kpi-skeleton-donut" />
            <div className="risk-kpi-skeleton-line risk-kpi-skeleton-line-short" />
          </article>
        ))}
      </section>
    </>
  );
}

function CommercialRiskDashboard({ dashboardFilter }) {
  const navigate = useNavigate();
  const { filter, options, toggleFilterValue, updateFilter } = useDashboardFilter();
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);
  const [hedgePolicies, setHedgePolicies] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [summaryData, setSummaryData] = useState({
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
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [selectedMarketNewsPost, setSelectedMarketNewsPost] = useState(null);
  const [selectedMarketNewsAttachments, setSelectedMarketNewsAttachments] = useState([]);
  const [selectedMarketNewsAttachmentsLoading, setSelectedMarketNewsAttachmentsLoading] = useState(false);
  const [editingMaturityItem, setEditingMaturityItem] = useState(null);
  const [maturityAttachments, setMaturityAttachments] = useState([]);
  const [maturityFormError, setMaturityFormError] = useState("");
  const [resourceTableModal, setResourceTableModal] = useState(null);
  const summaryReadyEventDispatchedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    setSummaryLoading(true);
    resourceService
      .getCommercialRiskSummary({
        grupo: dashboardFilter?.grupo || [],
        subgrupo: dashboardFilter?.subgrupo || [],
        cultura: dashboardFilter?.cultura || [],
        safra: dashboardFilter?.safra || [],
        localidade: dashboardFilter?.localidade || [],
      })
      .then((response) => {
        if (!isMounted) return;
        setSummaryData(response || {});
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
  }, [dashboardFilter]);

  useEffect(() => {
    let isMounted = true;
    setAnalyticsLoading(true);
    setAnalyticsReady(false);
    const loadAnalytics = () => {
      Promise.all([
        resourceService.listAll("physical-sales").catch(() => []),
        resourceService.listAll("derivative-operations").catch(() => []),
        resourceService.listAll("crop-boards").catch(() => []),
        resourceService.listAll("hedge-policies").catch(() => []),
        resourceService.listAll("physical-payments").catch(() => []),
      ])
        .then(([salesResponse, derivativeResponse, cropBoardResponse, policiesResponse, physicalPaymentsResponse]) => {
          if (!isMounted) return;
          setPhysicalSales(salesResponse || []);
          setDerivatives(derivativeResponse || []);
          setCropBoards(cropBoardResponse || []);
          setHedgePolicies(policiesResponse || []);
          setPhysicalPayments(physicalPaymentsResponse || []);
          setAnalyticsReady(true);
        })
        .finally(() => {
          if (!isMounted) return;
          setAnalyticsLoading(false);
        });
    };

    loadAnalytics();
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
  const formCompletionSummary = summaryData?.formCompletionSummary || {
    totalForms: 0,
    filledForms: 0,
    pendingForms: 0,
    totalRecords: 0,
  };

  const filteredSales = useMemo(
    () => physicalSales.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, physicalSales],
  );
  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter],
  );
  const filteredPolicies = useMemo(
    () => hedgePolicies.filter((item) => rowMatchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, hedgePolicies],
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
  const [hedgeSummaryActiveIndex, setHedgeSummaryActiveIndex] = useState(hedgeSummaryTodayIndex);

  useEffect(() => {
    setHedgeSummaryActiveIndex(hedgeSummaryTodayIndex);
  }, [hedgeSummaryTodayIndex]);

  const hedgeSummaryActivePoint =
    hedgeSummaryChartState.points[hedgeSummaryActiveIndex] || hedgeSummaryChartState.points[hedgeSummaryTodayIndex] || hedgeSummaryChartState.points.at(-1) || null;
  const hedgeSummaryReferenceDate = hedgeSummaryActivePoint?.date || startOfDashboardDay(new Date());
  const hedgeCardCommercializedVolume = hedgeSummaryActivePoint?.total || 0;
  const commercializationCoverage = netProductionBase > 0 ? hedgeCardCommercializedVolume / netProductionBase : 0;
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
  const netProductionVolume = netProductionBase;
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
  const hedgeSummaryStatusText = useMemo(() => {
    const activeTotalValue = hedgeSummaryActivePoint?.total || 0;
    if (Number.isFinite(hedgeSummaryActivePoint?.maxValue) && activeTotalValue > hedgeSummaryActivePoint.maxValue) {
      return `${(((activeTotalValue - hedgeSummaryActivePoint.maxValue) / Math.max(netProductionBase, 1)) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 0,
      })}% acima da politica`;
    }
    if (Number.isFinite(hedgeSummaryActivePoint?.minValue) && activeTotalValue < hedgeSummaryActivePoint.minValue) {
      return `${(((hedgeSummaryActivePoint.minValue - activeTotalValue) / Math.max(netProductionBase, 1)) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 0,
      })}% abaixo da politica`;
    }
    return "dentro da politica";
  }, [hedgeSummaryActivePoint, netProductionBase]);
  const hedgeSummaryCardTone = useMemo(() => {
    const totalPercent = netProductionBase > 0 ? (Number(hedgeSummaryActivePoint?.total || 0) / netProductionBase) * 100 : 0;
    return getHedgeBandTone(totalPercent, activePolicyMinPercent, activePolicyMaxPercent);
  }, [activePolicyMaxPercent, activePolicyMinPercent, hedgeSummaryActivePoint, netProductionBase]);
  const hedgeSummaryTooltipLines = useMemo(() => {
    const activeTotalValue = hedgeSummaryActivePoint?.total || 0;
    return [
      `${formatHedgeSummaryPercentValue(activeTotalValue, netProductionBase)} - ${hedgeSummaryStatusText} - ${formatHedgeSummaryValue(activeTotalValue, "SC")}${
        formatHedgeSummaryScPerHaValue(activeTotalValue, "SC", totalArea)
          ? ` - ${formatHedgeSummaryScPerHaValue(activeTotalValue, "SC", totalArea)}`
          : ""
      }`,
      formatHedgeSummaryLine("Vendas Fisico", activePhysicalCommercializedVolume, "SC", netProductionBase, totalArea),
      formatHedgeSummaryLine("Derivativos", activeDerivativeCommercializedVolume, "SC", netProductionBase, totalArea),
      hedgeSummaryActivePoint?.minValue != null
        ? formatHedgeSummaryLine("Politica Min", hedgeSummaryActivePoint.minValue, "SC", netProductionBase, totalArea)
        : "Politica Min: —",
      hedgeSummaryActivePoint?.maxValue != null
        ? formatHedgeSummaryLine("Politica Max", hedgeSummaryActivePoint.maxValue, "SC", netProductionBase, totalArea)
        : "Politica Max: —",
    ];
  }, [
    activeDerivativeCommercializedVolume,
    activePhysicalCommercializedVolume,
    hedgeSummaryActivePoint,
    hedgeSummaryStatusText,
    netProductionBase,
    totalArea,
  ]);
  const hedgeSummaryCardRows = useMemo(
    () => [
      {
        label: "Vendas Fisico",
        value: formatHedgeSummaryLine("Vendas Fisico", activePhysicalCommercializedVolume, "SC", netProductionBase, totalArea).replace("Vendas Fisico: ", ""),
      },
      {
        label: "Derivativos",
        value: formatHedgeSummaryLine("Derivativos", activeDerivativeCommercializedVolume, "SC", netProductionBase, totalArea).replace("Derivativos: ", ""),
      },
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
      activeDerivativeCommercializedVolume,
      activePhysicalCommercializedVolume,
      hedgeSummaryActivePoint,
      netProductionBase,
      totalArea,
    ],
  );
  const activePhysicalPayments = useMemo(
    () =>
      filteredPhysicalPayments.filter((item) => {
        const paymentDate = startOfDashboardDay(item.data_pagamento || item.created_at);
        return paymentDate && hedgeSummaryReferenceDate && paymentDate <= hedgeSummaryReferenceDate;
      }),
    [filteredPhysicalPayments, hedgeSummaryReferenceDate],
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

    filteredCropBoards.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_texto);
      if (!node) return;
      node.production += Math.abs(Number(item.producao_total || 0));
    });

    activePhysicalSales.forEach((item) => {
      const node = ensureNode(item.cultura || item.cultura_produto || item.cultura_texto);
      if (!node) return;
      node.physical += Math.abs(Number(item.volume_fisico || 0));
      node.detailRows.physical.push({
        ...item,
        detailVolume: Math.abs(Number(item.volume_fisico || 0)),
      });
    });

    activeBolsaDerivatives.forEach((item) => {
      const node = ensureNode(getDerivativeCultureValue(item));
      if (!node) return;
      const detailVolume = derivativeStandardVolumeGetter(item);
      node.derivatives += detailVolume;
      node.detailRows.derivatives.push({
        ...item,
        detailVolume,
      });
    });

    activePhysicalPayments.forEach((item) => {
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
    activeBolsaDerivatives,
    activePhysicalPayments,
    activePhysicalSales,
    derivativeStandardVolumeGetter,
    filteredCropBoards,
  ]);

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

  const openQuotesPage = () => {
    navigateFromSummary(navigate, "/mercado/cotacoes", "Cotações");
  };

  const openBlogNewsPage = () => {
    navigateFromSummary(navigate, "/mercado/blog-news", "Blog/News");
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

  const hedgeProductionChartNode = (
    <HedgePolicyChart
      title="Hedge produção liquida (sc)"
      unit="SC"
      frequency="monthly"
      baseValue={netProductionBase}
      areaBase={totalArea}
      activeIndex={hedgeSummaryActiveIndex}
      onActiveIndexChange={setHedgeSummaryActiveIndex}
      physicalRows={filteredSales}
      derivativeRows={bolsaDerivatives}
      policies={filteredPolicies}
      physicalValueGetter={getPhysicalVolumeValue}
      derivativeValueGetter={derivativeStandardVolumeGetter}
      derivativeVolumeGetter={derivativeStandardVolumeGetter}
      onFocusToggle={() => navigateFromSummary(navigate, "/dashboard/politica-hedge", "Política de Hedge")}
      onOpenResourceRow={openCommercialRiskResourceRow}
      showFloatingCard={false}
    />
  );

  const hedgeRealizadoSummaryCard = (
    <HedgeStatusSummaryCard
      title="Resumo Hedge"
      tone={hedgeSummaryCardTone}
      summaryLine={hedgeSummaryTooltipLines[0]}
      rows={hedgeSummaryCardRows}
    />
  );

  return (
    <section className="risk-kpi-shell">
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
            <article className="card stat-card">
              <h1 className="stat-card-primary-title risk-kpi-card-title">Produção líquida</h1>
              <strong>{formatNumber0(displayedNetProductionVolume)} sc</strong>
              <span className="stat-card-secondary-label">(-) Pgtos Físico</span>
              <strong className="stat-card-secondary-value">{formatNumber0(displayedPhysicalPaymentVolume)} sc</strong>
              <span className="stat-card-secondary-label">Produção total</span>
              <strong className="stat-card-secondary-value">
                {formatNumber0(displayedProductionTotal)} sc ({formatNumber0(displayedTotalArea)} ha | {formatNumber0(displayedTotalArea > 0 ? displayedProductionTotal / displayedTotalArea : 0)} sc/ha)
              </strong>
            </article>
            <UpcomingMaturitiesCard rows={upcomingMaturityRows} onOpenItem={openMaturityForm} />
            <CommercialRiskNewsSummaryCard rows={marketNewsPosts} onOpen={openBlogNewsPage} onOpenPost={openMarketNewsPreview} />
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
          <section className="stats-grid risk-kpi-grid risk-kpi-grid-summary">
            <HedgeSummaryGaugeCards
              totalPercent={totalSalesPercent}
              totalMetricValue={totalCommercializedVolume}
              totalMetricLabel={totalArea > 0 ? `${formatNumber2(totalScPerHa)} scs/ha` : null}
              physicalPercent={totalCommercializedVolume > 0 ? (activePhysicalCommercializedVolume / totalCommercializedVolume) * 100 : physicalSalesPercent}
              physicalMetricValue={activePhysicalCommercializedVolume}
              physicalMetricLabel={totalArea > 0 ? `${formatNumber2(physicalScPerHa)} scs/ha` : `${formatNumber0(activePhysicalCommercializedVolume)} sc`}
              physicalDetailLines={
                physicalPriceLines.length
                  ? physicalPriceLines.map((item) => `${formatNumber0(item.volume)} sc | ${formatCurrency2(item.averagePrice)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
                  : []
              }
              derivativePercent={totalCommercializedVolume > 0 ? (activeDerivativeCommercializedVolume / totalCommercializedVolume) * 100 : derivativeSalesPercent}
              derivativeMetricValue={activeDerivativeCommercializedVolume}
              derivativeMetricLabel={totalArea > 0 ? `${formatNumber2(derivativeScPerHa)} scs/ha` : `${formatNumber0(activeDerivativeCommercializedVolume)} sc`}
              derivativeDetailLines={
                derivativePriceLines.length
                  ? derivativePriceLines.map((item) => `${formatNumber0(item.volume)} sc | Strike ${formatCurrency2(item.averageStrike)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
                  : []
              }
              policyMinPercent={activePolicyMinPercent}
              policyMaxPercent={activePolicyMaxPercent}
            />
            {hedgeRealizadoSummaryCard}
          </section>

          <section className="risk-kpi-long-short-grid risk-kpi-hedge-chart-row">
            {hedgeProductionChartNode}
          </section>

          <section className="risk-kpi-long-short-grid">
            <CommercialRiskLongShortChart
              rows={longShortRows}
              cultureButtons={options.cropBoardCrops || []}
              selectedCultureIds={filter.cultura}
              onToggleCulture={(value) => toggleFilterValue("cultura", value)}
              onClearCultures={() => updateFilter("cultura", [])}
              referenceDate={hedgeSummaryReferenceDate}
              onOpenDetailTable={openCommercialRiskLongShortDetail}
            />
          </section>

          <section className="risk-kpi-derivative-donuts">
            <DonutChart
              centerLabel="Derivativos"
              centerValue={`${filteredDerivatives.length} ops`}
              slices={derivativeExchangeSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "all")}
            />
            <DonutChart
              centerLabel="Em aberto"
              centerValue={`${filteredDerivatives.filter((item) => !normalizeText(item.status_operacao).includes("encerr")).length} ops`}
              slices={derivativeExchangeOpenSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "open")}
            />
            <DonutChart
              centerLabel="Encerrado"
              centerValue={`${filteredDerivatives.filter((item) => normalizeText(item.status_operacao).includes("encerr")).length} ops`}
              slices={derivativeExchangeClosedSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "closed")}
            />
          </section>
        </>
      ) : (
        <CommercialRiskAnalyticsSkeleton />
      )}

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
  areaBase = 0,
  activeIndex: controlledActiveIndex = null,
  onActiveIndexChange = null,
  onFocusToggle,
  focusButtonIcon = "⛶",
  focusButtonTitle = "Destacar gráfico",
  extraActions = null,
  simulatedIncrement = 0,
  simulatedLabel = null,
  onOpenResourceRow = null,
  showFloatingCard = true,
}) {
  const chartRef = useRef(null);
  const chartWrapRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [detailIndex, setDetailIndex] = useState(null);
  const [showPhysical, setShowPhysical] = useState(true);
  const [showDerivatives, setShowDerivatives] = useState(true);
  const [detailPhysicalSearch, setDetailPhysicalSearch] = useState("");
  const [detailDerivativeSearch, setDetailDerivativeSearch] = useState("");
  const [guideState, setGuideState] = useState({ today: null, hover: null });
  const [hoverSnapshot, setHoverSnapshot] = useState(null);

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
  const dailyChartState = useMemo(
    () =>
      buildHedgePolicyChartState({
        unit,
        frequency: "daily",
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
      physicalRows,
      physicalValueGetter,
      policies,
      showDerivatives,
      showPhysical,
      simulatedIncrement,
      unit,
    ],
  );
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

  const resolveHoverSnapshot = useCallback(
    (chart, nativeEvent) => {
      const area = chart?.chartArea;
      const dailyPoints = dailyChartState.points || [];
      if (!area || dailyPoints.length < 1) return null;

      const rawX = nativeEvent?.x;
      if (!Number.isFinite(rawX)) return null;
      const clampedX = Math.max(area.left, Math.min(rawX, area.right));
      const range = Math.max(area.right - area.left, 1);
      const ratio = (clampedX - area.left) / range;
      const startTime = dailyPoints[0].date?.getTime?.() || 0;
      const endTime = dailyPoints[dailyPoints.length - 1].date?.getTime?.() || startTime;
      const targetTime = startTime + ratio * Math.max(endTime - startTime, 0);

      let nearestPoint = dailyPoints[0];
      let nearestDistance = Math.abs((nearestPoint?.date?.getTime?.() || startTime) - targetTime);
      for (let index = 1; index < dailyPoints.length; index += 1) {
        const candidate = dailyPoints[index];
        const distance = Math.abs((candidate?.date?.getTime?.() || startTime) - targetTime);
        if (distance < nearestDistance) {
          nearestPoint = candidate;
          nearestDistance = distance;
        }
      }

      return {
        point: nearestPoint,
        x: clampedX,
        label: nearestPoint?.date ? formatHedgeTitleDate(nearestPoint.date) : null,
      };
    },
    [dailyChartState.points],
  );

  const syncGuideState = useCallback(
    (chart, hoverIndex = activeIndex, hoverInfo = hoverSnapshot) => {
      if (!chart) {
        setGuideState({ today: null, hover: null });
        return;
      }

      const meta = chart.getDatasetMeta(4);
      const points = meta?.data || [];
      const area = chart.chartArea;
      if (!area || !points.length) {
        setGuideState({ today: null, hover: null });
        return;
      }

      const buildGuide = (index, label, variant) => {
        if (!Number.isInteger(index) || index < 0 || index >= points.length) return null;
        const x = points[index]?.x;
        if (!Number.isFinite(x)) return null;
        return {
          left: x,
          top: area.top,
          height: area.bottom - area.top,
          label,
          variant,
        };
      };

      setGuideState({
        today: buildGuide(todayIndex, "Hoje", "today"),
        hover: hoverInfo
          ? {
              left: hoverInfo.x,
              top: area.top,
              height: area.bottom - area.top,
              label: hoverInfo.label,
              variant: "hover",
            }
          : null,
      });
    },
    [hoverSnapshot, todayIndex],
  );

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
              align: (context) => {
                const totalPoints = chartState.points.length;
                if (context.dataIndex === totalPoints - 1) return "left";
                return context.dataIndex % 2 === 0 ? "top" : "right";
              },
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
        animation: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        onClick: (_, elements) => {
          if (!elements?.[0]) return;
          setDetailIndex(elements[0].index);
        },
        onHover: (event, elements, chart) => {
          const nextHoverSnapshot = resolveHoverSnapshot(chart, event);
          setHoverSnapshot(nextHoverSnapshot);
          if (elements?.[0]) {
            updateActiveIndex(elements[0].index);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: { display: false },
          fundPositionZeroLineAndLabels: { enabled: false },
          fundPositionLastValueLabel: { enabled: false },
        },
        layout: {
          padding: {
            top: 20,
            right: 18,
          },
        },
        scales: {
          x: {
            offset: true,
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
      setHoverSnapshot(null);
      updateActiveIndex(todayIndex);
    };
    canvas.addEventListener("mouseleave", handleMouseLeave);

    chartInstanceRef.current = nextChart;
    syncGuideState(nextChart, activeIndex, hoverSnapshot);

    const handleResize = () => {
      window.requestAnimationFrame(() => {
        syncGuideState(nextChart, controlledActiveIndex != null ? controlledActiveIndex : internalActiveIndex, hoverSnapshot);
      });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      nextChart.destroy();
    };
  }, [activeIndex, chartState, controlledActiveIndex, frequency, hoverSnapshot, internalActiveIndex, resolveHoverSnapshot, syncGuideState, todayIndex, unit, updateActiveIndex]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    syncGuideState(chart, activeIndex, hoverSnapshot);
  }, [activeIndex, hoverSnapshot, syncGuideState]);

  const activePoint = hoverSnapshot?.point || chartState.points[activeIndex] || chartState.points.at(-1) || null;
  const detailPoint = detailIndex != null ? chartState.points[detailIndex] || null : null;
  const activeSimulation = hoverSnapshot?.point
    ? hoverSnapshot.point === dailyChartState.points[dailyChartState.points.length - 1]
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

  return (
    <article className={`hedge-chart-card${showFloatingCard && activePoint ? " has-floating-card" : " is-chart-fill"}`}>
      <div className="hedge-chart-card-header">
        <h2>{title}</h2>
        <div className="hedge-chart-actions">
          {extraActions}
          <button type="button" className="hedge-chart-icon-btn" onClick={onFocusToggle} title={focusButtonTitle}>
            {focusButtonIcon}
          </button>
        </div>
      </div>

      {showFloatingCard && activePoint ? (
        <aside className="hedge-floating-card">
          <div className="hedge-floating-topline">
            <div className="hedge-floating-title">{formatHedgeTitleDate(activePoint.date)}</div>
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
            {formatHedgeTooltipLine("Vendas Fisico", activePoint.physicalRaw, unit, baseValue, areaBase)}
          </div>
          <div className="hedge-floating-line">
            {formatHedgeTooltipLine("Derivativos", activePoint.derivativeRaw, unit, baseValue, areaBase)}
          </div>
          <div className="hedge-floating-line">
            {activePoint.minValue != null ? formatHedgeTooltipLine("Politica Min", activePoint.minValue, unit, baseValue, areaBase) : "Politica Min: —"}
          </div>
          <div className="hedge-floating-line">
            {activePoint.maxValue != null ? formatHedgeTooltipLine("Politica Max", activePoint.maxValue, unit, baseValue, areaBase) : "Politica Max: —"}
          </div>
          {activeSimulation > 0 && simulatedLabel ? (
            <div className="hedge-floating-line">
              Simulação: +{formatHedgeTooltipValue(activeSimulation, unit)} {simulatedLabel}
            </div>
          ) : null}
        </aside>
      ) : null}

      <div className="hedge-chart-wrap" ref={chartWrapRef}>
        <canvas ref={chartRef} />
        {guideState.today ? (
          <div
            className="hedge-chart-guide hedge-chart-guide--today"
            style={{ left: `${guideState.today.left}px`, top: `${guideState.today.top}px`, height: `${guideState.today.height}px` }}
          >
            <div className="hedge-chart-guide-label hedge-chart-guide-label--today">{guideState.today.label}</div>
          </div>
        ) : null}
        {guideState.hover ? (
          <div
            className="hedge-chart-guide hedge-chart-guide--hover"
            style={{ left: `${guideState.hover.left}px`, top: `${guideState.hover.top}px`, height: `${guideState.hover.height}px` }}
          >
            <div className="hedge-chart-guide-label hedge-chart-guide-label--hover">{guideState.hover.label}</div>
          </div>
        ) : null}
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
              <ResourceTable
                definition={resourceDefinitions.physicalSales}
                rows={detailRows.physical}
                searchValue={detailPhysicalSearch}
                searchPlaceholder={resourceDefinitions.physicalSales.searchPlaceholder || "Buscar..."}
                onSearchChange={setDetailPhysicalSearch}
                onClear={() => setDetailPhysicalSearch("")}
                onEdit={onOpenResourceRow ? (row) => onOpenResourceRow(resourceDefinitions.physicalSales.resource, row) : undefined}
                tableHeight="34vh"
                showClearButton={false}
              />
            </section>
            <section className="hedge-detail-section">
              <h4>Derivativos (dia entre início e liquidação — inclusivo)</h4>
              <ResourceTable
                definition={resourceDefinitions.derivativeOperations}
                rows={detailRows.derivatives}
                searchValue={detailDerivativeSearch}
                searchPlaceholder={resourceDefinitions.derivativeOperations.searchPlaceholder || "Buscar..."}
                onSearchChange={setDetailDerivativeSearch}
                onClear={() => setDetailDerivativeSearch("")}
                onEdit={onOpenResourceRow ? (row) => onOpenResourceRow(resourceDefinitions.derivativeOperations.resource, row) : undefined}
                tableHeight="34vh"
                showClearButton={false}
              />
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

function HedgePolicyDashboard({ dashboardFilter }) {
  const { matchesDashboardFilter, options } = useDashboardFilter();
  const [frequency, setFrequency] = useState("monthly");
  const [focusedChart, setFocusedChart] = useState(null);
  const [costActiveIndex, setCostActiveIndex] = useState(0);
  const [productionActiveIndex, setProductionActiveIndex] = useState(0);
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
  const filteredCropBoards = useMemo(
    () => cropBoards.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [cropBoards, dashboardFilter, matchesDashboardFilter],
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
        simulatedIncrement: simulatedCostValue,
      }),
    [costBase, filteredDerivatives, filteredPhysicalSales, filteredPolicies, frequency, simulatedCostValue, usdBrlRate],
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
      }),
    [
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

  useEffect(() => {
    setCostActiveIndex(costTodayIndex);
  }, [costTodayIndex]);

  useEffect(() => {
    setProductionActiveIndex(productionTodayIndex);
  }, [productionTodayIndex]);

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
    () =>
      filteredPhysicalSales.filter((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return saleDate && focusedReferenceDate && saleDate <= focusedReferenceDate;
      }),
    [filteredPhysicalSales, focusedReferenceDate],
  );
  const focusedActiveDerivatives = useMemo(() => {
    const sourceRows = focusedChart === "production" ? filteredCommodityDerivatives : filteredDerivatives;
    return sourceRows.filter((item) => {
      const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
      const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
      return startDate && endDate && focusedReferenceDate && startDate <= focusedReferenceDate && focusedReferenceDate < endDate;
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
    const statusText = (() => {
      if (Number.isFinite(activePoint?.maxValue) && totalValue > activePoint.maxValue) {
        return `${(((totalValue - activePoint.maxValue) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 0,
        })}% acima da politica`;
      }
      if (Number.isFinite(activePoint?.minValue) && totalValue < activePoint.minValue) {
        return `${(((activePoint.minValue - totalValue) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 0,
        })}% abaixo da politica`;
      }
      return "dentro da politica";
    })();
    const totalLine = `${formatHedgeSummaryPercentValue(totalValue, baseValue)} - ${statusText} - ${formatHedgeSummaryValue(totalValue, unit)}${
      formatHedgeSummaryScPerHaValue(totalValue, unit, totalArea) ? ` - ${formatHedgeSummaryScPerHaValue(totalValue, unit, totalArea)}` : ""
    }`;

    return {
      title: "Resumo Hedge",
      tone,
      summaryLine: totalLine,
      rows: [
        { label: "Vendas Fisico", value: formatHedgeSummaryLine("Vendas Fisico", physicalValue, unit, baseValue, totalArea).replace("Vendas Fisico: ", "") },
        { label: "Derivativos", value: formatHedgeSummaryLine("Derivativos", derivativeValue, unit, baseValue, totalArea).replace("Derivativos: ", "") },
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
      activeIndex={costActiveIndex}
      onActiveIndexChange={setCostActiveIndex}
      onFocusToggle={() => setFocusedChart((current) => (current === "cost" ? null : "cost"))}
      focusButtonIcon={focusedChart === "cost" ? "↩" : "⛶"}
      focusButtonTitle={focusedChart === "cost" ? "Voltar" : "Maximizar gráfico"}
      simulatedIncrement={simulatedCostValue}
      simulatedLabel={simulationLabel}
      showFloatingCard={focusedChart !== "cost"}
      extraActions={
        <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="hedge-chart-select">
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensal</option>
        </select>
      }
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
      derivativeVolumeGetter={derivativeStandardVolumeGetter}
      physicalDetailValueGetter={(item) => getPhysicalCostValue(item, usdBrlRate)}
      derivativeDetailValueGetter={(item) => getDerivativeCostValue(item, usdBrlRate)}
      activeIndex={productionActiveIndex}
      onActiveIndexChange={setProductionActiveIndex}
      onFocusToggle={() => setFocusedChart((current) => (current === "production" ? null : "production"))}
      focusButtonIcon={focusedChart === "production" ? "↩" : "⛶"}
      focusButtonTitle={focusedChart === "production" ? "Voltar" : "Maximizar gráfico"}
      simulatedIncrement={parsedSimulationVolume}
      simulatedLabel="adicionado em volume"
      showFloatingCard={focusedChart !== "production"}
    />
  );

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
        {!focusedChart ? costChartNode : null}
        {!focusedChart ? productionChartNode : null}
        {focusedChart ? (
          <div className="hedge-focus-layout">
            <div className="hedge-focus-main">
              {focusedChart === "cost" ? costChartNode : productionChartNode}
            </div>
            <div className="hedge-focus-side">
              <div className="hedge-focus-side-panels">
                {focusedSummaryProps ? <HedgeSummaryGaugeCards {...focusedSummaryProps} /> : null}
                {focusedStatusSummaryProps ? <HedgeStatusSummaryCard {...focusedStatusSummaryProps} /> : null}
              </div>
            </div>
          </div>
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
      grid: { top: 18, right: isMobileViewport ? 4 : 12, bottom: isMobileViewport ? 56 : 38, left: isMobileViewport ? 6 : 56, containLabel: true },
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
      series: uniqueSeries.map((seriesLabel) => ({
        name: seriesLabel,
        type: "bar",
        stack: "price-comp",
        barWidth: isMobileViewport ? "72%" : "58%",
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
    [categories, isMobileViewport, normalizedBars, uniqueSeries, unitLabel, valueFormatter],
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
        <div
          className={`price-comp-column-totals${isMobileViewport ? " is-mobile" : ""}`}
          style={{ gridTemplateColumns: `repeat(${normalizedBars.length}, minmax(0, 1fr))`, marginBottom: 12, marginLeft: isMobileViewport ? 0 : 56 }}
        >
          {normalizedBars.map((bar) => (
            <div key={bar.label} className="price-comp-column-total">
              {bar.totalValue >= 0 ? "" : "-"}
              {unitLabel} {valueFormatter(Math.abs(bar.totalValue))}
            </div>
          ))}
        </div>
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
  const [currencyMode, setCurrencyMode] = useState("AMBOS_R$");
  const [adjustmentMode, setAdjustmentMode] = useState("ALL");
  const [soldVolumeInput, setSoldVolumeInput] = useState("");
  const [hasManualVolume, setHasManualVolume] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [includeClosedDerivatives, setIncludeClosedDerivatives] = useState(true);
  const [includeOpenDerivatives, setIncludeOpenDerivatives] = useState(true);
  const { openOperationForm, editorNode } = useDashboardOperationEditor({
    sales: physicalSales,
    setSales: setPhysicalSales,
    derivatives,
    setDerivatives,
  });
  const openPriceCompositionOperation = useCallback((row) => {
    setDetailModal(null);
    openOperationForm(row);
  }, [openOperationForm]);

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
        recordId: item.id,
        resourceKey: "physical-sales",
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
        recordId: item.id,
        resourceKey: "derivative-operations",
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
            <VerticalChartComponent
              bars={verticalRowsG1}
              unitLabel={selectedCurrencyLabel}
              onSelectBar={(row) => openVerticalDetail("G1", row)}
            />
          </div>
        </section>

        <section className="price-comp-pair-card card">
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
                    <th className="component-popup-action-col" />
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
                          <td className="component-popup-action-cell">
                            {row.recordId ? <ComponentPopupEyeButton onClick={() => openPriceCompositionOperation(row)} /> : null}
                          </td>
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
                        <td />
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
                      <td colSpan="10">Nenhuma operacao encontrada para esta coluna.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {editorNode}
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
    description: "",
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

export function DashboardPage({ kind = "cashflow", chartEngine }) {
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
        <ComponentSalesNativeDashboard dashboardFilter={filter} />
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
        <PriceCompositionDashboard dashboardFilter={filter} chartEngine={chartEngine} />
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
