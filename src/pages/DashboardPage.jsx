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
import { InfoPopup } from "../components/InfoPopup";
import { PageHeader } from "../components/PageHeader";
import { ResourceTable } from "../components/ResourceTable";
import { ResourceForm } from "../components/ResourceForm";
import { filterSubgroupsByGroups, rowMatchesDashboardFilter, useDashboardFilter } from "../contexts/DashboardFilterContext";
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
const CHART_BAR_RADIUS = 2;
const CASHFLOW_DEFAULT_PAST_DAYS = 30;
const CASHFLOW_DEFAULT_FUTURE_DAYS = 365;

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
        <strong>{emphasis}</strong>
      </div>
      <div className="risk-kpi-executive-table">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="risk-kpi-executive-row">
            <div>
              <span>{row.label}</span>
              {row.note ? <small>{row.note}</small> : null}
            </div>
            <b>{row.value}</b>
          </div>
        ))}
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

function UpcomingMaturitiesCard({ rows, onOpenItem }) {
  return (
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
              ]}
            />
          }
        />
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
    <article className="chart-card chart-card-large risk-kpi-long-short-card summary-insight-card">
      <SummaryInsightButton
        title="Long & Short por cultura"
        message={
          <SummaryInsightCopy
            paragraphs={[
              "Neste gráfico, cada barra representa o volume total de uma cultura em sacas, dividido entre o que já está coberto e o que ainda está livre.",
              "Os segmentos mostram separadamente vendas via derivativos, vendas via físico, pagamentos físicos e a parte classificada como 'Nada feito', que representa a exposição ainda sem cobertura.",
            ]}
          />
        }
      />
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

const formatHedgeSummaryPolicyHeadline = (value, baseValue, minValue, maxValue) => {
  if (Number.isFinite(maxValue) && value > maxValue) {
    return `você está ${formatHedgeSummaryPercentValue(value - maxValue, baseValue)} acima da politica`;
  }
  if (Number.isFinite(minValue) && value < minValue) {
    return `você está ${formatHedgeSummaryPercentValue(minValue - value, baseValue)} abaixo da politica`;
  }
  return "você está dentro da politica";
};

const formatHedgeSummaryPolicyDeviation = (value, minValue, maxValue, unit) => {
  if (Number.isFinite(maxValue) && value > maxValue) {
    return `${formatHedgeSummaryValue(value - maxValue, unit)} acima da politica`;
  }
  if (Number.isFinite(minValue) && value < minValue) {
    return `${formatHedgeSummaryValue(minValue - value, unit)} abaixo da politica`;
  }
  return null;
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

const getPriceCompositionDerivativeKind = (item) => (item?.moeda_ou_cmdtye === "Moeda" ? "Cambio" : "Bolsa");

const getPriceCompositionDerivativeStatus = (item) =>
  normalizeText(item?.status_operacao).includes("encerr") ? "Encerrado" : "Em aberto";

const resolvePriceCompositionDerivativeVolume = (item) => {
  if (normalizeText(item?.moeda_ou_cmdtye) === "moeda") {
    return parseLocalizedNumber(item?.volume_financeiro_valor_moeda_original ?? item?.volume_financeiro_valor);
  }

  return parseLocalizedNumber(item?.volume ?? item?.volume_fisico_valor ?? item?.volume_fisico);
};

const calculatePriceCompositionDerivativeMtm = (item, strikeMtm, openUsdBrlQuote = 0) => {
  const status = normalizeText(item?.status_operacao);
  if (status !== "em aberto") {
    return {
      usd: parseLocalizedNumber(item?.ajustes_totais_usd),
      brl: parseLocalizedNumber(item?.ajustes_totais_brl),
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

  const isUsdOperation = String(item?.volume_financeiro_moeda || "").trim() === "U$";
  const fx = isUsdOperation ? (openUsdBrlQuote || parseLocalizedNumber(item?.dolar_ptax_vencimento)) : 1;

  return {
    usd,
    brl: isUsdOperation ? usd * fx : usd,
  };
};

const formatMoneyByCurrency = (value, currencyLabel) =>
  `${currencyLabel} ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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
        { key: "purchaseDerivatives", label: "Compra via Derivativos", color: "#f59e0b", stack: "cashflow" },
        { key: "physicalSales", label: "Vendas", color: "#16a34a", stack: "cashflow" },
        { key: "saleDerivatives", label: "Vendas via Derivativos", color: "#86efac", stack: "cashflow" },
      ]
    : [
        { key: "payments", label: `Pagamentos em ${currencyConfig.label}`, color: "#ff3b30", stack: "cashflow" },
        { key: "paymentsSwap", label: `Pagamentos em ${currencyConfig.label} (com swap para R$)`, color: "#f9a8b5", stack: "cashflow" },
        { key: "purchaseDerivatives", label: `Compra de ${currencyConfig.label} via Derivativos`, color: "#ffd43b", stack: "cashflow" },
        { key: "physicalSales", label: `Vendas em ${currencyConfig.label}`, color: "#16a34a", stack: "cashflow" },
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
    return getDerivativePositionValue(item) === "compra" ? "purchaseDerivatives" : "saleDerivatives";
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

const splitCashflowRowsByAmount = ({
  rows,
  matchedAmount,
  matchedCategoryKey,
  matchedCategoryLabel,
  unmatchedCategoryKey,
  unmatchedCategoryLabel,
  direction,
}) => {
  if (!rows.length) return [];

  let remainingMatched = Math.max(Number(matchedAmount || 0), 0);
  return rows.flatMap((row) => {
    const absoluteValue = Math.abs(Number(row.valor || 0));
    if (!(absoluteValue > 0)) return [];

    const matchedPortion = Math.min(absoluteValue, remainingMatched);
    remainingMatched -= matchedPortion;
    const unmatchedPortion = Math.max(absoluteValue - matchedPortion, 0);
    const nextRows = [];

    if (matchedPortion > 0 && matchedCategoryKey && matchedCategoryLabel) {
      nextRows.push({
        ...row,
        categoryKey: matchedCategoryKey,
        category: matchedCategoryLabel,
        valor: direction * matchedPortion,
      });
    }
    if (unmatchedPortion > 0 && unmatchedCategoryKey && unmatchedCategoryLabel) {
      nextRows.push({
        ...row,
        categoryKey: unmatchedCategoryKey,
        category: unmatchedCategoryLabel,
        valor: direction * unmatchedPortion,
      });
    }
    return nextRows;
  });
};

const reconcileCashflowRows = (rows, currencyConfig) => {
  if (currencyConfig?.key === "BRL") {
    return rows;
  }

  const labelMap = getCashflowSeriesLabelMap(currencyConfig);
  const groupsByDate = rows.reduce((acc, row) => {
    const dateKey = formatIsoDate(row.date);
    if (!dateKey) return acc;
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(row);
    return acc;
  }, {});

  return Object.values(groupsByDate).flatMap((dateRows) => {
    const paymentRows = dateRows.filter((row) => row.categoryKey === "payments");
    const purchaseRows = dateRows.filter((row) => row.categoryKey === "purchaseDerivatives");
    const otherRows = dateRows.filter((row) => row.categoryKey !== "payments" && row.categoryKey !== "purchaseDerivatives");

    const totalPayments = paymentRows.reduce((sum, row) => sum + Math.abs(Number(row.valor || 0)), 0);
    const totalPurchases = purchaseRows.reduce((sum, row) => sum + Math.abs(Number(row.valor || 0)), 0);
    const matchedAmount = Math.min(totalPayments, totalPurchases);

    return [
      ...splitCashflowRowsByAmount({
        rows: paymentRows,
        matchedAmount,
        matchedCategoryKey: "paymentsSwap",
        matchedCategoryLabel: labelMap.paymentsSwap,
        unmatchedCategoryKey: "payments",
        unmatchedCategoryLabel: labelMap.payments,
        direction: -1,
      }),
      ...purchaseRows,
      ...otherRows,
    ];
  });
};

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
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (interval === "monthly") {
    const [month, year] = String(label).split("/");
    const start = new Date(Number(year), Number(month) - 1, 1);
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
  const defaultDateRange = useMemo(() => buildComponentSalesDefaultDateRange(), []);
  const chartRef = useRef(null);
  const chartWrapRef = useRef(null);
  const [interval, setInterval] = useState("monthly");
  const [dateFrom, setDateFrom] = useState(defaultDateRange.fromBrazilian);
  const [dateTo, setDateTo] = useState(defaultDateRange.toBrazilian);
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [zoomRange, setZoomRange] = useState(null);
  const [chartWidth, setChartWidth] = useState(0);
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
  const timelinePeriods = useMemo(() => {
    if (interval === "geral") return [];
    return chartState.labels
      .map((label) => {
        const bounds = getComponentPeriodBounds(label, interval);
        if (!bounds?.start || !bounds?.end) return null;
        const anchor =
          interval === "monthly"
            ? bounds.start
            : interval === "weekly"
              ? bounds.start
              : bounds.start;
        return {
          label,
          start: bounds.start,
          end: bounds.end,
          anchor,
        };
      })
      .filter(Boolean);
  }, [chartState.labels, interval]);
  const visiblePeriodLabels = useMemo(() => {
    if (interval === "geral" || !zoomRange?.start || !zoomRange?.end) {
      return null;
    }
    const startTime = Number(zoomRange.start.getTime());
    const endTime = Number(zoomRange.end.getTime());
    return new Set(
      timelinePeriods
        .filter((period) => {
          const anchorTime = period?.anchor?.getTime?.();
          return Number.isFinite(anchorTime) && anchorTime >= startTime && anchorTime <= endTime;
        })
        .map((period) => period.label),
    );
  }, [interval, timelinePeriods, zoomRange]);
  const visibleRows = useMemo(() => {
    if (interval === "geral" || !visiblePeriodLabels) {
      return rows;
    }
    return rows.filter((item) => visiblePeriodLabels.has(buildComponentPeriodKey(item.date, interval)));
  }, [interval, rows, visiblePeriodLabels]);
  const summaryChartState = useMemo(
    () => buildComponentSalesChartState(visibleRows, interval, datasetVisibility),
    [datasetVisibility, interval, visibleRows],
  );
  const visiblePeriodCount = visiblePeriodLabels?.size || timelinePeriods.length || 1;
  const openSummaryCardModal = useCallback((groupLabel) => {
    const matchingChartRows = visibleRows.filter((row) => {
      if (groupLabel === "Venda Físico em U$") {
        return row.resourceKey === "physical-sales";
      }
      if (groupLabel === "Bolsa (Futuros)") {
        return row.resourceKey === "derivative-operations" && row.categoriaBase === "Bolsa (Futuros)";
      }
      if (groupLabel === "Dólar") {
        return row.resourceKey === "derivative-operations" && row.categoriaBase === "Dólar";
      }
      return false;
    });

    const definition = groupLabel === "Venda Físico em U$"
      ? resourceDefinitions.physicalSales
      : resourceDefinitions.derivativeOperations;
    const sourceRows = definition?.resource === "physical-sales" ? sales : derivatives;
    const ids = new Set(
      matchingChartRows
        .map((item) => item.recordId)
        .filter(Boolean)
        .map(String),
    );
    const operationCodes = new Set(
      matchingChartRows
        .map((item) => item.operationCode)
        .filter(Boolean)
        .map(String),
    );
    const filteredRows = sourceRows.filter((row) =>
      ids.has(String(row.id)) || operationCodes.has(String(row.cod_operacao_mae || "")),
    );

    if (!filteredRows.length) return;

    const titleSuffix = interval === "geral" ? "Total Consolidado" : "Periodo visivel";

    setSelectedTableModal({
      title: `${groupLabel} — ${titleSuffix}`,
      definition,
      rows: filteredRows,
    });
  }, [derivatives, interval, sales, visibleRows]);
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
  const chartOption = useMemo(() => {
    const today = startOfDashboardDay(new Date()).getTime();
    const visibleDatasets = chartState.datasets.filter((dataset) => dataset.hidden !== true);
    const lastVisibleByStack = visibleDatasets.reduce((acc, dataset) => ({ ...acc, [dataset.stack]: dataset.label }), {});
    const totalsByLabel = new Map((chartState.periods || []).map((period) => [period.label, period]));
    const visibleStackCount = Math.max(1, new Set(visibleDatasets.map((dataset) => dataset.stack)).size);
    const effectiveChartWidth = Math.max(Number(chartWidth || 0), 320);
    const slotWidth = Math.max(18, (effectiveChartWidth - 48) / Math.max(visiblePeriodCount, 1));
    const intervalFillRatio = {
      daily: effectiveChartWidth <= 640 ? 0.38 : 0.34,
      weekly: effectiveChartWidth <= 640 ? 0.52 : 0.5,
      monthly: effectiveChartWidth <= 640 ? 0.68 : 0.64,
      geral: effectiveChartWidth <= 640 ? 0.78 : 0.72,
    };
    const intervalMinBarWidth = {
      daily: effectiveChartWidth <= 640 ? 5 : 6,
      weekly: effectiveChartWidth <= 640 ? 9 : 12,
      monthly: effectiveChartWidth <= 640 ? 14 : 18,
      geral: effectiveChartWidth <= 640 ? 28 : 40,
    };
    const intervalMaxBarWidth = {
      daily: effectiveChartWidth <= 640 ? 10 : 12,
      weekly: effectiveChartWidth <= 640 ? 18 : 24,
      monthly: effectiveChartWidth <= 640 ? 32 : 42,
      geral: effectiveChartWidth <= 640 ? 120 : 180,
    };
    const intervalDateGapPreset = {
      daily: 8,
      weekly: 6,
      monthly: 5,
      geral: 4,
    };
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

    if (interval === "geral") {
      return {
        animationDuration: 250,
        grid: { top: 28, right: 18, bottom: 56, left: 18, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
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
          stack: dataset.stack,
          barWidth: responsiveBarWidth,
          barMaxWidth: responsiveBarWidth,
          barGap: responsiveBarGap,
          barCategoryGap: responsiveCategoryGap,
          cursor: "pointer",
          itemStyle: { color: dataset.backgroundColor, borderRadius: 0 },
          label: {
            show: true,
            position: lastVisibleByStack[dataset.stack] === dataset.label ? "top" : "inside",
            color: lastVisibleByStack[dataset.stack] === dataset.label ? "#111827" : "#ffffff",
            fontSize: 11,
            fontWeight: 700,
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
        })),
      };
    }

    return {
      animationDuration: 250,
      grid: { top: 28, right: 18, bottom: 80, left: 18, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const validItems = params.filter((item) => Number(item?.value?.[1] || 0) > 0);
          if (!validItems.length) return "";
          const periodLabel = validItems[0]?.data?.periodLabel || "";
          const rowsHtml = validItems
            .map((item) => `${item.marker}${item.seriesName}: U$ ${Number(item.value?.[1] || 0).toLocaleString("pt-BR")}`)
            .join("<br/>");
          return `<strong>${periodLabel}</strong><br/>${rowsHtml}`;
        },
      },
      legend: { show: false },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "weakFilter",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 22,
          bottom: 20,
          filterMode: "weakFilter",
        },
      ],
      xAxis: {
        type: "time",
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontWeight: 700,
          fontSize: 12,
          hideOverlap: true,
          margin: 14,
          formatter: (value) => {
            const date = new Date(value);
            if (interval === "monthly") {
              return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
            }
            return formatBrazilianDate(date);
          },
        },
        axisLine: { lineStyle: { color: "rgba(15,23,42,0.18)" } },
        splitLine: { show: false },
        minInterval: interval === "monthly" ? 28 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
      },
      yAxis: {
        type: "value",
        min: 0,
        name: "U$",
        nameTextStyle: { color: "#475569", fontSize: 10, fontWeight: 700 },
        axisLabel: { color: "#475569", fontSize: 11, formatter: (value) => Number(value).toLocaleString("pt-BR") },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
      },
      series: chartState.datasets.map((dataset, datasetIndex) => ({
        name: dataset.label,
        type: "bar",
        stack: dataset.stack,
        barWidth: responsiveBarWidth,
        barMaxWidth: responsiveBarWidth,
        barGap: responsiveBarGap,
        barCategoryGap: responsiveCategoryGap,
        barMinHeight: 3,
        cursor: "pointer",
        itemStyle: { color: dataset.backgroundColor, borderRadius: 0 },
        label: {
          show: lastVisibleByStack[dataset.stack] === dataset.label,
          position: "top",
          color: "#111827",
          fontSize: 11,
          fontWeight: 700,
          distance: 6,
          formatter: ({ data }) => {
            const numericValue = Number(data?.value?.[1] || 0);
            if (!(numericValue > 0)) return "";
            const period = totalsByLabel.get(data?.periodLabel || "");
            const total = dataset.stack === "stack_dolar" ? period?.dolar || 0 : period?.stackTotal || 0;
            return total > 0 ? `U$ ${Number(total).toLocaleString("pt-BR")}` : "";
          },
        },
        labelLayout: {
          hideOverlap: true,
        },
        markLine: datasetIndex === 0
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
              data: [{ xAxis: today }],
            }
          : undefined,
        data: timelinePeriods.map((period, index) => ({
          value: [period.anchor.getTime(), Number(dataset.data[index] || 0)],
          periodLabel: period.label,
        })),
      })),
    };
  }, [chartState, chartWidth, interval, timelinePeriods, visiblePeriodCount]);
  const chartEvents = useMemo(() => ({
    click: (params) => {
      if (!params?.seriesName) return;
      const numericValue = Array.isArray(params.value) ? Number(params.value?.[1] || 0) : Number(params.value || 0);
      if (!(numericValue > 0)) return;
      const period = params?.data?.periodLabel || chartState.labels[params.dataIndex];
      openTableModal(period, params.seriesName);
    },
    datazoom: (params) => {
      const payload = Array.isArray(params?.batch) ? params.batch[0] : params;
      const domainStart = timelinePeriods[0]?.anchor?.getTime?.();
      const domainEnd = timelinePeriods[timelinePeriods.length - 1]?.anchor?.getTime?.();
      if (Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainEnd > domainStart) {
        let startValue = payload?.startValue;
        let endValue = payload?.endValue;
        if (startValue == null || endValue == null) {
          const startPct = Number(payload?.start ?? 0);
          const endPct = Number(payload?.end ?? 100);
          startValue = domainStart + ((Math.min(Math.max(startPct, 0), 100) / 100) * (domainEnd - domainStart));
          endValue = domainStart + ((Math.min(Math.max(endPct, 0), 100) / 100) * (domainEnd - domainStart));
        }
        if (startValue != null && endValue != null) {
          setZoomRange({
            start: new Date(Number(startValue)),
            end: new Date(Number(endValue)),
          });
        }
      }
      const startValue = payload?.startValue;
      const endValue = payload?.endValue;
      if (startValue == null || endValue == null) return;
      setDateFrom(formatBrazilianDate(new Date(startValue)));
      setDateTo(formatBrazilianDate(new Date(endValue)));
    },
  }), [chartState.labels, openTableModal, timelinePeriods]);

  useEffect(() => {
    setZoomRange(null);
  }, [interval, dateFrom, dateTo]);

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

  return (
    <section className="component-sales-shell">
      <section className="stats-grid">
        {summaryChartState.totalsByCategory.map((item) => (
          <article
            key={item.label}
            className="card stat-card component-summary-card summary-insight-card"
            role="button"
            tabIndex={0}
            onClick={() => openSummaryCardModal(item.label)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSummaryCardModal(item.label);
              }
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

    <div className="chart-card component-chartjs-card cashflow-chart-card summary-insight-card">
        <SummaryInsightButton
          title="Venda de Componentes"
          message={
            <SummaryInsightCopy
              paragraphs={[
                `Este gráfico distribui o valor financeiro das vendas de componentes por período, usando os totais dos cards acima como referência resumida.`,
                `Cada barra mostra o valor de uma categoria no intervalo selecionado, e os rótulos no topo destacam os totais por período em U$.`,
              ]}
            />
          }
        />
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

        <div ref={chartWrapRef} className="component-chartjs-wrap">
          <ReactECharts
            ref={chartRef}
            option={chartOption}
            onEvents={chartEvents}
            style={{ height: "100%" }}
            opts={{ renderer: "svg" }}
          />
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


const buildCashflowRows = ({
  sales,
  cashPayments,
  derivatives,
  counterpartyMap,
  dashboardFilter,
  currencyConfig,
  cropsById,
}) => {
  const labelMap = getCashflowSeriesLabelMap(currencyConfig);
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
        category: labelMap.payments,
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
        category: labelMap.physicalSales,
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
      const cashflowSide = getDerivativeCashflowSide(item, currencyConfig, cropsById);
      if (!cashflowSide) return null;
      return {
        recordId: item.id,
        resourceKey: "derivative-operations",
        categoryKey: cashflowSide,
        category: labelMap[cashflowSide],
        date,
        data: formatBrazilianDate(item.data_liquidacao || item.data_contratacao || date),
        valor: Math.abs(Number(item.volume_financeiro_valor_moeda_original ?? item.volume_financeiro_valor ?? 0)),
        volume: Number(item.volume || item.numero_lotes || 0),
        preco: Number(item.strike_montagem || item.strike_liquidacao || 0),
        moedaUnidade: item.moeda_unidade || item.volume_financeiro_moeda || "",
        instituicao: item.bolsa_ref || counterpartyMap[String(item.contraparte)] || "",
        tipo: item.tipo_derivativo || "",
      };
    })
    .filter(Boolean);

  return reconcileCashflowRows([...paymentRows, ...salesRows, ...derivativeRows], currencyConfig);
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
  const rangeLabels = buildCashflowPeriodLabels(interval, dateRange);
  rangeLabels.forEach((label) => {
    if (!grouped.has(label)) {
      grouped.set(label, Object.fromEntries(seriesDefs.map((item) => [item.key, { total: 0, ops: [] }])));
    }
    if (!labels.includes(label)) {
      labels.push(label);
    }
  });
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

function CashflowCurrencyChart({
  currencyConfig,
  rows,
  interval,
  dateRange,
  fixedDateRange,
  compact = false,
  isExpanded = false,
  onToggleExpand,
  onOpenTable,
  sectionRef,
  onDateRangeChange,
}) {
  const chartWrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
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
  const chartRows = isExpanded ? rows : visibleRows;
  const chartRange = isExpanded ? fixedDateRange : dateRange;
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
  const timelinePeriods = useMemo(() => {
    if (interval === "geral") return [];
    return chartState.labels
      .map((label) => {
        const bounds = getComponentPeriodBounds(label, interval);
        if (!bounds?.start || !bounds?.end) return null;
        return {
          label,
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
    daily: effectiveChartWidth <= 640 ? 0.38 : 0.34,
    weekly: effectiveChartWidth <= 640 ? 0.52 : 0.5,
    monthly: effectiveChartWidth <= 640 ? 0.68 : 0.64,
    geral: effectiveChartWidth <= 640 ? 0.78 : 0.72,
  };
  const intervalMinBarWidth = {
    daily: effectiveChartWidth <= 640 ? 5 : 6,
    weekly: effectiveChartWidth <= 640 ? 9 : 12,
    monthly: effectiveChartWidth <= 640 ? 14 : 18,
    geral: effectiveChartWidth <= 640 ? 28 : 40,
  };
  const intervalMaxBarWidth = {
    daily: effectiveChartWidth <= 640 ? 10 : 12,
    weekly: effectiveChartWidth <= 640 ? 18 : 24,
    monthly: effectiveChartWidth <= 640 ? 32 : 42,
    geral: effectiveChartWidth <= 640 ? 120 : 180,
  };
  const intervalDateGapPreset = {
    daily: 8,
    weekly: 6,
    monthly: 5,
    geral: 4,
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
  const hasNativeZoom = interval !== "geral" && isExpanded && timelinePeriods.length > 1;
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
    const temporalGridBottom = isExpanded ? (hasNativeZoom ? 84 : 56) : 18;
    const temporalGridTop = isExpanded ? 28 : 14;
    const temporalAxisLabelMargin = isExpanded ? 14 : 8;

    if (interval === "geral") {
      return {
        animationDuration: 250,
        grid: { top: 28, right: 18, bottom: 56, left: 18, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) =>
            `<strong>${params[0]?.axisValue || ""}</strong><br/>${params
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
                show: !(compact && !isExpanded) && lastVisibleByStack[dataset.stack] === dataset.label,
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

    return {
      animationDuration: 250,
      grid: { top: temporalGridTop, right: 18, bottom: temporalGridBottom, left: 18, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const periodLabel = params.find((item) => item?.data?.periodLabel)?.data?.periodLabel || "";
          const rowsHtml = params
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
              filterMode: "weakFilter",
              startValue: selectedStartValue,
              endValue: selectedEndValue,
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: true,
              preventDefaultMouseMove: false,
            },
            {
              type: "slider",
              xAxisIndex: 0,
              height: 28,
              bottom: 16,
              filterMode: "weakFilter",
              startValue: selectedStartValue,
              endValue: selectedEndValue,
              borderColor: "rgba(148, 163, 184, 0.35)",
              fillerColor: "rgba(59, 130, 246, 0.14)",
              backgroundColor: "rgba(226, 232, 240, 0.65)",
              dataBackground: {
                lineStyle: { color: "rgba(99, 102, 241, 0.35)", width: 1 },
                areaStyle: { color: "rgba(191, 219, 254, 0.45)" },
              },
              moveHandleStyle: {
                color: "#ffffff",
                borderColor: "rgba(148, 163, 184, 0.9)",
              },
              handleStyle: {
                color: "#ffffff",
                borderColor: "rgba(148, 163, 184, 0.9)",
              },
              textStyle: {
                color: "#64748b",
              },
            },
          ]
        : [],
      xAxis: {
        type: "time",
        min: Number.isFinite(isExpanded ? fixedStartValue : selectedStartValue)
          ? (isExpanded ? fixedStartValue : selectedStartValue)
          : undefined,
        max: Number.isFinite(isExpanded ? fixedEndValue : selectedEndValue)
          ? (isExpanded ? fixedEndValue : selectedEndValue)
          : undefined,
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontWeight: 700,
          fontSize: 12,
          hideOverlap: true,
          margin: temporalAxisLabelMargin,
          formatter: (value) => {
            const date = new Date(value);
            if (interval === "monthly") {
              return formatCashflowMonthYear(date);
            }
            return formatBrazilianDate(date);
          },
        },
        axisLine: { lineStyle: { color: "rgba(15,23,42,0.18)" } },
        splitLine: { show: false },
        minInterval: interval === "monthly" ? 28 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
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
              show: !(compact && !isExpanded) && lastVisibleByStack[dataset.stack] === dataset.label,
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
        markLine: dataset.type !== "line" && datasetIndex === 0 && Number.isFinite(today)
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
              data: [{ xAxis: today }],
            }
          : undefined,
        data: dataset.type === "line"
          ? timelinePeriods.map((period, index) => ({
              value: [period.anchor.getTime(), Number(dataset.data[index] || 0)],
              periodLabel: period.label,
            }))
          : timelinePeriods.map((period, index) => ({
              value: [period.anchor.getTime(), Number(dataset.data[index] || 0)],
              periodLabel: period.label,
            })),
      })),
    };
  }, [
    chartState,
    compact,
    currencyConfig.label,
    chartWidth,
    fixedEndValue,
    fixedStartValue,
    hasNativeZoom,
    interval,
    isExpanded,
    lastVisibleByStack,
    responsiveBarGap,
    responsiveBarWidth,
    responsiveCategoryGap,
    selectedEndValue,
    selectedStartValue,
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
      const firstAnchor = timelinePeriods[0]?.anchor?.getTime?.();
      const lastAnchor = timelinePeriods[timelinePeriods.length - 1]?.anchor?.getTime?.();
      if (!Number.isFinite(firstAnchor) || !Number.isFinite(lastAnchor)) return;

      let startValue = Number(payload?.startValue);
      let endValue = Number(payload?.endValue);
      if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
        const startPercent = Math.min(Math.max(Number(payload?.start ?? 0), 0), 100);
        const endPercent = Math.min(Math.max(Number(payload?.end ?? 100), 0), 100);
        startValue = firstAnchor + ((lastAnchor - firstAnchor) * startPercent) / 100;
        endValue = firstAnchor + ((lastAnchor - firstAnchor) * endPercent) / 100;
      }

      const visiblePeriods = timelinePeriods.filter((period) => {
        const anchorTime = period.anchor?.getTime?.();
        return Number.isFinite(anchorTime) && anchorTime >= startValue && anchorTime <= endValue;
      });
      let nextPeriods = visiblePeriods.length ? visiblePeriods : timelinePeriods;
      if (nextPeriods.length < 2 && timelinePeriods.length >= 2) {
        const nearestIndex = timelinePeriods.reduce((bestIndex, period, index) => {
          const anchorTime = period.anchor?.getTime?.();
          const bestAnchorTime = timelinePeriods[bestIndex]?.anchor?.getTime?.();
          if (!Number.isFinite(anchorTime)) return bestIndex;
          if (!Number.isFinite(bestAnchorTime)) return index;
          const currentDistance = Math.abs(anchorTime - startValue);
          const bestDistance = Math.abs(bestAnchorTime - startValue);
          return currentDistance < bestDistance ? index : bestIndex;
        }, 0);
        const fallbackStartIndex = Math.max(0, Math.min(nearestIndex, timelinePeriods.length - 2));
        nextPeriods = timelinePeriods.slice(fallbackStartIndex, fallbackStartIndex + 2);
      }
      const nextStart = nextPeriods[0]?.start;
      const nextEnd = nextPeriods[nextPeriods.length - 1]?.end;
      if (!nextStart || !nextEnd) return;
      onDateRangeChange?.({ start: nextStart, end: nextEnd });
    },
    click: (params) => {
      if (params.componentType !== "series") return;
      const period = params?.data?.periodLabel || chartState.labels[params.dataIndex];
      const category = String(params.seriesName || "");
      if (category === "Saldo") return;
      const categoryKey = chartState.seriesDefs.find((item) => item.label === category)?.key;
      const chartRows = chartState.opsIndex.get(`${period}||${categoryKey}`) || [];
      if (!chartRows.length) return;
      onOpenTable?.({
        title: `${category} — ${period}`,
        resourceKey: chartRows[0]?.resourceKey,
        chartRows,
      });
    },
  }), [chartState, hasNativeZoom, onDateRangeChange, onOpenTable, timelinePeriods]);

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

  return (
      <div
        ref={sectionRef}
        className={`chart-card component-chartjs-card cashflow-chart-card summary-insight-card${compact ? " cashflow-chart-card--compact" : ""}${isExpanded ? " cashflow-chart-card--expanded" : ""}`}
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
      <div className="chart-card-header cashflow-chart-header">
        <div>
          <h3>{currencyConfig.title}</h3>
          <p className="muted">{isExpanded ? "Clique nas barras para detalhar e use o seletor inferior para recortar o período." : "Clique nas barras para detalhar o período."}</p>
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
            title={`${currencyConfig.title} — Saldo`}
            message={
              <SummaryInsightCopy
                paragraphs={[
                  `O saldo de ${formatMoneyByCurrency(saldoSummary, currencyConfig.label)} representa o resultado líquido entre entradas e saídas no período visível.`,
                  "Quando positivo, indica sobra de caixa nessa moeda; quando negativo, indica pressão financeira no recorte selecionado.",
                ]}
              />
            }
          />
          <span className="component-summary-label">
            <span className="component-summary-dot" style={{ background: "#64748b" }} />
            Saldo
          </span>
          <strong>{formatMoneyByCurrency(saldoSummary, currencyConfig.label)}</strong>
        </article>
      </section>
      <div ref={chartWrapRef} className={`component-chartjs-wrap cashflow-chartjs-wrap${compact ? " cashflow-chartjs-wrap--compact" : ""}${isExpanded ? " cashflow-chartjs-wrap--expanded" : ""}`}>
        <ReactECharts option={chartOption} notMerge onEvents={chartEvents} style={{ height: "100%" }} opts={{ renderer: "canvas" }} />
      </div>
    </div>
  );
}

function CashflowDashboard({ dashboardFilter, compact = false }) {
  const isMobileViewport = useViewportMatch("(max-width: 768px)");
  const defaultSelectionRange = useMemo(() => buildCashflowDefaultDateRange(), []);
  const sectionRefs = useRef({});
  const [interval, setInterval] = useState("monthly");
  const [expandedCurrencyKey, setExpandedCurrencyKey] = useState(null);
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: defaultSelectionRange.fromBrazilian,
    end: defaultSelectionRange.toBrazilian,
  });
  const [sales, setSales] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [crops, setCrops] = useState([]);
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
      resourceService.listAll("crops"),
    ]).then(([salesResponse, cashPaymentsResponse, derivativesResponse, counterpartiesResponse, cropsResponse]) => {
      if (!isMounted) return;
      setSales(salesResponse || []);
      setCashPayments(cashPaymentsResponse || []);
      setDerivatives(derivativesResponse || []);
      setCounterparties(counterpartiesResponse || []);
      setCrops(cropsResponse || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const counterpartyMap = useMemo(
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.contraparte || item.obs || `#${item.id}`])),
    [counterparties],
  );
  const cropsById = useMemo(
    () => Object.fromEntries((crops || []).map((item) => [String(item.id), item])),
    [crops],
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
          derivatives,
          counterpartyMap,
          dashboardFilter,
          currencyConfig,
          cropsById,
        }),
      ),
    [cashPayments, counterpartyMap, cropsById, dashboardFilter, derivatives, sales],
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
  const handleOpenTable = useCallback(({ title, resourceKey, chartRows }) => {
    if (!resourceKey || !chartRows?.length) return;
    const definition =
      resourceKey === "cash-payments"
        ? resourceDefinitions.cashPayments
        : resourceKey === "physical-sales"
          ? resourceDefinitions.physicalSales
          : resourceDefinitions.derivativeOperations;
    const sourceRows =
      resourceKey === "cash-payments"
        ? cashPayments
        : resourceKey === "physical-sales"
          ? sales
          : derivatives;
    const ids = new Set(
      chartRows
        .map((item) => item.recordId)
        .filter(Boolean)
        .map(String),
    );
    const filteredRows = sourceRows.filter((row) => ids.has(String(row.id)));
    if (!filteredRows.length) return;
    setSelectedTableModal({
      title,
      definition,
      rows: filteredRows,
    });
  }, [cashPayments, derivatives, sales]);

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
            cropsById,
          }),
        ]),
      ),
    [cashPayments, counterpartyMap, cropsById, dashboardFilter, derivatives, sales],
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
  const scrollToCurrencySection = useCallback((currencyKey) => {
    const node = sectionRefs.current[currencyKey];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const expandedRangeLabel = useMemo(() => {
    if (!expandedCurrencyKey) return "";
    return `de: ${formatShortBrazilianDate(dateRange.start)} a ${formatShortBrazilianDate(dateRange.end)}`;
  }, [dateRange.end, dateRange.start, expandedCurrencyKey]);
  const handleCurrencyToolbarClick = useCallback((currencyKey) => {
    if (compact && !isMobileViewport && expandedCurrencyKey) {
      setExpandedCurrencyKey(currencyKey);
      return;
    }
    scrollToCurrencySection(currencyKey);
  }, [compact, expandedCurrencyKey, isMobileViewport, scrollToCurrencySection]);

  return (
    <section className="component-sales-shell">
      {compact ? (
        <div className="cashflow-dashboard-toolbar">
          <div className="cashflow-currency-links">
            {CASHFLOW_CURRENCY_CONFIGS.map((currencyConfig) => (
              <button
                key={`cashflow-link-${currencyConfig.key}`}
                type="button"
                className={`cashflow-currency-link${expandedCurrencyKey === currencyConfig.key ? " active" : ""}`}
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
      {expandedCurrencyKey ? <div className="cashflow-expanded-range-label">{expandedRangeLabel}</div> : null}
      <section
        className={`cashflow-dashboard-shell${compact ? " cashflow-dashboard-shell--compact" : ""}${expandedCurrencyKey ? " cashflow-dashboard-shell--expanded" : ""}${compact && isMobileViewport ? " cashflow-dashboard-shell--mobile-stacked" : ""}`}
      >
      {visibleCurrencies.map((currencyConfig) => (
        <CashflowCurrencyChart
          key={currencyConfig.key}
          currencyConfig={currencyConfig}
          rows={currencyRows[currencyConfig.key] || []}
          interval={interval}
          dateRange={dateRange}
          fixedDateRange={sliderRange}
          compact={compact}
          isExpanded={compact && isMobileViewport ? true : expandedCurrencyKey === currencyConfig.key}
          onOpenTable={handleOpenTable}
          onDateRangeChange={handleDateRangeChange}
          sectionRef={(node) => {
            if (node) {
              sectionRefs.current[currencyConfig.key] = node;
            } else {
              delete sectionRefs.current[currencyConfig.key];
            }
          }}
          onToggleExpand={
            compact && !isMobileViewport
              ? () => setExpandedCurrencyKey((current) => (current === currencyConfig.key ? null : currencyConfig.key))
              : undefined
          }
        />
      ))}
      {editorNode}
      </section>
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
  const { options, toggleFilterValue, updateFilter } = useDashboardFilter();
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);
  const [hedgePolicies, setHedgePolicies] = useState([]);
  const [physicalPayments, setPhysicalPayments] = useState([]);
  const [cashPayments, setCashPayments] = useState([]);
  const [strategyTriggers, setStrategyTriggers] = useState([]);
  const [triggerQuotes, setTriggerQuotes] = useState([]);
  const [triggerExchanges, setTriggerExchanges] = useState([]);
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
    setAnalyticsReady(false);
    let timeoutId = 0;
    let idleId = 0;

    const loadAnalytics = () => {
      Promise.all([
        resourceService.listAll("physical-sales").catch(() => []),
        resourceService.listAll("derivative-operations").catch(() => []),
        resourceService.listAll("crop-boards").catch(() => []),
        resourceService.listAll("hedge-policies").catch(() => []),
        resourceService.listAll("physical-payments").catch(() => []),
        resourceService.listAll("strategy-triggers").catch(() => []),
        resourceService.listTradingviewQuotes({ force: true }).catch(() => []),
        resourceService.listAll("exchanges").catch(() => []),
      ])
        .then(([
          salesResponse,
          derivativeResponse,
          cropBoardResponse,
          policiesResponse,
          physicalPaymentsResponse,
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
          setStrategyTriggers(strategyTriggersResponse || []);
          setTriggerQuotes(triggerQuotesResponse || []);
          setTriggerExchanges(triggerExchangesResponse || []);
          setAnalyticsReady(true);
        });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(loadAnalytics, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(loadAnalytics, 180);
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
        if ("cancelIdleCallback" in window && idleId) {
          window.cancelIdleCallback(idleId);
        }
      }
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
  const formCompletionSummary = summaryData?.formCompletionSummary || {};

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
      ),
      formatHedgeSummaryPolicyDeviation(activeTotalValue, hedgeSummaryActivePoint?.minValue, hedgeSummaryActivePoint?.maxValue, "SC"),
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

    filteredPhysicalPayments.forEach((item) => {
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
    activePhysicalSales,
    derivativeStandardVolumeGetter,
    filteredPhysicalPayments,
    filteredCropBoards,
  ]);
  const coverageByCultureRows = useMemo(
    () =>
      longShortRows
        .slice(0, 4)
        .map((item) => ({
          label: item.label,
          value: `${formatNumber0(item.coverage * 100)}%`,
          note: `${formatNumber0(item.gap)} sc livres`,
        })),
    [longShortRows],
  );
  const topCoverageGap = longShortRows[0] || null;
  const policyStatusLabel = useMemo(() => {
    if (hedgeSummaryCardTone === "positive") return "Dentro";
    if (hedgeSummaryCardTone === "warning") return "Abaixo";
    if (hedgeSummaryCardTone === "danger") return "Acima";
    return "Neutro";
  }, [hedgeSummaryCardTone]);
  const policyDeviationValue = useMemo(() => {
    const total = Number(hedgeSummaryActivePoint?.total || 0);
    const minValue = Number(hedgeSummaryActivePoint?.minValue ?? 0);
    const maxValue = Number(hedgeSummaryActivePoint?.maxValue ?? 0);
    if (hedgeSummaryActivePoint?.minValue != null && total < minValue) {
      return `${formatNumber0(minValue - total)} sc`;
    }
    if (hedgeSummaryActivePoint?.maxValue != null && total > maxValue) {
      return `${formatNumber0(total - maxValue)} sc`;
    }
    return "0 sc";
  }, [hedgeSummaryActivePoint]);
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
  const derivativeExchangeExecutiveRows = useMemo(
    () =>
      derivativeOperationsByExchange
        .filter((item) => item.open > 0 || item.total > 0)
        .slice(0, 4)
        .map((item) => ({
          label: item.label,
          value: `${item.open} ab.`,
          note: `${formatNumber0(item.total > 0 ? (item.open / item.total) * 100 : 0)}% da bolsa`,
        })),
    [derivativeOperationsByExchange],
  );
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
  const summaryTriggerClosestRows = useMemo(
    () =>
      evaluatedSummaryTriggers
        .slice()
        .sort((left, right) => {
          const leftDistance = Number.isFinite(left.percentDistanceValue) ? Math.abs(left.percentDistanceValue) : Number.POSITIVE_INFINITY;
          const rightDistance = Number.isFinite(right.percentDistanceValue) ? Math.abs(right.percentDistanceValue) : Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
          return String(left.contractLabel).localeCompare(String(right.contractLabel));
        })
        .slice(0, 4)
        .map((item) => ({
          id: item.id,
          exchange: `${item.exchangeLabel} | ${item.contractLabel}`,
          label: `${item.directionLabel ? `${String(item.directionLabel).trim()} de` : "Sem direção"} ${formatTriggerMarketValue(item.strike)}${
            (triggerExchangePriceUnitMap.get(item.exchangeLabel) || item.priceUnitLabel) ? ` ${triggerExchangePriceUnitMap.get(item.exchangeLabel) || item.priceUnitLabel}` : ""
          }`.trim(),
          scope: `${item.groupSummary} | ${item.subgroupSummary}`,
          distance: formatTriggerTargetDistance(item),
          tone: item.isHit ? "is-hit" : Number.isFinite(item.percentDistanceValue) ? "is-open" : "is-missing",
        })),
    [evaluatedSummaryTriggers, triggerExchangePriceUnitMap],
  );

  const productionFlowSlices = useMemo(() => {
    const net = Math.max(displayedNetProductionVolume, 0);
    const committed = Math.max(displayedPhysicalPaymentVolume, 0);
    const total = Math.max(displayedProductionTotal, 0);
    const free = Math.max(net - totalCommercializedVolume, 0);
    const items = [
      { label: "Comercializado", value: Math.max(totalCommercializedVolume, 0), color: "#0f766e" },
      { label: "Livre", value: free, color: "#2563eb" },
      { label: "Pgto físico", value: committed, color: "#ea580c" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem dados", value: Math.max(total, 1), color: "#cbd5e1" }];
  }, [displayedNetProductionVolume, displayedPhysicalPaymentVolume, displayedProductionTotal, totalCommercializedVolume]);

  const commercializedMixBars = useMemo(
    () => [
      { label: "Físico", value: Math.max(activePhysicalCommercializedVolume, 0.01), formatted: `${formatNumber0(activePhysicalCommercializedVolume)} sc`, color: "#0f766e" },
      { label: "Derivativos", value: Math.max(activeDerivativeCommercializedVolume, 0.01), formatted: `${formatNumber0(activeDerivativeCommercializedVolume)} sc`, color: "#f59e0b" },
      { label: "Pgto físico", value: Math.max(displayedPhysicalPaymentVolume, 0.01), formatted: `${formatNumber0(displayedPhysicalPaymentVolume)} sc`, color: "#2563eb" },
    ],
    [activeDerivativeCommercializedVolume, activePhysicalCommercializedVolume, displayedPhysicalPaymentVolume],
  );

  const cultureGapBars = useMemo(
    () =>
      longShortRows
        .slice(0, 6)
        .map((item, index) => ({
          label: item.label,
          value: Math.max(item.gap || 0, 0.01),
          formatted: `${formatNumber0(item.gap || 0)} sc livres`,
          color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
        })),
    [longShortRows],
  );

  const maturityBars = useMemo(
    () =>
      upcomingByAppRows.map((item, index) => ({
        label: item.label,
        value: Math.max(Number.parseInt(item.value, 10) || 0, 0.01),
        formatted: item.note || item.value,
        color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
      })),
    [upcomingByAppRows],
  );

  const marketMoverBars = useMemo(() => {
    const movers = [...trackedQuotes]
      .sort((left, right) => Math.abs(Number(right.change_percent || 0)) - Math.abs(Number(left.change_percent || 0)))
      .slice(0, 6);
    return movers.map((item) => ({
      label: item.ticker || item.symbol || "Ativo",
      value: Math.max(Math.abs(Number(item.change_percent || 0)), 0.01),
      formatted: `${formatSignedQuoteNumber(item.change_percent)}%`,
      color: Number(item.change_percent || 0) >= 0 ? "#0f766e" : "#dc2626",
    }));
  }, [trackedQuotes]);

  const baseCompletionSlices = useMemo(() => {
    const items = [
      { label: "Preenchidos", value: Math.max(filledForms, 0), color: "#0f766e" },
      { label: "Pendentes", value: Math.max(pendingForms, 0), color: "#f59e0b" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem módulos", value: 1, color: "#cbd5e1" }];
  }, [filledForms, pendingForms]);

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
      insightTitle="Hedge produção líquida"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            "Este gráfico mostra, ao longo do tempo, quantas sacas da produção líquida já estão cobertas por vendas físicas e derivativos.",
            "A linha principal representa o hedge acumulado, enquanto a faixa de política indica o intervalo desejado para cada momento. Assim, os números mostram a evolução da cobertura em volume e em aderência à política.",
          ]}
        />
      }
    />
  );

  const hedgeRealizadoSummaryCard = (
    <HedgeStatusSummaryCard
      title="Resumo Hedge"
      tone={hedgeSummaryCardTone}
      summaryLines={hedgeSummaryHeaderLines}
      rows={hedgeSummaryCardRows}
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            "A primeira linha resume o percentual atual do hedge em relação à política.",
            "Quando o hedge estiver acima ou abaixo da política, a segunda linha mostra apenas o volume excedente ou faltante. As linhas seguintes mostram os limites mínimo e máximo da política aplicável ao ponto atual.",
          ]}
        />
      }
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
              selectedCultureIds={dashboardFilter?.cultura || []}
              onToggleCulture={(value) => toggleFilterValue("cultura", value)}
              onClearCultures={() => updateFilter("cultura", [])}
              referenceDate={hedgeSummaryReferenceDate}
              onOpenDetailTable={openCommercialRiskLongShortDetail}
            />
          </section>

          <section className="risk-kpi-derivative-donuts">
            <DonutChart
              centerLabel="Derivativos"
              centerValue={`${derivativeStatusCounts.total} ops`}
              slices={derivativeExchangeSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "all")}
              insightTitle="Distribuição de derivativos"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    `O número central de ${derivativeStatusCounts.total} ops representa a quantidade total de operações em derivativos dentro do filtro atual.`,
                    "Cada fatia mostra quantas operações pertencem a cada grupo da distribuição. Quanto maior a fatia, maior a participação daquele grupo no total exibido.",
                  ]}
                />
              }
            />
            <DonutChart
              centerLabel="Em aberto"
              centerValue={`${derivativeStatusCounts.open} ops`}
              slices={derivativeExchangeOpenSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "open")}
              insightTitle="Derivativos em aberto"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    `O número central de ${derivativeStatusCounts.open} ops mostra apenas as operações ainda em aberto, ou seja, posições que continuam ativas.`,
                    "As fatias indicam como essas posições ativas estão distribuídas entre os grupos do card, ajudando a enxergar onde o risco ainda está concentrado.",
                  ]}
                />
              }
            />
            <DonutChart
              centerLabel="Encerrado"
              centerValue={`${derivativeStatusCounts.closed} ops`}
              slices={derivativeExchangeClosedSlices}
              onSliceClick={(sliceLabel) => openDerivativeExchangeDetail(sliceLabel, "closed")}
              insightTitle="Derivativos encerrados"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    `O número central de ${derivativeStatusCounts.closed} ops representa as operações já encerradas dentro do recorte atual.`,
                    "As fatias mostram como os encerramentos se distribuem entre os grupos do card, permitindo comparar o histórico concluído com as posições ainda abertas.",
                  ]}
                />
              }
            />
          </section>

          <section className="risk-kpi-executive-grid">
            <CommercialRiskExecutiveCard
              title="Cobertura por cultura"
              subtitle="Onde a exposição ainda está mais aberta"
              emphasis={topCoverageGap ? topCoverageGap.label : "Sem dados"}
              tone={topCoverageGap?.gap > 0 ? "warning" : "positive"}
              rows={
                coverageByCultureRows.length
                  ? coverageByCultureRows
                  : [{ label: "Sem culturas", value: "—", note: "Aguardando dados no filtro atual." }]
              }
              insightTitle="Cobertura por cultura"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Este bloco resume rapidamente quais culturas estão mais cobertas e quais ainda guardam mais volume livre.",
                    "A porcentagem compara o que já foi coberto contra a produção daquela cultura, e a linha complementar mostra o saldo ainda sem ação.",
                  ]}
                />
              }
            />
            <CommercialRiskExecutiveCard
              title="Política do mês"
              subtitle={`Referência ${formatHedgeTitleDate(hedgeSummaryReferenceDate)}`}
              emphasis={
                activePolicyMinPercent != null && activePolicyMaxPercent != null
                  ? `${formatNumber0(activePolicyMinPercent)}% a ${formatNumber0(activePolicyMaxPercent)}%`
                  : "Sem faixa"
              }
              tone={hedgeSummaryCardTone}
              rows={[
                { label: "Coberto agora", value: `${formatNumber0(totalSalesPercent)}%`, note: `${formatNumber0(totalCommercializedVolume)} sc` },
                { label: "Status", value: policyStatusLabel, note: "Leitura frente à política" },
                { label: "Desvio", value: policyDeviationValue, note: "Volume fora da faixa" },
              ]}
              insightTitle="Política do mês"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Aqui a ideia é bater o olho e entender se o hedge atual está dentro, abaixo ou acima da faixa desejada.",
                    "A faixa mostra a política aplicável ao momento e o desvio aponta apenas o excesso ou a falta de volume frente a ela.",
                  ]}
                />
              }
            />
            <CommercialRiskExecutiveCard
              title="Próximos vencimentos"
              subtitle={`Próxima data: ${nextMaturityDate}`}
              emphasis={`${upcomingMaturityRows.length} agenda${upcomingMaturityRows.length === 1 ? "" : "s"}`}
              tone={upcomingMaturityRows.length ? "warning" : "neutral"}
              rows={
                upcomingByAppRows.length
                  ? upcomingByAppRows
                  : [{ label: "Sem compromissos", value: "—", note: "Nenhum vencimento futuro encontrado." }]
              }
              insightTitle="Próximos vencimentos"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Este quadro consolida os vencimentos mais próximos por tipo de operação para evitar que algo importante passe despercebido.",
                    "Ele não detalha contrato a contrato; serve só para mostrar rapidamente onde está a concentração da agenda.",
                  ]}
                />
              }
            />
            <CommercialRiskExecutiveCard
              title="Bolsas ativas"
              subtitle="Onde as posições em aberto estão concentradas"
              emphasis={`${derivativeStatusCounts.open} ops`}
              tone={derivativeStatusCounts.open > 0 ? "neutral" : "positive"}
              rows={
                derivativeExchangeExecutiveRows.length
                  ? derivativeExchangeExecutiveRows
                  : [{ label: "Sem derivativos", value: "—", note: "Nenhuma operação aberta no recorte." }]
              }
              insightTitle="Bolsas ativas"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "A leitura aqui é simples: em quais bolsas ainda está o maior número de operações abertas.",
                    "Isso ajuda a perceber rapidamente onde a carteira está mais concentrada operacionalmente.",
                  ]}
                />
              }
            />
            <CommercialRiskExecutiveCard
              title="Mercado hoje"
              subtitle={`${trackedQuotes.length} ativos com variação monitorada`}
              emphasis={topPositiveQuote?.ticker || topNegativeQuote?.ticker || "Sem cotações"}
              tone="neutral"
              rows={[
                {
                  label: "Maior alta",
                  value: topPositiveQuote ? `${topPositiveQuote.ticker} ${formatSignedQuoteNumber(topPositiveQuote.change_percent)}%` : "—",
                  note: topPositiveQuote ? `${formatQuoteNumber(topPositiveQuote.price)} ${topPositiveQuote.currency || ""}`.trim() : "Sem dado",
                },
                {
                  label: "Maior queda",
                  value: topNegativeQuote ? `${topNegativeQuote.ticker} ${formatSignedQuoteNumber(topNegativeQuote.change_percent)}%` : "—",
                  note: topNegativeQuote ? `${formatQuoteNumber(topNegativeQuote.price)} ${topNegativeQuote.currency || ""}`.trim() : "Sem dado",
                },
                {
                  label: "Fontes",
                  value: `${new Set(marketQuotes.map((item) => item?.section_name).filter(Boolean)).size} seções`,
                  note: "Resumo de humor do mercado",
                },
              ]}
              insightTitle="Mercado hoje"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Este card não tenta mostrar todas as cotações. Ele destaca apenas o movimento mais forte de alta, o de baixa e a abrangência do monitoramento.",
                    "A ideia é trazer um termômetro rápido do mercado para contextualizar o restante do resumo.",
                  ]}
                />
              }
            />
            <CommercialRiskExecutiveCard
              title="Base preenchida"
              subtitle={`${filledForms} de ${totalForms} módulos com registros`}
              emphasis={`${formatNumber0(filledFormsPercent)}%`}
              tone={pendingForms > 0 ? "warning" : "positive"}
              rows={
                pendingFormRows.length
                  ? pendingFormRows
                  : [{ label: "Sem pendências", value: "Base ok", note: "Todos os módulos do resumo já têm registros." }]
              }
              insightTitle="Base preenchida"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Este é um indicador rápido de qualidade da base usada pelo resumo.",
                    "Quando aparecem pendências aqui, normalmente vale revisar esses módulos antes de aprofundar qualquer análise.",
                  ]}
                />
              }
            />
          </section>

          <section className="risk-kpi-derivative-donuts">
            <DonutChart
              centerLabel="Produção"
              centerValue={`${formatNumber0(displayedNetProductionVolume)} sc`}
              slices={productionFlowSlices}
              insightTitle="Fluxo da produção"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Esse gráfico divide a produção líquida entre o que já foi comercializado, o que segue livre e o que já está comprometido em pagamentos físicos.",
                    "A leitura é generalista e ajuda a entender o estágio operacional da produção dentro do filtro atual.",
                  ]}
                />
              }
            />
            <ScenarioBars
              data={commercializedMixBars}
              insightTitle="Mix de proteção"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Aqui a ideia é comparar rapidamente o peso relativo entre físico, derivativos e pagamentos físicos.",
                    "Funciona como um retrato simples da composição do volume já tratado na operação.",
                  ]}
                />
              }
            />
            <ScenarioBars
              data={cultureGapBars.length ? cultureGapBars : [{ label: "Sem dados", value: 1, formatted: "0 sc livres", color: "#cbd5e1" }]}
              insightTitle="Gap por cultura"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Mostra quais culturas ainda concentram maior volume livre, sem ação comercial equivalente.",
                    "É útil para enxergar onde a visão generalista aponta maior espaço de decisão.",
                  ]}
                />
              }
            />
            <ScenarioBars
              data={maturityBars.length ? maturityBars : [{ label: "Sem agenda", value: 1, formatted: "Sem vencimentos", color: "#cbd5e1" }]}
              insightTitle="Agenda de vencimentos"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Distribui os próximos vencimentos por bloco operacional.",
                    "Serve como visão geral de pressão de agenda no curto prazo.",
                  ]}
                />
              }
            />
            <ScenarioBars
              data={marketMoverBars.length ? marketMoverBars : [{ label: "Sem cotações", value: 1, formatted: "0,00%", color: "#cbd5e1" }]}
              insightTitle="Movimentos do mercado"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Destaca os ativos com maior variação percentual entre as cotações monitoradas.",
                    "Ajuda a trazer contexto de mercado para a leitura generalista do resumo.",
                  ]}
                />
              }
            />
            <DonutChart
              centerLabel="Base"
              centerValue={`${formatNumber0(filledFormsPercent)}%`}
              slices={baseCompletionSlices}
              insightTitle="Qualidade da base"
              insightMessage={
                <SummaryInsightCopy
                  paragraphs={[
                    "Mostra a proporção entre módulos já preenchidos e pendentes dentro do resumo.",
                    "É uma leitura importante porque a visão generalista fica mais confiável quanto mais completa estiver a base.",
                  ]}
                />
              }
            />
            <article className="chart-card strategy-top-summary-card is-table summary-insight-card">
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
                {summaryTriggerClosestRows.length ? (
                  summaryTriggerClosestRows.map((item) => (
                    <div key={item.id} className="strategy-top-table-row strategy-top-table-row--summary">
                      <span>{item.exchange}</span>
                      <span>{item.label}</span>
                      <small>{item.scope}</small>
                      <strong className={item.tone}>{item.distance}</strong>
                    </div>
                  ))
                ) : (
                  <div className="strategy-top-table-empty">Sem gatilhos com percentual calculado.</div>
                )}
              </div>
            </article>
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
  insightTitle = "",
  insightMessage = null,
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
          longShortCenterTextPlugin: { enabled: false },
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
  const productionReferenceDate = activeProductionPoint?.date || null;
  const productionActivePhysicalSales = useMemo(
    () =>
      filteredPhysicalSales.filter((item) => {
        const saleDate = startOfDashboardDay(item.data_negociacao || item.created_at);
        return saleDate && productionReferenceDate && saleDate <= productionReferenceDate;
      }),
    [filteredPhysicalSales, productionReferenceDate],
  );
  const productionActiveDerivatives = useMemo(
    () =>
      filteredCommodityDerivatives.filter((item) => {
        const startDate = startOfDashboardDay(item.data_contratacao || item.created_at);
        const endDate = startOfDashboardDay(item.data_liquidacao || item.data_contratacao || item.created_at);
        return startDate && endDate && productionReferenceDate && startDate <= productionReferenceDate && productionReferenceDate < endDate;
      }),
    [filteredCommodityDerivatives, productionReferenceDate],
  );
  const productionPhysicalPriceLines = useMemo(() => {
    const groups = new Map();
    productionActivePhysicalSales.forEach((item) => {
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
  }, [productionActivePhysicalSales]);
  const productionDerivativePriceLines = useMemo(() => {
    const groups = new Map();
    productionActiveDerivatives.forEach((item) => {
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
  }, [derivativeStandardVolumeGetter, productionActiveDerivatives]);
  const productionSummaryProps = useMemo(() => {
    const activeTotalValue =
      (activeProductionPoint?.total || 0) + (productionActiveIndex === productionChartState.points.length - 1 ? parsedSimulationVolume : 0);
    const activePhysicalValue = activeProductionPoint?.physicalRaw || 0;
    const activeDerivativeValue = activeProductionPoint?.derivativeRaw || 0;
    const activeTotalPercent = productionBase > 0 ? (activeTotalValue / productionBase) * 100 : 0;
    const activePhysicalPercent = activeTotalValue > 0 ? (activePhysicalValue / activeTotalValue) * 100 : 0;
    const activeDerivativePercent = activeTotalValue > 0 ? (activeDerivativeValue / activeTotalValue) * 100 : 0;
    return {
      totalPercent: activeTotalPercent,
      totalMetricValue: activeTotalValue,
      totalMetricLabel: totalArea > 0 ? `${formatNumber2(activeTotalValue / totalArea)} scs/ha` : `${formatNumber0(activeTotalValue)} sc`,
      physicalPercent: activePhysicalPercent,
      physicalMetricValue: activePhysicalValue,
      physicalMetricLabel: totalArea > 0 ? `${formatNumber2(activePhysicalValue / totalArea)} scs/ha` : `${formatNumber0(activePhysicalValue)} sc`,
      physicalDetailLines: productionPhysicalPriceLines.length
        ? productionPhysicalPriceLines.map((item) => `${formatNumber0(item.volume)} sc | ${formatCurrency2(item.averagePrice)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
        : [],
      derivativePercent: activeDerivativePercent,
      derivativeMetricValue: activeDerivativeValue,
      derivativeMetricLabel: totalArea > 0 ? `${formatNumber2(activeDerivativeValue / totalArea)} scs/ha` : `${formatNumber0(activeDerivativeValue)} sc`,
      derivativeDetailLines: productionDerivativePriceLines.length
        ? productionDerivativePriceLines.map((item) => `${formatNumber0(item.volume)} sc | Strike ${formatCurrency2(item.averageStrike)}${item.unitLabel ? ` ${item.unitLabel}` : ""}`)
        : [],
      policyMinPercent: activeProductionPoint?.minPct != null ? activeProductionPoint.minPct * 100 : null,
      policyMaxPercent: activeProductionPoint?.maxPct != null ? activeProductionPoint.maxPct * 100 : null,
    };
  }, [
    activeProductionPoint,
    parsedSimulationVolume,
    productionActiveIndex,
    productionBase,
    productionChartState.points.length,
    productionDerivativePriceLines,
    productionPhysicalPriceLines,
    totalArea,
  ]);
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
    const summaryLines = [
      formatHedgeSummaryPolicyHeadline(totalValue, baseValue, activePoint?.minValue, activePoint?.maxValue),
      formatHedgeSummaryPolicyDeviation(totalValue, activePoint?.minValue, activePoint?.maxValue, unit),
    ].filter(Boolean);

    return {
      title: "Resumo Hedge",
      tone,
      summaryLines,
      insightMessage: (
        <SummaryInsightCopy
          paragraphs={[
            `A primeira linha resume o percentual atual do hedge${isCost ? " sobre o custo" : " sobre a produção"} em relação à política.`,
            "Quando o hedge estiver acima ou abaixo da política, a segunda linha mostra apenas o valor excedente ou faltante. As linhas abaixo mostram os limites mínimo e máximo da política aplicável ao ponto selecionado.",
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
      insightTitle="Hedge sobre o custo"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            `Este gráfico compara o hedge realizado sobre o custo total da operação. A base usada para o cálculo é de R$ ${formatCurrency2(costBase)}.`,
            `Em cada ponto do tempo, a linha mostra quanto desse custo já está protegido via vendas físicas e derivativos, e a faixa indica a política mínima e máxima desejada.`,
          ]}
        />
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
      insightTitle="Hedge produção líquida"
      insightMessage={
        <SummaryInsightCopy
          paragraphs={[
            `Este gráfico acompanha a cobertura da produção líquida, cuja base atual é ${formatNumber0(productionBase)} sc${totalArea > 0 ? `, equivalente a ${formatNumber2(productionBase / totalArea)} scs/ha` : ""}.`,
            "A linha mostra quanto da produção já foi coberta por físico e derivativos em cada período, comparando o realizado com a faixa da política.",
          ]}
        />
      }
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

    if (!isUsdContract) {
      return contractRevenue;
    }

    const today = startOfDashboardDay(new Date());
    const paymentDate = startOfDashboardDay(item.data_pagamento);
    const usesSpotQuote = paymentDate && today ? paymentDate.getTime() >= today.getTime() : false;
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

  const selectedCurrencyLabel = currencyMode === "U$" ? "U$" : "R$";

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
        const originalValueBrl = Number(item.ajustes_totais_brl || 0);
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
        if (currencyMode === "AMBOS_R$") return true;
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

  const strategyLoadBars = useMemo(
    () =>
      strategyCardRows
        .slice()
        .sort((left, right) => right.totalTriggers - left.totalTriggers)
        .slice(0, 6)
        .map((item, index) => ({
          label: item.descricao_estrategia || `Estratégia ${item.id}`,
          value: item.totalTriggers || 0.01,
          formatted: `${item.totalTriggers} gatilho(s)`,
          color: COMMERCIAL_RISK_DERIVATIVE_COLORS[index % COMMERCIAL_RISK_DERIVATIVE_COLORS.length],
        })),
    [strategyCardRows],
  );

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

function MtmDashboard({ dashboardFilter }) {
  const [derivatives, setDerivatives] = useState([]);
  const [physicalSales, setPhysicalSales] = useState([]);
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [resourceTableModal, setResourceTableModal] = useState(null);
  const [mtmScope, setMtmScope] = useState("all");
  const [mtmFacet, setMtmFacet] = useState("all");

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
  const openMtmRowsModal = useCallback((title, rows, definition = resourceDefinitions.derivativeOperations) => {
    setResourceTableModal({
      title,
      definition,
      rows,
    });
  }, []);

  const createMiniHorizontalBarOption = useCallback(
    ({ rows, color = "#2563eb", valueFormatter = formatMtmCompactLabel, minValue = null }) => ({
      animationDuration: 180,
      grid: { left: 92, right: 14, top: 14, bottom: 14 },
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
        min: minValue,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
      },
      yAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontWeight: 700, formatter: (value) => String(value).slice(0, 18) },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { color, borderRadius: CHART_BAR_RADIUS },
          label: {
            show: true,
            position: ({ value }) => (Number(value || 0) >= 0 ? "insideRight" : "insideLeft"),
            color: "#ffffff",
            fontWeight: 800,
            formatter: ({ value }) => (Math.abs(Number(value || 0)) > 0 ? valueFormatter(value) : ""),
          },
          data: rows.map((item) => item.value),
        },
      ],
    }),
    [],
  );

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

  const positionRows = useMemo(() => {
    const map = new Map();
    normalizedRows.forEach((item) => {
      const label = item?.posicao ? String(item.posicao).trim() : "Sem posição";
      const current = map.get(label) || { label, total: 0, netBrl: 0, volume: 0, open: 0, rows: [] };
      current.total += 1;
      current.netBrl += item.mtmBrl;
      current.volume += item.standardVolume || item.rawVolume || 0;
      current.rows.push(item);
      if (item.statusLabel === "Em aberto") current.open += 1;
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => right.total - left.total);
  }, [normalizedRows]);

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

  const openExchangePressureRows = useMemo(() => {
    const map = new Map();
    openRowsInView.forEach((item) => {
      const current = map.get(item.exchangeLabel) || { label: item.exchangeLabel, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(item.exchangeLabel, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 6);
  }, [openRowsInView]);

  const openTypeExposureRows = useMemo(() => {
    const map = new Map();
    openRowsInView.forEach((item) => {
      const label = item.derivativeType || "Outros";
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.standardVolume || item.rawVolume || 0;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => right.value - left.value).slice(0, 6);
  }, [openRowsInView]);

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

  const openPositionNetRows = useMemo(() => {
    const map = new Map();
    openRowsInView.forEach((item) => {
      const label = item?.posicao ? String(item.posicao).trim() : "Sem posição";
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 6);
  }, [openRowsInView]);

  const openDirectionSlices = useMemo(() => ([
    { name: "Positivas", value: openRowsInView.filter((item) => item.direction === "positive").length, itemStyle: { color: "#16a34a" } },
    { name: "Negativas", value: openRowsInView.filter((item) => item.direction === "negative").length, itemStyle: { color: "#dc2626" } },
    { name: "Neutras", value: openRowsInView.filter((item) => item.direction === "neutral").length, itemStyle: { color: "#94a3b8" } },
  ]).filter((item) => item.value > 0), [openRowsInView]);

  const closedExchangeResultRows = useMemo(() => {
    const map = new Map();
    closedRowsInView.forEach((item) => {
      const current = map.get(item.exchangeLabel) || { label: item.exchangeLabel, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(item.exchangeLabel, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 6);
  }, [closedRowsInView]);

  const closedTypeResultRows = useMemo(() => {
    const map = new Map();
    closedRowsInView.forEach((item) => {
      const label = item.derivativeType || "Outros";
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 6);
  }, [closedRowsInView]);

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

  const closedPositionResultRows = useMemo(() => {
    const map = new Map();
    closedRowsInView.forEach((item) => {
      const label = item?.posicao ? String(item.posicao).trim() : "Sem posição";
      const current = map.get(label) || { label, value: 0, rows: [] };
      current.value += item.mtmBrl;
      current.rows.push(item);
      map.set(label, current);
    });
    return Array.from(map.values()).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 6);
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
        key: "contract-month",
        title: "Contratações por mês",
        subtitle: "Ritmo de montagem do book derivativo.",
        option: createMiniLineOption({
          rows: monthlyContractRows,
          color: "#2563eb",
          valueFormatter: formatNumber0,
        }),
      },
      {
        key: "settlement-month",
        title: "Liquidações por mês",
        subtitle: "Saldo mensal das liquidações do portfólio.",
        option: createMiniLineOption({
          rows: monthlySettlementRows,
          color: "#7c3aed",
        }),
      },
      {
        key: "price-exchange",
        title: "Preço médio por bolsa",
        subtitle: "Preço ponderado das vendas físicas.",
        option: createMiniHorizontalBarOption({
          rows: salesExchangeRows.slice(0, 6).map((item) => ({ label: item.label, value: item.priceAvg })),
          color: "#0f766e",
          valueFormatter: (value) => `R$ ${formatCurrency2(value)}`,
          minValue: 0,
        }),
      },
      {
        key: "sales-volume-exchange",
        title: "Volume vendido por bolsa",
        subtitle: "Sacas físicas já precificadas por bolsa.",
        option: createMiniVerticalBarOption({
          rows: salesExchangeRows.slice(0, 6).map((item) => ({ label: item.label, value: item.volume })),
          color: "#6366f1",
          valueFormatter: formatNumber0,
        }),
      },
      {
        key: "basis-mtm-scatter",
        title: "Basis x MTM por bolsa",
        subtitle: "Cruza basis físico e saldo derivativo por bolsa.",
        option: {
          animationDuration: 180,
          grid: { left: 38, right: 16, top: 18, bottom: 32 },
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
            axisLabel: { color: "#475569", formatter: (value) => formatNumber2(value) },
            splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
          },
          yAxis: {
            type: "value",
            axisLabel: { show: false },
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
        key: "contract-table",
        title: "Top contratos derivativos",
        subtitle: "Contratos com maior peso no saldo absoluto.",
        table: {
          columns: ["Contrato", "Ops", "MTM"],
          rows: contractRows.slice(0, 6).map((item) => ({
            key: item.label,
            cells: [item.label, formatNumber0(item.total), formatMtmIntegerLabel(item.netBrl)],
            tone: item.netBrl >= 0 ? "positive" : "negative",
            onClick: () => openMtmRowsModal(`Contrato ${item.label}`, item.rows),
          })),
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
        key: "basis-exchange-table",
        title: "Resumo basis por bolsa",
        subtitle: "Liga basis, preço e volume vendido.",
        table: {
          columns: ["Bolsa", "Basis", "Preço", "Volume"],
          rows: salesExchangeRows.slice(0, 6).map((item) => ({
            key: item.label,
            cells: [item.label, formatNumber2(item.basisAvg), `R$ ${formatCurrency2(item.priceAvg)}`, `${formatNumber0(item.volume)} sc`],
            onClick: () => openMtmRowsModal(`Vendas físicas · ${item.label}`, item.rows, resourceDefinitions.physicalSales),
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
    createMiniHorizontalBarOption,
    createMiniLineOption,
    createMiniVerticalBarOption,
    derivativeTypeRows,
    exchangeRows,
    monthlyContractRows,
    monthlySettlementRows,
    normalizedRows,
    openMtmRowsModal,
    openRiskRows,
    positionRows,
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

  const heatmapOption = {
    animationDuration: 220,
    tooltip: { position: "top" },
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
        type: "heatmap",
        data: heatmapSource.data,
        label: { show: true, color: "#431407", fontWeight: 800 },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(15, 23, 42, 0.15)" } },
        itemStyle: {
          borderColor: "rgba(255, 255, 255, 0.7)",
          borderWidth: 1,
        },
      },
    ],
    visualMap: {
      show: false,
      min: 0,
      max: Math.max(...heatmapSource.data.map((item) => item[2]), 1),
      inRange: { color: ["#fff7ed", "#fdba74", "#f97316", "#9a3412"] },
    },
  };

  const heatmapMtmOption = {
    animationDuration: 220,
    tooltip: {
      position: "top",
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
        type: "heatmap",
        data: heatmapMtmSource.data,
        label: {
          show: true,
          fontWeight: 800,
          color: "#0f172a",
          formatter: ({ value }) => {
            const numericValue = Array.isArray(value) ? value[2] : value;
            return Math.abs(Number(numericValue || 0)) > 0 ? formatMtmCompactLabel(numericValue) : "R$ 0";
          },
        },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(15, 23, 42, 0.15)" } },
        itemStyle: {
          borderColor: "rgba(255, 255, 255, 0.7)",
          borderWidth: 1,
        },
      },
    ],
    visualMap: {
      show: false,
      min: -heatmapMtmSource.maxAbs,
      max: heatmapMtmSource.maxAbs,
      inRange: {
        color: [
          "#991b1b",
          "#dc2626",
          "#fca5a5",
          "#fff7ed",
          "#dcfce7",
          "#4ade80",
          "#15803d",
        ],
      },
    },
  };

  const openExchangeModal = useCallback((exchangeLabel) => {
    const rows = normalizedRows.filter((item) => item.exchangeLabel === exchangeLabel);
    openMtmRowsModal(`${exchangeLabel} · Operações de derivativos`, rows);
  }, [normalizedRows, openMtmRowsModal]);

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
          help: "Soma dos ajustes MTM R$ das operações encerradas.",
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

  const openExchangePressureEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = openExchangePressureRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Em aberto · ${row.label}`, row.rows);
      },
    }),
    [openExchangePressureRows, openMtmRowsModal],
  );

  const openTypeExposureEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = openTypeExposureRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Em aberto · ${row.label}`, row.rows);
      },
    }),
    [openMtmRowsModal, openTypeExposureRows],
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

  const openPositionNetEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = openPositionNetRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Em aberto · ${row.label}`, row.rows);
      },
    }),
    [openMtmRowsModal, openPositionNetRows],
  );

  const openDirectionEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const direction =
          params.name === "Positivas" ? "positive" : params.name === "Negativas" ? "negative" : "neutral";
        openMtmRowsModal(`Em aberto · ${params.name}`, openRowsInView.filter((item) => item.direction === direction));
      },
    }),
    [openMtmRowsModal, openRowsInView],
  );

  const closedExchangeResultEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = closedExchangeResultRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Encerrado · ${row.label}`, row.rows);
      },
    }),
    [closedExchangeResultRows, openMtmRowsModal],
  );

  const closedTypeResultEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = closedTypeResultRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Encerrado · ${row.label}`, row.rows);
      },
    }),
    [closedTypeResultRows, openMtmRowsModal],
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

  const closedPositionResultEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.componentType !== "series") return;
        const row = closedPositionResultRows.find((item) => item.label === params.name);
        if (!row) return;
        openMtmRowsModal(`Encerrado · ${row.label}`, row.rows);
      },
    }),
    [closedPositionResultRows, openMtmRowsModal],
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

  if (!normalizedRows.length) {
    return (
      <section className="mtm-shell">
        <article className="card mtm-empty-card">
          <strong>Sem derivativos para o recorte atual.</strong>
          <p>O dashboard de MTM só aparece quando existem operações em `derivative-operations`. Nesta visão, o filtro de cultura é ignorado por padrão.</p>
        </article>
      </section>
    );
  }

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
            <button
              type="button"
              key={`${card.label}-${item.label}`}
              className={`mtm-hero-metric${card.isActive && mtmFacet === item.key ? " is-active" : ""}`}
              aria-pressed={card.isActive && mtmFacet === item.key}
              onClick={(event) => {
                event.stopPropagation();
                setMtmScope(card.key);
                setMtmFacet(item.key);
              }}
            >
              <small>{item.label}</small>
              <b>{item.value}</b>
            </button>
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
                <ReactECharts option={statusDonutOption} onEvents={statusDonutEvents} style={{ height: 340, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
              <div>
                <div className="mtm-chart-head">
                  <h3>Abertas x encerradas</h3>
                  <p>Mix operacional do book.</p>
                </div>
                <ReactECharts option={openClosedDonutOption} onEvents={openClosedDonutEvents} style={{ height: 340, width: "100%" }} opts={{ renderer: "svg" }} />
              </div>
            </div>
          </article>
        </section>
        <section className="mtm-chart-grid">
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>MTM por bolsa</h3>
              <p>Bloco positivo versus pressão negativa por bolsa.</p>
            </div>
            <ReactECharts option={exchangeMtmOption} onEvents={exchangeMtmEvents} style={{ height: 460, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Status por bolsa</h3>
              <p>Distribuição de operações em aberto e encerradas.</p>
            </div>
            <ReactECharts option={exchangeStatusOption} onEvents={exchangeStatusEvents} style={{ height: 400, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Matriz bolsa x tipo</h3>
              <p>Heatmap com a concentração operacional por tipo de derivativo.</p>
            </div>
            <ReactECharts option={heatmapOption} onEvents={heatmapEvents} style={{ height: 400, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Matriz MTM R$ x tipo</h3>
              <p>Heatmap com os ajustes MTM em R$ por bolsa e estrutura.</p>
            </div>
            <ReactECharts option={heatmapMtmOption} onEvents={heatmapEvents} style={{ height: 400, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
        </section>
        <section className="mtm-exchange-section">
          <div className="mtm-section-head">
            <h3>Cards por bolsa</h3>
            <p>Um bloco para cada bolsa, sem filtro por cultura e com leitura rápida de quantidade, ganho, perda e operação extrema.</p>
          </div>
          <div className="mtm-exchange-grid">
            {exchangeRows.map((exchange) => {
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
          </div>
        </section>
        <section className="mtm-extra-section">
          <div className="mtm-section-head">
            <h3>Mais Insights</h3>
            <p>Leituras adicionais para explorar estrutura, risco, ritmo operacional e basis das vendas físicas junto do book derivativo.</p>
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
          <p>Recorte focado nas posições ainda ativas, com prioridade para vencimento próximo, exposição e monitoramento do resultado vivo.</p>
        </div>
        <section className="mtm-chart-grid">
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>Volume semanal até 90d</h3>
              <p>Semanas S1 a S13, com colunas separadas por bolsa e tooltip com o intervalo completo.</p>
            </div>
            <ReactECharts option={weeklyVolumeByExchangeOption} onEvents={weeklyVolumeByExchangeEvents} style={{ height: 400, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
          <article className="card mtm-chart-card">
            <div className="mtm-chart-head">
              <h3>MTM semanal até 90d</h3>
              <p>Semanas S1 a S13, com colunas separadas por bolsa e leitura dos ajustes MTM em R$.</p>
            </div>
            <ReactECharts option={weeklyMtmByExchangeOption} onEvents={weeklyMtmByExchangeEvents} style={{ height: 400, width: "100%" }} opts={{ renderer: "svg" }} />
          </article>
        </section>
        <section className="mtm-extra-section">
          <div className="mtm-section-head">
            <h3>Painel operacional em aberto</h3>
            <p>Gráficos dedicados apenas às posições em aberto, olhando pressão, exposição, vencimento e composição do book vivo.</p>
          </div>
          <div className="mtm-extra-grid">
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Pressão por bolsa</h4>
                <p>Saldo MTM das operações ainda abertas por bolsa.</p>
              </div>
              <ReactECharts
                option={createMiniHorizontalBarOption({ rows: openExchangePressureRows, color: "#16a34a" })}
                onEvents={openExchangePressureEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Exposição por tipo</h4>
                <p>Volume ainda aberto por estrutura derivativa.</p>
              </div>
              <ReactECharts
                option={createMiniVerticalBarOption({ rows: openTypeExposureRows, color: "#2563eb", valueFormatter: formatNumber0 })}
                onEvents={openTypeExposureEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Janela de vencimento</h4>
                <p>Quantidade de posições abertas por faixa de dias.</p>
              </div>
              <ReactECharts
                option={createMiniVerticalBarOption({ rows: openSettlementBandRows, color: "#7c3aed", valueFormatter: formatNumber0 })}
                onEvents={openSettlementBandEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>MTM por posição</h4>
                <p>Compra versus venda nas operações ainda vivas.</p>
              </div>
              <ReactECharts
                option={createMiniHorizontalBarOption({ rows: openPositionNetRows, color: "#f97316" })}
                onEvents={openPositionNetEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Mix de sinal</h4>
                <p>Quantas abertas estão positivas, negativas ou neutras.</p>
              </div>
              <ReactECharts
                option={createMiniDonutOption({ rows: openDirectionSlices, centerLabel: "Abertas", centerValue: formatNumber0(openRowsInView.length) })}
                onEvents={openDirectionEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
          </div>
        </section>
      </section>
      ) : null}

      {closedRowsInView.length ? (
      <section className="mtm-phase-section">
        <div className="mtm-phase-head">
          <h2>Encerrado</h2>
          <p>Resultado já realizado, com foco nas operações finalizadas e nas maiores contribuições efetivas do período filtrado.</p>
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
        <section className="mtm-extra-section">
          <div className="mtm-section-head">
            <h3>Painel operacional encerrado</h3>
            <p>Gráficos dedicados apenas às operações liquidadas, olhando captura de resultado, distribuição e composição do realizado.</p>
          </div>
          <div className="mtm-extra-grid">
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Resultado por bolsa</h4>
                <p>Saldo realizado das operações encerradas por bolsa.</p>
              </div>
              <ReactECharts
                option={createMiniHorizontalBarOption({ rows: closedExchangeResultRows, color: "#16a34a" })}
                onEvents={closedExchangeResultEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Resultado por tipo</h4>
                <p>Estruturas que mais contribuíram no encerrado.</p>
              </div>
              <ReactECharts
                option={createMiniHorizontalBarOption({ rows: closedTypeResultRows, color: "#0f766e" })}
                onEvents={closedTypeResultEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Liquidação por mês</h4>
                <p>Ritmo mensal do MTM realizado no encerrado.</p>
              </div>
              <ReactECharts
                option={createMiniLineOption({ rows: closedSettlementMonthRows, color: "#7c3aed" })}
                onEvents={closedSettlementMonthEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Resultado por posição</h4>
                <p>Compra versus venda no book já encerrado.</p>
              </div>
              <ReactECharts
                option={createMiniHorizontalBarOption({ rows: closedPositionResultRows, color: "#ea580c" })}
                onEvents={closedPositionResultEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
            <article className="card mtm-mini-card">
              <div className="mtm-mini-card-head">
                <h4>Mix de sinal realizado</h4>
                <p>Quantas encerradas fecharam positivas, negativas ou neutras.</p>
              </div>
              <ReactECharts
                option={createMiniDonutOption({ rows: closedDirectionSlices, centerLabel: "Encerradas", centerValue: formatNumber0(closedRowsInView.length) })}
                onEvents={closedDirectionEvents}
                style={{ height: 290, width: "100%" }}
                opts={{ renderer: "svg" }}
              />
            </article>
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
        />
      ) : null}
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
