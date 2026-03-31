import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";

const STORAGE_KEY = "market-summary-workspace-v2";

const DEFAULT_OBJECTIVE =
  "Criar um resumo semanal de mercado com linguagem executiva, semelhante a uma carta de mercado para produtores rurais.";

const DEFAULT_OUTLINE = `Principais Acontecimentos da Semana

Performance das Commodities

Macroeconomia
Macroeconomia - Brasil
Macroeconomia - Guerras

Dolar

Mercado da Soja
Premios Paranagua
Evolucao da Safra
Analise Grafica da Soja CBOT

Mercado do Milho

Insumos

Clima - Destaques da Semana

Agenda da Semana

Posicao de Fundos

Estrategias Recomendadas para Produtores Rurais

Demais Numeros da Soja

Demais Numeros do Milho`;

const DEFAULT_LAYOUT_GUIDE = [
  "Principais Acontecimentos da Semana: bullet points",
  "Performance das Commodities: bullet points",
  "Macroeconomia, Dolar, Soja, Milho, Insumos e Clima: texto corrido",
  "Agenda da Semana, Posicao de Fundos e Estrategias: bullet points",
  "Se faltar assunto para algum item: usar 'sem noticias relevantes'",
];

const createSource = (index, overrides = {}) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  title: `Fonte ${index + 1}`,
  url: "",
  content: "",
  ...overrides,
});

const buildDefaultSources = () => [
  createSource(0, {
    title: "Noticias Agricolas",
    url: "https://www.noticiasagricolas.com.br/noticias/",
    content: "",
  }),
  createSource(1, {
    title: "InfoMoney Economia",
    url: "https://www.infomoney.com.br/economia/",
    content: "",
  }),
];

const buildDefaultState = () => ({
  objective: DEFAULT_OBJECTIVE,
  outline: DEFAULT_OUTLINE,
  sources: buildDefaultSources(),
  summary: "",
  useSourceSearch: true,
});

const loadInitialState = () => {
  if (typeof window === "undefined") {
    return buildDefaultState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return buildDefaultState();
    }
    const parsed = JSON.parse(raw);
    return {
      objective: typeof parsed?.objective === "string" ? parsed.objective : DEFAULT_OBJECTIVE,
      outline: typeof parsed?.outline === "string" ? parsed.outline : DEFAULT_OUTLINE,
      sources:
        Array.isArray(parsed?.sources) && parsed.sources.length
          ? parsed.sources.map((item, index) => ({
              id: item?.id || createSource(index).id,
              title: item?.title || `Fonte ${index + 1}`,
              url: item?.url || "",
              content: item?.content || "",
            }))
          : buildDefaultSources(),
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      useSourceSearch: parsed?.useSourceSearch !== false,
    };
  } catch {
    return buildDefaultState();
  }
};

export function MarketSummaryPage() {
  const initialState = useMemo(() => loadInitialState(), []);
  const [objective, setObjective] = useState(initialState.objective);
  const [outline, setOutline] = useState(initialState.outline);
  const [sources, setSources] = useState(initialState.sources);
  const [summary, setSummary] = useState(initialState.summary);
  const [useSourceSearch, setUseSourceSearch] = useState(initialState.useSourceSearch);
  const [warnings, setWarnings] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        objective,
        outline,
        sources,
        summary,
        useSourceSearch,
      }),
    );
  }, [objective, outline, sources, summary, useSourceSearch]);

  const filledSourcesCount = useMemo(
    () => sources.filter((item) => String(item?.url || item?.content || "").trim()).length,
    [sources],
  );

  const updateSource = (id, field, value) => {
    setSources((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addSource = () => {
    setSources((current) => [...current, createSource(current.length)]);
  };

  const removeSource = (id) => {
    setSources((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  };

  const resetWorkspace = () => {
    const defaults = buildDefaultState();
    setObjective(defaults.objective);
    setOutline(defaults.outline);
    setSources(defaults.sources);
    setSummary("");
    setUseSourceSearch(defaults.useSourceSearch);
    setWarnings([]);
    setNotice("");
    setError("");
    setModel("");
  };

  const copySummary = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setNotice("Resumo copiado para a area de transferencia.");
      setError("");
    } catch {
      setError("Nao foi possivel copiar o resumo automaticamente.");
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    setWarnings([]);

    try {
      const { data } = await api.post("/market-summary/generate/", {
        objective,
        outline,
        use_source_search: useSourceSearch,
        sources: sources.map(({ id, ...item }) => item),
      });
      setSummary(data?.summary || "");
      setWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
      setModel(data?.model || "");
      setNotice("Resumo semanal gerado com sucesso.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel gerar o resumo agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="resource-page dashboard-page market-summary-page">
      <PageHeader
        title="Criar Resumo Semanal de Mercado - 2"
        description="Fluxo com fontes padrao, busca automatica opcional e consolidacao por IA para montar o resumo semanal."
        tag={model ? `IA ${model}` : "Ferramentas"}
      />

      <section className="panel market-summary-hero">
        <div>
          <strong>Fluxo sugerido</strong>
          <p className="muted">
            Revise as fontes padrao abaixo, escolha se a IA deve buscar noticias recentes nesses sites e gere um resumo
            semanal consolidado. Quando um item da estrutura nao tiver material suficiente, o resultado deve trazer
            &quot;sem noticias relevantes&quot;.
          </p>
        </div>
        <div className="market-summary-hero-stats">
          <span>{filledSourcesCount} fonte(s) configurada(s)</span>
          <span>{useSourceSearch ? "Busca automatica ligada" : "Busca automatica desligada"}</span>
          <span>{summary ? "Resumo pronto" : "Sem resumo gerado"}</span>
        </div>
      </section>

      <section className="market-summary-grid">
        <div className="market-summary-column">
          <section className="panel market-summary-panel">
            <div className="market-summary-panel-header">
              <div>
                <h3>Configuracao</h3>
                <p className="muted">Defina o objetivo e ajuste a sequencia base do relatorio semanal.</p>
              </div>
            </div>

            <div className="market-summary-form-grid">
              <label className="form-field">
                <span>Objetivo do resumo</span>
                <textarea
                  className="form-control form-control-textarea"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Estrutura sugerida</span>
                <textarea
                  className="form-control market-summary-outline"
                  value={outline}
                  onChange={(event) => setOutline(event.target.value)}
                />
              </label>
            </div>

            <div className="market-summary-layout-guide">
              <strong>Formato esperado</strong>
              <div className="market-summary-chip-list">
                {DEFAULT_LAYOUT_GUIDE.map((item) => (
                  <span className="market-summary-chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="panel market-summary-panel">
            <div className="market-summary-panel-header">
              <div>
                <h3>Fontes</h3>
                <p className="muted">
                  Mostre as fontes que deseja usar e marque a opcao abaixo se a IA deve abrir esses sites e consolidar
                  as noticias mais recentes automaticamente.
                </p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={addSource}>
                Adicionar fonte
              </button>
            </div>

            <label className="market-summary-toggle">
              <input
                type="checkbox"
                checked={useSourceSearch}
                onChange={(event) => setUseSourceSearch(event.target.checked)}
              />
              <span>Permitir que a IA busque noticias recentes nas fontes com URL</span>
            </label>

            <div className="market-summary-table-wrap">
              <table className="market-summary-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fonte</th>
                    <th>Link</th>
                    <th>Observacoes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source, index) => (
                    <tr key={source.id}>
                      <td className="market-summary-table-index">{index + 1}</td>
                      <td>
                        <input
                          className="form-control"
                          value={source.title}
                          onChange={(event) => updateSource(source.id, "title", event.target.value)}
                        />
                      </td>
                      <td>
                        <div className="market-summary-table-link-cell">
                          <input
                            className="form-control"
                            placeholder="https://..."
                            value={source.url}
                            onChange={(event) => updateSource(source.id, "url", event.target.value)}
                          />
                          <a
                            className="market-summary-source-link"
                            href={source.url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            aria-disabled={!source.url}
                          >
                            abrir
                          </a>
                        </div>
                      </td>
                      <td>
                        <textarea
                          className="form-control market-summary-source-textarea compact"
                          placeholder="Opcional"
                          value={source.content}
                          onChange={(event) => updateSource(source.id, "content", event.target.value)}
                        />
                      </td>
                      <td className="market-summary-table-actions">
                        <button
                          type="button"
                          className="market-summary-link-button"
                          onClick={() => removeSource(source.id)}
                          disabled={sources.length === 1}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="market-summary-actions">
              <button type="button" className="btn btn-secondary" onClick={resetWorkspace} disabled={loading}>
                Restaurar padrao
              </button>
              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                {loading ? "Gerando resumo..." : "Gerar resumo semanal"}
              </button>
            </div>
          </section>
        </div>

        <div className="market-summary-column">
          <section className="panel market-summary-panel market-summary-output-panel">
            <div className="market-summary-panel-header">
              <div>
                <h3>Resultado</h3>
                <p className="muted">Saida em Markdown para revisar, copiar e reaproveitar.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={copySummary} disabled={!summary}>
                Copiar resumo
              </button>
            </div>

            {error ? <div className="copy-base-error">{error}</div> : null}
            {notice ? <div className="copy-base-notice">{notice}</div> : null}
            {warnings.length ? (
              <div className="market-summary-warning-list">
                {warnings.map((item) => (
                  <div className="market-summary-warning" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            ) : null}

            <textarea
              className="form-control market-summary-result-textarea"
              value={summary}
              readOnly
              placeholder="O resumo gerado aparecera aqui."
            />

            <div className="market-summary-preview">
              <h4>Preview rapido</h4>
              <pre>{summary || "Nenhum resumo gerado ainda."}</pre>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
