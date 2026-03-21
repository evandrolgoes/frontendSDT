import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../services/api";

export function JsonImportPage() {
  const mappingSectionRef = useRef(null);
  const [url, setUrl] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [databaseTarget, setDatabaseTarget] = useState("local");
  const [destination, setDestination] = useState("derivatives");
  const [targetFields, setTargetFields] = useState([]);
  const [sourceFields, setSourceFields] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [rowsFound, setRowsFound] = useState(0);
  const [mapping, setMapping] = useState({});
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

  const handleInspect = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    setResult(null);

    try {
      const { data } = await api.post("/import-tools/bubble/inspect/", { url, rawJson });
      const nextMapping = {};
      (data.sourceFields || []).forEach((field) => {
        nextMapping[field.sourceField] = field.suggestedTargetField || "ignore";
      });

      setTargetFields(data.targetFields || []);
      setSourceFields(data.sourceFields || []);
      setSampleRows(data.sampleRows || []);
      setRowsFound(data.rowsFound || 0);
      setMapping(nextMapping);
      setUrlReturnedEmpty(Boolean(data.urlReturnedEmpty));
      if (data.rowsFound) {
        setNotice(`JSON reconhecido com sucesso. ${data.rowsFound || 0} registros encontrados.`);
      } else if (data.urlReturnedEmpty && url.trim()) {
        setNotice("A URL foi lida, mas retornou 0 registros para o backend. Cole o JSON bruto no campo abaixo para continuar.");
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
        url,
        rawJson,
        databaseTarget,
        destination,
        mapping,
      });
      setResult(data);
      setNotice("Importacao concluida no banco local.");
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
          <p>Fluxo provisório para testar importação do Bubble no banco local.</p>
        </div>
      </div>

      <section className="json-import-card">
        <div className="json-import-grid">
          <label className="form-field">
            <span>Link do JSON</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://sdtposition.com.br/version-test/api/1.1/obj/derivativos"
            />
          </label>

          <label className="form-field">
            <span>Banco de destino</span>
            <select value={databaseTarget} onChange={(event) => setDatabaseTarget(event.target.value)}>
              <option value="local">Banco local (teste)</option>
            </select>
          </label>

          <label className="form-field">
            <span>Tabela de destino</span>
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="derivatives">Derivativos</option>
            </select>
          </label>
        </div>

        <label className="form-field">
          <span>Ou cole o JSON bruto</span>
          <textarea
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            rows={10}
            placeholder='Cole aqui o JSON completo, por exemplo: {"response":{"results":[...]}}'
          />
        </label>

        <div className="json-import-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleInspect}
            disabled={loading || (!url.trim() && !rawJson.trim())}
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
            <div>A URL retornou vazia para o backend. Isso normalmente acontece por regra de privacidade ou autenticação do Bubble.</div>
            <div>Se no seu navegador os dados aparecem, cole o JSON bruto no campo acima e rode novamente.</div>
          </div>
        ) : null}
      </section>

      {sourceFields.length ? (
        <section className="json-import-card" ref={mappingSectionRef}>
          <div className="json-import-section-head">
            <div>
              <h3>Mapeamento automático</h3>
              <p>Revise os campos reconhecidos e ajuste o destino antes de importar.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? "Importando..." : "Importar no Banco Local"}
            </button>
          </div>

          <div className="json-import-mapping-table">
            <div className="json-import-mapping-header">
              <span>Campo do JSON</span>
              <span>Exemplo</span>
              <span>Campo no banco</span>
            </div>

            {sourceFields.map((field) => (
              <div className="json-import-mapping-row" key={field.sourceField}>
                <strong>{field.sourceField}</strong>
                <code>{Array.isArray(field.sampleValue) ? JSON.stringify(field.sampleValue) : String(field.sampleValue ?? "")}</code>
                <select
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
              <h3>Amostra do JSON</h3>
              <p>Prévia dos primeiros registros lidos para validar rapidamente o payload.</p>
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
              <p>Resumo do que foi criado, atualizado e do que ainda precisa de ajuste fino.</p>
            </div>
          </div>

          <div className="json-import-result-grid">
            <div>
              <strong>{result.created}</strong>
              <span>criados</span>
            </div>
            <div>
              <strong>{result.updated}</strong>
              <span>atualizados</span>
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
