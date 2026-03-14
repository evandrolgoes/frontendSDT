export function DataTable({
  columns,
  rows,
  onEdit,
  onDelete,
  title,
  filters = [],
  filterValues = {},
  onFilterChange,
  pagination,
  onPageChange,
  actionLabel = "Novo registro",
}) {
  return (
    <section className="table-shell">
      <div className="table-toolbar">
        <div>
          <strong>{title}</strong>
          <div className="muted">Listagem integrada com a API REST</div>
        </div>
        <button className="btn btn-primary">{actionLabel}</button>
      </div>
      {filters.length ? (
        <div className="form-grid" style={{ paddingTop: 16, paddingBottom: 16 }}>
          {filters.map((filter) => (
            <div className="field" key={filter.name}>
              <label htmlFor={filter.name}>{filter.label}</label>
              <input
                id={filter.name}
                placeholder={filter.placeholder}
                value={filterValues[filter.name] || ""}
                onChange={(event) => onFilterChange?.(filter.name, event.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="muted">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>
                  ))}
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary" onClick={() => onEdit?.(row)}>
                        Editar
                      </button>
                      <button className="btn btn-secondary" onClick={() => onDelete?.(row)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span className="muted" style={{ marginRight: "auto" }}>
          {pagination?.count || 0} registros
        </span>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!pagination?.previous}
          onClick={() => onPageChange?.((pagination?.page || 1) - 1)}
        >
          Anterior
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!pagination?.next}
          onClick={() => onPageChange?.((pagination?.page || 1) + 1)}
        >
          Proxima
        </button>
      </div>
    </section>
  );
}
