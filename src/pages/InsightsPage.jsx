import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { resourceService } from "../services/resourceService";

function WrittenCard({ title, body, bullets }) {
  return (
    <article className="chart-card insights-summary-card">
      <div className="chart-card-header">
        <div>
          <h3>{title}</h3>
        </div>
      </div>
      {body ? <p className="insights-summary-text">{body}</p> : null}
      {bullets?.length ? (
        <ul className="insights-bullet-list">
          {bullets.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}
      {!body && !bullets?.length ? <p className="muted">Sem leitura disponível no momento.</p> : null}
    </article>
  );
}

export function InsightsPage() {
  const { filter } = useDashboardFilter();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    resourceService
      .getCommercialInsights(
        {
          grupo: filter?.grupo || [],
          subgrupo: filter?.subgrupo || [],
          cultura: filter?.cultura || [],
          safra: filter?.safra || [],
          localidade: filter?.localidade || [],
        },
        { force: true },
      )
      .then((response) => {
        if (!active) return;
        setPayload(response || null);
      })
      .catch(() => {
        if (!active) return;
        setError("Nao foi possivel carregar os insights agora.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filter?.cultura, filter?.grupo, filter?.localidade, filter?.safra, filter?.subgrupo]);

  const writtenCards = useMemo(() => (Array.isArray(payload?.written_cards) ? payload.written_cards : []), [payload?.written_cards]);

  const sourceTag = useMemo(() => {
    if (payload?.ai_result && payload?.ai_model) {
      return `Insights com IA (${payload.ai_model})`;
    }
    return "Insights locais";
  }, [payload?.ai_model, payload?.ai_result]);

  return (
    <div className="resource-page dashboard-page insights-page">
      <PageHeader
        title="Insights"
        description="Leitura inteligente da comercializacao, política de hedge e riscos operacionais para apoiar a decisão do produtor rural."
        tag={sourceTag}
      />

      {loading ? <div className="panel muted">Carregando insights...</div> : null}
      {error ? <div className="panel muted">{error}</div> : null}

      {!loading && !error ? (
        <section className="insights-main-grid">
          {writtenCards.map((card) => (
            <WrittenCard key={card.key} title={card.title} body={card.body} bullets={card.bullets} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
