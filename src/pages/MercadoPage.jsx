import { PageHeader } from "../components/PageHeader";

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
    description: "Acompanhamento das curvas de juros do Brasil e dos Estados Unidos dentro do modulo Mercado.",
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
    "Embeds prontos para acompanhamento rapido",
  ],
  others: [
    "Entrada para modulos auxiliares de mercado",
    "Espaco para testes de novos paineis",
    "Estrutura inicial ja conectada ao sidebar",
  ],
};

export function MercadoPage({ kind = "quotes" }) {
  const content = mercadoPageContent[kind] || mercadoPageContent.quotes;
  const highlights = mercadoHighlights[kind] || mercadoHighlights.quotes;

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
