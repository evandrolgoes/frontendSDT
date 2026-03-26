import { PageHeader } from "../components/PageHeader";
import { FundPositionChart } from "../components/FundPositionChart";

const mercadoPageContent = {
  fundPositions: {
    title: "Posicao de Fundos",
    description: "",
  },
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
    description: "Acompanhamento das curvas de juros do Brasil e dos Estados Unidos dentro do modulo Mercado.",
  },
  others: {
    title: "Outros",
    description: "Area coringa do modulo Mercado para futuros paineis e ferramentas complementares.",
  },
};

const mercadoHighlights = {
  fundPositions: [
    "Consolidacao de exposicao por fundo",
    "Comparativos entre janelas e gestores",
    "Espaco para filtros e indicadores dedicados",
  ],
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
    "Embeds prontos para acompanhamento rapido",
  ],
  others: [
    "Entrada para modulos auxiliares de mercado",
    "Espaco para testes de novos paineis",
    "Estrutura inicial ja conectada ao sidebar",
  ],
};

export function MercadoPage({ kind = "fundPositions" }) {
  const content = mercadoPageContent[kind] || mercadoPageContent.fundPositions;
  const highlights = mercadoHighlights[kind] || mercadoHighlights.fundPositions;

  if (kind === "fundPositions") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader
          title={content.title}
          description=""
          tag="Mercado"
        />

        <div className="fund-position-grid">
          <FundPositionChart
            title="Posicao de Fundos - Milho CBOT"
            marketName="CORN - CHICAGO BOARD OF TRADE"
            csvUrl={"https://publicreporting.cftc.gov/resource/jun7-fc8e.csv?$select=report_date_as_yyyy_mm_dd,market_and_exchange_names,noncomm_positions_long_all,noncomm_positions_short_all,noncomm_postions_spread_all&$where=cftc_contract_market_code='002602'%20AND%20report_date_as_yyyy_mm_dd%20%3E=%20'2020-01-01'&$order=report_date_as_yyyy_mm_dd%20asc&$limit=2000&$offset=0"}
            showDirectionLabels
            showNetLabel
          />
          <FundPositionChart
            title="Posicao de Fundos - Soja CBOT"
            marketName="SOYBEANS - CHICAGO BOARD OF TRADE"
            csvUrl={"https://publicreporting.cftc.gov/resource/jun7-fc8e.csv?$select=report_date_as_yyyy_mm_dd,market_and_exchange_names,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_short_all,noncomm_postions_spread_all&$where=market_and_exchange_names='SOYBEANS - CHICAGO BOARD OF TRADE'%20AND%20report_date_as_yyyy_mm_dd%20%3E=%20'2020-01-01'&$order=report_date_as_yyyy_mm_dd%20asc&$limit=2000&$offset=0"}
            showDirectionLabels
            showNetLabel
          />
        </div>
      </div>
    );
  }

  if (kind === "interestRates") {
    return (
      <div className="resource-page dashboard-page">
        <PageHeader title={content.title} description={content.description} tag="Mercado" />

        <div className="interest-rates-grid">
          <section className="panel interest-rate-card">
            <div className="interest-rate-header">
              <h3 className="interest-rate-title">Juros Brasil: 1, 2, 3, 5 e 10 anos</h3>
            </div>
            <div className="interest-rate-frame-shell">
              <iframe
                title="Juros Brasil"
                src="https://app.koyfin.com/share/89eb21db9a/simple"
                className="interest-rate-frame"
                frameBorder="0"
              />
            </div>
          </section>

          <section className="panel interest-rate-card">
            <div className="interest-rate-header">
              <h3 className="interest-rate-title">Juros EUA: 1, 2, 3, 5 e 10 anos</h3>
            </div>
            <div className="interest-rate-frame-shell interest-rate-frame-shell-compact">
              <iframe
                title="Juros EUA"
                src="https://app.koyfin.com/share/9a31dec8e4/simple"
                className="interest-rate-frame"
                frameBorder="0"
              />
            </div>
          </section>
        </div>
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
