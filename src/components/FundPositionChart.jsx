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
import Hammer from "hammerjs";
import zoomPlugin from "chartjs-plugin-zoom";

window.Hammer = Hammer;

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
  zoomPlugin,
);

const zeroLineAndLabelsPlugin = {
  id: "fundPositionZeroLineAndLabels",
  afterDraw(chart, _args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    const y = scales?.y;
    if (!y) return;

    const y0 = y.getPixelForValue(0);
    if (y0 < chartArea.top || y0 > chartArea.bottom) return;

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = pluginOptions?.zeroLineWidth ?? 3;
    ctx.strokeStyle = pluginOptions?.zeroLineColor ?? "rgba(0,0,0,.72)";
    ctx.moveTo(chartArea.left, y0);
    ctx.lineTo(chartArea.right, y0);
    ctx.stroke();

    const midX = (chartArea.left + chartArea.right) / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${pluginOptions?.labelFontWeight ?? 900} ${pluginOptions?.labelFontSize ?? 20}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    ctx.fillStyle = pluginOptions?.labelColor ?? "rgba(0,0,0,.45)";
    const offset = pluginOptions?.labelOffset ?? 34;
    ctx.fillText("Long", midX, y0 - offset);
    ctx.fillText("Short", midX, y0 + offset);
    ctx.restore();
  },
};

const lastValueLabelPlugin = {
  id: "fundPositionLastValueLabel",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const datasetIndex = pluginOptions?.datasetIndex ?? 0;
    const meta = chart.getDatasetMeta(datasetIndex);
    if (!meta || meta.hidden) return;

    const data = chart.data.datasets?.[datasetIndex]?.data || [];
    let lastIndex = -1;
    for (let index = data.length - 1; index >= 0; index -= 1) {
      const value = Number(data[index]);
      if (Number.isFinite(value)) {
        lastIndex = index;
        break;
      }
    }
    if (lastIndex < 0) return;

    const element = meta.data?.[lastIndex];
    if (!element) return;

    const { ctx, chartArea } = chart;
    const x = element.x;
    const y = element.y;
    if (x < chartArea.left || x > chartArea.right || y < chartArea.top || y > chartArea.bottom) return;

    const value = Number(data[lastIndex]);
    const label = `NET: ${formatInteger(value)}`;
    const padX = 10;
    const radius = 10;

    ctx.save();
    ctx.font = "900 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + padX * 2;
    const boxHeight = 28;

    let boxX = x + 10;
    let boxY = y - (boxHeight + 10);

    if (boxX + boxWidth > chartArea.right) boxX = x - boxWidth - 10;
    if (boxX < chartArea.left) boxX = chartArea.left;
    if (boxY < chartArea.top) boxY = y + 10;
    if (boxY + boxHeight > chartArea.bottom) boxY = chartArea.bottom - boxHeight;

    drawRoundRect(
      ctx,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      radius,
      value < 0 ? "rgba(239,68,68,.92)" : "rgba(34,197,94,.92)",
      "rgba(0,0,0,.25)",
    );

    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, boxX + padX, boxY + boxHeight / 2);
    ctx.restore();
  },
};

Chart.register(zeroLineAndLabelsPlugin, lastValueLabelPlugin);

function drawRoundRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

const formatInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return Math.round(parsed).toLocaleString("pt-BR");
};

const formatAxisTick = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  if (Math.abs(parsed) >= 1_000_000) return `${(parsed / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (Math.abs(parsed) >= 1_000) return `${(parsed / 1_000).toFixed(0)}k`;
  return String(parsed);
};

const toNumber = (value) => {
  if (value == null) return 0;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateOnly = (value) => String(value || "").slice(0, 10);
const uniqueSorted = (items) => Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
const clampIndex = (value, min, max) => Math.max(min, Math.min(max, value));
const monthKey = (dateStr) => String(dateStr).slice(0, 7);

const parseYmd = (value) => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
};

const todayUtcDateOnly = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysUtc = (value, days) => {
  const parsed = parseYmd(value);
  if (!parsed) return null;
  const nextDate = new Date(parsed + days * 86400000);
  const year = nextDate.getUTCFullYear();
  const month = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const findNearestIndexByDate = (sortedDates, targetDate) => {
  const targetTimestamp = parseYmd(targetDate);
  if (!Number.isFinite(targetTimestamp)) return 0;

  let low = 0;
  let high = sortedDates.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTimestamp = parseYmd(sortedDates[mid]);
    if (midTimestamp === targetTimestamp) return mid;
    if (midTimestamp < targetTimestamp) low = mid + 1;
    else high = mid - 1;
  }

  const leftIndex = clampIndex(low - 1, 0, sortedDates.length - 1);
  const rightIndex = clampIndex(low, 0, sortedDates.length - 1);
  const leftDistance = Math.abs(parseYmd(sortedDates[leftIndex]) - targetTimestamp);
  const rightDistance = Math.abs(parseYmd(sortedDates[rightIndex]) - targetTimestamp);
  return rightDistance < leftDistance ? rightIndex : leftIndex;
};

const splitCsvLine = (line) => {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  out.push(current);
  return out.map((item) => item.trim());
};

const parseCsv = (text) => {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  return lines.slice(1).reduce((rows, line) => {
    const columns = splitCsvLine(line);
    if (columns.length !== header.length) return rows;

    const row = {};
    header.forEach((key, index) => {
      row[key] = columns[index];
    });
    rows.push(row);
    return rows;
  }, []);
};

function attachNativeDragPan(chart) {
  const canvas = chart.canvas;
  const state = { active: false, startX: 0, startMin: 0, startMax: 0 };

  const getVisibleRange = () => {
    const total = chart.data.labels.length;
    const scale = chart.options.scales.x || {};
    let min = scale.min;
    let max = scale.max;

    if (min == null) min = 0;
    if (max == null) max = total - 1;

    min = clampIndex(Math.round(Number(min)), 0, total - 1);
    max = clampIndex(Math.round(Number(max)), 0, total - 1);

    if (max < min) {
      const temp = min;
      min = max;
      max = temp;
    }

    return { min, max, total };
  };

  const pointInsideChartArea = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const area = chart.chartArea;
    if (!area) return false;
    return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  };

  const onPointerDown = (event) => {
    if (!pointInsideChartArea(event)) return;
    const range = getVisibleRange();
    state.active = true;
    state.startX = event.clientX;
    state.startMin = range.min;
    state.startMax = range.max;
    canvas.classList.add("dragging");
  };

  const onPointerMove = (event) => {
    if (!state.active) return;

    const range = getVisibleRange();
    const visibleCount = Math.max(1, state.startMax - state.startMin);
    const plotWidth = Math.max(1, chart.chartArea.right - chart.chartArea.left);
    const pixelsPerIndex = plotWidth / visibleCount;
    const deltaX = event.clientX - state.startX;
    const shift = Math.round(deltaX / pixelsPerIndex);

    let newMin = state.startMin - shift;
    let newMax = state.startMax - shift;
    const maxIndex = range.total - 1;
    const windowSize = state.startMax - state.startMin;

    if (newMin < 0) {
      newMin = 0;
      newMax = windowSize;
    }
    if (newMax > maxIndex) {
      newMax = maxIndex;
      newMin = maxIndex - windowSize;
    }

    chart.options.scales.x.min = clampIndex(newMin, 0, maxIndex);
    chart.options.scales.x.max = clampIndex(newMax, 0, maxIndex);
    chart.update("none");
  };

  const onPointerUp = () => {
    state.active = false;
    canvas.classList.remove("dragging");
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  return () => {
    canvas.classList.remove("dragging");
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };
}

function useFundPositionData({ csvUrl, marketName }) {
  const [allRows, setAllRows] = useState([]);
  const [status, setStatus] = useState("Pronto.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFrom, setSelectedFrom] = useState("");
  const [selectedTo, setSelectedTo] = useState("");

  const monthOptions = useMemo(
    () => uniqueSorted(allRows.map((item) => monthKey(item.date)).filter(Boolean)),
    [allRows],
  );

  const filteredRows = useMemo(() => {
    if (!selectedFrom || !selectedTo) return [];

    const low = selectedFrom <= selectedTo ? selectedFrom : selectedTo;
    const high = selectedFrom <= selectedTo ? selectedTo : selectedFrom;

    return allRows.filter((item) => {
      const month = monthKey(item.date);
      return month >= low && month <= high;
    });
  }, [allRows, selectedFrom, selectedTo]);

  const applyLast360 = (rows) => {
    const months = uniqueSorted(rows.map((item) => monthKey(item.date)).filter(Boolean));
    if (!months.length) return;

    const today = todayUtcDateOnly();
    const fromTarget = addDaysUtc(today, -360);
    const monthDates = months.map((month) => `${month}-01`);
    const toIndex = findNearestIndexByDate(monthDates, `${monthKey(today)}-01`);
    const fromIndex = findNearestIndexByDate(monthDates, `${monthKey(fromTarget)}-01`);
    const low = Math.min(fromIndex, toIndex);
    const high = Math.max(fromIndex, toIndex);

    setSelectedFrom(months[low]);
    setSelectedTo(months[high]);
  };

  const loadAll = async () => {
    setError("");
    setLoading(true);
    setStatus("Carregando CSV...");

    try {
      const response = await fetch(csvUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }

      setStatus("Processando dados...");
      const csv = await response.text();
      const rawRows = parseCsv(csv);
      const normalizedRows = rawRows
        .map((row) => {
          const date = toDateOnly(row.report_date_as_yyyy_mm_dd);
          const nonCommLong = toNumber(row.noncomm_positions_long_all);
          const nonCommShort = toNumber(row.noncomm_positions_short_all);
          const spreading = toNumber(row.noncomm_postions_spread_all);

          return {
            date,
            market: row.market_and_exchange_names,
            nonCommLong,
            nonCommShort,
            spreading,
            net: nonCommLong - nonCommShort,
          };
        })
        .filter((row) => row.market === marketName && row.date)
        .sort((left, right) => left.date.localeCompare(right.date));

      if (!normalizedRows.length) {
        throw new Error("Nenhum dado retornou do endpoint com esse filtro.");
      }

      setAllRows(normalizedRows);
      applyLast360(normalizedRows);
    } catch (requestError) {
      setStatus("Falha ao carregar.");
      setError(`Erro ao buscar/ler o CSV.\n\nDetalhe:\n${requestError?.message || String(requestError)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [csvUrl, marketName]);

  useEffect(() => {
    if (!selectedFrom || !selectedTo) return;
    if (!filteredRows.length) {
      setStatus("Nenhum ponto encontrado para o periodo selecionado.");
      return;
    }

    const low = selectedFrom <= selectedTo ? selectedFrom : selectedTo;
    const high = selectedFrom <= selectedTo ? selectedTo : selectedFrom;
    setStatus(`OK - ${filteredRows.length} pontos (${low} -> ${high}). Ultimo: ${filteredRows[filteredRows.length - 1].date}`);
  }, [filteredRows, selectedFrom, selectedTo]);

  return {
    error,
    filteredRows,
    loading,
    monthOptions,
    reload: loadAll,
    selectedFrom,
    selectedTo,
    setDefaultLast360: () => applyLast360(allRows),
    setSelectedFrom,
    setSelectedTo,
    status,
  };
}

export function FundPositionChart({ title, csvUrl, marketName }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const {
    error,
    filteredRows,
    loading,
    monthOptions,
    reload,
    selectedFrom,
    selectedTo,
    setDefaultLast360,
    setSelectedFrom,
    setSelectedTo,
    status,
  } = useFundPositionData({ csvUrl, marketName });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !filteredRows.length) return undefined;

    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const labels = filteredRows.map((item) => item.date);
    const nextChart = new Chart(canvas.getContext("2d"), {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Non-Comm Long",
            data: filteredRows.map((item) => item.nonCommLong),
            yAxisID: "y2",
            order: 2,
            backgroundColor: "rgba(59,130,246,.55)",
            borderColor: "rgba(59,130,246,.95)",
            borderWidth: 1,
            barPercentage: 0.85,
            categoryPercentage: 0.8,
          },
          {
            type: "bar",
            label: "Non-Comm Short",
            data: filteredRows.map((item) => item.nonCommShort),
            yAxisID: "y2",
            order: 2,
            backgroundColor: "rgba(239,68,68,.55)",
            borderColor: "rgba(239,68,68,.95)",
            borderWidth: 1,
            barPercentage: 0.85,
            categoryPercentage: 0.8,
          },
          {
            type: "bar",
            label: "Spreading",
            data: filteredRows.map((item) => item.spreading),
            yAxisID: "y2",
            order: 2,
            backgroundColor: "rgba(107,114,128,.55)",
            borderColor: "rgba(107,114,128,.95)",
            borderWidth: 1,
            barPercentage: 0.85,
            categoryPercentage: 0.8,
          },
          {
            type: "line",
            label: "NET (Non-Comm Long - Short)",
            data: filteredRows.map((item) => item.net),
            yAxisID: "y",
            borderWidth: 4.5,
            borderColor: "#064e3b",
            backgroundColor: "#064e3b",
            pointBackgroundColor: "#064e3b",
            pointBorderColor: "#064e3b",
            pointRadius: 0,
            tension: 0.25,
            order: 0,
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
            display: false,
          },
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: { size: 12, weight: "800" },
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = Number(context.parsed.y);
                if (!Number.isFinite(value)) return `${context.dataset.label}: -`;
                return `${context.dataset.label}: ${formatInteger(value)}`;
              },
            },
          },
          fundPositionZeroLineAndLabels: {
            zeroLineWidth: 3,
            zeroLineColor: "rgba(0,0,0,.72)",
            labelFontSize: 20,
            labelFontWeight: 900,
            labelColor: "rgba(0,0,0,.45)",
            labelOffset: 34,
          },
          fundPositionLastValueLabel: {
            datasetIndex: 3,
          },
          zoom: {
            pan: { enabled: false },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: "x",
            },
            limits: {
              x: { min: 0, max: labels.length - 1 },
            },
          },
        },
        scales: {
          x: {
            min: 0,
            max: labels.length - 1,
            ticks: { maxTicksLimit: 12, autoSkip: true },
            grid: { display: false },
          },
          y: {
            type: "linear",
            position: "left",
            grid: {
              color: (context) => (context.tick?.value === 0 ? "rgba(0,0,0,.40)" : "rgba(0,0,0,.06)"),
              lineWidth: (context) => (context.tick?.value === 0 ? 2 : 1),
            },
            ticks: { callback: formatAxisTick },
          },
          y2: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { callback: formatAxisTick },
          },
        },
      },
    });

    chartRef.current = nextChart;
    dragCleanupRef.current = attachNativeDragPan(nextChart);

    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
      nextChart.destroy();
    };
  }, [filteredRows]);

  useEffect(() => {
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleResetZoom = () => {
    if (!chartRef.current) return;
    chartRef.current.options.scales.x.min = 0;
    chartRef.current.options.scales.x.max = chartRef.current.data.labels.length - 1;
    chartRef.current.update("none");
  };

  const handleApply = () => {
    chartRef.current?.update("none");
  };

  return (
    <section className="panel fund-position-card">
      <div className="fund-position-top">
        <div>
          <h3 className="fund-position-title">{title}</h3>
        </div>
        <div className="fund-position-status">{status}</div>
      </div>

      <div className="fund-position-controls">
        <label htmlFor={`${marketName}-from`}>Inicio:</label>
        <select id={`${marketName}-from`} value={selectedFrom} onChange={(event) => setSelectedFrom(event.target.value)}>
          {monthOptions.map((month) => (
            <option key={`${marketName}-from-${month}`} value={month}>
              {month.slice(5, 7)}/{month.slice(0, 4)}
            </option>
          ))}
        </select>

        <label htmlFor={`${marketName}-to`}>Fim:</label>
        <select id={`${marketName}-to`} value={selectedTo} onChange={(event) => setSelectedTo(event.target.value)}>
          {monthOptions.map((month) => (
            <option key={`${marketName}-to-${month}`} value={month}>
              {month.slice(5, 7)}/{month.slice(0, 4)}
            </option>
          ))}
        </select>

        <button type="button" className="btn btn-primary fund-position-button-primary" onClick={handleApply} disabled={loading}>
          Aplicar
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleResetZoom} disabled={!filteredRows.length}>
          Reset zoom
        </button>
        <button type="button" className="btn btn-secondary" onClick={setDefaultLast360} disabled={loading}>
          Ultimos 360 dias
        </button>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={loading}>
          Recarregar
        </button>
      </div>

      <div className="fund-position-chart-box">
        <canvas ref={canvasRef} />
      </div>

      {error ? <div className="fund-position-error">{error}</div> : null}
    </section>
  );
}
