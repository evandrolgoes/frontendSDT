import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { TradingviewCandlestickChart } from "../components/charts/tradingview/TradingviewCandlestickChart";
import { TradingviewLineChart } from "../components/charts/tradingview/TradingviewLineChart";
import { resourceService } from "../services/resourceService";

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

const mapProxyRowsToLine = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
    const time = String(item?.date || "").trim();
    const value = Number(item?.value);

    if (!time || !Number.isFinite(value)) {
      return acc;
    }

    acc.push({ time, value });
    return acc;
  }, []);

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

  return timestamps.reduce((acc, timestamp, index) => {
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
    </div>
  );
}
