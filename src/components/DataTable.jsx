import { useEffect, useMemo, useState } from "react";

import { formatBrazilianDate, isBrazilianDate, isIsoDate } from "../utils/date";

const DEFAULT_FILTER = { values: [], min: "", max: "" };
const isBrDate = (value) => isBrazilianDate(value);

const normalizeLocalizedNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) {
    return null;
  }

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = raw.replace(/,/g, ".");
  } else if (hasDot) {
    const parts = raw.split(".");
    if (parts.length === 2) {
      normalized = raw;
    } else {
      normalized = raw.replace(/\./g, "");
    }
  }

  return normalized;
};

const parseLocalizedNumberStrict = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const normalized = normalizeLocalizedNumber(value);
  if (normalized === null) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const looksNumericString = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  return parseLocalizedNumberStrict(value) !== null;
};

const toNumberLoose = (value) => {
  const parsed = parseLocalizedNumberStrict(value);
  return parsed ?? 0;
};

const parseDate = (value) => {
  if (!value) {
    return Number.NaN;
  }
  if (typeof value !== "string") {
    return new Date(value).getTime();
  }
  if (isBrDate(value)) {
    const [day, month, year] = value.split("/");
    return new Date(`${year}-${month}-${day}`).getTime();
  }
  return new Date(value).getTime();
};

const getColumnType = (column, rows) => {
  if (column.type && column.type !== "relation" && column.type !== "multirelation") {
    return column.type;
  }

  for (const row of rows) {
    const value = row?.[column.key];
    if (value === null || value === undefined || value === "") {
      continue;
    }
    if (typeof value === "number") {
      return "number";
    }
    if (typeof value === "boolean") {
      return "boolean";
    }
    if (Array.isArray(value)) {
      return "multirelation";
    }
    if (typeof value === "string") {
      if (isIsoDate(value) || isBrDate(value)) {
        return "date";
      }
      if (looksNumericString(value)) {
        return "number";
      }
    }
  }

  if (column.type === "relation") {
    return "string";
  }

  return "string";
};

const parseValue = (value, type) => {
  if (type === "number") {
    return toNumberLoose(value);
  }
  if (type === "date") {
    return parseDate(value);
  }
  if (type === "boolean") {
    return value ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value ?? "");
};

const formatNumber = (value, fixed = 4) => {
  const normalized = toNumberLoose(value);
  return normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
};

const formatDate = (value) => formatBrazilianDate(value, "—");

const detectWeightKey = (columns) => {
  const keys = columns.map((column) => column.key);
  return ["volume_fisico", "volume", "producao_total", "area"].find((key) => keys.includes(key)) || null;
};

const shouldUseWeightedAverage = (key) => {
  const normalized = key.toLowerCase();
  return normalized.includes("strike") || normalized.includes("preco") || normalized.includes("preço");
};

const shouldUseSum = (key) => {
  const normalized = key.toLowerCase();
  return [
    "volume",
    "valor",
    "faturamento",
    "ajuste",
    "mtm",
    "producao",
    "produção",
    "area",
    "área",
    "custo",
  ].some((token) => normalized.includes(token));
};

const getUniqueValues = (rows, key) =>
  [...new Set(rows.map((row) => (Array.isArray(row[key]) ? row[key].join(", ") : String(row[key] ?? ""))))].sort((left, right) =>
    left.localeCompare(right, "pt-BR"),
  );

const formatCellValue = (column, value, row) => {
  if (column.render) {
    return column.render(value, row);
  }

  const type = column.detectedType || column.type;
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (type === "date") {
    return formatDate(value);
  }
  if (type === "number") {
    return formatNumber(value);
  }
  if (type === "boolean") {
    return value ? "Sim" : "Nao";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  return String(value);
};

export function DataTable({
  title,
  rows,
  columns,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onCreate,
  onClear,
  onEdit,
  onDuplicate,
  onDelete,
  onRowClick,
  selectedId,
  getRowClassName,
}) {
  const canCreate = typeof onCreate === "function";
  const canEdit = typeof onEdit === "function";
  const canDuplicate = typeof onDuplicate === "function";
  const canDelete = typeof onDelete === "function";
  const canRowClick = typeof onRowClick === "function";
  const showActions = canEdit || canDuplicate || canDelete;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [columnFilters, setColumnFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [activePopover, setActivePopover] = useState(null);
  const [tempFilter, setTempFilter] = useState(DEFAULT_FILTER);
  const [actionRowId, setActionRowId] = useState(null);

  useEffect(() => {
  }, [searchValue, columnFilters]);

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(rows.map((row) => row.id));
      return new Set([...current].filter((id) => validIds.has(id)));
    });
  }, [rows]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setActionRowId(null);
        setActivePopover(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const preparedColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        detectedType: getColumnType(column, rows),
      })),
    [columns, rows],
  );

  const weightKey = useMemo(() => detectWeightKey(preparedColumns), [preparedColumns]);

  const filteredRows = useMemo(() => {
    const terms = searchValue.toLowerCase().trim().split(/\s+/).filter(Boolean);

    const nextRows = rows.filter((row) => {
      const globalMatch =
        terms.length === 0 ||
        terms.every((term) =>
          Object.values(row).some((value) => String(Array.isArray(value) ? value.join(", ") : value ?? "").toLowerCase().includes(term)),
        );

      if (!globalMatch) {
        return false;
      }

      return Object.entries(columnFilters).every(([key, config]) => {
        const column = preparedColumns.find((item) => item.key === key);
        if (!column) {
          return true;
        }
        const rawValue = Array.isArray(row[key]) ? row[key].join(", ") : row[key];
        const type = column.detectedType;

        if (type === "number" || type === "date") {
          const current = parseValue(rawValue, type);
          const min = config.min !== "" ? parseValue(config.min, type) : -Infinity;
          const max = config.max !== "" ? parseValue(config.max, type) : Infinity;
          return current >= min && current <= max;
        }

        if (!config.values?.length) {
          return true;
        }
        return config.values.includes(String(rawValue ?? ""));
      });
    });

    if (!sortConfig.key) {
      return nextRows;
    }

    const sortColumn = preparedColumns.find((column) => column.key === sortConfig.key);
    const sortType = sortColumn?.detectedType || "string";

    return [...nextRows].sort((left, right) => {
      const leftValue = parseValue(left[sortConfig.key], sortType);
      const rightValue = parseValue(right[sortConfig.key], sortType);
      if (leftValue === rightValue) {
        return 0;
      }
      if (sortConfig.direction === "asc") {
        return leftValue > rightValue ? 1 : -1;
      }
      return leftValue < rightValue ? 1 : -1;
    });
  }, [columnFilters, preparedColumns, rows, searchValue, sortConfig]);

  const gridTemplateColumns = useMemo(
    () => `${showActions ? "42px " : ""}repeat(${preparedColumns.length}, 160px)`,
    [preparedColumns.length, showActions],
  );

  const footerStats = useMemo(() => {
    const sourceRows = selectedIds.size ? filteredRows.filter((row) => selectedIds.has(row.id)) : filteredRows;
    const weightTotal = weightKey ? sourceRows.reduce((acc, row) => acc + toNumberLoose(row[weightKey]), 0) : 0;

    return preparedColumns.reduce(
      (acc, column) => {
        if (column.detectedType !== "number") {
          return acc;
        }

        if (weightKey && shouldUseWeightedAverage(column.key)) {
          const weightedValue = sourceRows.reduce((sum, row) => sum + toNumberLoose(row[column.key]) * toNumberLoose(row[weightKey]), 0);
          acc[column.key] = { type: "Media", value: weightTotal ? weightedValue / weightTotal : 0 };
          return acc;
        }

        if (shouldUseSum(column.key)) {
          acc[column.key] = {
            type: "Soma",
            value: sourceRows.reduce((sum, row) => sum + toNumberLoose(row[column.key]), 0),
          };
        }
        return acc;
      },
      {},
    );
  }, [filteredRows, preparedColumns, selectedIds, weightKey]);

  const toggleSelection = (rowId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleRowClick = (row) => {
    if (canRowClick) {
      onRowClick(row);
      return;
    }
    toggleSelection(row.id);
  };

  return (
    <section className="bubble-table-shell">
      <div className="bubble-toolbar">
        <div className="bubble-toolbar-left">
          {canCreate ? (
            <button className="bubble-btn bubble-btn-primary" type="button" onClick={onCreate}>
              Novo
            </button>
          ) : null}
          <button className="bubble-btn bubble-btn-light" type="button">
            {title}
          </button>
          <button
            className="bubble-btn bubble-btn-danger"
            type="button"
            onClick={() => {
              setColumnFilters({});
              setSelectedIds(new Set());
              onClear();
            }}
          >
            Limpar
          </button>
        </div>
        <div className="bubble-toolbar-right">
          <div className="bubble-search-wrap">
            <input
              className="bubble-search"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bubble-table-wrapper custom-scrollbar">
        <div className="bubble-table-plane">
          <div className="bubble-grid-header" style={{ gridTemplateColumns }}>
            {showActions ? <div className="bubble-action-spacer" /> : null}
            {preparedColumns.map((column) => (
              <div className="bubble-grid-cell bubble-grid-head" key={column.key}>
                <button
                  type="button"
                  className="bubble-grid-sort"
                  onClick={() =>
                    setSortConfig((current) => ({
                      key: column.key,
                      direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  <span>{column.label}</span>
                  <span className="bubble-sort-icon">
                    {sortConfig.key === column.key ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
                <button
                  type="button"
                  className={`bubble-filter-btn${columnFilters[column.key] ? " active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const current = columnFilters[column.key] || DEFAULT_FILTER;
                    setTempFilter({ values: [...(current.values || [])], min: current.min || "", max: current.max || "" });
                    setActivePopover((openKey) => (openKey === column.key ? null : column.key));
                  }}
                >
                  F
                </button>
                {activePopover === column.key ? (
                  <div className="bubble-popover" onClick={(event) => event.stopPropagation()}>
                    <div className="bubble-popover-title">{column.label}</div>
                    {column.detectedType === "number" || column.detectedType === "date" ? (
                      <div className="bubble-filter-stack">
                        <input
                          type={column.detectedType === "number" ? "text" : "date"}
                          inputMode={column.detectedType === "number" ? "decimal" : undefined}
                          placeholder="Min..."
                          value={tempFilter.min}
                          onChange={(event) => setTempFilter((current) => ({ ...current, min: event.target.value }))}
                        />
                        <input
                          type={column.detectedType === "number" ? "text" : "date"}
                          inputMode={column.detectedType === "number" ? "decimal" : undefined}
                          placeholder="Max..."
                          value={tempFilter.max}
                          onChange={(event) => setTempFilter((current) => ({ ...current, max: event.target.value }))}
                        />
                      </div>
                    ) : (
                      <div className="bubble-filter-options custom-scrollbar">
                        {getUniqueValues(rows, column.key).map((value) => (
                          <label className="bubble-checkline" key={value}>
                            <input
                              type="checkbox"
                              checked={tempFilter.values.includes(value)}
                              onChange={(event) =>
                                setTempFilter((current) => ({
                                  ...current,
                                  values: event.target.checked
                                    ? [...current.values, value]
                                    : current.values.filter((item) => item !== value),
                                }))
                              }
                            />
                            <span>{value || "Vazio"}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="bubble-popover-actions">
                      <button
                        className="bubble-btn bubble-btn-light"
                        type="button"
                        onClick={() => {
                          setColumnFilters((current) => {
                            const next = { ...current };
                            delete next[column.key];
                            return next;
                          });
                          setActivePopover(null);
                        }}
                      >
                        Limpar
                      </button>
                      <button
                        className="bubble-btn bubble-btn-primary"
                        type="button"
                        onClick={() => {
                          setColumnFilters((current) => ({ ...current, [column.key]: { ...tempFilter } }));
                          setActivePopover(null);
                        }}
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="bubble-grid-body">
            {filteredRows.length ? (
              filteredRows.map((row, index) => (
                <div
                  className={`bubble-grid-row ${
                    selectedId === row.id || selectedIds.has(row.id)
                      ? "bubble-row-selected"
                      : index % 2 === 0
                        ? "bubble-row-base"
                        : "bubble-row-alt"
                  }${getRowClassName ? ` ${getRowClassName(row)}` : ""}`}
                key={row.id}
                onClick={() => handleRowClick(row)}
                style={{ gridTemplateColumns }}
              >
                  {showActions ? (
                    <div className="bubble-grid-cell bubble-action-col">
                      <button
                        className="bubble-mini-action"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActionRowId((current) => (current === row.id ? null : row.id));
                        }}
                      >
                        ⋮
                      </button>
                      {actionRowId === row.id ? (
                        <div className="bubble-popover bubble-row-popover" onClick={(event) => event.stopPropagation()}>
                          <div className="bubble-popover-title">Acoes</div>
                          {canEdit ? (
                            <button
                              className="bubble-popover-action"
                              type="button"
                              onClick={() => {
                                onEdit(row);
                                setActionRowId(null);
                              }}
                            >
                              Editar
                            </button>
                          ) : null}
                          {canDuplicate ? (
                            <button
                              className="bubble-popover-action"
                              type="button"
                              onClick={() => {
                                onDuplicate(row);
                                setActionRowId(null);
                              }}
                            >
                              Duplicar
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              className="bubble-popover-action bubble-popover-action-danger"
                              type="button"
                              onClick={() => {
                                onDelete(row);
                                setActionRowId(null);
                              }}
                            >
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {preparedColumns.map((column) => (
                    <div
                      className="bubble-grid-cell bubble-grid-value"
                      key={column.key}
                      title={typeof formatCellValue(column, row[column.key], row) === "string" ? formatCellValue(column, row[column.key], row) : undefined}
                    >
                      <span className="bubble-cell-text">{formatCellValue(column, row[column.key], row)}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="bubble-empty">Nenhum registro encontrado.</div>
            )}
          </div>

          <div className="bubble-footer">
            <div className="bubble-footer-grid" style={{ gridTemplateColumns }}>
              {showActions ? <div className="bubble-footer-spacer" /> : null}
              {preparedColumns.map((column, index) => {
                const stat = footerStats[column.key];
                const isFirstColumn = index === 0;

                if (!stat && !isFirstColumn) {
                  return <div className="bubble-footer-cell" key={column.key} />;
                }

                return (
                  <div className="bubble-footer-cell" key={column.key}>
                    {isFirstColumn ? (
                      <div className="bubble-footer-count">
                        <span>{selectedIds.size ? "Selecionados" : "Total de itens"}</span>
                        <strong>{selectedIds.size || filteredRows.length}</strong>
                      </div>
                    ) : null}
                    {stat ? (
                      <div className="bubble-footer-stat">
                        <span>{stat.type}</span>
                        <strong>{formatNumber(stat.value, 2)}</strong>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
