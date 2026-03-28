import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";

const ALL_RESOURCES_VALUE = "all";

export function CopyBasePage() {
  const [sourceDatabase, setSourceDatabase] = useState("");
  const [targetDatabase, setTargetDatabase] = useState("");
  const [selectedResources, setSelectedResources] = useState([]);
  const [databaseOptions, setDatabaseOptions] = useState([]);
  const [resourceOptions, setResourceOptions] = useState([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;

    const loadTargets = async () => {
      setLoadingMetadata(true);
      try {
        const { data } = await api.get("/copy-base/targets/");
        if (!active) return;
        const nextDatabases = data.databases || [];
        const nextResources = data.resources || [];
        setDatabaseOptions(nextDatabases);
        setResourceOptions(nextResources);
        if (nextDatabases.length) {
          setSourceDatabase((current) => current || nextDatabases[0].value);
          setTargetDatabase((current) => current || nextDatabases[1]?.value || nextDatabases[0].value);
        }
        if (nextResources.length) {
          setSelectedResources((current) => (current.length ? current : [ALL_RESOURCES_VALUE]));
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.detail || "Nao foi possivel carregar os alvos do Copy Base.");
        }
      } finally {
        if (active) setLoadingMetadata(false);
      }
    };

    loadTargets();
    return () => {
      active = false;
    };
  }, []);

  const resetFeedback = () => {
    setPreview(null);
    setResult(null);
    setError("");
    setNotice("");
  };

  const resolvedResources = useMemo(() => {
    if (selectedResources.includes(ALL_RESOURCES_VALUE)) {
      return resourceOptions.map((item) => item.value);
    }
    return selectedResources;
  }, [resourceOptions, selectedResources]);

  const selectedCountLabel = useMemo(() => {
    if (selectedResources.includes(ALL_RESOURCES_VALUE)) {
      return `Todos (${resourceOptions.length})`;
    }
    return `${resolvedResources.length} selecionado(s)`;
  }, [resourceOptions.length, resolvedResources.length, selectedResources]);

  const hasInvalidDatabasePair = Boolean(sourceDatabase && targetDatabase && sourceDatabase === targetDatabase);

  const toggleResource = (value) => {
    resetFeedback();
    if (value === ALL_RESOURCES_VALUE) {
      setSelectedResources([ALL_RESOURCES_VALUE]);
      return;
    }

    setSelectedResources((current) => {
      const withoutAll = current.filter((item) => item !== ALL_RESOURCES_VALUE);
      const exists = withoutAll.includes(value);
      const next = exists ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
      return next.length ? next : [ALL_RESOURCES_VALUE];
    });
  };

  const buildPayload = () => ({
    sourceDatabase,
    targetDatabase,
    resources: selectedResources.includes(ALL_RESOURCES_VALUE) ? [ALL_RESOURCES_VALUE] : resolvedResources,
  });

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError("");
    setNotice("");
    setResult(null);
    try {
      const { data } = await api.post("/copy-base/preview/", buildPayload());
      setPreview(data);
      setNotice(`Preview pronto: ${data.matchCount || 0} registros encontrados em ${data.resourceCount || 0} recurso(s).`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel gerar o preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopy = async () => {
    setCopyLoading(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/copy-base/apply/", buildPayload());
      setResult(data);
      setNotice(`Copy Base concluido. ${data.copiedCount || 0} registros sincronizados para o banco de destino.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel copiar os registros.");
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <div className="copy-base-page">
      <div className="page-header">
        <div>
          <h2>Copy Base</h2>
          <p>Esta tela serve apenas para copiar dados entre o banco de origem e o banco de destino, incluindo o fluxo Render para local e local para desenvolvimento.</p>
        </div>
      </div>

      <section className="copy-base-card copy-base-card-primary">
        <div className="copy-base-transfer-grid">
          <div className="copy-base-transfer-panel">
            <div className="copy-base-panel-title">
              <h3>Origem</h3>
              <p>De onde os dados serao lidos.</p>
            </div>
            <label className="form-field">
              <span>Banco de origem</span>
              <select
                className="form-control"
                value={sourceDatabase}
                onChange={(event) => {
                  setSourceDatabase(event.target.value);
                  resetFeedback();
                }}
                disabled={loadingMetadata}
              >
                <option value="">Selecione</option>
                {databaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="copy-base-transfer-arrow" aria-hidden="true">
            <span>→</span>
          </div>

          <div className="copy-base-transfer-panel">
            <div className="copy-base-panel-title">
              <h3>Destino</h3>
              <p>Para onde os dados serao gravados.</p>
            </div>
            <label className="form-field">
              <span>Banco de destino</span>
              <select
                className="form-control"
                value={targetDatabase}
                onChange={(event) => {
                  setTargetDatabase(event.target.value);
                  resetFeedback();
                }}
                disabled={loadingMetadata}
              >
                <option value="">Selecione</option>
                {databaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="copy-base-section-head">
          <div>
            <h3>Recursos para copiar</h3>
            <p>Escolha em lista quais tabelas/recursos deseja copiar ou marque `Todos`.</p>
          </div>
          <div className="copy-base-stats">
            <span>{selectedCountLabel}</span>
          </div>
        </div>

        <div className="copy-base-resource-list">
          <label className="copy-base-resource-item">
            <input
              type="checkbox"
              checked={selectedResources.includes(ALL_RESOURCES_VALUE)}
              onChange={() => toggleResource(ALL_RESOURCES_VALUE)}
            />
            <span>Todos</span>
          </label>

          {resourceOptions.map((option) => (
            <label className="copy-base-resource-item" key={option.value}>
              <input
                type="checkbox"
                checked={selectedResources.includes(ALL_RESOURCES_VALUE) || selectedResources.includes(option.value)}
                onChange={() => toggleResource(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

        <div className="copy-base-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePreview}
            disabled={previewLoading || copyLoading || !sourceDatabase || !targetDatabase || !resolvedResources.length || hasInvalidDatabasePair}
          >
            {previewLoading ? "Montando preview..." : "Preview"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={copyLoading || previewLoading || !sourceDatabase || !targetDatabase || !resolvedResources.length || hasInvalidDatabasePair}
          >
            {copyLoading ? "Copiando..." : "Copiar agora"}
          </button>
          <div className="copy-base-stats">
            <span>{hasInvalidDatabasePair ? "Origem e destino precisam ser diferentes" : "Sem filtros adicionais"}</span>
          </div>
        </div>

        {error ? <div className="copy-base-error">{error}</div> : null}
        {notice ? <div className="copy-base-notice">{notice}</div> : null}
      </section>

      {preview ? (
        <section className="copy-base-card">
          <div className="copy-base-section-head">
            <div>
              <h3>Preview</h3>
              <p>Resumo do que sera lido da origem antes da copia.</p>
            </div>
          </div>

          <div className="copy-base-result-grid">
            <div>
              <strong>Banco de origem</strong>
              <span>{preview.sourceDatabaseLabel || preview.sourceDatabase}</span>
            </div>
            <div>
              <strong>Banco de destino</strong>
              <span>{preview.targetDatabaseLabel || preview.targetDatabase}</span>
            </div>
            <div>
              <strong>Recursos</strong>
              <span>{preview.resourceCount || 0}</span>
            </div>
            <div>
              <strong>Registros encontrados</strong>
              <span>{preview.matchCount || 0}</span>
            </div>
          </div>

          <div className="copy-base-warning-list">
            {(preview.resources || []).map((item) => (
              <div key={item.resource}>
                {item.resourceLabel || item.resource}: {item.matchCount || 0} registro(s)
              </div>
            ))}
          </div>

          <pre className="copy-base-preview">{JSON.stringify(preview.sampleRows || [], null, 2)}</pre>
        </section>
      ) : null}

      {result ? (
        <section className="copy-base-card">
          <div className="copy-base-section-head">
            <div>
              <h3>Resultado</h3>
              <p>Resumo da ultima copia executada.</p>
            </div>
          </div>

          <div className="copy-base-result-grid">
            <div>
              <strong>Banco de origem</strong>
              <span>{result.sourceDatabaseLabel || result.sourceDatabase}</span>
            </div>
            <div>
              <strong>Banco de destino</strong>
              <span>{result.targetDatabaseLabel || result.targetDatabase}</span>
            </div>
            <div>
              <strong>Copiados</strong>
              <span>{result.copiedCount || 0}</span>
            </div>
            <div>
              <strong>Criados</strong>
              <span>{result.createdCount || 0}</span>
            </div>
            <div>
              <strong>Atualizados</strong>
              <span>{result.updatedCount || 0}</span>
            </div>
          </div>

          <div className="copy-base-warning-list">
            {(result.resources || []).map((item) => (
              <div key={item.resource}>
                {item.resourceLabel || item.resource}: {item.copiedCount || 0} copiado(s), {item.createdCount || 0} criado(s), {item.updatedCount || 0} atualizado(s)
              </div>
            ))}
          </div>

          {result.sampleIds?.length ? (
            <div className="copy-base-warning-list">
              <div>IDs de amostra afetados: {result.sampleIds.join(", ")}</div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
