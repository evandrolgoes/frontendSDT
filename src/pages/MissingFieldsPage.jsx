import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { buildResourceEditPath } from "../routes/routes";
import { resourceService } from "../services/resourceService";

const normalizeSearch = (value) => String(value || "").trim().toLowerCase();

const matchesSearch = (row, search) => {
  if (!search) {
    return true;
  }

  const haystack = [
    row?.grupo_label,
    row?.subgrupo_label,
    row?.resource_label,
    row?.record_label,
    ...(Array.isArray(row?.missing_fields) ? row.missing_fields : []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
};

function SummaryCard({ label, value }) {
  return (
    <article className="missing-fields-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function MissingFieldsPage() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState({ summary: { rows: 0, resources: 0, records_with_missing_fields: 0 }, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadReport = async ({ force = false } = {}) => {
    setLoading(true);
    setError("");
    try {
      const nextPayload = await resourceService.getMissingFieldsReport({}, { force });
      setPayload(nextPayload || { summary: { rows: 0, resources: 0, records_with_missing_fields: 0 }, rows: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel carregar as pendencias cadastrais.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  const normalizedSearch = useMemo(() => normalizeSearch(search), [search]);

  const filteredRows = useMemo(
    () => (Array.isArray(payload?.rows) ? payload.rows : []).filter((row) => matchesSearch(row, normalizedSearch)),
    [normalizedSearch, payload?.rows],
  );

  return (
    <div className="page-stack missing-fields-page">
      <PageHeader
        tag="Ferramentas"
        title="Pendencias Cadastrais"
        description="Mostra os registros com algum campo editavel vazio nas tabelas reconhecidas automaticamente pela API."
      />

      <section className="panel missing-fields-toolbar">
        <div className="missing-fields-toolbar-main">
          <label className="field">
            <span>Buscar</span>
            <input
              type="text"
              className="form-control"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Grupo, subgrupo, tabela ou campo faltante"
            />
          </label>
        </div>
        <div className="missing-fields-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setSearch("")} disabled={!search}>
            Limpar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void loadReport({ force: true })} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </section>

      <section className="missing-fields-summary-grid">
        <SummaryCard label="Registros pendentes" value={payload?.summary?.records_with_missing_fields || 0} />
        <SummaryCard label="Linhas exibidas" value={filteredRows.length} />
        <SummaryCard label="Tabelas varridas" value={payload?.summary?.resources || 0} />
      </section>

      <section className="panel missing-fields-table-panel">
        {error ? <div className="form-error">{error}</div> : null}
        {!error && !loading && !filteredRows.length ? (
          <div className="missing-fields-empty-state">Nenhuma pendencia encontrada para os filtros atuais.</div>
        ) : null}
        {!error && (loading || filteredRows.length) ? (
          <div className="missing-fields-table-wrap">
            <table className="resource-table missing-fields-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Subgrupo</th>
                  <th>Tabela</th>
                  <th>Informacoes faltantes</th>
                  <th className="missing-fields-action-col">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="missing-fields-loading-cell">
                      Carregando pendencias...
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const editPath = buildResourceEditPath(row.resource, row.record_id);
                    return (
                      <tr key={`${row.resource}-${row.record_id}`}>
                        <td>{row.grupo_label || "Sem grupo"}</td>
                        <td>{row.subgrupo_label || "Sem subgrupo"}</td>
                        <td>
                          <div className="missing-fields-table-name">{row.resource_label}</div>
                          <div className="missing-fields-record-label">{row.record_label || `ID ${row.record_id}`}</div>
                        </td>
                        <td>
                          <div className="missing-fields-badge-list">
                            {(row.missing_fields || []).map((fieldName) => (
                              <span className="missing-fields-badge" key={`${row.resource}-${row.record_id}-${fieldName}`}>
                                {fieldName}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="missing-fields-action-cell">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => editPath && navigate(editPath)}
                            disabled={!editPath}
                            title={editPath ? "Abrir registro para editar" : "Rota de edicao indisponivel para este recurso"}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
