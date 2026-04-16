import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { TradingviewCandlestickChart } from "../components/charts/tradingview/TradingviewCandlestickChart";
import { TradingviewLineChart } from "../components/charts/tradingview/TradingviewLineChart";
import { resourceService } from "../services/resourceService";

// --- Derivative Efficiency Simulation ---

const DERIV_DATES = [
  "2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27",
  "2025-02-03", "2025-02-10", "2025-02-17", "2025-02-24", "2025-03-03",
];

// CBOT Soja (cts/bu) — idêntico nos três cenários (CBOT sobe +120 cts)
const DERIV_CBOT = [1360, 1380, 1400, 1420, 1440, 1450, 1460, 1470, 1480];
const DERIV_ENTRY_CBOT = 1360;
const DERIV_ENTRY_BASIS = -80;
const DERIV_REF_PRICE = DERIV_ENTRY_CBOT + DERIV_ENTRY_BASIS; // 1280 cts

// Basis (cts/bu) por cenário
const DERIV_SCENARIOS = [
  {
    id: "stable",
    title: "Cenário 1 — Basis Estável",
    subtitle: "CBOT sobe, basis permanece em -80 cts",
    description:
      "O CBOT subiu +120 cts e você pagou ajuste negativo no futuro. Mas o preço físico subiu na mesma proporção. " +
      "O resultado líquido é exatamente igual ao preço de referência — o derivativo cumpriu seu papel de hedge.",
    insight: "Ajuste negativo ≠ estratégia errada. O CBOT foi neutralizado.",
    basis: [-80, -80, -82, -80, -82, -80, -80, -80, -80],
    effectiveColor: "#0369a1",
    basisColor: "#64748b",
    outcomeLabel: "Neutro",
    outcomeBg: "#f1f5f9",
    outcomeText: "#475569",
  },
  {
    id: "improve",
    title: "Cenário 2 — Basis Melhora",
    subtitle: "Basis sobe de -80 para -20 cts (+60 cts)",
    description:
      "O basis melhorou +60 cts durante o período. Mesmo pagando o ajuste no CBOT, o preço físico final " +
      "superou o preço de referência em exatamente 60 cts. Estratégia bem-sucedida.",
    insight: "Ganho puro de basis: +60 cts. A direção do CBOT não importou.",
    basis: [-80, -65, -50, -40, -30, -20, -20, -20, -20],
    effectiveColor: "#0f766e",
    basisColor: "#0f766e",
    outcomeLabel: "+ 60 cts",
    outcomeBg: "#f0fdf4",
    outcomeText: "#0f766e",
  },
  {
    id: "worsen",
    title: "Cenário 3 — Basis Piora",
    subtitle: "Basis cai de -80 para -155 cts (-75 cts)",
    description:
      "O basis piorou -75 cts. O preço físico final não compensou o ajuste pago no CBOT. " +
      "O resultado líquido ficou 75 cts abaixo do preço de referência. Estratégia fracassada.",
    insight: "Perda pura de basis: -75 cts. O CBOT subiu, mas não importou.",
    basis: [-80, -95, -110, -120, -130, -140, -148, -155, -155],
    effectiveColor: "#dc2626",
    basisColor: "#dc2626",
    outcomeLabel: "- 75 cts",
    outcomeBg: "#fef2f2",
    outcomeText: "#dc2626",
  },
];

const DERIV_VISIBLE_RANGE = { from: "2025-01-05", to: "2025-03-08" };

const buildDerivLines = (scenario) => {
  const basisArr = scenario.basis;
  const n = DERIV_CBOT.length;
  const cbot = DERIV_DATES.map((time, i) => ({ time, value: DERIV_CBOT[i] }));
  const effective = DERIV_DATES.map((time, i) => ({ time, value: DERIV_CBOT[i] + basisArr[i] }));
  const reference = DERIV_DATES.map((time) => ({ time, value: DERIV_REF_PRICE }));
  const basisLine = DERIV_DATES.map((time, i) => ({ time, value: basisArr[i] }));
  const totalAdjustment = DERIV_ENTRY_CBOT - DERIV_CBOT[n - 1]; // negativo: pagamos
  const finalEffective = DERIV_CBOT[n - 1] + basisArr[n - 1];
  const netResult = finalEffective + totalAdjustment;
  const basisChange = basisArr[n - 1] - DERIV_ENTRY_BASIS;
  return { cbot, effective, reference, basisLine, totalAdjustment, finalEffective, netResult, basisChange };
};

const MAX_BASIS_DELTA = 80; // para normalizar as barras

function DerivativeBasisBar({ value }) {
  const pct = Math.min(Math.abs(value) / MAX_BASIS_DELTA, 1) * 44; // max 44% do lado
  const isPositive = value > 0;
  const isZero = value === 0;
  const color = isZero ? "#94a3b8" : isPositive ? "#0f766e" : "#dc2626";
  return (
    <div className="deriv-eff-bar-track">
      <div className="deriv-eff-bar-center" />
      {isZero ? (
        <div className="deriv-eff-bar-zero" />
      ) : isPositive ? (
        <div
          className="deriv-eff-bar-fill deriv-eff-bar-fill-pos"
          style={{ width: `${pct}%`, background: color }}
        />
      ) : (
        <div
          className="deriv-eff-bar-fill deriv-eff-bar-fill-neg"
          style={{ width: `${pct}%`, background: color }}
        />
      )}
    </div>
  );
}

function DerivativeScenarioCard({ scenario }) {
  const { cbot, effective, reference, basisLine, totalAdjustment, netResult, basisChange } =
    buildDerivLines(scenario);

  const priceLineDefs = [
    {
      key: "cbot",
      title: "CBOT",
      color: "#f59e0b",
      lineWidth: 2,
      data: cbot,
    },
    {
      key: "effective",
      title: "Preço Efetivo",
      color: scenario.effectiveColor,
      lineWidth: 2,
      data: effective,
    },
    {
      key: "reference",
      title: "Referência entrada",
      color: "#94a3b8",
      lineWidth: 1,
      lineStyle: 2,
      data: reference,
      options: { lastValueVisible: false, priceLineVisible: false },
    },
  ];

  const basisLineDefs = [
    {
      key: "basis",
      title: "Basis",
      color: scenario.basisColor,
      lineWidth: 2,
      data: basisLine,
    },
  ];

  const fmtCts = (v) =>
    `${v > 0 ? "+" : ""}${Number(v).toLocaleString("pt-BR")} cts`;

  return (
    <article className="deriv-eff-card">
      <div className="deriv-eff-card-header">
        <div>
          <h3 className="deriv-eff-card-title">{scenario.title}</h3>
          <p className="deriv-eff-card-subtitle">{scenario.subtitle}</p>
        </div>
        <span
          className="deriv-eff-badge"
          style={{ background: scenario.outcomeBg, color: scenario.outcomeText }}
        >
          {scenario.outcomeLabel}
        </span>
      </div>

      <p className="deriv-eff-card-desc">{scenario.description}</p>

      <div className="deriv-eff-metrics">
        <div className="deriv-eff-metric">
          <span className="deriv-eff-metric-label">Entrada</span>
          <span className="deriv-eff-metric-value">CBOT {DERIV_ENTRY_CBOT} | Basis {DERIV_ENTRY_BASIS}</span>
        </div>
        <div className="deriv-eff-metric">
          <span className="deriv-eff-metric-label">Ajuste total pago</span>
          <span className="deriv-eff-metric-value" style={{ color: "#dc2626" }}>
            {fmtCts(totalAdjustment)}
          </span>
        </div>
        <div className="deriv-eff-metric">
          <span className="deriv-eff-metric-label">Variação do basis</span>
          <span
            className="deriv-eff-metric-value"
            style={{ color: basisChange > 0 ? "#0f766e" : basisChange < 0 ? "#dc2626" : "#475569" }}
          >
            {fmtCts(basisChange)}
          </span>
        </div>
        <div className="deriv-eff-metric deriv-eff-metric-result">
          <span className="deriv-eff-metric-label">Resultado líquido</span>
          <span
            className="deriv-eff-metric-value"
            style={{ color: scenario.outcomeText, fontWeight: 800 }}
          >
            {DERIV_REF_PRICE + basisChange} cts
            {basisChange !== 0
              ? ` (${fmtCts(basisChange)} vs ref)`
              : " (= referência)"}
          </span>
        </div>
      </div>

      <div className="deriv-eff-chart-label">CBOT vs Preço Efetivo (cts/bu)</div>
      <div className="market-test-chart-shell">
        <TradingviewLineChart
          className="deriv-eff-price-chart"
          height={220}
          visibleRange={DERIV_VISIBLE_RANGE}
          lines={priceLineDefs}
          chartOptions={{
            handleScroll: false,
            handleScale: false,
            localization: { priceFormatter: (v) => `${Math.round(v)} cts` },
          }}
        />
      </div>

      <div className="deriv-eff-chart-label">Evolução do Basis (cts/bu)</div>
      <div className="market-test-chart-shell">
        <TradingviewLineChart
          className="deriv-eff-basis-chart"
          height={120}
          visibleRange={DERIV_VISIBLE_RANGE}
          lines={basisLineDefs}
          chartOptions={{
            handleScroll: false,
            handleScale: false,
            localization: { priceFormatter: (v) => `${Math.round(v)} cts` },
          }}
        />
      </div>

      <div
        className="deriv-eff-insight"
        style={{ borderLeftColor: scenario.outcomeText, color: scenario.outcomeText }}
      >
        {scenario.insight}
      </div>
    </article>
  );
}

function DerivativeEfficiencySection() {
  const comparisons = DERIV_SCENARIOS.map((s) => {
    const { basisChange } = buildDerivLines(s);
    return { ...s, basisChange };
  });

  return (
    <section className="panel market-test-panel deriv-eff-section">
      <div className="market-test-intro">
        <div>
          <h3>Eficiência do Uso de Derivativos — Análise de Basis</h3>
          <p>
            O objetivo do derivativo de commodities não é gerar lucro por si só, mas sim{" "}
            <strong>proteger o basis</strong>. Se você vende CBOT futuro e o CBOT sobe,
            pagar o ajuste negativo não significa que você errou — você é compensado pelo
            preço físico mais alto. O que determina o sucesso da estratégia é exclusivamente
            a <strong>variação do basis</strong> no período. Os três cenários abaixo usam
            exatamente o mesmo movimento de CBOT (+120 cts) e mostram como o basis define
            o resultado.
          </p>
        </div>
        <div className="deriv-eff-formula-box">
          <div className="deriv-eff-formula-line">
            Resultado líquido = <strong>Referência + Δ Basis</strong>
          </div>
          <div className="deriv-eff-formula-sub">
            O movimento do CBOT é sempre cancelado pelo ajuste do derivativo.
          </div>
        </div>
      </div>

      <div className="deriv-eff-card-grid">
        {DERIV_SCENARIOS.map((s) => (
          <DerivativeScenarioCard key={s.id} scenario={s} />
        ))}
      </div>

      <article className="market-test-card deriv-eff-summary-card">
        <h3 className="deriv-eff-summary-title">Resumo Comparativo — Variação do Basis</h3>
        <p className="deriv-eff-summary-sub">
          Todos os cenários partem do mesmo ponto (CBOT 1360, Basis -80, Ref 1280 cts/bu).
          O CBOT sobe +120 cts nos três casos. O resultado final depende apenas do basis.
        </p>

        <div className="deriv-eff-compare-table">
          {comparisons.map((s) => (
            <div key={s.id} className="deriv-eff-compare-row">
              <div className="deriv-eff-compare-label">
                <span className="deriv-eff-compare-name">{s.title.replace("Cenário ", "C")}</span>
                <span
                  className="deriv-eff-compare-result"
                  style={{ color: s.outcomeText }}
                >
                  {s.basisChange > 0 ? "+" : ""}{s.basisChange} cts
                </span>
              </div>
              <DerivativeBasisBar value={s.basisChange} />
              <div
                className="deriv-eff-compare-final"
                style={{ color: s.outcomeText }}
              >
                {DERIV_REF_PRICE + s.basisChange} cts/bu
              </div>
            </div>
          ))}
        </div>

        <div className="deriv-eff-compare-legend">
          <span>◀ Basis piorou</span>
          <span>|</span>
          <span>Basis melhorou ▶</span>
        </div>
      </article>
    </section>
  );
}

const HISTORY_DAYS = 365 * 5;
const VISIBLE_DAYS = 30;
const BRAZIL_MACRO_LINES = [
  { symbol: "BRINTR", title: "BRINTR", color: "#0f766e" },
  { symbol: "BRGDPYY", title: "BRGDPYY", color: "#dc2626" },
];
const COMMODITIES = [
  { symbol: "ZS1!", title: "Soja CBOT", unitLabel: "pts" },
  { symbol: "ZC=F", title: "Milho CBOT", unitLabel: "pts" },
  { symbol: "ZW=F", title: "Trigo CBOT", unitLabel: "pts" },
  { symbol: "SB=F", title: "Acucar ICE", unitLabel: "pts" },
  { symbol: "KC=F", title: "Cafe ICE", unitLabel: "pts" },
  { symbol: "LE=F", title: "Boi Gordo CME", unitLabel: "pts" },
];

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatRate = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Remove duplicatas de tempo e garante ordem ascendente estrita
const deduplicateAscByTime = (arr) => {
  const seen = new Map();
  arr.forEach((item) => seen.set(item.time, item));
  return Array.from(seen.values()).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
};

const mapProxyRowsToLine = (rows = []) => {
  const raw = (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
    const time = String(item?.date || "").trim();
    const value = Number(item?.value);

    if (!time || !Number.isFinite(value)) {
      return acc;
    }

    acc.push({ time, value });
    return acc;
  }, []);
  return deduplicateAscByTime(raw);
};

const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const expandQuarterlySeriesToDaily = (rows = [], endDate) => {
  const sortedRows = [...rows].sort((left, right) => left.time.localeCompare(right.time));
  if (!sortedRows.length) {
    return [];
  }

  const lastVisibleDate = endDate ? new Date(endDate) : new Date(sortedRows[sortedRows.length - 1].time);
  const expanded = [];

  sortedRows.forEach((row, index) => {
    const currentDate = new Date(row.time);
    const nextDate = sortedRows[index + 1] ? new Date(sortedRows[index + 1].time) : addDays(lastVisibleDate, 1);

    for (let cursor = new Date(currentDate); cursor < nextDate; cursor = addDays(cursor, 1)) {
      expanded.push({
        time: toIsoDate(cursor),
        value: row.value,
      });
    }
  });

  return expanded;
};

const buildVisibleRange = (lastTime) => {
  if (lastTime) {
    const to = new Date(lastTime);
    const from = new Date(to);
    from.setDate(to.getDate() - VISIBLE_DAYS);
    return {
      from: toIsoDate(from),
      to: lastTime,
    };
  }

  const fallbackTo = new Date();
  const fallbackFrom = new Date();
  fallbackFrom.setDate(fallbackTo.getDate() - VISIBLE_DAYS);
  return {
    from: toIsoDate(fallbackFrom),
    to: toIsoDate(fallbackTo),
  };
};

const mapYahooPayloadToCandles = (payload) => {
  const result = payload?.chart?.result?.[0] || {};
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];

  const raw = timestamps.reduce((acc, timestamp, index) => {
    const open = Number(opens[index]);
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const close = Number(closes[index]);

    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return acc;
    }

    acc.push({
      time: toIsoDate(new Date(timestamp * 1000)),
      open,
      high,
      low,
      close,
    });
    return acc;
  }, []);

  return deduplicateAscByTime(raw);
};

export function MercadoTestesPage() {
  const [macroSeriesMap, setMacroSeriesMap] = useState({});
  const [macroLoading, setMacroLoading] = useState(true);
  const [macroError, setMacroError] = useState("");
  const [commoditySeriesMap, setCommoditySeriesMap] = useState({});
  const [commoditiesLoading, setCommoditiesLoading] = useState(true);
  const [commoditiesError, setCommoditiesError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - HISTORY_DAYS);
    const endDateIso = toIsoDate(endDate);

    Promise.all(
      BRAZIL_MACRO_LINES.map((line) =>
        resourceService
          .getBrazilMacroHistory(
            {
              symbol: line.symbol,
              start_date: toIsoDate(startDate),
              end_date: endDateIso,
            },
            { force: true },
          )
          .then((payload) => ({
            symbol: line.symbol,
            rows: mapProxyRowsToLine(payload?.rows),
          })),
      ),
    )
      .then((items) => {
        if (!isMounted) return;

        const nextMap = items.reduce((acc, item) => {
          acc[item.symbol] =
            item.symbol === "BRGDPYY" ? expandQuarterlySeriesToDaily(item.rows, endDateIso) : item.rows;
          return acc;
        }, {});

        setMacroSeriesMap(nextMap);
        const hasAnyData = Object.values(nextMap).some((rows) => Array.isArray(rows) && rows.length > 0);
        setMacroError(hasAnyData ? "" : "Nenhum dado histórico foi retornado para BRINTR e BRGDPYY.");
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setMacroSeriesMap({});
        setMacroError(
          requestError?.response?.data?.error || requestError?.message || "Nao foi possivel carregar BRINTR e BRGDPYY.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setMacroLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - HISTORY_DAYS);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    Promise.all(
      COMMODITIES.map((commodity) =>
        resourceService
          .getYahooHistory(
            {
              symbol: commodity.symbol,
              period1,
              period2,
            },
            { force: true },
          )
          .then((payload) => ({
            symbol: commodity.symbol,
            candles: mapYahooPayloadToCandles(payload),
          })),
      ),
    )
      .then((items) => {
        if (!isMounted) return;

        const nextMap = items.reduce((acc, item) => {
          acc[item.symbol] = item.candles;
          return acc;
        }, {});

        setCommoditySeriesMap(nextMap);
        const hasAnyData = Object.values(nextMap).some((rows) => Array.isArray(rows) && rows.length > 0);
        setCommoditiesError(hasAnyData ? "" : "Nenhum dado histórico foi retornado para as commodities selecionadas.");
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setCommoditySeriesMap({});
        setCommoditiesError(
          requestError?.response?.data?.error || requestError?.message || "Nao foi possivel carregar o historico das commodities.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setCommoditiesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const macroVisibleRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - VISIBLE_DAYS);
    return {
      from: toIsoDate(from),
      to: toIsoDate(to),
    };
  }, []);

  const macroLineDefs = BRAZIL_MACRO_LINES.map((line) => ({
    title: line.title,
    color: line.color,
    lineWidth: 2,
    data: macroSeriesMap[line.symbol] || [],
  }));

  const latestMacroLabels = BRAZIL_MACRO_LINES.map((line) => {
    const rows = macroSeriesMap[line.symbol] || [];
    return {
      symbol: line.symbol,
      point: rows[rows.length - 1] || null,
    };
  }).filter((item) => item.point);

  return (
    <div className="resource-page dashboard-page market-test-page">
      <PageHeader
        title="Testes"
        description="Seis commodities históricas renderizadas com lightweight-charts."
        tag="Mercado"
      />

      <section className="panel market-test-panel">
        <div className="market-test-intro">
          <div>
            <h3>Commodities em candle</h3>
          </div>
        </div>

        {macroError ? <div className="market-test-error">{macroError}</div> : null}

        <article className="market-test-card">
          <div className="market-test-curve-header">
            <div>
              <h3>BRINTR e BRGDPYY</h3>
            </div>
          </div>

          <div className="market-test-chart-shell">
            <TradingviewLineChart
              className="market-test-chart"
              height={420}
              visibleRange={macroVisibleRange}
              lines={macroLineDefs}
              chartOptions={{
                handleScroll: true,
                handleScale: true,
                localization: {
                  priceFormatter: (value) => `${formatRate(value)}%`,
                },
              }}
            />
          </div>

          {latestMacroLabels.length ? (
            <div className="market-test-footnote">
              {latestMacroLabels.map((item) => `${item.symbol}: ${formatRate(item.point.value)}%`).join(" | ")}
            </div>
          ) : macroLoading ? null : (
            <div className="market-test-footnote">Sem dados no recorte atual.</div>
          )}
        </article>

        {commoditiesError ? <div className="market-test-error">{commoditiesError}</div> : null}

        <div className="market-test-card-grid">
          {COMMODITIES.map((commodity) => {
            const candles = commoditySeriesMap[commodity.symbol] || [];
            const latestCandle = candles[candles.length - 1] || null;

            return (
              <article key={commodity.symbol} className="market-test-card">
                <div className="market-test-curve-header">
                  <div>
                    <h3>{commodity.title}</h3>
                  </div>
                </div>

                <div className="market-test-chart-shell">
                  <TradingviewCandlestickChart
                    className="market-test-chart market-test-chart-compact"
                    height={320}
                    visibleRange={buildVisibleRange(latestCandle?.time)}
                    candles={candles}
                    chartOptions={{
                      handleScroll: true,
                      handleScale: true,
                      localization: {
                        priceFormatter: (value) => `${formatRate(value)} ${commodity.unitLabel}`,
                      },
                    }}
                  />
                </div>

                {latestCandle ? (
                  <div className="market-test-footnote">
                    {`Fechamento ${formatRate(latestCandle.close)} ${commodity.unitLabel} em ${latestCandle.time}.`}
                  </div>
                ) : (
                  <div className="market-test-footnote">Sem candles válidos no recorte atual.</div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <DerivativeEfficiencySection />
    </div>
  );
}
