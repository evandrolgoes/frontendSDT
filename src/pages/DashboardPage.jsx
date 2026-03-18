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

import { DatePickerField } from "../components/DatePickerField";
import { PageHeader } from "../components/PageHeader";
import { rowMatchesDashboardFilter, useDashboardFilter } from "../contexts/DashboardFilterContext";
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
  const width = 640;
  const height = 220;
  const padding = 20;
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const stepX = (width - padding * 2) / Math.max(data.length - 1, 1);

  const points = data.map((item, index) => {
    const x = padding + stepX * index;
    const y = height - padding - ((item.value / maxValue) * (height - padding * 2));
    return { ...item, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? width - padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

  return (
    <div className="chart-card chart-card-large">
      <div className="chart-card-header">
        <div>
          <h3>Tendencia principal</h3>
          <p className="muted">Leitura rapida da curva mais importante do painel.</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="dashboard-chart" role="img" aria-label="Grafico de tendencia">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((row) => {
          const y = padding + ((height - padding * 2) / 3) * row;
          return <line key={row} x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid-line" />;
        })}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5" fill={color} />
            <text x={point.x} y={height - 4} textAnchor="middle" className="chart-axis-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StackedBarsChart({ data }) {
  const width = 640;
  const height = 220;
  const padding = 20;
  const maxValue = Math.max(...data.map((item) => item.parts.reduce((sum, part) => sum + part.value, 0)), 1);
  const slotWidth = (width - padding * 2) / data.length;
  const barWidth = Math.min(72, slotWidth * 0.54);

  return (
    <div className="chart-card chart-card-large">
      <div className="chart-card-header">
        <div>
          <h3>Composicao por bloco</h3>
          <p className="muted">Comparacao visual entre componentes relevantes.</p>
        </div>
        <MiniLegend
          items={[
            { label: data[0].parts[0].label, color: data[0].parts[0].color },
            { label: data[0].parts[1].label, color: data[0].parts[1].color },
            { label: data[0].parts[2].label, color: data[0].parts[2].color },
          ]}
        />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="dashboard-chart" role="img" aria-label="Grafico de barras empilhadas">
        {[0, 1, 2, 3].map((row) => {
          const y = padding + ((height - padding * 2) / 3) * row;
          return <line key={row} x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid-line" />;
        })}
        {data.map((item, index) => {
          const x = padding + slotWidth * index + (slotWidth - barWidth) / 2;
          let currentTop = height - padding;
          return (
            <g key={item.label}>
              {item.parts.map((part) => {
                const partHeight = (part.value / maxValue) * (height - padding * 2);
                currentTop -= partHeight;
                return <rect key={part.label} x={x} y={currentTop} width={barWidth} height={partHeight} rx="10" fill={part.color} />;
              })}
              <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" className="chart-axis-label">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ slices, centerLabel, centerValue }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let cumulative = -90;
  const radius = 74;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>Distribuicao</h3>
          <p className="muted">Participacao relativa dos principais grupos.</p>
        </div>
      </div>
      <div className="donut-wrap">
        <svg viewBox="0 0 220 220" className="donut-chart" role="img" aria-label="Grafico de rosca">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="24" />
          {slices.map((slice) => {
            const arc = (slice.value / total) * circumference;
            const node = (
              <circle
                key={slice.label}
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray={`${arc} ${circumference}`}
                transform={`rotate(${cumulative} 110 110)`}
              />
            );
            cumulative += (slice.value / total) * 360;
            return node;
          })}
          <text x="110" y="102" textAnchor="middle" className="donut-center-label">
            {centerLabel}
          </text>
          <text x="110" y="126" textAnchor="middle" className="donut-center-value">
            {centerValue}
          </text>
        </svg>
        <MiniLegend items={slices} />
      </div>
    </div>
  );
}

function ScenarioBars({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

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
              <div className="scenario-bar" style={{ width: `${(item.value / maxValue) * 100}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
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

const formatHedgeShortDate = (value, frequency) => {
  const date = parseDashboardDate(value);
  if (!date) return "—";
  if (frequency === "monthly") {
    return formatBrazilianDate(date);
  }
  if (frequency === "weekly") {
    const start = startOfDashboardWeek(date);
    const end = endOfDashboardWeek(date);
    return `${formatBrazilianDate(start)} a ${formatBrazilianDate(end)}`;
  }
  return formatBrazilianDate(date);
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

const getDerivativeVolumeValue = (item) => Math.abs(Number(item.volume || item.volume_fisico || item.numero_lotes || 0));

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
      const isCurrencyDerivative = normalizeText(item.moeda_ou_cmdtye) === "moeda";
      return rowMatchesDashboardFilter(item, dashboardFilter, {
        cultureKeys: isCurrencyDerivative ? ["destino_cultura"] : ["cultura", "culturas"],
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
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.obs || `#${item.id}`])),
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

Chart.register(stackTotalsPlugin);

function ComponentSalesDashboard({ dashboardFilter }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const defaultDateFrom = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return formatBrazilianDate(start);
  }, [today]);
  const defaultDateTo = useMemo(() => {
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    return formatBrazilianDate(end);
  }, [today]);

  const [interval, setInterval] = useState("daily");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [selectedBar, setSelectedBar] = useState(null);
  const [datasetVisibility, setDatasetVisibility] = useState(() =>
    Object.fromEntries(COMPONENT_DATASETS.map((dataset) => [dataset.key, true])),
  );
  const rows = useComponentSalesSource(dashboardFilter, dateFrom, dateTo);
  const chartState = useMemo(
    () => buildComponentSalesChartState(rows, interval, datasetVisibility),
    [datasetVisibility, interval, rows],
  );

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return undefined;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const nextChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: chartState.labels,
        datasets: chartState.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: true, mode: "nearest", axis: "x" },
        onClick: (_, elements) => {
          const hit = elements?.[0];
          if (!hit) return;
          const dataset = chartState.datasets[hit.datasetIndex];
          const period = chartState.labels[hit.index];
          const key = `${period}||${dataset.label}`;
          setSelectedBar({
            category: dataset.label,
            period,
            ops: chartState.opsIndex.get(key) || [],
            meta: chartState.metaMap.get(key) || null,
            color: dataset.backgroundColor,
          });
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (context) => Number(context.raw) > 0,
            formatter: (value) =>
              Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
            color: "#ffffff",
            textStrokeColor: "#000000",
            textStrokeWidth: 1,
            font: { size: 11, weight: "700" },
            anchor: "center",
            align: "center",
            clamp: true,
          },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (context) => `${context.dataset.label} — U$ ${Number(context.parsed.y || 0).toLocaleString("pt-BR")}`,
              afterLabel: (context) => {
                const meta = chartState.metaMap.get(`${context.label}||${context.dataset.label}`);
                if (!meta?.wAvgStrike) return "";
                return `Strike medio: ${Number(meta.wAvgStrike).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}${meta.moeda_unidade ? ` ${meta.moeda_unidade}` : ""}`;
              },
            },
          },
        },
        layout: { padding: { top: 30, bottom: 6 } },
        scales: {
          x: {
            stacked: true,
            ticks: { font: { size: 12 } },
            grid: { color: "rgba(15,23,42,0.12)" },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              font: { size: 11 },
              callback: (value) => Number(value).toLocaleString("pt-BR"),
            },
            title: {
              display: true,
              text: "U$",
              font: { size: 10, weight: "700" },
            },
            grid: { color: "rgba(15,23,42,0.12)" },
          },
        },
      },
    });

    chartInstanceRef.current = nextChart;
    return () => nextChart.destroy();
  }, [chartState]);

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
          <canvas ref={chartRef} />
        </div>
      </div>

      <ComponentSalesDetailsPopup selectedBar={selectedBar} onClose={() => setSelectedBar(null)} />
    </section>
  );
}

function ComponentSalesNativeDashboard({ dashboardFilter }) {
  const today = useMemo(() => new Date(), []);
  const defaultDateFrom = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return formatBrazilianDate(start);
  }, [today]);
  const defaultDateTo = useMemo(() => {
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    return formatBrazilianDate(end);
  }, [today]);
  const [interval, setInterval] = useState("monthly");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
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
        cultureKeys: ["destino_cultura", "cultura", "culturas"],
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
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  const chartState = useMemo(() => buildCashflowChartState(rows, interval), [interval, rows]);
  const activeSummary = hoveredPeriod ? chartState.periodSummaries.get(hoveredPeriod) : null;
  const summaryCards = activeSummary?.totals || chartState.totals;
  const saldoSummary = activeSummary?.saldo ?? chartState.saldoTotal;

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return undefined;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const nextChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: chartState.labels,
        datasets: chartState.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: true, mode: "nearest", axis: "x" },
        onHover: (_, elements, chart) => {
          const hit = elements?.[0];
          if (!hit) {
            setHoveredPeriod(null);
            return;
          }
          const period = chart.data.labels?.[hit.index] || null;
          setHoveredPeriod(period);
        },
        onClick: (_, elements, chart) => {
          const hit = elements?.[0];
          if (!hit) return;
          const dataset = chart.data.datasets[hit.datasetIndex];
          const period = chart.data.labels?.[hit.index];
          const category = String(dataset.label || "");
          const categoryKey = CASHFLOW_SERIES_DEFS.find((item) => item.label === category)?.key;
          const ops =
            category === "Saldo"
              ? CASHFLOW_SERIES_DEFS.flatMap((item) => chartState.opsIndex.get(`${period}||${item.key}`) || [])
              : chartState.opsIndex.get(`${period}||${categoryKey}`) || [];
          setSelectedItem({
            category,
            period,
            ops,
            color: dataset.borderColor || dataset.backgroundColor,
          });
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (context) => context.dataset.type !== "line" && Math.abs(Number(context.raw || 0)) > 0,
            formatter: (value) => formatMoneyByCurrency(value, currencyConfig.label),
            color: "#111827",
            font: { size: 10, weight: "700" },
            anchor: "end",
            align: "top",
            clamp: true,
          },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (context) => `${context.dataset.label}: ${formatMoneyByCurrency(context.parsed.y, currencyConfig.label)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: "rgba(15,23,42,0.08)" },
          },
          y: {
            stacked: true,
            ticks: {
              callback: (value) => formatMoneyByCurrency(value, currencyConfig.label),
            },
            grid: { color: "rgba(15,23,42,0.1)" },
          },
        },
      },
    });

    chartInstanceRef.current = nextChart;
    return () => nextChart.destroy();
  }, [chartState, currencyConfig.label]);

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
        <canvas ref={chartRef} />
      </div>
      <CashflowOperationsPopup selectedItem={selectedItem} currencyLabel={currencyConfig.label} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

function CashflowDashboard({ dashboardFilter, compact = false }) {
  const [interval, setInterval] = useState("daily");
  const [expandedCurrencyKey, setExpandedCurrencyKey] = useState(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
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
    () => Object.fromEntries(counterparties.map((item) => [String(item.id), item.obs || `#${item.id}`])),
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
  if (!value) return "Sem cultura";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return readCultureLabel(value[0]);
  return value.cultura || value.nome || value.label || value.descricao || `#${value.id ?? ""}`;
};

function CommercialRiskDashboard({ dashboardFilter }) {
  const [physicalSales, setPhysicalSales] = useState([]);
  const [derivatives, setDerivatives] = useState([]);
  const [cropBoards, setCropBoards] = useState([]);
  const [physicalQuotes, setPhysicalQuotes] = useState([]);
  const [hedgePolicies, setHedgePolicies] = useState([]);
  const [budgetCosts, setBudgetCosts] = useState([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      resourceService.listAll("physical-sales"),
      resourceService.listAll("derivative-operations"),
      resourceService.listAll("crop-boards"),
      resourceService.listAll("physical-quotes"),
      resourceService.listAll("hedge-policies"),
      resourceService.listAll("budget-costs"),
    ]).then(([salesResponse, derivativeResponse, cropBoardResponse, quotesResponse, policiesResponse, budgetResponse]) => {
      if (!isMounted) return;
      setPhysicalSales(salesResponse || []);
      setDerivatives(derivativeResponse || []);
      setCropBoards(cropBoardResponse || []);
      setPhysicalQuotes(quotesResponse || []);
      setHedgePolicies(policiesResponse || []);
      setBudgetCosts(budgetResponse || []);
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
  const filteredDerivatives = useMemo(
    () =>
      derivatives.filter((item) => {
        const isCurrencyDerivative = normalizeText(item.moeda_ou_cmdtye) === "moeda";
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: isCurrencyDerivative ? ["destino_cultura"] : ["cultura", "culturas", "destino_cultura"],
        });
      }),
    [dashboardFilter, derivatives],
  );

  const productionTotal = useMemo(
    () => filteredCropBoards.reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0),
    [filteredCropBoards],
  );
  const physicalSoldVolume = useMemo(
    () => filteredSales.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)), 0),
    [filteredSales],
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
    () => bolsaDerivatives.reduce((sum, item) => sum + getDerivativeVolumeValue(item), 0),
    [bolsaDerivatives],
  );
  const derivativeCurrencyVolume = useMemo(
    () => currencyDerivatives.reduce((sum, item) => sum + getDerivativeVolumeValue(item), 0),
    [currencyDerivatives],
  );
  const derivativeMtm = useMemo(
    () => filteredDerivatives.reduce((sum, item) => sum + Number(item.ajustes_totais_brl || 0), 0),
    [filteredDerivatives],
  );
  const basisContracts = useMemo(
    () => filteredSales.filter((item) => Math.abs(Number(item.basis_valor || 0)) > 0).length,
    [filteredSales],
  );
  const basisAverage = useMemo(
    () => averageOf(filteredSales.map((item) => item.basis_valor)) ?? 0,
    [filteredSales],
  );
  const physicalAveragePrice = useMemo(
    () => {
      const totalVolume = filteredSales.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)), 0);
      if (!totalVolume) return 0;
      return filteredSales.reduce((sum, item) => sum + Math.abs(Number(item.volume_fisico || 0)) * Number(item.preco || 0), 0) / totalVolume;
    },
    [filteredSales],
  );
  const quoteAverage = useMemo(
    () => averageOf(filteredQuotes.map((item) => item.cotacao)) ?? 0,
    [filteredQuotes],
  );
  const policyCount = filteredPolicies.length;
  const commercializationCoverage = productionTotal > 0 ? (physicalSoldVolume + derivativeCommodityVolume) / productionTotal : 0;

  const mixSlices = useMemo(() => {
    const items = [
      { label: "Venda Fisica", value: physicalSoldVolume, color: "#16a34a" },
      { label: "Bolsa / CBOT", value: derivativeCommodityVolume, color: "#f59e0b" },
      { label: "Dólar", value: derivativeCurrencyVolume, color: "#2563eb" },
    ].filter((item) => item.value > 0);
    return items.length ? items : [{ label: "Sem dados", value: 1, color: "#cbd5e1" }];
  }, [derivativeCommodityVolume, derivativeCurrencyVolume, physicalSoldVolume]);

  const leverageBars = useMemo(
    () => [
      { label: "Cobertura comercial", value: commercializationCoverage * 100, formatted: formatPercent1(commercializationCoverage), color: "#0f766e" },
      { label: "MTM derivativos", value: Math.abs(derivativeMtm), formatted: `R$ ${formatCurrency2(derivativeMtm)}`, color: "#0369a1" },
      { label: "Preço médio físico", value: Math.abs(physicalAveragePrice), formatted: formatCurrency2(physicalAveragePrice), color: "#ea580c" },
      { label: "Basis médio", value: Math.abs(basisAverage), formatted: formatCurrency2(basisAverage), color: "#7c3aed" },
    ],
    [basisAverage, commercializationCoverage, derivativeMtm, physicalAveragePrice],
  );

  const cultureRows = useMemo(() => {
    const map = new Map();

    filteredCropBoards.forEach((item) => {
      const label = readCultureLabel(item.cultura || item.cultura_texto);
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.production += Math.abs(Number(item.producao_total || 0));
      map.set(label, node);
    });

    filteredSales.forEach((item) => {
      const label = readCultureLabel(item.cultura || item.cultura_produto || item.cultura_texto);
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.physical += Math.abs(Number(item.volume_fisico || 0));
      map.set(label, node);
    });

    bolsaDerivatives.forEach((item) => {
      const label = readCultureLabel(item.cultura || item.culturas || item.destino_cultura);
      const node = map.get(label) || { label, production: 0, physical: 0, derivatives: 0 };
      node.derivatives += getDerivativeVolumeValue(item);
      map.set(label, node);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        coverage: item.production > 0 ? (item.physical + item.derivatives) / item.production : 0,
      }))
      .sort((left, right) => right.coverage - left.coverage)
      .slice(0, 6);
  }, [bolsaDerivatives, filteredCropBoards, filteredSales]);

  return (
    <section className="risk-kpi-shell">
      <section className="stats-grid risk-kpi-grid">
        <article className="card stat-card">
          <span>Produção total</span>
          <strong>{formatNumber0(productionTotal)} sc</strong>
        </article>
        <article className="card stat-card">
          <span>Venda física</span>
          <strong>{formatNumber0(physicalSoldVolume)} sc</strong>
        </article>
        <article className="card stat-card">
          <span>Hedge em bolsa</span>
          <strong>{formatNumber0(derivativeCommodityVolume)} sc</strong>
        </article>
        <article className="card stat-card">
          <span>Hedge cambial</span>
          <strong>{formatNumber0(derivativeCurrencyVolume)} U$</strong>
        </article>
        <article className="card stat-card">
          <span>MTM derivativos</span>
          <strong>R$ {formatCurrency2(derivativeMtm)}</strong>
        </article>
        <article className="card stat-card">
          <span>Cobertura comercial</span>
          <strong>{formatPercent1(commercializationCoverage)}</strong>
        </article>
      </section>

      <section className="content-grid risk-kpi-content">
        <div className="chart-card chart-card-large">
          <div className="chart-card-header">
            <div>
              <h3>Radar da comercialização por componente</h3>
              <p className="muted">Leitura objetiva da combinação entre físico, bolsa/CBOT, dólar e basis dentro do método de venda por componentes.</p>
            </div>
          </div>
          <div className="risk-kpi-list">
            <div className="risk-kpi-row">
              <div>
                <strong>Venda física já capturada</strong>
                <span>Volume já monetizado no físico, importante para travar margem e caixa.</span>
              </div>
              <b>{formatNumber0(physicalSoldVolume)} sc</b>
            </div>
            <div className="risk-kpi-row">
              <div>
                <strong>Bolsa / CBOT protegida</strong>
                <span>Volume derivativo em commodity, útil para separar o momento da venda de CBOT do basis.</span>
              </div>
              <b>{formatNumber0(derivativeCommodityVolume)} sc</b>
            </div>
            <div className="risk-kpi-row">
              <div>
                <strong>Dólar futuro protegido</strong>
                <span>Volume financeiro em moeda, alinhado ao método de travar câmbio em momento distinto da soja.</span>
              </div>
              <b>{formatNumber0(derivativeCurrencyVolume)} U$</b>
            </div>
            <div className="risk-kpi-row">
              <div>
                <strong>Basis já definido</strong>
                <span>Contratos físicos com basis explícito, sinalizando avanço na captura do componente regional.</span>
              </div>
              <b>{basisContracts} contratos</b>
            </div>
            <div className="risk-kpi-row">
              <div>
                <strong>Spot físico médio</strong>
                <span>Referência de tela para confrontar preço atual, basis médio e qualidade da comercialização.</span>
              </div>
              <b>{formatCurrency2(quoteAverage)}</b>
            </div>
            <div className="risk-kpi-row">
              <div>
                <strong>Políticas ativas / base de custo</strong>
                <span>Políticas em uso e custo orçado filtrado, fundamentais para disciplina de risco.</span>
              </div>
              <b>{policyCount} / R$ {formatCurrency2(filteredBudgetCosts.reduce((sum, item) => sum + Number(item.valor || 0), 0))}</b>
            </div>
          </div>
        </div>

        <DonutChart
          centerLabel="Mix"
          centerValue={formatPercent1(commercializationCoverage)}
          slices={mixSlices}
        />

        <ScenarioBars data={leverageBars} />
      </section>

      <section className="chart-card risk-kpi-culture-card">
        <div className="chart-card-header">
          <div>
            <h3>Cobertura por cultura</h3>
            <p className="muted">Produção versus comercialização física e proteção em bolsa, para priorizar onde ainda existe exposição relevante.</p>
          </div>
        </div>
        <div className="risk-kpi-culture-list">
          {cultureRows.map((item) => (
            <div key={item.label} className="risk-kpi-culture-row">
              <div className="risk-kpi-culture-head">
                <strong>{item.label}</strong>
                <span>{formatPercent1(item.coverage)}</span>
              </div>
              <div className="risk-kpi-track">
                <span className="risk-kpi-track-physical" style={{ width: `${Math.min((item.physical / Math.max(item.production, 1)) * 100, 100)}%` }} />
                <span className="risk-kpi-track-derivative" style={{ width: `${Math.min((item.derivatives / Math.max(item.production, 1)) * 100, 100)}%` }} />
              </div>
              <small>
                Produção: {formatNumber0(item.production)} sc | Físico: {formatNumber0(item.physical)} sc | Bolsa: {formatNumber0(item.derivatives)} sc
              </small>
            </div>
          ))}
          {!cultureRows.length ? <p className="muted">Sem dados suficientes para montar a visão por cultura com o filtro atual.</p> : null}
        </div>
      </section>
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
  const [sheetyQuotes, setSheetyQuotes] = useState([]);
  const [selectedSojaCtr, setSelectedSojaCtr] = useState("");
  const [selectedDollarDvc, setSelectedDollarDvc] = useState("");
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
      resourceService.fetchJsonCached("sheety-cotacoes-spot", SHEETY_QUOTES_URL).catch(() => ({ planilha1: [] })),
    ]).then(([quotesResponse, salesResponse, policiesResponse, budgetResponse, derivativesResponse, sheetyResponse]) => {
      if (!isMounted) return;
      setQuotes(quotesResponse || []);
      setSales(salesResponse || []);
      setPolicies(policiesResponse || []);
      setBudgetCosts(budgetResponse || []);
      setDerivatives(derivativesResponse || []);
      const sheetyRows = sheetyResponse?.planilha1 || [];
      setSheetyQuotes(sheetyRows);

      const sojaContracts = sheetyRows.filter((item) => normalizeText(item.bolsa).includes("soja_cbot") && item.ctrbolsa);
      const dollarContracts = sheetyRows.filter((item) => normalizeText(item["cultura/produto"]).includes("dolar") && item.dvc);

      if (sojaContracts[0]?.ctrbolsa) {
        setSelectedSojaCtr(String(sojaContracts[0].ctrbolsa));
      }

      if (dollarContracts[0]?.dvc) {
        setSelectedDollarDvc(String(dollarContracts[0].dvc));
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
      .map((item) => item.cultura);
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

    setSojaValue((current) => (selectedSojaCtr ? current : formatNumber2(sojaAvg)));
    setCambioValue((current) => (selectedDollarDvc ? current : formatNumber2(cambioAvg)));
    setBreakevenValue(formatNumber2(breakEvenAvg));
    setBasisValue(formatNumber2(basisAvg));
    setTargetPercentValue(formatPercent1(Number.isFinite(targetPct) ? targetPct : 0.18));
  }, [filteredBudgetCosts, filteredDerivatives, filteredPolicies, filteredQuotes, filteredSales, selectedDollarDvc, selectedSojaCtr]);

  const sojaCtrOptions = useMemo(() => {
    const unique = new Map();
    sheetyQuotes
      .filter((item) => normalizeText(item.bolsa).includes("soja_cbot") && item.ctrbolsa)
      .forEach((item) => {
        const key = String(item.ctrbolsa);
        if (!unique.has(key)) unique.set(key, item);
      });
    return Array.from(unique.values());
  }, [sheetyQuotes]);

  const dollarDvcOptions = useMemo(() => {
    const unique = new Map();
    sheetyQuotes
      .filter((item) => normalizeText(item["cultura/produto"]).includes("dolar") && item.dvc)
      .forEach((item) => {
        const key = String(item.dvc);
        if (!unique.has(key)) unique.set(key, item);
      });
    return Array.from(unique.values());
  }, [sheetyQuotes]);

  useEffect(() => {
    if (!selectedSojaCtr) return;
    const match = sojaCtrOptions.find((item) => String(item.ctrbolsa) === String(selectedSojaCtr));
    if (!match) return;
    const cotacao = Number(match.cotacao);
    if (Number.isFinite(cotacao)) {
      setSojaValue(formatNumber2(cotacao));
    }
  }, [selectedSojaCtr, sojaCtrOptions]);

  useEffect(() => {
    if (!selectedDollarDvc) return;
    const match = dollarDvcOptions.find((item) => String(item.dvc) === String(selectedDollarDvc));
    if (!match) return;
    const cotacao = Number(match.cotacao);
    if (Number.isFinite(cotacao)) {
      setCambioValue(formatNumber2(cotacao));
    }
  }, [dollarDvcOptions, selectedDollarDvc]);

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
          Ctr bolsa soja cbot:
          <select value={selectedSojaCtr} onChange={(event) => setSelectedSojaCtr(event.target.value)}>
            <option value="">Selecione</option>
            {sojaCtrOptions.map((item) => (
              <option key={item.ctrbolsa} value={item.ctrbolsa}>
                {item.ctrbolsa}
              </option>
            ))}
          </select>
        </label>
        <label>
          Soja Cbot:
          <input type="text" value={sojaValue} onChange={(event) => setSojaValue(event.target.value)} />
        </label>
        <label>
          DVC dolar:
          <select value={selectedDollarDvc} onChange={(event) => setSelectedDollarDvc(event.target.value)}>
            <option value="">Selecione</option>
            {dollarDvcOptions.map((item) => (
              <option key={item.dvc} value={item.dvc}>
                {item.dvc}
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
  onFocusToggle,
  extraActions = null,
}) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailIndex, setDetailIndex] = useState(null);
  const [showPhysical, setShowPhysical] = useState(true);
  const [showDerivatives, setShowDerivatives] = useState(true);

  const chartState = useMemo(() => {
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
    let physicalPointer = 0;
    let physicalTotal = 0;

    const points = buckets.map((bucket) => {
      while (
        activePolicy &&
        policyRows.findIndex((item) => item === activePolicy) < policyRows.length - 1 &&
        policyRows[policyRows.findIndex((item) => item === activePolicy) + 1].monthDate <= startOfDashboardMonth(bucket.date)
      ) {
        activePolicy = policyRows[policyRows.findIndex((item) => item === activePolicy) + 1];
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
        total,
        totalPct: baseValue > 0 ? total / baseValue : 0,
      };
    });

    return {
      labels: points.map((item) => item.label),
      points,
      minDataset: points.map((item) => item.minValue ?? null),
      maxDataset: points.map((item) => item.maxValue ?? null),
      derivativeDataset: points.map((item) => item.derivativeVisible),
      physicalDataset: points.map((item) => item.derivativeVisible + item.physicalVisible),
      totalDataset: points.map((item) => item.total),
    };
  }, [
    baseValue,
    derivativeRows,
    derivativeValueGetter,
    frequency,
    physicalRows,
    physicalValueGetter,
    policies,
    showDerivatives,
    showPhysical,
    unit,
  ]);

  useEffect(() => {
    if (!chartState.points.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(chartState.points.length - 1);
  }, [chartState.points.length, frequency]);

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
            backgroundColor: "rgba(34, 197, 94, 0.08)",
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
            backgroundColor: "rgba(34, 197, 94, 0.12)",
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
              formatter: (_, context) =>
                `${((chartState.points[context.dataIndex]?.totalPct || 0) * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}%`,
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

    chartInstanceRef.current = nextChart;
    return () => nextChart.destroy();
  }, [chartState, frequency, unit]);

  const activePoint = chartState.points[activeIndex] || chartState.points.at(-1) || null;
  const detailPoint = detailIndex != null ? chartState.points[detailIndex] || null : null;
  const statusSummary = useMemo(() => {
    if (!activePoint) return null;
    if (Number.isFinite(activePoint.maxValue) && activePoint.total > activePoint.maxValue) {
      return {
        tone: "bad",
        text: `${(((activePoint.total - activePoint.maxValue) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}% acima da politica`,
      };
    }
    if (Number.isFinite(activePoint.minValue) && activePoint.total < activePoint.minValue) {
      return {
        tone: "bad",
        text: `${(((activePoint.minValue - activePoint.total) / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}% abaixo da politica`,
      };
    }
    return {
      tone: "ok",
      text: `${((activePoint.totalPct || 0) * 100).toLocaleString("pt-BR", {
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
        volume: getPhysicalVolumeValue(item),
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
        volume: getDerivativeVolumeValue(item),
        valor: derivativeDetailValueGetter(item),
        ajusteMtm: Number(item.ajustes_totais_brl || 0),
        strike: Number(item.strike_montagem || 0),
        unidade: item.unidade || "",
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
  }, [derivativeDetailValueGetter, derivativeRows, detailPoint, physicalDetailValueGetter, physicalRows]);

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
            Politica Máx.: {activePoint.maxValue != null ? formatHedgeTooltipValue(activePoint.maxValue, unit) : "—"}
          </div>
          <div className="hedge-floating-line">
            Politica Min.: {activePoint.minValue != null ? formatHedgeTooltipValue(activePoint.minValue, unit) : "—"}
          </div>
          <div className={`hedge-floating-total-box ${statusSummary?.tone || "ok"}`}>
            <div className="hedge-floating-total-main">
              Total Realizado: {((activePoint.totalPct || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% —{" "}
              {formatHedgeTooltipValue(activePoint.total, unit)}
            </div>
            <div className="hedge-floating-total-status">{statusSummary?.text || "—"}</div>
          </div>
          <div className="hedge-floating-line">
            Vendas Fisico:{" "}
            {((activePoint.physicalRaw / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% —{" "}
            {formatHedgeTooltipValue(activePoint.physicalRaw, unit)}
          </div>
          <div className="hedge-floating-line">
            Derivativos:{" "}
            {((activePoint.derivativeRaw / Math.max(baseValue, 1)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% —{" "}
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

function HedgePolicyDashboard({ dashboardFilter }) {
  const { matchesDashboardFilter } = useDashboardFilter();
  const [frequency, setFrequency] = useState("monthly");
  const [focusedChart, setFocusedChart] = useState(null);
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
    () => {
      const totalProduction = cropBoards
        .filter((item) => matchesDashboardFilter(item, dashboardFilter))
        .reduce((sum, item) => sum + Math.abs(Number(item.producao_total || 0)), 0);
      const physicalPaymentVolume = physicalPayments
        .filter((item) => matchesDashboardFilter(item, dashboardFilter))
        .reduce((sum, item) => sum + Math.abs(Number(item.volume || 0)), 0);

      return Math.max(totalProduction - physicalPaymentVolume, 0);
    },
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
    () => derivatives.filter((item) => matchesDashboardFilter(item, dashboardFilter)),
    [dashboardFilter, derivatives],
  );

  return (
    <section className="hedge-dashboard-shell">
      <section className={`hedge-dashboard-grid${focusedChart ? " single-visible" : ""}`}>
        {focusedChart !== "production" ? (
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
            extraActions={
              <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="hedge-chart-select">
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            }
          />
        ) : null}
        {focusedChart !== "cost" ? (
          <HedgePolicyChart
            title="Gráfico 2 — Hedge produção liquida (sc)"
            unit="SC"
            frequency={frequency}
            baseValue={productionBase}
            physicalRows={filteredPhysicalSales}
            derivativeRows={filteredDerivatives}
            policies={filteredPolicies}
            physicalValueGetter={getPhysicalVolumeValue}
            derivativeValueGetter={getDerivativeVolumeValue}
            physicalDetailValueGetter={(item) => getPhysicalCostValue(item, usdBrlRate)}
            derivativeDetailValueGetter={(item) => getDerivativeCostValue(item, usdBrlRate)}
            onFocusToggle={() => setFocusedChart((current) => (current === "production" ? null : "production"))}
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
  const { matchesDashboardFilter } = useDashboardFilter();
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
      .map((item) => normalizeText(item.cultura));
  }, [dashboardFilter?.cultura, filterOptions?.crops]);

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
        const isCurrencyDerivative = normalizeText(item.moeda_ou_cmdtye) === "moeda";
        return rowMatchesDashboardFilter(item, dashboardFilter, {
          cultureKeys: isCurrencyDerivative ? ["destino_cultura"] : ["cultura", "culturas"],
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
    const primaryCropBoard = filteredCropBoards.find((item) => Number(item.producao_total || 0) > 0);
    const productionTotal = Number(primaryCropBoard?.producao_total || 0);
    const producaoLiquida = productionTotal - volumePgtoFisico;

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

const dashboardContent = {
  cashflow: {
    title: "Fluxo de Caixa",
    description: "Visao consolidada de entradas, saidas, vencimentos e pressao financeira por safra e grupo.",
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
    title: "KPIs de Risco Comercial",
    description: "Indicadores executivos para gestão de risco, comercialização por componentes e acompanhamento de MTM dos derivativos.",
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

  if (kind === "cashflow") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} />
        <CashflowDashboard dashboardFilter={filter} compact />
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
