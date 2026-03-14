import { PageHeader } from "../components/PageHeader";

const stats = [
  { label: "Exposicao Aberta", value: "48.200 t" },
  { label: "Hedge Ratio", value: "63.5%" },
  { label: "MTM Consolidado", value: "R$ 12,4 mi" },
  { label: "Eventos de Gatilho", value: "18" },
];

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visao inicial de risco, hedge, posicao fisica, mercado e auditoria."
        tag="overview"
      />
      <section className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="card stat-card">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>
      <section className="content-grid">
        <div className="panel">
          <h3>Resumo operacional</h3>
          <p className="muted">
            O dashboard foi preparado para evoluir com indicadores vindos dos endpoints de exposicao, MTM,
            vendas fisicas, derivativos e liquidações. A estrutura ja comporta cards, tabelas e graficos.
          </p>
        </div>
        <div className="panel">
          <h3>Alertas recentes</h3>
          <p className="muted">
            Estrategias e gatilhos podem acionar alertas por preco, basis, FX e volume, mantendo rastreabilidade
            de eventos e acompanhamento por tenant.
          </p>
        </div>
      </section>
    </div>
  );
}
