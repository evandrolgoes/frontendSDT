import { useEffect, useMemo, useState } from "react";

import { resourceService } from "../services/resourceService";

export function MissingFieldsIgnoredConfigPanel() {
  const [configPayload, setConfigPayload] = useState({ resources: [], ignored_fields: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [selectedFieldName, setSelectedFieldName] = useState("");

  const loadConfig = async ({ force = false } = {}) => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const nextPayload = await resourceService.getMissingFieldsIgnoredConfig({ force });
      setConfigPayload(nextPayload || { resources: [], ignored_fields: [] });
    } catch (requestError) {
      setConfigError(requestError.response?.data?.detail || "Nao foi possivel carregar a configuracao de campos ignorados.");
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const resourceOptions = useMemo(() => (Array.isArray(configPayload?.resources) ? configPayload.resources : []), [configPayload?.resources]);

  const selectedResourceOption = useMemo(
    () => resourceOptions.find((item) => item.resource === selectedResource) || null,
    [resourceOptions, selectedResource],
  );

  useEffect(() => {
    if (!resourceOptions.length) {
      setSelectedResource("");
      return;
    }
    if (!resourceOptions.some((item) => item.resource === selectedResource)) {
      setSelectedResource(resourceOptions[0].resource);
    }
  }, [resourceOptions, selectedResource]);

  const fieldOptions = useMemo(() => {
    if (!selectedResourceOption || !Array.isArray(selectedResourceOption.fields)) {
      return [];
    }
    return selectedResourceOption.fields;
  }, [selectedResourceOption]);

  useEffect(() => {
    if (!selectedResourceOption) {
      setSelectedFieldName("");
      return;
    }

    const fieldStillExists = fieldOptions.some((item) => item.name === selectedFieldName);
    if (!fieldStillExists) {
      const firstAvailableField = fieldOptions.find((item) => !item.ignored) || fieldOptions[0] || null;
      setSelectedFieldName(firstAvailableField?.name || "");
    }
  }, [fieldOptions, selectedFieldName, selectedResourceOption]);

  const handleSaveIgnoredField = async () => {
    if (!selectedResource || !selectedFieldName) {
      return;
    }

    setConfigLoading(true);
    setConfigError("");
    try {
      const nextConfig = await resourceService.saveMissingFieldsIgnoredConfig({
        resource: selectedResource,
        field_name: selectedFieldName,
      });
      setConfigPayload(nextConfig || { resources: [], ignored_fields: [] });
    } catch (requestError) {
      setConfigError(requestError.response?.data?.detail || "Nao foi possivel salvar a configuracao.");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleRemoveIgnoredField = async (resource, fieldName) => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const nextConfig = await resourceService.removeMissingFieldsIgnoredConfig({
        resource,
        field_name: fieldName,
      });
      setConfigPayload(nextConfig || { resources: [], ignored_fields: [] });
    } catch (requestError) {
      setConfigError(requestError.response?.data?.detail || "Nao foi possivel remover a configuracao.");
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <section className="panel missing-fields-config-panel">
      <div className="config-item-header">
        <div>
          <strong>Pendencias cadastrais</strong>
          <p>Escolha uma tabela e um campo para nao considerar esse item na exibicao das pendencias cadastrais.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadConfig({ force: true })} disabled={configLoading}>
          {configLoading ? "Atualizando..." : "Atualizar configuracao"}
        </button>
      </div>

      <div className="missing-fields-config-form">
        <label className="field">
          <span>App / tabela</span>
          <select className="form-control" value={selectedResource} onChange={(event) => setSelectedResource(event.target.value)}>
            <option value="">Selecione uma tabela</option>
            {resourceOptions.map((item) => (
              <option key={item.resource} value={item.resource}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Campo para ignorar</span>
          <select
            className="form-control"
            value={selectedFieldName}
            onChange={(event) => setSelectedFieldName(event.target.value)}
            disabled={!selectedResourceOption}
          >
            <option value="">{selectedResourceOption ? "Selecione um campo" : "Escolha a tabela primeiro"}</option>
            {fieldOptions.map((item) => (
              <option key={`${selectedResourceOption?.resource || "resource"}-${item.name}`} value={item.name} disabled={item.ignored}>
                {item.label}
                {item.ignored ? " (ja ignorado)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="missing-fields-config-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSaveIgnoredField()}
            disabled={!selectedResource || !selectedFieldName || configLoading}
          >
            Adicionar ignorado
          </button>
        </div>
      </div>

      {configError ? <div className="form-error">{configError}</div> : null}

      <div className="missing-fields-config-list">
        {configPayload?.ignored_fields?.length ? (
          configPayload.ignored_fields.map((item) => (
            <div className="missing-fields-config-chip" key={`${item.resource}-${item.field_name}`}>
              <div>
                <strong>{item.resource_label}</strong>
                <span>{item.field_label}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleRemoveIgnoredField(item.resource, item.field_name)}
                disabled={configLoading}
              >
                Remover
              </button>
            </div>
          ))
        ) : (
          <div className="missing-fields-config-empty">Nenhum campo ignorado configurado.</div>
        )}
      </div>
    </section>
  );
}
