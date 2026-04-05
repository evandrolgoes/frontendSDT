import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

import { InfoPopup } from "../components/InfoPopup";
import { PageHeader } from "../components/PageHeader";
import { resourceService } from "../services/resourceService";

const DEFAULT_SERIES_IDS = ["soja", "farelo-soja", "oleo-soja", "milho", "algodao", "acucar", "petroleo-wti", "ouro", "gas-natural"];

let chartRegistered = false;

const lastNetValueLabelPlugin = {
  id: "lastNetValueLabelPlugin",
  afterDatasetsDraw(chart) {
    const datasetIndex = chart.data.datasets.findIndex((dataset) => dataset?.label === "NET");
    if (datasetIndex < 0) {
      return;
    }

    const dataset = chart.data.datasets[datasetIndex];
    const meta = chart.getDatasetMeta(datasetIndex);
    if (!dataset || !meta || meta.hidden) {
      return;
    }

    const values = Array.isArray(dataset.data) ? dataset.data : [];
    let lastIndex = -1;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (Number.isFinite(Number(values[index]))) {
        lastIndex = index;
        break;
      }
    }

    if (lastIndex < 0 || !meta.data?.[lastIndex]) {
      return;
    }

    const point = meta.data[lastIndex];
    const value = Number(values[lastIndex]);
    const label = formatInteger(value);
    const { ctx, chartArea } = chart;
    const isNegative = value < 0;
    const paddingX = 8;
    const boxHeight = 24;
    const textY = point.y;
    let boxX = point.x + 8;
    let boxY = textY - boxHeight - 8;

    ctx.save();
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const boxWidth = ctx.measureText(label).width + paddingX * 2;

    if (boxX + boxWidth > chartArea.right) {
      boxX = point.x - boxWidth - 8;
    }
    if (boxX < chartArea.left) {
      boxX = chartArea.left + 4;
    }
    if (boxY < chartArea.top) {
      boxY = textY + 8;
    }
    if (boxY + boxHeight > chartArea.bottom) {
      boxY = chartArea.bottom - boxHeight - 4;
    }

    ctx.beginPath();
    const radius = 10;
    ctx.moveTo(boxX + radius, boxY);
    ctx.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxHeight, radius);
    ctx.arcTo(boxX + boxWidth, boxY + boxHeight, boxX, boxY + boxHeight, radius);
    ctx.arcTo(boxX, boxY + boxHeight, boxX, boxY, radius);
    ctx.arcTo(boxX, boxY, boxX + boxWidth, boxY, radius);
    ctx.closePath();
    ctx.fillStyle = isNegative ? "rgba(239,68,68,0.92)" : "rgba(6,95,70,0.92)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + paddingX, boxY + boxHeight / 2);
    ctx.restore();
  },
};

const longShortCenterTextPlugin = {
  id: "longShortCenterTextPlugin",
  afterDatasetsDraw(chart) {
    if (chart?.options?.plugins?.longShortCenterTextPlugin?.enabled === false) {
      return;
    }
    const { ctx, chartArea, scales } = chart;
    const yScale = scales?.y2 || scales?.y;
    if (!ctx || !chartArea || !yScale) {
      return;
    }

    const y0 = yScale.getPixelForValue(0);
    if (y0 < chartArea.top || y0 > chartArea.bottom) {
      return;
    }

    const centerX = (chartArea.left + chartArea.right) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(15, 23, 42, 0.36)";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeText("Long", centerX, y0 - 18);
    ctx.fillText("Long", centerX, y0 - 18);
    ctx.strokeText("Short", centerX, y0 + 18);
    ctx.fillText("Short", centerX, y0 + 18);
    ctx.restore();
  },
};

if (!chartRegistered) {
  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
    Legend,
    ChartDataLabels,
    lastNetValueLabelPlugin,
    longShortCenterTextPlugin,
  );
  chartRegistered = true;
}

function parseYmd(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function addDaysUtc(value, days) {
  const time = parseYmd(value);
  if (!Number.isFinite(time)) {
    return "";
  }
  return new Date(time + days * 86400000).toISOString().slice(0, 10);
}

function todayUtcDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function clampIndex(index, min, max) {
  return Math.max(min, Math.min(max, index));
}

function findNearestIndexByDate(sortedDates, targetDate) {
  const target = parseYmd(targetDate);
  if (!Number.isFinite(target) || !sortedDates.length) {
    return 0;
  }

  let low = 0;
  let high = sortedDates.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const middleTime = parseYmd(sortedDates[middle]);
    if (middleTime === target) {
      return middle;
    }
    if (middleTime < target) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const previousIndex = clampIndex(low - 1, 0, sortedDates.length - 1);
  const nextIndex = clampIndex(low, 0, sortedDates.length - 1);
  const previousDistance = Math.abs(parseYmd(sortedDates[previousIndex]) - target);
  const nextDistance = Math.abs(parseYmd(sortedDates[nextIndex]) - target);
  return nextDistance < previousDistance ? nextIndex : previousIndex;
}

function getDefaultIndexRange(rows) {
  if (!rows.length) {
    return { startIndex: 0, endIndex: 0 };
  }
  const today = todayUtcDateOnly();
  const startTarget = addDaysUtc(today, -360);
  const dates = rows.map((item) => item.date);
  const startIndex = findNearestIndexByDate(dates, startTarget);
  const endIndex = findNearestIndexByDate(dates, today);
  return {
    startIndex: Math.min(startIndex, endIndex),
    endIndex: Math.max(startIndex, endIndex),
  };
}

function buildSliderTrackStyle(startIndex, endIndex, maxIndex) {
  const safeMax = Math.max(1, maxIndex);
  const left = (Math.min(startIndex, endIndex) / safeMax) * 100;
  const right = (Math.max(startIndex, endIndex) / safeMax) * 100;
  return {
    left: `${left}%`,
    width: `${Math.max(0, right - left)}%`,
  };
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "—";
  }
  return Math.round(number).toLocaleString("pt-BR");
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "—";
  }
  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function getSeriesLabel(seriesId, availableSeries) {
  return availableSeries.find((item) => item.id === seriesId)?.label || "Produto";
}

function getSeriesDisplayName(seriesId, availableSeries) {
  const series = availableSeries.find((item) => item.id === seriesId);
  if (!series) {
    return "Produto";
  }
  return `${series.label} ${series.exchangeLabel || ""}`.trim();
}

function FundPositionChartCanvas({ rows, seriesLabel, expanded = false }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || !rows.length) {
      return undefined;
    }

    const chart = new Chart(canvasRef.current.getContext("2d"), {
      data: {
        labels: rows.map((item) => item.date),
        datasets: [
          {
            type: "bar",
            label: "Long",
            data: rows.map((item) => item.nonCommLong),
            yAxisID: "y2",
            backgroundColor: "rgba(59,130,246,.45)",
            borderColor: "rgba(59,130,246,.85)",
            borderWidth: 1,
            borderRadius: 2,
            borderSkipped: false,
            barPercentage: 0.8,
            categoryPercentage: 0.86,
            order: 3,
          },
          {
            type: "bar",
            label: "Short",
            data: rows.map((item) => item.nonCommShort * -1),
            yAxisID: "y2",
            backgroundColor: "rgba(239,68,68,.45)",
            borderColor: "rgba(239,68,68,.85)",
            borderWidth: 1,
            borderRadius: 2,
            borderSkipped: false,
            barPercentage: 0.8,
            categoryPercentage: 0.86,
            order: 3,
          },
          {
            type: "line",
            label: "NET",
            data: rows.map((item) => item.net),
            yAxisID: "y",
            borderColor: "#065f46",
            backgroundColor: "#065f46",
            borderWidth: expanded ? 4 : 3,
            pointRadius: 0,
            tension: 0.2,
            order: 1,
          },
          {
            type: "line",
            label: `${seriesLabel} CBOT`,
            data: rows.map((item) => item.soyClose ?? null),
            yAxisID: "y3",
            borderColor: "#d97706",
            backgroundColor: "#d97706",
            borderWidth: expanded ? 3 : 2,
            pointRadius: 0,
            tension: 0.15,
            spanGaps: true,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          datalabels: {
            display(context) {
              return context.dataset.type === "bar";
            },
            color(context) {
              return context.dataset.label === "Long" ? "#eff6ff" : "#fef2f2";
            },
            anchor: "center",
            align: "center",
            clamp: true,
            clip: true,
            font: {
              weight: 800,
              size: expanded ? 11 : 10,
            },
            formatter(value) {
              const numericValue = Math.abs(Number(value));
              return numericValue >= 50000 ? formatInteger(numericValue) : "";
            },
          },
          legend: {
            display: expanded,
            position: "top",
          },
          tooltip: {
            callbacks: {
              title(context) {
                const label = context?.[0]?.label;
                return formatShortDate(label);
              },
              label(context) {
                const number = Number(context.parsed.y);
                if (context.dataset.yAxisID === "y3") {
                  return `${context.dataset.label}: ${formatPrice(number)}`;
                }
                return `${context.dataset.label}: ${formatInteger(number)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: expanded ? 8 : 4,
              autoSkip: true,
              callback(value, index) {
                return formatShortDate(rows[index]?.date);
              },
            },
          },
          y: {
            position: "left",
            grid: {
              color: "rgba(15, 23, 42, 0.06)",
            },
            ticks: {
              callback(value) {
                const number = Number(value);
                if (!Number.isFinite(number)) {
                  return value;
                }
                if (Math.abs(number) >= 1000000) {
                  return `${(number / 1000000).toFixed(1).replace(".", ",")}M`;
                }
                if (Math.abs(number) >= 1000) {
                  return `${(number / 1000).toFixed(0)}k`;
                }
                return String(number);
              },
            },
          },
          y2: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: {
              display: expanded,
              callback(value) {
                const number = Math.abs(Number(value));
                if (!Number.isFinite(number)) {
                  return value;
                }
                if (number >= 1000000) {
                  return `${(number / 1000000).toFixed(1).replace(".", ",")}M`;
                }
                if (number >= 1000) {
                  return `${(number / 1000).toFixed(0)}k`;
                }
                return String(number);
              },
            },
          },
          y3: {
            position: "right",
            offset: true,
            grid: { drawOnChartArea: false },
            ticks: {
              display: expanded,
              callback: (value) => formatPrice(value),
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [expanded, rows, seriesLabel]);

  return <canvas ref={canvasRef} />;
}

function FundPositionSlider({ rows, range, setRange, disabled = false }) {
  const startIndex = Math.min(range[0], range[1]);
  const endIndex = Math.max(range[0], range[1]);

  return (
    <div className="fund-position-range-block">
      <div className="fund-position-range-meta">
        <span>{formatShortDate(rows[startIndex]?.date) || "—"}</span>
        <span>{formatShortDate(rows[endIndex]?.date) || "—"}</span>
      </div>
      <div className="fund-position-slider-shell">
        <div
          className="fund-position-slider-track-active"
          style={buildSliderTrackStyle(startIndex, endIndex, Math.max(1, rows.length - 1))}
        />
        <input
          type="range"
          min="0"
          max={Math.max(0, rows.length - 1)}
          value={startIndex}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            setRange(([, currentEnd]) => [Math.min(nextValue, currentEnd), currentEnd]);
          }}
          disabled={disabled || rows.length < 2}
          className="fund-position-range-input"
        />
        <input
          type="range"
          min="0"
          max={Math.max(0, rows.length - 1)}
          value={endIndex}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            setRange(([currentStart]) => [currentStart, Math.max(nextValue, currentStart)]);
          }}
          disabled={disabled || rows.length < 2}
          className="fund-position-range-input"
        />
      </div>
    </div>
  );
}

function FundPositionInsightButton({ title, message }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="summary-insight-button summary-insight-button-inline fund-position-ai-button"
        aria-label={`Abrir explicacao do card ${title}`}
        title="Ver explicacao do card"
        onClick={() => setOpen(true)}
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

function FundPositionModal({ open, onClose, rows, seriesLabel, range, setRange, insightMessage }) {
  if (!open) {
    return null;
  }

  const startIndex = Math.min(range[0], range[1]);
  const endIndex = Math.max(range[0], range[1]);
  const filteredRows = rows.slice(startIndex, endIndex + 1);

  return (
    <div className="modal-shell fund-position-modal-shell">
      <button type="button" className="modal-backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="modal-card fund-position-modal-card">
        <div className="modal-header">
          <div>
            <strong>{seriesLabel}</strong>
            <div className="muted">Visao ampliada do grafico</div>
          </div>
          <div className="modal-header-actions">
            <FundPositionInsightButton title={seriesLabel} message={insightMessage} />
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        <div className="fund-position-modal-body">
          <FundPositionSlider rows={rows} range={range} setRange={setRange} />
          <div className="fund-position-modal-chart">
            {filteredRows.length ? <FundPositionChartCanvas rows={filteredRows} seriesLabel={seriesLabel} expanded /> : <div className="fund-positions-empty">Carregando...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFundPositionChart({ seriesId, options }) {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState([0, 0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSeries() {
      setLoading(true);
      setError("");
      try {
        const payload = await resourceService.getFundPositionSeries(seriesId);
        if (!active) {
          return;
        }
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const defaultRange = getDefaultIndexRange(nextRows);
        setRows(nextRows);
        setRange([defaultRange.startIndex, defaultRange.endIndex]);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setRows([]);
        setError(loadError?.response?.data?.detail || loadError?.message || "Erro ao carregar serie.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSeries();
    return () => {
      active = false;
    };
  }, [seriesId]);

  const startIndex = Math.min(range[0], range[1]);
  const endIndex = Math.max(range[0], range[1]);
  const filteredRows = useMemo(() => rows.slice(startIndex, endIndex + 1), [endIndex, rows, startIndex]);
  const latest = filteredRows[filteredRows.length - 1];
  const seriesLabel = getSeriesDisplayName(seriesId, options.items);
  const insightMessage = latest
    ? [
        `Produto analisado: ${seriesLabel}.`,
        `A data mais recente do recorte selecionado e ${formatShortDate(latest.date)}.`,
        `O NET esta em ${formatInteger(latest.net)} contratos, que representa a diferenca entre posicoes compradas e vendidas dos fundos nao comerciais.`,
        `As barras azuis mostram o volume Long (${formatInteger(latest.nonCommLong)}).`,
        `As barras vermelhas mostram o volume Short (${formatInteger(Math.abs(latest.nonCommShort))}).`,
        `A linha laranja acompanha o preco de fechamento do futuro no Yahoo, hoje em ${formatPrice(latest.soyClose)}.`,
      ].join("\n\n")
    : "Sem dados suficientes para explicar este card no intervalo selecionado.";

  return (
    <>
      <article className="panel fund-position-mini-card">
        <div className="fund-position-mini-topbar">
          <label className="fund-position-mini-select-label">
            Produto
            <select value={seriesId} onChange={(event) => options.onChange(event.target.value)} disabled={loading}>
              {options.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {`${item.label} ${item.exchangeLabel || ""}`.trim()}
                </option>
              ))}
            </select>
          </label>
          <div className="fund-position-mini-actions">
            <FundPositionInsightButton title={seriesLabel} message={insightMessage} />
            <button type="button" className="fund-position-expand-button" onClick={() => setIsExpanded(true)} aria-label={`Maximizar ${seriesLabel}`}>
              ⤢
            </button>
          </div>
        </div>

        <div className="fund-position-mini-meta">
          <span>{latest ? `${formatShortDate(latest.date)} • NET ${formatInteger(latest.net)}` : loading ? "Carregando..." : "Sem dados"}</span>
        </div>

        <div className="fund-position-mini-chart">
          {error ? <div className="fund-position-error">{error}</div> : filteredRows.length ? <FundPositionChartCanvas rows={filteredRows} seriesLabel={seriesLabel} /> : <div className="fund-positions-empty">Carregando...</div>}
        </div>
      </article>

      <FundPositionModal
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        rows={rows}
        seriesLabel={seriesLabel}
        range={range}
        setRange={setRange}
        insightMessage={insightMessage}
      />
    </>
  );
}

export function FundPositionsPage() {
  const [availableSeries, setAvailableSeries] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(DEFAULT_SERIES_IDS);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSeriesOptions() {
      setError("");
      try {
        const payload = await resourceService.getFundPositionSeries("soja");
        if (!active) {
          return;
        }
        const nextSeries = Array.isArray(payload?.availableSeries) ? payload.availableSeries : [];
        setAvailableSeries(nextSeries);
        setSelectedSeries((current) =>
          current.map((item, index) => nextSeries.find((series) => series.id === item)?.id || nextSeries[index % nextSeries.length]?.id || item),
        );
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError?.response?.data?.detail || loadError?.message || "Erro ao carregar produtos.");
      }
    }

    loadSeriesOptions();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="resource-page dashboard-page">
      <PageHeader
        title="Posicao de Fundos"
        description="Seis graficos lado a lado, cada um com dropdown, slider proprio de datas e opcao de maximizar."
        tag="Mercado"
      />

      {error ? <div className="fund-position-error">{error}</div> : null}

      <section className="fund-position-six-grid">
        {selectedSeries.map((seriesId, index) => (
          <MiniFundPositionChart
            key={`${index}-${seriesId}`}
            seriesId={seriesId}
            options={{
              items: availableSeries,
              onChange: (nextSeriesId) =>
                setSelectedSeries((current) => current.map((item, currentIndex) => (currentIndex === index ? nextSeriesId : item))),
            }}
          />
        ))}
      </section>
    </div>
  );
}
