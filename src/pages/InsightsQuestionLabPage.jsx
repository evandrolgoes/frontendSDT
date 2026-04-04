import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { resourceService } from "../services/resourceService";

export function InsightsQuestionLabPage() {
  const { filter } = useDashboardFilter();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("open-sales");

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
        },
        { force: true },
      )
      .then((response) => {
        if (!active) return;
        setPayload(response || null);
      })
      .catch(() => {
        if (!active) return;
        setError("Nao foi possivel carregar as respostas prontas agora.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filter?.cultura, filter?.grupo, filter?.safra, filter?.subgrupo]);

  const questions = useMemo(() => (Array.isArray(payload?.question_lab) ? payload.question_lab : []), [payload?.question_lab]);

  useEffect(() => {
    if (!questions.length) {
      return;
    }
    if (!questions.some((item) => item.id === selectedQuestionId)) {
      setSelectedQuestionId(questions[0].id);
    }
  }, [questions, selectedQuestionId]);

  const selectedQuestion = useMemo(
    () => questions.find((item) => item.id === selectedQuestionId) || questions[0] || null,
    [questions, selectedQuestionId],
  );

  return (
    <div className="resource-page dashboard-page insights-page">
      <PageHeader
        title="Perguntas Prontas"
        description="Laboratório de teste para respostas guiadas dentro do grupo de Insights, sem necessidade de chat aberto."
        tag="Insights Lab"
      />

      <section className="panel insights-lab-panel">
        <div className="insights-lab-header">
          <div>
            <div className="mono muted">Teste rapido</div>
            <h3>Perguntas sugeridas</h3>
            <p className="muted">
              Escolha uma pergunta pronta para consultar números e leituras reais do recorte filtrado, sem depender de chat aberto.
            </p>
          </div>
        </div>

        <div className="insights-lab-grid">
          <div className="insights-question-list" role="tablist" aria-label="Perguntas prontas">
            {loading ? <div className="chart-card muted">Carregando perguntas...</div> : null}
            {error ? <div className="chart-card muted">{error}</div> : null}
            {!loading && !error
              ? questions.map((question) => {
                  const isActive = question.id === selectedQuestion.id;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      className={`insights-question-button${isActive ? " active" : ""}`}
                      onClick={() => setSelectedQuestionId(question.id)}
                    >
                      <span className="insights-question-caption">Resposta real</span>
                      <strong>{question.title}</strong>
                    </button>
                  );
                })
              : null}
          </div>

          {!loading && !error && selectedQuestion ? (
            <article className="chart-card insights-answer-card">
              <div className="chart-card-header">
                <div>
                  <div className="mono muted">Resposta real</div>
                  <h3>{selectedQuestion.title}</h3>
                </div>
              </div>

              <div className="stats-grid">
                {(selectedQuestion.stats || []).map((stat) => (
                  <article className="card stat-card" key={`${selectedQuestion.id}-${stat.label}`}>
                    <span>{stat.label}</span>
                    <strong className="stat-card-primary-title">{stat.value}</strong>
                  </article>
                ))}
              </div>

              <p className="insights-summary-text">{selectedQuestion.summary}</p>
              <ul className="insights-bullet-list">
                {(selectedQuestion.bullets || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
