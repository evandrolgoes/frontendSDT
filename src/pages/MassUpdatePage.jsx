import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
const EMPTY_UPDATE = {
  field: "",
  matchCurrent: false,
  fromValue: "",
  toValue: "",
  clearTarget: false,
};

const EMPTY_FILTER = {
  field: "",
  value: "",
};

const parseFieldValue = (field, rawValue) => {
  if (rawValue === "" || rawValue === undefined) {
    return "";
  }
  if (field?.type === "boolean") {
    if (rawValue === true || rawValue === "true") {
      return true;
    }
    if (rawValue === false || rawValue === "false") {
      return false;
    }
  }
  if (field?.type === "number") {
    const normalized = String(rawValue).replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  return rawValue;
};

function ValueInput({ field, value, onChange, disabled = false, placeholder = "Selecione" }) {
  return (
    <input
      type="text"
      inputMode={field?.type === "number" ? "decimal" : undefined}
      className="mass-update-input"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}

function FilterValueInput({ field, value, onChange, disabled = false }) {
  return <ValueInput field={field} value={value} onChange={onChange} disabled={disabled} placeholder="Selecione" />;
}

export function MassUpdatePage() {
  const [resources, setResources] = useState([]);
  const [resource, setResource] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [filters, setFilters] = useState([{ ...EMPTY_FILTER }]);
  const [updates, setUpdates] = useState([{ ...EMPTY_UPDATE }]);
  const [search, setSearch] = useState("");
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const { data } = await api.get("/mass-update/resources/");
        if (!active) {
          return;
        }
        const nextResources = data.resources || [];
        setResources(nextResources);
        if (nextResources.length) {
          setResource(nextResources[0].value);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.detail || "Nao foi possivel carregar os recursos para alteracao em massa.");
        }
      } finally {
        if (active) {
          setLoadingResources(false);
        }
      }
    };

    loadResources();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!resource) {
      return;
    }

    let active = true;

    const loadMetadata = async () => {
      setLoadingMetadata(true);
      setError("");
      setNotice("");
      setPreview(null);
      setResult(null);
      try {
        const { data } = await api.get("/mass-update/metadata/", { params: { resource } });
        if (!active) {
          return;
        }
        setMetadata(data);
        setFilters([{ ...EMPTY_FILTER }]);
        setUpdates([{ ...EMPTY_UPDATE }]);
        setSearch("");
      } catch (requestError) {
        if (active) {
          setMetadata(null);
          setError(requestError.response?.data?.detail || "Nao foi possivel carregar os campos da base selecionada.");
        }
      } finally {
        if (active) {
          setLoadingMetadata(false);
        }
      }
    };

    loadMetadata();
    return () => {
      active = false;
    };
  }, [resource]);

  const fieldCatalog = useMemo(() => {
    const definition = resourceDefinitions[resource?.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] || null;
    const definitionFields = [...(definition?.fields || []), ...(definition?.editFields || []), ...(definition?.detailFields || [])];
    const mappedDefinitionFields = Object.fromEntries(definitionFields.map((field) => [field.name, field]));
    const mappedColumns = Object.fromEntries((definition?.columns || []).map((field) => [field.key, field]));

    const mergeFilterField = (field) => {
      const definitionField = mappedDefinitionFields[field.name] || mappedColumns[field.name] || {};
      return {
        ...field,
        ...definitionField,
        name: field.name,
        label: definitionField.label || field.label,
        type: definitionField.type || field.type,
        resource: definitionField.resource || field.relatedResource || field.resource,
        resources: definitionField.resources,
        options: definitionField.options || field.options,
        labelKey: definitionField.labelKey || field.labelKey,
        valueKey: definitionField.valueKey || field.valueKey,
      };
    };

    const mergeUpdateField = (field) => {
      const definitionField = mappedDefinitionFields[field.name] || mappedColumns[field.name] || {};
      return {
        ...field,
        ...definitionField,
        name: field.name,
        label: definitionField.label || field.label,
        type: definitionField.type || field.type,
        resource: definitionField.resource || field.relatedResource || field.resource,
        resources: definitionField.resources,
        options: definitionField.options || field.options,
        labelKey: definitionField.labelKey || field.labelKey,
        valueKey: definitionField.valueKey || field.valueKey,
      };
    };

    return {
      filters: (metadata?.filters || []).map(mergeFilterField),
      updateFields: (metadata?.updateFields || []).map(mergeUpdateField),
    };
  }, [metadata, resource]);

  const updateFieldOptions = fieldCatalog.updateFields || [];
  const filterFieldOptions = fieldCatalog.filters || [];

  const serializeFilters = () =>
    filters
      .filter((item) => item.field)
      .map((item) => {
        const field = filterFieldOptions.find((option) => option.name === item.field);
        return {
          field: item.field,
          value: parseFieldValue(field, item.value),
        };
      })
      .filter((item) => item.value !== "");

  const serializeUpdates = () =>
    updates
      .filter((item) => item.field)
      .map((item) => {
        const field = updateFieldOptions.find((option) => option.name === item.field);
        return {
          field: item.field,
          matchCurrent: Boolean(item.matchCurrent),
          fromValue: item.matchCurrent ? parseFieldValue(field, item.fromValue) : null,
          toValue: item.clearTarget ? null : parseFieldValue(field, item.toValue),
          clearTarget: Boolean(item.clearTarget),
        };
      });

  const handlePreview = async () => {
    setPreviewing(true);
    setError("");
    setNotice("");
    setResult(null);
    try {
      const { data } = await api.post("/mass-update/preview/", {
        resource,
        filters: serializeFilters(),
        updates: serializeUpdates(),
        search,
      });
      setPreview(data);
      setNotice(`Preview pronto. ${data.affectedCount || 0} registro(s) serao impactados.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel gerar o preview da alteracao em massa.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/mass-update/apply/", {
        resource,
        filters: serializeFilters(),
        updates: serializeUpdates(),
        search,
      });
      setResult(data);
      setPreview(null);
      setNotice(`Alteracao em massa concluida. ${data.updatedCount || 0} registro(s) atualizados.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel executar a alteracao em massa.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mass-update-page">
      <div className="page-header">
        <div>
          <h2>Alteracao em Massa</h2>
          <p>Selecione a base, aplique os filtros disponiveis e defina uma ou mais regras no formato campo, de e para.</p>
        </div>
      </div>

      <section className="mass-update-card">
        <div className="mass-update-grid">
          <label className="form-field">
            <span>Base de dados</span>
            <select value={resource} onChange={(event) => setResource(event.target.value)} disabled={loadingResources}>
              {resources.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {metadata?.searchEnabled ? (
            <label className="form-field">
              <span>Busca textual</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Opcional" />
            </label>
          ) : null}
        </div>
      </section>

      {metadata ? (
        <>
          <section className="mass-update-card">
            <div className="mass-update-section-head mass-update-section-head-filters">
              <div>
                <h3>Filtros</h3>
                <p>Adicione quantos filtros quiser, escolhendo o campo e o valor. Campos de texto aceitam busca parcial.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFilters((current) => [...current, { ...EMPTY_FILTER }])}
              >
                Adicionar filtro
              </button>
            </div>

            <div className="mass-update-filters">
              {filters.map((filter, index) => {
                const selectedField = filterFieldOptions.find((field) => field.name === filter.field) || null;

                return (
                  <div className="mass-update-filter-row" key={`filter-row-${index}`}>
                    <label className="form-field">
                      <span>Campo</span>
                      <select
                        value={filter.field}
                        onChange={(event) =>
                          setFilters((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...EMPTY_FILTER,
                                    field: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                        disabled={loadingMetadata}
                      >
                        <option value="">Selecione</option>
                        {filterFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field">
                      <span>Valor</span>
                      <FilterValueInput
                        field={selectedField}
                        value={filter.value}
                        onChange={(value) =>
                          setFilters((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    value,
                                  }
                                : item,
                            ),
                          )
                        }
                        disabled={!selectedField || loadingMetadata}
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary mass-update-remove"
                      onClick={() =>
                        setFilters((current) => (current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [{ ...EMPTY_FILTER }]))
                      }
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mass-update-card">
            <div className="mass-update-section-head mass-update-section-head-rules">
              <div>
                <h3>Alteracoes</h3>
                <p>Voce pode montar mais de uma regra de alteracao para executar tudo em um unico lote.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUpdates((current) => [...current, { ...EMPTY_UPDATE }])}
              >
                Adicionar campo
              </button>
            </div>

            <div className="mass-update-rules">
              {updates.map((update, index) => {
                const selectedField = updateFieldOptions.find((field) => field.name === update.field) || null;

                return (
                  <div className="mass-update-rule" key={`update-rule-${index}`}>
                    <label className="form-field">
                      <span>Campo</span>
                      <select
                        value={update.field}
                        onChange={(event) =>
                          setUpdates((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...EMPTY_UPDATE,
                                    field: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">Selecione</option>
                        {updateFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field mass-update-inline-check">
                      <span>Aplicar somente quando o valor atual for igual a</span>
                      <input
                        type="checkbox"
                        checked={update.matchCurrent}
                        onChange={(event) =>
                          setUpdates((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    matchCurrent: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>

                    <label className="form-field">
                      <span>De</span>
                      <ValueInput
                        field={selectedField}
                        value={update.fromValue}
                        onChange={(value) =>
                          setUpdates((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    fromValue: value,
                                  }
                                : item,
                            ),
                          )
                        }
                        disabled={!update.matchCurrent || !selectedField}
                        placeholder="Qualquer valor"
                      />
                    </label>

                    <label className="form-field mass-update-inline-check">
                      <span>Limpar o campo no destino</span>
                      <input
                        type="checkbox"
                        checked={update.clearTarget}
                        onChange={(event) =>
                          setUpdates((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    clearTarget: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                        disabled={!selectedField}
                      />
                    </label>

                    <label className="form-field">
                      <span>Para</span>
                      <ValueInput
                        field={selectedField}
                        value={update.toValue}
                        onChange={(value) =>
                          setUpdates((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    toValue: value,
                                  }
                                : item,
                            ),
                          )
                        }
                        disabled={!selectedField || update.clearTarget}
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary mass-update-remove"
                      onClick={() =>
                        setUpdates((current) => (current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [{ ...EMPTY_UPDATE }]))
                      }
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mass-update-actions">
              <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={previewing || loadingMetadata}>
                {previewing ? "Gerando preview..." : "Ver preview"}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleApply} disabled={applying || loadingMetadata}>
                {applying ? "Aplicando..." : "Executar alteracao"}
              </button>
            </div>

            {error ? <div className="mass-update-error">{error}</div> : null}
            {notice ? <div className="mass-update-notice">{notice}</div> : null}
          </section>
        </>
      ) : null}

      {preview ? (
        <section className="mass-update-card">
          <div className="mass-update-section-head">
            <div>
              <h3>Preview</h3>
              <p>Quantidade estimada de registros que serao alterados com os filtros e regras atuais.</p>
            </div>
          </div>
          <div className="mass-update-result-grid">
            <div>
              <strong>Registros afetados</strong>
              <span>{preview.affectedCount}</span>
            </div>
            <div>
              <strong>IDs de amostra</strong>
              <span>{preview.sampleIds?.length ? preview.sampleIds.join(", ") : "Nenhum"}</span>
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="mass-update-card">
          <div className="mass-update-section-head">
            <div>
              <h3>Resultado</h3>
              <p>Resumo da execucao da alteracao em massa.</p>
            </div>
          </div>
          <div className="mass-update-result-grid">
            <div>
              <strong>Registros atualizados</strong>
              <span>{result.updatedCount}</span>
            </div>
            <div>
              <strong>Primeiros IDs atualizados</strong>
              <span>{result.updatedIds?.length ? result.updatedIds.join(", ") : "Nenhum"}</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
