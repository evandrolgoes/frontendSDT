import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { ResourceTable } from "../components/ResourceTable";
import { TradingviewLineChart } from "../components/charts/tradingview/TradingviewLineChart";
import { useAuth } from "../contexts/AuthContext";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";
import { normalizeLookupValue } from "../utils/formatters";
import { formatBrazilianDate } from "../utils/date";

const HISTORY_DAYS = 365 * 5;
const VISIBLE_DAYS = 30;
const PHYSICAL_SALE_MARKER_COLOR = "#facc15";
const DERIVATIVE_MARKER_COLOR = "#f97316";
const SOYBEAN_LINE_KEY = "soybean-line";
const USD_BRL_LINE_KEY = "usdbrl-line";
const SALES_POINT_KEY = "sales-points";
const CMDTY_DERIVATIVE_POINT_KEY = "cmdty-derivative-points";
const FX_DERIVATIVE_POINT_KEY = "fx-derivative-points";

const SOYBEAN_CBOT = {
  symbol: "ZS1!",
  title: "Soja CBOT",
  unitLabel: "pts",
  exchangeKey: "soja_cbot",
};

const USD_BRL = {
  symbol: "USDBRL=X",
  title: "USDBRL",
  unitLabel: "R$",
};

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatRate = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

const mapCandlesToLine = (candles = []) =>
  candles.reduce((acc, candle) => {
    const value = Number(candle?.close);
    if (!candle?.time || !Number.isFinite(value) || value <= 0) {
      return acc;
    }
    acc.push({ time: candle.time, value });
    return acc;
  }, []);

const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const buildDailyCarryForwardLine = (candles = [], endDate = new Date()) => {
  const baseLine = mapCandlesToLine(candles);
  if (!baseLine.length) {
    return [];
  }

  const orderedLine = [...baseLine].sort((left, right) => left.time.localeCompare(right.time));
  const lineByDate = new Map(orderedLine.map((item) => [item.time, item.value]));
  const startDate = new Date(orderedLine[0].time);
  const finalDate = new Date(Math.max(new Date(orderedLine[orderedLine.length - 1].time).getTime(), endDate.getTime()));
  const expanded = [];
  let lastValue = null;

  for (let cursor = new Date(startDate); cursor <= finalDate; cursor = addDays(cursor, 1)) {
    const isoDate = toIsoDate(cursor);
    const exactValue = lineByDate.get(isoDate);

    if (Number.isFinite(exactValue) && exactValue > 0) {
      lastValue = exactValue;
    }

    if (!Number.isFinite(lastValue)) {
      continue;
    }

    expanded.push({
      time: isoDate,
      value: lastValue,
    });
  }

  return expanded;
};

const buildPointSeries = ({
  soybeanLine = [],
  usdBrlLine = [],
  sales = [],
  derivatives = [],
}) => {
  const soybeanByDate = new Map(soybeanLine.map((item) => [item.time, item.value]));
  const usdBrlByDate = new Map(usdBrlLine.map((item) => [item.time, item.value]));
  const salesPointsByDate = new Map();
  const cmdtyDerivativePointsByDate = new Map();
  const fxDerivativePointsByDate = new Map();

  sales.forEach((item) => {
    const negotiationDate = String(item?.data_negociacao || "").trim();
    const value = soybeanByDate.get(negotiationDate);

    if (!negotiationDate || !Number.isFinite(value)) {
      return;
    }

    salesPointsByDate.set(negotiationDate, { time: negotiationDate, value });
  });

  derivatives.forEach((item) => {
    const negotiationDate = String(item?.data_negociacao || item?.data_contratacao || "").trim();
    const isCurrencyDerivative = normalizeLookupValue(item?.moeda_ou_cmdtye) === "moeda";
    const value = isCurrencyDerivative ? usdBrlByDate.get(negotiationDate) : soybeanByDate.get(negotiationDate);

    if (!negotiationDate || !Number.isFinite(value)) {
      return;
    }

    if (isCurrencyDerivative) {
      fxDerivativePointsByDate.set(negotiationDate, { time: negotiationDate, value });
      return;
    }

    cmdtyDerivativePointsByDate.set(negotiationDate, { time: negotiationDate, value });
  });

  const sortByTime = (left, right) => left.time.localeCompare(right.time);

  return {
    salesPoints: [...salesPointsByDate.values()].sort(sortByTime),
    cmdtyDerivativePoints: [...cmdtyDerivativePointsByDate.values()].sort(sortByTime),
    fxDerivativePoints: [...fxDerivativePointsByDate.values()].sort(sortByTime),
  };
};

function BasisResourceTableModal({ selectedTable, onClose }) {
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    setSearchValue("");
  }, [selectedTable?.definition?.resource, selectedTable?.rows, selectedTable?.title]);

  if (!selectedTable?.definition) {
    return null;
  }

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup dashboard-resource-table-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="component-popup-close" onClick={onClose}>
          ×
        </button>
        <div className="component-popup-header dashboard-resource-table-header">
          <div>
            <strong>{selectedTable.title}</strong>
            <p className="muted">{selectedTable.rows.length} registro(s) no recorte selecionado.</p>
          </div>
        </div>
        <ResourceTable
          definition={selectedTable.definition}
          rows={selectedTable.rows}
          searchValue={searchValue}
          searchPlaceholder={selectedTable.definition.searchPlaceholder || "Buscar..."}
          onSearchChange={setSearchValue}
          onClear={() => setSearchValue("")}
          tableHeight="100%"
        />
      </div>
    </div>
  );
}

export function BasisPage() {
  const { isAuthenticated } = useAuth();
  const [candles, setCandles] = useState([]);
  const [usdBrlCandles, setUsdBrlCandles] = useState([]);
  const [salesPoints, setSalesPoints] = useState([]);
  const [cmdtyDerivativePoints, setCmdtyDerivativePoints] = useState([]);
  const [fxDerivativePoints, setFxDerivativePoints] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [derivativeRows, setDerivativeRows] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - HISTORY_DAYS);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    Promise.all([
      resourceService.getYahooHistory(
        {
          symbol: SOYBEAN_CBOT.symbol,
          period1,
          period2,
        },
        { force: true },
      ),
      resourceService.getYahooHistory(
        {
          symbol: USD_BRL.symbol,
          period1,
          period2,
        },
        { force: true },
      ),
      isAuthenticated ? resourceService.listAll("physical-sales", {}, { force: true }) : Promise.resolve([]),
      isAuthenticated ? resourceService.listAll("derivative-operations", {}, { force: true }) : Promise.resolve([]),
    ])
      .then(([payload, usdBrlPayload, physicalSales, derivativeOperations]) => {
        if (!isMounted) return;

        const soybeanLine = buildDailyCarryForwardLine(mapYahooPayloadToCandles(payload), endDate);
        const usdBrlLine = buildDailyCarryForwardLine(mapYahooPayloadToCandles(usdBrlPayload), endDate);
        const filteredSales = (Array.isArray(physicalSales) ? physicalSales : []).filter(
          (item) => normalizeLookupValue(item?.bolsa_ref) === normalizeLookupValue(SOYBEAN_CBOT.exchangeKey),
        );
        const filteredDerivatives = (Array.isArray(derivativeOperations) ? derivativeOperations : []).filter((item) => {
          const derivativeKind = normalizeLookupValue(item?.moeda_ou_cmdtye);

          if (derivativeKind === "cmdtye") {
            return normalizeLookupValue(item?.bolsa_ref) === normalizeLookupValue(SOYBEAN_CBOT.exchangeKey);
          }

          return derivativeKind === "moeda";
        });

        const pointState = buildPointSeries({
          soybeanLine,
          usdBrlLine,
          sales: filteredSales,
          derivatives: filteredDerivatives,
        });

        setCandles(soybeanLine);
        setUsdBrlCandles(usdBrlLine);
        setSalesPoints(pointState.salesPoints);
        setCmdtyDerivativePoints(pointState.cmdtyDerivativePoints);
        setFxDerivativePoints(pointState.fxDerivativePoints);
        setSalesRows(filteredSales);
        setDerivativeRows(filteredDerivatives);
        setError(soybeanLine.length ? "" : "Nenhum dado histórico foi retornado para Soja CBOT.");
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setCandles([]);
        setUsdBrlCandles([]);
        setSalesPoints([]);
        setCmdtyDerivativePoints([]);
        setFxDerivativePoints([]);
        setSalesRows([]);
        setDerivativeRows([]);
        setError(
          requestError?.response?.data?.error || requestError?.message || "Nao foi possivel carregar o historico de Soja CBOT.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const latestCandle = candles[candles.length - 1] || null;
  const latestUsdBrlCandle = usdBrlCandles[usdBrlCandles.length - 1] || null;
  const markerCount = useMemo(
    () => salesPoints.length + cmdtyDerivativePoints.length + fxDerivativePoints.length,
    [cmdtyDerivativePoints.length, fxDerivativePoints.length, salesPoints.length],
  );

  const lineDefs = useMemo(
    () => [
      {
        key: SOYBEAN_LINE_KEY,
        title: SOYBEAN_CBOT.title,
        color: "#0f766e",
        lineWidth: 3,
        data: candles,
        options: {
          priceScaleId: "right",
        },
      },
      {
        key: USD_BRL_LINE_KEY,
        title: USD_BRL.title,
        color: "#2563eb",
        lineWidth: 2,
        data: usdBrlCandles,
        options: {
          priceScaleId: "left",
        },
      },
      {
        key: SALES_POINT_KEY,
        title: "Vendas Fisico",
        color: PHYSICAL_SALE_MARKER_COLOR,
        data: salesPoints,
        options: {
          priceScaleId: "right",
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        },
      },
      {
        key: CMDTY_DERIVATIVE_POINT_KEY,
        title: "Derivativos Bolsa",
        color: DERIVATIVE_MARKER_COLOR,
        data: cmdtyDerivativePoints,
        options: {
          priceScaleId: "right",
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        },
      },
      {
        key: FX_DERIVATIVE_POINT_KEY,
        title: "Derivativos Moeda",
        color: DERIVATIVE_MARKER_COLOR,
        data: fxDerivativePoints,
        options: {
          priceScaleId: "left",
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        },
      },
    ],
    [candles, cmdtyDerivativePoints, fxDerivativePoints, salesPoints, usdBrlCandles],
  );

  const handleChartClick = useCallback(
    (param) => {
      const seriesKey = String(param?.seriesKey || "").trim();
      const negotiationDate = String(param?.time || "").trim();

      if (!seriesKey || !negotiationDate) {
        return;
      }

      if (![SALES_POINT_KEY, CMDTY_DERIVATIVE_POINT_KEY, FX_DERIVATIVE_POINT_KEY].includes(seriesKey)) {
        return;
      }

      const isDerivative = seriesKey === CMDTY_DERIVATIVE_POINT_KEY || seriesKey === FX_DERIVATIVE_POINT_KEY;
      const rows = isDerivative
        ? derivativeRows.filter((item) => String(item?.data_negociacao || item?.data_contratacao || "").trim() === negotiationDate)
        : salesRows.filter((item) => String(item?.data_negociacao || "").trim() === negotiationDate);

      if (!rows.length) {
        return;
      }

      setSelectedTable({
        title: `${isDerivative ? "Derivativos" : "Vendas Fisico"} — ${formatBrazilianDate(negotiationDate)}`,
        definition: isDerivative ? resourceDefinitions.derivativeOperations : resourceDefinitions.physicalSales,
        rows,
      });
    },
    [derivativeRows, salesRows],
  );

  return (
    <>
      <div className="resource-page dashboard-page market-test-page">
        <PageHeader
          title="Basis"
          description="Copia inicial do grafico Soja CBOT da pagina Testes."
          tag="Mercado"
        />

        <section className="panel market-test-panel">
          <div className="market-test-intro">
            <div>
              <h3>Grafico inicial</h3>
              <p>Espaco reservado para a primeira versao da pagina Basis.</p>
            </div>
          </div>

          {error ? <div className="market-test-error">{error}</div> : null}

          <article className="market-test-card">
            <div className="market-test-curve-header">
              <div>
                <h3>{SOYBEAN_CBOT.title}</h3>
              </div>
            </div>

            <div className="market-test-chart-shell">
              <TradingviewLineChart
                className="market-test-chart"
                height={420}
                lines={lineDefs}
                onClick={handleChartClick}
                chartOptions={{
                  handleScroll: true,
                  handleScale: true,
                  leftPriceScale: {
                    visible: true,
                    borderColor: "rgba(37, 99, 235, 0.35)",
                  },
                  rightPriceScale: {
                    visible: true,
                    borderColor: "rgba(15, 118, 110, 0.35)",
                  },
                  localization: {
                    priceFormatter: (value) => formatRate(value),
                  },
                }}
              />
            </div>

            {latestCandle ? (
              <div className="market-test-footnote">
                {`Fechamento ${formatRate(latestCandle.value)} ${SOYBEAN_CBOT.unitLabel} em ${latestCandle.time}.`}
              </div>
            ) : loading ? null : (
              <div className="market-test-footnote">Sem candles válidos no recorte atual.</div>
            )}

            {latestUsdBrlCandle ? (
              <div className="market-test-footnote">
                {`USDBRL em ${formatRate(latestUsdBrlCandle.value)} ${USD_BRL.unitLabel} na data ${latestUsdBrlCandle.time}.`}
              </div>
            ) : null}

            {!markerCount && !loading ? (
              <div className="market-test-footnote">Sem operacoes plotadas no recorte atual.</div>
            ) : null}
          </article>
        </section>
      </div>

      <BasisResourceTableModal selectedTable={selectedTable} onClose={() => setSelectedTable(null)} />
    </>
  );
}
