import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { TradingviewLineChart } from "../components/charts/tradingview/TradingviewLineChart";
import { resourceService } from "../services/resourceService";

const HISTORY_DAYS = 365 * 5;
const VISIBLE_DAYS = 30;
const USA_CURVES = [
  { code: "1Y", title: "1Y", color: "#0f766e" },
  { code: "2Y", title: "2Y", color: "#2563eb" },
  { code: "3Y", title: "3Y", color: "#7c3aed" },
  { code: "5Y", title: "5Y", color: "#d97706" },
  { code: "10Y", title: "10Y", color: "#dc2626" },
];
const BRAZIL_CURVES = [
  { code: "1Y", title: "1Y", color: "#15803d" },
  { code: "2Y", title: "2Y", color: "#0891b2" },
  { code: "3Y", title: "3Y", color: "#7c2d12" },
  { code: "5Y", title: "5Y", color: "#9333ea" },
  { code: "10Y", title: "10Y", color: "#be123c" },
];

const mercadoPageContent = {
  quotes: {
    title: "Cotacoes",
    description: "Espaco reservado para a leitura de precos, curvas e referencias de mercado.",
  },
  exports: {
    title: "Exportacoes",
    description: "Base inicial para acompanhar informacoes e indicadores ligados a exportacoes.",
  },
  basis: {
    title: "Basis",
    description: "Tela inicial para series, comparativos e acompanhamento de basis.",
  },
  interestRates: {
    title: "Taxa de Juros",
    description: "Curvas de juros do Brasil e dos Estados Unidos.",
  },
  others: {
    title: "Outros",
    description: "Area coringa do modulo Mercado para futuros paineis e ferramentas complementares.",
  },
};

const mercadoHighlights = {
  quotes: [
    "Cotacoes spot e referencias de bolsa",
    "Acompanhamento por cultura, praca e moeda",
    "Estrutura pronta para cards e series historicas",
  ],
  exports: [
    "Leituras de fluxo e ritmo de embarque",
    "Indicadores por produto, porto ou periodo",
    "Espaco pronto para tabelas e alertas",
  ],
  basis: [
    "Painel para series e diferencas regionais",
    "Comparacao entre origem, destino e janela",
    "Base pronta para graficos e monitoramento",
  ],
  interestRates: [
    "Curvas de juros do Brasil por vencimento",
    "Curvas de juros dos Estados Unidos por vencimento",
    "Estrutura pronta para acompanhamento historico",
  ],
  others: [
    "Entrada para modulos auxiliares de mercado",
    "Espaco para testes de novos paineis",
    "Estrutura inicial ja conectada ao sidebar",
  ],
};

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatRate = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function InterestRatesContent() {
  const [usaCurveMap, setUsaCurveMap] = useState({});
  const [brazilCurveMap, setBrazilCurveMap] = useState({});
  const [usaLoading, setUsaLoading] = useState(true);
  const [brazilLoading, setBrazilLoading] = useState(true);
  const [usaError, setUsaError] = useState("");
  const [brazilError, setBrazilError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - HISTORY_DAYS);

    Promise.all(
      USA_CURVES.map((curve) =>
        resourceService.getGovernmentBondHistory(
          {
            country: "UNITED_STATES",
            duration: curve.code,
            start_date: toIsoDate(startDate),
            end_date: toIsoDate(endDate),
          },
          { force: true },
        ),
      ),
    )
      .then((payloads) => {
        if (!isMounted) return;
        const nextMap = payloads.reduce((acc, payload, index) => {
          acc[USA_CURVES[index].code] = Array.isArray(payload?.rows)
            ? payload.rows.map((item) => ({ time: item.date, value: Number(item.value) }))
            : [];
          return acc;
        }, {});
        setUsaCurveMap(nextMap);
        const hasAnyData = Object.values(nextMap).some((rows) => rows.length > 0);
        setUsaError(hasAnyData ? "" : "Nenhum dado histórico foi retornado para a curva americana.");
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setUsaCurveMap({});
        setUsaError(requestError?.response?.data?.error || requestError?.message || "Nao foi possivel carregar o historico da curva americana.");
      })
      .finally(() => {
        if (!isMounted) return;
        setUsaLoading(false);
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

    Promise.all(
      BRAZIL_CURVES.map((curve) =>
        resourceService.getGovernmentBondHistory(
          {
            country: "BRAZIL",
            duration: curve.code,
            start_date: toIsoDate(startDate),
            end_date: toIsoDate(endDate),
          },
          { force: true },
        ),
      ),
    )
      .then((payloads) => {
        if (!isMounted) return;
        const nextMap = payloads.reduce((acc, payload, index) => {
          acc[BRAZIL_CURVES[index].code] = Array.isArray(payload?.rows)
            ? payload.rows.map((item) => ({ time: item.date, value: Number(item.value) }))
            : [];
          return acc;
        }, {});
        setBrazilCurveMap(nextMap);
        const hasAnyData = Object.values(nextMap).some((rows) => rows.length > 0);
        setBrazilError(hasAnyData ? "" : "Nenhum dado histórico foi retornado para a curva brasileira.");
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setBrazilCurveMap({});
        setBrazilError(requestError?.response?.data?.error || requestError?.message || "Nao foi possivel carregar o historico da curva brasileira.");
      })
      .finally(() => {
        if (!isMounted) return;
        setBrazilLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - VISIBLE_DAYS);
    return {
      from: toIsoDate(from),
      to: toIsoDate(to),
    };
  }, []);

  const usaLineDefs = USA_CURVES.map((curve) => ({
    title: curve.title,
    color: curve.color,
    lineWidth: 2,
    data: usaCurveMap[curve.code] || [],
  }));

  const brazilLineDefs = BRAZIL_CURVES.map((curve) => ({
    title: curve.title,
    color: curve.color,
    lineWidth: 2,
    data: brazilCurveMap[curve.code] || [],
  }));

  const latestUsaLabels = USA_CURVES.map((curve) => {
    const rows = usaCurveMap[curve.code] || [];
    return {
      code: curve.title,
      point: rows[rows.length - 1] || null,
    };
  }).filter((item) => item.point);

  const latestBrazilLabels = BRAZIL_CURVES.map((curve) => {
    const rows = brazilCurveMap[curve.code] || [];
    return {
      code: curve.title,
      point: rows[rows.length - 1] || null,
    };
  }).filter((item) => item.point);

  return (
    <div className="interest-rates-grid">
      {usaError ? <div className="market-test-error">{usaError}</div> : null}
      {brazilError ? <div className="market-test-error">{brazilError}</div> : null}

      <section className="panel market-test-card">
        <div className="market-test-curve-header">
          <div>
            <h3>Estados Unidos</h3>
          </div>
        </div>
        <div className="market-test-chart-shell">
          <TradingviewLineChart
            className="market-test-chart"
            height={420}
            visibleRange={visibleRange}
            lines={usaLineDefs}
            chartOptions={{
              handleScroll: true,
              handleScale: true,
              localization: {
                priceFormatter: (value) => `${formatRate(value)}%`,
              },
            }}
          />
        </div>
        {latestUsaLabels.length ? (
          <div className="market-test-footnote">
            {latestUsaLabels.map((item) => `${item.code}: ${formatRate(item.point.value)}%`).join(" | ")}
          </div>
        ) : usaLoading ? null : (
          <div className="market-test-footnote">Sem dados no recorte atual.</div>
        )}
      </section>

      <section className="panel market-test-card">
        <div className="market-test-curve-header">
          <div>
            <h3>Brasil</h3>
          </div>
        </div>
        <div className="market-test-chart-shell">
          <TradingviewLineChart
            className="market-test-chart"
            height={420}
            visibleRange={visibleRange}
            lines={brazilLineDefs}
            chartOptions={{
              handleScroll: true,
              handleScale: true,
              localization: {
                priceFormatter: (value) => `${formatRate(value)}%`,
              },
            }}
          />
        </div>
        {latestBrazilLabels.length ? (
          <div className="market-test-footnote">
            {latestBrazilLabels.map((item) => `${item.code}: ${formatRate(item.point.value)}%`).join(" | ")}
          </div>
        ) : brazilLoading ? null : (
          <div className="market-test-footnote">Sem dados no recorte atual.</div>
        )}
      </section>
    </div>
  );
}

export function MercadoPage({ kind = "quotes" }) {
  const content = mercadoPageContent[kind] || mercadoPageContent.quotes;
  const highlights = mercadoHighlights[kind] || mercadoHighlights.quotes;

  if (kind === "interestRates") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} tag="Mercado" />
        <InterestRatesContent />
      </div>
    );
  }

  return (
    <div className="resource-page dashboard-page">
      <PageHeader title={content.title} description={content.description} tag="Mercado" />

      <section className="panel">
        <div className="stats-grid">
          {highlights.map((item) => (
            <article className="card stat-card" key={item}>
              <span>Mercado</span>
              <strong className="stat-card-primary-title">{item}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
