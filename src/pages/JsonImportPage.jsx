import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../services/api";

export function JsonImportPage() {
  const mappingSectionRef = useRef(null);
  const [rawJson, setRawJson] = useState("");
  const [databaseTarget, setDatabaseTarget] = useState("");
  const [databaseTargets, setDatabaseTargets] = useState([]);
  const [destination, setDestination] = useState("derivatives");
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [targetFields, setTargetFields] = useState([]);
  const [sourceFields, setSourceFields] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [rowsFound, setRowsFound] = useState(0);
  const [mapping, setMapping] = useState({});
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [urlReturnedEmpty, setUrlReturnedEmpty] = useState(false);
  const [result, setResult] = useState(null);

  const mappedCount = useMemo(
    () => Object.values(mapping).filter((value) => value && value !== "ignore").length,
    [mapping],
  );

  useEffect(() => {
    if (!sourceFields.length || !mappingSectionRef.current) {
      return;
    }
    mappingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sourceFields]);

  useEffect(() => {
    let active = true;

    const loadTargets = async () => {
      setLoadingMetadata(true);
      try {
        const { data } = await api.get("/import-tools/bubble/targets/");
        if (!active) {
          return;
        }
        const nextDatabaseTargets = data.databaseTargets || [];
        const nextDestinationOptions = data.destinationOptions || [];
        setDatabaseTargets(nextDatabaseTargets);
        setDestinationOptions(nextDestinationOptions);

        if (nextDatabaseTargets.length && !nextDatabaseTargets.some((item) => item.value === databaseTarget)) {
          setDatabaseTarget(nextDatabaseTargets[0].value);
        }
        if (nextDestinationOptions.length && !nextDestinationOptions.some((item) => item.value === destination)) {
          setDestination(nextDestinationOptions[0].value);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.detail || "Nao foi possivel carregar os destinos disponiveis.");
        }
      } finally {
        if (active) {
          setLoadingMetadata(false);
        }
      }
    };

    loadTargets();
    return () => {
      active = false;
    };
  }, []);

  const resetInspection = () => {
    setTargetFields([]);
    setSourceFields([]);
    setSampleRows([]);
    setRowsFound(0);
    setMapping({});
    setResult(null);
    setUrlReturnedEmpty(false);
  };

  const handleInspect = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    setResult(null);

    try {
      const { data } = await api.post("/import-tools/bubble/inspect/", {
        rawJson,
        destination,
      });
      const nextMapping = {};
      (data.sourceFields || []).forEach((field) => {
        nextMapping[field.sourceField] = field.suggestedTargetField || "ignore";
      });

      setDatabaseTargets(data.databaseTargets || []);
      setDestinationOptions(data.destinationOptions || []);
      setTargetFields(data.targetFields || []);
      setSourceFields(data.sourceFields || []);
      setSampleRows(data.sampleRows || []);
      setRowsFound(data.rowsFound || 0);
      setMapping(nextMapping);
      setUrlReturnedEmpty(Boolean(data.urlReturnedEmpty));
      if (data.rowsFound) {
        setNotice(`JSON reconhecido com sucesso. ${data.rowsFound || 0} registros encontrados.`);
      } else if (data.urlReturnedEmpty && rawJson.trim()) {
        setNotice("JSON reconhecido, mas sem registros para importar.");
      } else {
        setNotice("JSON reconhecido com sucesso. 0 registros encontrados.");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel inspecionar o JSON.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError("");
    setNotice("");
    setResult(null);

    try {
      const { data } = await api.post("/import-tools/bubble/derivatives/", {
        rawJson,
        databaseTarget,
        destination,
        mapping,
      });
      setResult(data);
      setNotice(`Importacao concluida na tabela ${destinationOptions.find((item) => item.value === destination)?.label || destination}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel importar os dados.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="json-import-page">
      <div className="page-header">
        <div>
          <h2>Importador JSON</h2>
          <p>Cole o JSON bruto do Bubble, escolha a tabela de destino e revise o mapeamento dos campos antes de importar.</p>
        </div>
      </div>

      <section className="json-import-card json-import-card-primary">
        <div className="json-import-grid">
          <label className="form-field">
            <span>Banco de destino</span>
            <select
              className="form-control"
              value={databaseTarget}
              onChange={(event) => setDatabaseTarget(event.target.value)}
              disabled={loadingMetadata}
            >
              {databaseTargets.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Tabela de destino</span>
            <select
              className="form-control"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                resetInspection();
                setNotice("");
                setError("");
              }}
              disabled={loadingMetadata}
            >
              {destinationOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-field json-import-raw-field">
          <span>JSON bruto</span>
          <textarea
            className="json-import-textarea form-control"
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            rows={18}
            wrap="off"
            spellCheck={false}
            placeholder='Cole aqui o JSON completo do Bubble, por exemplo: {"response":{"cursor":0,"results":[...]}}'
          />
        </label>

        <div className="json-import-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleInspect}
            disabled={loading || loadingMetadata || !rawJson.trim() || !destination}
          >
            {loading ? "Lendo JSON..." : "Reconhecer Campos"}
          </button>
          <div className="json-import-stats">
            <span>{rowsFound ? `${rowsFound} registros encontrados` : "Nenhum JSON analisado ainda"}</span>
            <span>{mappedCount} campos mapeados</span>
          </div>
        </div>

        {error ? <div className="json-import-error">{error}</div> : null}
        {notice ? <div className="json-import-notice">{notice}</div> : null}
        {urlReturnedEmpty ? (
          <div className="json-import-warning-list">
            <div>O JSON foi lido corretamente, mas nao trouxe registros para importar.</div>
          </div>
        ) : null}
      </section>

      {sourceFields.length ? (
        <section className="json-import-card" ref={mappingSectionRef}>
          <div className="json-import-section-head">
            <div>
              <h3>Mapeamento dos campos</h3>
              <p>Escolha para qual campo do sistema cada valor da API original deve ser enviado.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>

          <div className="json-import-mapping-table">
            <div className="json-import-mapping-header">
              <span>Campo da API original</span>
              <span>Exemplo</span>
              <span>Campo do sistema</span>
            </div>

            {sourceFields.map((field) => (
              <div className="json-import-mapping-row" key={field.sourceField}>
                <strong>{field.sourceField}</strong>
                <code>{Array.isArray(field.sampleValue) ? JSON.stringify(field.sampleValue) : String(field.sampleValue ?? "")}</code>
                <select
                  className="form-control"
                  value={mapping[field.sourceField] || "ignore"}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.sourceField]: event.target.value,
                    }))
                  }
                >
                  {targetFields.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sampleRows.length ? (
        <section className="json-import-card">
          <div className="json-import-section-head">
            <div>
              <h3>Amostra da API</h3>
              <p>Prévia dos primeiros registros lidos para validar rapidamente o JSON colado.</p>
            </div>
          </div>
          <pre className="json-import-preview">{JSON.stringify(sampleRows, null, 2)}</pre>
        </section>
      ) : null}

      {result ? (
        <section className="json-import-card">
          <div className="json-import-section-head">
            <div>
              <h3>Resultado da importação</h3>
              <p>Resumo do que foi criado e do que ainda precisa de ajuste fino.</p>
            </div>
          </div>

          <div className="json-import-result-grid">
            <div>
              <strong>{result.created}</strong>
              <span>criados</span>
            </div>
            <div>
              <strong>{result.skipped}</strong>
              <span>ignorados</span>
            </div>
            <div>
              <strong>{result.rowsProcessed}</strong>
              <span>processados</span>
            </div>
          </div>

          {result.warnings?.length ? (
            <div className="json-import-warning-list">
              {result.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
