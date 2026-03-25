import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import { resourceService } from "../services/resourceService";
import { isBrazilianDate, parseBrazilianDate } from "../utils/date";

const DEFAULT_VISIBLE_ROWS = 200;
const ROW_COUNT_OPTIONS = [10, 50, 100, 150, 200];

const normalizeLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("/", "");

const normalizeDescriptionBase = (value) =>
  String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isSelectLikeField = (field) => ["select", "relation", "contract"].includes(field?.type);

const parseLocalizedNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) {
    return undefined;
  }

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = raw.replace(/,/g, ".");
  } else if (hasDot) {
    normalized = raw.split(".").length === 2 ? raw : raw.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeDateValue = (value) => {
  if (!String(value || "").trim()) {
    return "";
  }
  if (isBrazilianDate(value)) {
    return parseBrazilianDate(value, "");
  }
  return parseBrazilianDate(value, "") || "";
};

const getOptionLabel = (field, option) =>
  option?.[field.label_key || field.labelKey || "nome"] ||
  option?.nome ||
  option?.label ||
  option?.obs ||
  option?.subgrupo ||
  option?.grupo ||
  `#${option?.id ?? ""}`;

const generateRandomOperationCode = () => `DRV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const buildRowDefaults = (baseDefaults = {}) => ({
  ...baseDefaults,
  cod_operacao_mae: baseDefaults.cod_operacao_mae || "",
  status_operacao: baseDefaults.status_operacao || "",
});

const createEmptyRow = (fields, defaults = {}) => {
  const normalizedDefaults = buildRowDefaults(defaults);
  return fields.reduce(
    (acc, field) => ({
      ...acc,
      [field.name]: normalizedDefaults[field.name] ?? "",
    }),
    {},
  );
};

const createDefaultRows = (fields, defaults = {}, total = DEFAULT_VISIBLE_ROWS) =>
  Array.from({ length: total }, () => createEmptyRow(fields, defaults));

const resizeRows = (currentRows, fields, total, defaults = {}) => {
  const nextRows = currentRows.slice(0, total);
  while (nextRows.length < total) {
    nextRows.push(createEmptyRow(fields, defaults));
  }
  return nextRows;
};

const createDefaultRowMeta = (total = DEFAULT_VISIBLE_ROWS) =>
  Array.from({ length: total }, () => ({ touched: false, manualCode: false, autoCode: false }));

const resizeRowMeta = (currentMeta, total) => {
  const nextMeta = currentMeta.slice(0, total);
  while (nextMeta.length < total) {
    nextMeta.push({ touched: false, manualCode: false, autoCode: false });
  }
  return nextMeta;
};

const rowHasAnyUserValue = (row, fields, meta) =>
  fields.some((field) => {
    const value = String(row?.[field.name] || "").trim();
    if (!value) {
      return false;
    }
    if (field.name === "cod_operacao_mae" && meta?.autoCode && !meta?.manualCode) {
      return false;
    }
    return true;
  });

const getFieldOptions = (field, lookupOptions, tradingviewQuotes, row) => {
  if (field.type === "contract") {
    const normalizedBolsa = normalizeLookupValue(row?.bolsa_ref);
    return (tradingviewQuotes || [])
      .filter((item) => normalizeLookupValue(normalizeDescriptionBase(item?.description)) === normalizedBolsa)
      .map((item) => ({ value: item?.ticker || "", label: item?.ticker || "" }))
      .filter((option) => option.value)
      .filter((option, index, array) => array.findIndex((candidate) => candidate.value === option.value) === index);
  }

  if (Array.isArray(field.options)) {
    return field.options.map((option) => ({ value: String(option.value), label: option.label }));
  }

  if (!field.resource) {
    return [];
  }

  return (lookupOptions[field.resource] || []).map((option) => ({
    value: String(option[field.value_key || field.valueKey || "id"] ?? option.id ?? ""),
    label: getOptionLabel(field, option),
  }));
};

const findSelectValue = (field, rawValue, lookupOptions, tradingviewQuotes, row) => {
  const normalizedRawValue = normalizeLookupValue(rawValue);
  const options = getFieldOptions(field, lookupOptions, tradingviewQuotes, row);
  const directMatch = options.find((option) => normalizeLookupValue(option.value) === normalizedRawValue);
  if (directMatch) {
    return directMatch.value;
  }
  const labelMatch = options.find((option) => normalizeLookupValue(option.label) === normalizedRawValue);
  if (labelMatch) {
    return labelMatch.value;
  }
  return String(rawValue || "").trim();
};

const applyExchangeDefaults = (row, fields, lookupOptions) => {
  const exchangeField = fields.find((field) => field.name === "bolsa_ref");
  if (!exchangeField) {
    return row;
  }

  const exchanges = lookupOptions[exchangeField.resource] || [];
  const selectedExchange = exchanges.find((item) => String(item.nome || "") === String(row.bolsa_ref || ""));
  if (!selectedExchange) {
    return row;
  }

  const nextRow = { ...row };
  if ("moeda_ou_cmdtye" in nextRow) {
    nextRow.moeda_ou_cmdtye = nextRow.moeda_ou_cmdtye || selectedExchange.moeda_cmdtye || "";
  }
  if ("strike_moeda_unidade" in nextRow) {
    nextRow.strike_moeda_unidade = nextRow.strike_moeda_unidade || selectedExchange.moeda_unidade_padrao || "";
  }
  if ("volume_financeiro_moeda" in nextRow) {
    nextRow.volume_financeiro_moeda = nextRow.volume_financeiro_moeda || selectedExchange.moeda_bolsa || "";
  }
  if ("volume_fisico_unidade" in nextRow) {
    nextRow.volume_fisico_unidade = nextRow.volume_fisico_unidade || selectedExchange.unidade_bolsa || "";
  }
  return nextRow;
};

const formatCellDisplayValue = (field, row, lookupOptions, tradingviewQuotes) => {
  const value = row?.[field.name] || "";
  if (!value) {
    return "";
  }
  if (field.type === "date") {
    return normalizeDateValue(value);
  }
  if (!isSelectLikeField(field)) {
    return String(value);
  }
  const options = getFieldOptions(field, lookupOptions, tradingviewQuotes, row);
  return options.find((option) => String(option.value) === String(value))?.label || String(value);
};

const buildCellKey = (rowIndex, columnIndex) => `${rowIndex}:${columnIndex}`;

const generateUniqueOperationCode = (rows, currentRowIndex) => {
  const usedCodes = new Set(
    rows
      .filter((_, index) => index !== currentRowIndex)
      .map((row) => String(row?.cod_operacao_mae || "").trim())
      .filter(Boolean),
  );

  let nextCode = generateRandomOperationCode();
  while (usedCodes.has(nextCode)) {
    nextCode = generateRandomOperationCode();
  }
  return nextCode;
};

export function DerivativeBulkImportModal({ nextOperationCode = "DRV-001", onClose, onImported }) {
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [rowMeta, setRowMeta] = useState([]);
  const [lookupOptions, setLookupOptions] = useState({});
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);
  const [selectedCell, setSelectedCell] = useState({ rowIndex: 0, columnIndex: 0 });
  const [openDropdownCell, setOpenDropdownCell] = useState(null);
  const [fillDrag, setFillDrag] = useState(null);

  useEffect(() => {
    let active = true;

    const loadDependencies = async () => {
      setLoadingLookups(true);
      try {
        const { data } = await api.get("/derivative-operations/bulk-import-metadata/");
        const metadataFields = Array.isArray(data?.fields) ? data.fields : [];
        const lookupResources = [...new Set(metadataFields.map((field) => field.resource).filter(Boolean))];
        const [lookupEntries, quoteItems] = await Promise.all([
          Promise.all(lookupResources.map(async (resource) => [resource, await resourceService.listAll(resource)])),
          resourceService.listTradingviewQuotes({ force: true }),
        ]);

        if (!active) {
          return;
        }

        const defaultValues = buildRowDefaults();
        setFields(metadataFields);
        setLookupOptions(Object.fromEntries(lookupEntries));
        setTradingviewQuotes(Array.isArray(quoteItems) ? quoteItems : []);
        setRows(createDefaultRows(metadataFields, defaultValues, rowCount));
        setRowMeta(createDefaultRowMeta(rowCount));
        setSelectedCell({ rowIndex: 0, columnIndex: 0 });
      } catch {
        if (active) {
          setError("Nao foi possivel carregar os campos da importacao em massa.");
        }
      } finally {
        if (active) {
          setLoadingLookups(false);
        }
      }
    };

    loadDependencies();
    return () => {
      active = false;
    };
  }, [nextOperationCode, rowCount]);

  useEffect(() => {
    if (!fillDrag) {
      return undefined;
    }

    const handleMouseUp = () => {
      setRows((currentRows) => {
        if (!fillDrag?.targetRowIndex || fillDrag.targetRowIndex === fillDrag.sourceRowIndex) {
          return currentRows;
        }

        const field = fields[fillDrag.columnIndex];
        if (!field) {
          return currentRows;
        }

        const startRow = Math.min(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
        const endRow = Math.max(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
        const sourceValue = currentRows[fillDrag.sourceRowIndex]?.[field.name] || "";
        const nextRows = [...currentRows];

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
          if (rowIndex === fillDrag.sourceRowIndex) {
            continue;
          }
          let nextRow = { ...nextRows[rowIndex], [field.name]: sourceValue };
          if (isSelectLikeField(field)) {
            nextRow = applyExchangeDefaults(nextRow, fields, lookupOptions);
          }
          nextRows[rowIndex] = nextRow;
        }

        return nextRows;
      });
      setFillDrag(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [fields, fillDrag, lookupOptions]);

  const totalFilledRows = useMemo(
    () => rows.filter((row, index) => rowMeta[index]?.touched && rowHasAnyUserValue(row, fields, rowMeta[index])).length,
    [fields, rowMeta, rows],
  );

  const updateRow = (rowIndex, fieldName, value) => {
    setOpenDropdownCell(null);
    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        let nextRow = { ...row, [fieldName]: value };
        const nextMeta = rowMeta[rowIndex] || { touched: false, manualCode: false, autoCode: false };

        if (fieldName === "cod_operacao_mae") {
          nextRow = { ...nextRow, cod_operacao_mae: value };
        } else {
          const hasAnyMeaningfulValue = fields.some((field) => {
            if (field.name === "cod_operacao_mae") return false;
            return String(nextRow?.[field.name] || "").trim() !== "";
          });

          if (hasAnyMeaningfulValue && !String(nextRow.cod_operacao_mae || "").trim()) {
            nextRow = {
              ...nextRow,
              cod_operacao_mae: generateUniqueOperationCode(currentRows, rowIndex),
            };
          }
        }

        nextRow = applyExchangeDefaults(nextRow, fields, lookupOptions);
        if (fieldName === "bolsa_ref" && "contrato_derivativo" in nextRow && nextRow.contrato_derivativo) {
          const contractField = fields.find((field) => field.name === "contrato_derivativo");
          const contractOptions = contractField ? getFieldOptions(contractField, lookupOptions, tradingviewQuotes, nextRow) : [];
          const hasContract = contractOptions.some((option) => option.value === nextRow.contrato_derivativo);
          if (!hasContract) {
            nextRow = { ...nextRow, contrato_derivativo: "" };
          }
        }
        return nextRow;
      }),
    );

    setRowMeta((currentMeta) =>
      currentMeta.map((meta, index) => {
        if (index !== rowIndex) {
          return meta;
        }
        if (fieldName === "cod_operacao_mae") {
          return {
            ...meta,
            touched: true,
            manualCode: String(value || "").trim() !== "",
            autoCode: false,
          };
        }
        return {
          ...meta,
          touched: true,
          autoCode: true,
        };
      }),
    );
  };

  const addRow = () => {
    const defaultValues = buildRowDefaults();
    setRows((currentRows) => [...currentRows, createEmptyRow(fields, defaultValues)]);
    setRowMeta((currentMeta) => [...currentMeta, { touched: false, manualCode: false, autoCode: false }]);
  };

  const removeRow = (rowIndex) => {
    const defaultValues = buildRowDefaults();
    setRows((currentRows) => {
      if (currentRows.length === 1) {
        return createDefaultRows(fields, defaultValues, rowCount);
      }
      return currentRows.filter((_, index) => index !== rowIndex);
    });
    setRowMeta((currentMeta) => {
      if (currentMeta.length === 1) {
        return createDefaultRowMeta(rowCount);
      }
      return currentMeta.filter((_, index) => index !== rowIndex);
    });
  };

  const handlePaste = (event, rowIndex, columnIndex) => {
    const clipboard = event.clipboardData?.getData("text/plain");
    if (!clipboard || (!clipboard.includes("\t") && !clipboard.includes("\n"))) {
      return;
    }

    event.preventDefault();
    const parsedRows = clipboard
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"));

    setRows((currentRows) => {
      const defaultValues = buildRowDefaults();
      const nextRows = [...currentRows];
      const missingRows = rowIndex + parsedRows.length - nextRows.length;
      const nextMeta = resizeRowMeta(rowMeta, nextRows.length + Math.max(missingRows, 0));

      for (let extraIndex = 0; extraIndex < missingRows; extraIndex += 1) {
        nextRows.push(createEmptyRow(fields, defaultValues));
      }

      parsedRows.forEach((values, pasteRowOffset) => {
        const absoluteRowIndex = rowIndex + pasteRowOffset;
        let nextRow = { ...nextRows[absoluteRowIndex] };

        values.forEach((rawValue, pasteColumnOffset) => {
          const field = fields[columnIndex + pasteColumnOffset];
          if (!field) {
            return;
          }

          if (isSelectLikeField(field)) {
            nextRow[field.name] = findSelectValue(field, rawValue, lookupOptions, tradingviewQuotes, nextRow);
            nextRow = applyExchangeDefaults(nextRow, fields, lookupOptions);
            nextMeta[absoluteRowIndex] = {
              ...nextMeta[absoluteRowIndex],
              touched: true,
              ...(field.name === "cod_operacao_mae"
                ? { manualCode: String(rawValue || "").trim() !== "", autoCode: false }
                : {}),
            };
            return;
          }

          if (field.type === "date") {
            nextRow[field.name] = normalizeDateValue(rawValue);
            nextMeta[absoluteRowIndex] = { ...nextMeta[absoluteRowIndex], touched: true };
            return;
          }

          nextRow[field.name] = String(rawValue || "").trim();
          nextMeta[absoluteRowIndex] = {
            ...nextMeta[absoluteRowIndex],
            touched: true,
            ...(field.name === "cod_operacao_mae"
              ? { manualCode: String(rawValue || "").trim() !== "", autoCode: false }
              : {}),
          };
        });

        const hasAnyMeaningfulValue = fields.some((field) => {
          if (field.name === "cod_operacao_mae") return false;
          return String(nextRow?.[field.name] || "").trim() !== "";
        });
        if (hasAnyMeaningfulValue && !String(nextRow.cod_operacao_mae || "").trim()) {
          nextRow.cod_operacao_mae = generateUniqueOperationCode(nextRows, absoluteRowIndex);
          nextMeta[absoluteRowIndex] = { ...nextMeta[absoluteRowIndex], autoCode: true, touched: true };
        }

        nextRows[absoluteRowIndex] = nextRow;
      });

      setRowMeta(nextMeta);
      return nextRows;
    });
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    setError("");

    const filledRows = rows.filter((row, index) => rowMeta[index]?.touched && rowHasAnyUserValue(row, fields, rowMeta[index]));
    if (!filledRows.length) {
      setError("Preencha ao menos uma linha antes de importar.");
      return;
    }

    const confirmed = window.confirm(`Deseja importar ${filledRows.length} linha(s) preenchida(s) assim mesmo?`);
    if (!confirmed) {
      return;
    }

    const payloadRows = filledRows.map((row) =>
      fields.reduce((acc, field) => {
        const rawValue = row[field.name];

        if (field.type === "relation") {
          acc[field.name] = rawValue ? Number(rawValue) : null;
          return acc;
        }
        if (field.type === "number") {
          acc[field.name] = parseLocalizedNumber(rawValue);
          return acc;
        }
        if (field.type === "date") {
          acc[field.name] = normalizeDateValue(rawValue);
          return acc;
        }

        acc[field.name] = rawValue;
        return acc;
      }, {}),
    );

    setSubmitting(true);
    try {
      const { data } = await api.post("/derivative-operations/bulk-import/", { rows: payloadRows });
      if (typeof onImported === "function") {
        await onImported(data);
      }
      onClose();
    } catch (requestError) {
      const responseRows = requestError.response?.data?.rows;
      if (responseRows && typeof responseRows === "object") {
        const firstMessage = Object.entries(responseRows)
          .map(([rowNumber, details]) => {
            const missingFields = Array.isArray(details?.missing_fields) ? details.missing_fields.join(", ") : "";
            const detail = details?.detail || "";
            return `Linha ${rowNumber}: ${detail}${missingFields ? ` (${missingFields})` : ""}`;
          })
          .join(" ");
        setError(firstMessage || "Nao foi possivel importar os registros.");
      } else {
        setError(requestError.response?.data?.detail || "Nao foi possivel importar os registros.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isCellSelected = (rowIndex, columnIndex) =>
    selectedCell?.rowIndex === rowIndex && selectedCell?.columnIndex === columnIndex;

  const isCellInFillPreview = (rowIndex, columnIndex) => {
    if (!fillDrag || fillDrag.columnIndex !== columnIndex || !fillDrag.targetRowIndex) {
      return false;
    }
    const startRow = Math.min(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
    const endRow = Math.max(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
    return rowIndex >= startRow && rowIndex <= endRow;
  };

  return (
    <div className="modal-shell">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card derivative-bulk-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Importar em massa</h3>
            <p>Planilha em modo Excel, com 200 linhas iniciais, colagem de bloco, dropdown por setinha e arraste para copiar.</p>
          </div>
          <button className="bubble-btn bubble-btn-light" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="derivative-bulk-import-toolbar">
          <div className="derivative-bulk-import-summary">
            {loadingLookups ? "Carregando campos..." : `${totalFilledRows} linha(s) preenchida(s)`}
          </div>
          <div className="derivative-bulk-import-actions">
            <select
              className="derivative-bulk-import-row-count"
              value={String(rowCount)}
              onChange={(event) => {
                const nextCount = Number(event.target.value) || DEFAULT_VISIBLE_ROWS;
                setRowCount(nextCount);
                const defaultValues = buildRowDefaults();
                setRows((currentRows) =>
                  resizeRows(
                    currentRows,
                    fields,
                    nextCount,
                    defaultValues,
                  ),
                );
                setRowMeta((currentMeta) => resizeRowMeta(currentMeta, nextCount));
              }}
              disabled={loadingLookups || !fields.length}
            >
              {ROW_COUNT_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option} linhas
                </option>
              ))}
            </select>
            <button className="bubble-btn bubble-btn-light" type="button" onClick={addRow} disabled={loadingLookups || !fields.length}>
              Adicionar linha
            </button>
            <button className="bubble-btn bubble-btn-primary" type="button" onClick={handleSubmit} disabled={submitting || loadingLookups || !fields.length}>
              {submitting ? "Importando..." : "Importar valores"}
            </button>
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="derivative-bulk-import-table-wrap custom-scrollbar">
          <table className="derivative-bulk-import-table">
            <thead>
              <tr>
                <th>#</th>
                {fields.map((field) => (
                  <th key={field.name}>{field.label}</th>
                ))}
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`bulk-row-${rowIndex}`}>
                  <td>{rowIndex + 1}</td>
                  {fields.map((field, columnIndex) => {
                    const cellSelected = isCellSelected(rowIndex, columnIndex);
                    const fillPreview = isCellInFillPreview(rowIndex, columnIndex);
                    const options = getFieldOptions(field, lookupOptions, tradingviewQuotes, row);
                    const hasError = getFieldError(row, field.name, submitted);
                    const dropdownOpen = openDropdownCell === buildCellKey(rowIndex, columnIndex);

                    return (
                      <td
                        key={field.name}
                        className={`derivative-bulk-import-td${cellSelected ? " is-selected" : ""}${fillPreview ? " is-fill-preview" : ""}${hasError ? " has-error" : ""}`}
                        onClick={() => {
                          setSelectedCell({ rowIndex, columnIndex });
                          if (!isSelectLikeField(field)) {
                            setOpenDropdownCell(null);
                          }
                        }}
                        onMouseEnter={() => {
                          if (fillDrag && fillDrag.columnIndex === columnIndex) {
                            setFillDrag((current) => ({ ...current, targetRowIndex: rowIndex }));
                          }
                        }}
                      >
                        <div className="derivative-sheet-cell">
                          {isSelectLikeField(field) ? (
                            <>
                              <div
                                className="derivative-sheet-display"
                                onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                              >
                                {formatCellDisplayValue(field, row, lookupOptions, tradingviewQuotes)}
                              </div>
                              <button
                                className="derivative-sheet-dropdown-toggle"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedCell({ rowIndex, columnIndex });
                                  setOpenDropdownCell((current) =>
                                    current === buildCellKey(rowIndex, columnIndex) ? null : buildCellKey(rowIndex, columnIndex),
                                  );
                                }}
                              >
                                ▾
                              </button>
                              {dropdownOpen ? (
                                <div className="derivative-sheet-dropdown-panel" onClick={(event) => event.stopPropagation()}>
                                  <select
                                    className="derivative-sheet-dropdown-select"
                                    size={Math.min(Math.max(options.length, 2), 8)}
                                    value={row[field.name] || ""}
                                    onChange={(event) => {
                                      updateRow(rowIndex, field.name, event.target.value);
                                      setOpenDropdownCell(null);
                                    }}
                                  >
                                    <option value="">Selecione</option>
                                    {options.map((option) => (
                                      <option key={`${field.name}-${option.value}`} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <input
                              className="derivative-sheet-input"
                              type={field.type === "date" ? "date" : "text"}
                              inputMode={field.type === "number" ? "decimal" : undefined}
                              value={field.type === "date" ? normalizeDateValue(row[field.name]) : row[field.name] || ""}
                              onChange={(event) => updateRow(rowIndex, field.name, event.target.value)}
                              onFocus={() => setSelectedCell({ rowIndex, columnIndex })}
                              onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                            />
                          )}
                          {cellSelected ? (
                            <div
                              className="derivative-sheet-fill-handle"
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                setFillDrag({
                                  sourceRowIndex: rowIndex,
                                  targetRowIndex: rowIndex,
                                  columnIndex,
                                });
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                  <td>
                    <button className="bubble-btn bubble-btn-danger derivative-bulk-import-remove" type="button" onClick={() => removeRow(rowIndex)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
