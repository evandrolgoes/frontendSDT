import { useEffect, useMemo, useRef, useState } from "react";

import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { api } from "../services/api";
import { resourceService } from "../services/resourceService";
import { isBrazilianDate, parseBrazilianDate } from "../utils/date";
import { inferExchangeFromBolsaLabel, normalizeLookupValue, parseLocalizedNumber } from "../utils/formatters";

const DEFAULT_VISIBLE_ROWS = 10;
const ROW_COUNT_OPTIONS = [10, 50, 100, 150, 200];

const getQuoteSectionName = (item) =>
  String(item?.section_name || item?.secao || item?.seção || "")
    .replace(/\s+/g, " ")
    .trim();

const isSelectLikeField = (field) => ["select", "relation", "contract", "boolean"].includes(field?.type);
const generateRandomOperationCode = () => `DRV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const toDefinitionKey = (value) => String(value || "").replace(/-([a-z])/g, (_match, char) => char.toUpperCase());

const buildRowDefaults = (resource, baseDefaults = {}) => ({
  ...baseDefaults,
  cod_operacao_mae: resource === "derivative-operations" ? (baseDefaults.cod_operacao_mae || "") : (baseDefaults.cod_operacao_mae ?? ""),
  status_operacao: baseDefaults.status_operacao || "",
});

const createEmptyRow = (fields, resource, defaults = {}) => {
  const normalizedDefaults = buildRowDefaults(resource, defaults);
  return fields.reduce(
    (acc, field) => ({
      ...acc,
      [field.name]: normalizedDefaults[field.name] ?? "",
    }),
    {},
  );
};

const createDefaultRows = (fields, resource, defaults = {}, total = DEFAULT_VISIBLE_ROWS) =>
  Array.from({ length: total }, () => createEmptyRow(fields, resource, defaults));

const createDefaultRowMeta = (total = DEFAULT_VISIBLE_ROWS) =>
  Array.from({ length: total }, () => ({ touched: false, manualCode: false, autoCode: false }));

const resizeRows = (currentRows, fields, resource, total, defaults = {}) => {
  const nextRows = currentRows.slice(0, total);
  while (nextRows.length < total) {
    nextRows.push(createEmptyRow(fields, resource, defaults));
  }
  return nextRows;
};

const resizeRowMeta = (currentMeta, total) => {
  const nextMeta = currentMeta.slice(0, total);
  while (nextMeta.length < total) {
    nextMeta.push({ touched: false, manualCode: false, autoCode: false });
  }
  return nextMeta;
};

const normalizeDateValue = (value) => {
  if (!String(value || "").trim()) return "";
  if (isBrazilianDate(value)) return parseBrazilianDate(value, "");
  return parseBrazilianDate(value, "") || "";
};

const getOptionLabel = (field, option) =>
  option?.[field.labelKey || "nome"] ||
  option?.nome ||
  option?.name ||
  option?.title ||
  option?.label ||
  option?.username ||
  option?.email ||
  option?.obs ||
  option?.descricao_estrategia ||
  option?.subgrupo ||
  option?.grupo ||
  option?.safra ||
  option?.ativo ||
  `#${option?.id ?? ""}`;

const getFieldOptions = (field, lookupOptions, tradingviewQuotes, row) => {
  if (field.type === "contract") {
    const normalizedBolsa = normalizeLookupValue(row?.bolsa_ref);
    return (tradingviewQuotes || [])
      .filter((item) => normalizeLookupValue(getQuoteSectionName(item)) === normalizedBolsa)
      .map((item) => ({ value: item?.ticker || "", label: item?.ticker || "" }))
      .filter((option) => option.value)
      .filter((option, index, array) => array.findIndex((candidate) => candidate.value === option.value) === index);
  }

  if (field.name === "bolsa_ref" && Array.isArray(tradingviewQuotes) && tradingviewQuotes.length) {
    return tradingviewQuotes
      .map((item) => getQuoteSectionName(item))
      .filter(Boolean)
      .filter((value, index, array) => array.findIndex((candidate) => normalizeLookupValue(candidate) === normalizeLookupValue(value)) === index)
      .map((value) => ({ value, label: value }));
  }

  if (Array.isArray(field.options)) {
    return field.options.map((option) => ({ value: String(option.value), label: option.label }));
  }

  if (!field.resource) return [];

  return (lookupOptions[field.resource] || [])
    .map((option) => ({
      value: String(option[field.valueKey || "id"] ?? option.id ?? ""),
      label: getOptionLabel(field, option),
    }))
    .filter((option) => String(option.value || "").trim() && String(option.label || "").trim());
};

const mergeMetadataFields = (resource, metadataFields) => {
  const definition = resourceDefinitions[toDefinitionKey(resource)] || null;
  const definitionFields = [...(definition?.fields || []), ...(definition?.editFields || []), ...(definition?.detailFields || [])];
  const definitionColumns = definition?.columns || [];
  const mappedDefinitionFields = Object.fromEntries(definitionFields.map((field) => [field.name, field]));
  const mappedColumns = Object.fromEntries(definitionColumns.map((field) => [field.key, field]));

  return (metadataFields || []).map((field) => {
    const definitionField = mappedDefinitionFields[field.name] || mappedColumns[field.name] || {};
    return {
      ...field,
      ...definitionField,
      name: field.name,
      label: definitionField.label || field.label,
      type: definitionField.type || field.type,
      resource: definitionField.resource || field.resource,
      options: definitionField.options || field.options,
      labelKey: definitionField.labelKey || field.labelKey,
      valueKey: definitionField.valueKey || field.valueKey,
    };
  });
};

const findSelectValue = (field, rawValue, lookupOptions, tradingviewQuotes, row) => {
  const normalizedRawValue = normalizeLookupValue(rawValue);
  const options = getFieldOptions(field, lookupOptions, tradingviewQuotes, row);
  const directMatch = options.find((option) => normalizeLookupValue(option.value) === normalizedRawValue);
  if (directMatch) return directMatch.value;
  const labelMatch = options.find((option) => normalizeLookupValue(option.label) === normalizedRawValue);
  if (labelMatch) return labelMatch.value;
  return String(rawValue || "").trim();
};

const applyResourceDefaults = (resource, row, fields, lookupOptions) => {
  if (resource !== "derivative-operations") {
    return row;
  }
  const exchangeField = fields.find((field) => field.name === "bolsa_ref");
  if (!exchangeField) return row;
  const exchanges = lookupOptions[exchangeField.resource] || [];
  const selectedExchange = inferExchangeFromBolsaLabel(row.bolsa_ref, exchanges);
  if (!selectedExchange) return row;

  const nextRow = { ...row };
  if ("moeda_ou_cmdtye" in nextRow) nextRow.moeda_ou_cmdtye = nextRow.moeda_ou_cmdtye || selectedExchange.moeda_cmdtye || "";
  if ("strike_moeda_unidade" in nextRow) nextRow.strike_moeda_unidade = nextRow.strike_moeda_unidade || selectedExchange.moeda_unidade_padrao || "";
  if ("volume_financeiro_moeda" in nextRow) nextRow.volume_financeiro_moeda = nextRow.volume_financeiro_moeda || selectedExchange.moeda_bolsa || "";
  if ("volume_fisico_unidade" in nextRow) nextRow.volume_fisico_unidade = nextRow.volume_fisico_unidade || selectedExchange.unidade_bolsa || "";
  return nextRow;
};

const rowHasAnyUserValue = (row, fields, meta) =>
  fields.some((field) => {
    const value = String(row?.[field.name] || "").trim();
    if (!value) return false;
    if (field.name === "cod_operacao_mae" && meta?.autoCode && !meta?.manualCode) return false;
    return true;
  });

const formatCellDisplayValue = (field, row, lookupOptions, tradingviewQuotes) => {
  const value = row?.[field.name] || "";
  if (!value) return "";
  if (field.type === "date") return normalizeDateValue(value);
  if (!isSelectLikeField(field)) return String(value);
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
  while (usedCodes.has(nextCode)) nextCode = generateRandomOperationCode();
  return nextCode;
};

export function MassImportWorkspace() {
  const tableWrapRef = useRef(null);
  const [resources, setResources] = useState([]);
  const [resource, setResource] = useState("");
  const [resourceLabel, setResourceLabel] = useState("");
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [rowMeta, setRowMeta] = useState([]);
  const [lookupOptions, setLookupOptions] = useState({});
  const [tradingviewQuotes, setTradingviewQuotes] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);
  const [selectedCell, setSelectedCell] = useState({ rowIndex: 0, columnIndex: 0 });
  const [selectionRange, setSelectionRange] = useState({ startRowIndex: 0, startColumnIndex: 0, endRowIndex: 0, endColumnIndex: 0 });
  const [isSelecting, setIsSelecting] = useState(false);
  const [openDropdownCell, setOpenDropdownCell] = useState(null);
  const [fillDrag, setFillDrag] = useState(null);

  useEffect(() => {
    let active = true;
    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const { data } = await api.get("/mass-import/resources/");
        if (!active) return;
        const items = Array.isArray(data?.resources) ? data.resources : [];
        setResources(items);
        if (items.length) setResource((current) => current || items[0].value);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.detail || "Nao foi possivel carregar os recursos para importacao em massa.");
      } finally {
        if (active) setLoadingResources(false);
      }
    };
    loadResources();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!resource) return;
    let active = true;
    const loadMetadata = async () => {
      setLoadingMetadata(true);
      setError("");
      setNotice("");
      try {
        const { data } = await api.get("/mass-import/metadata/", { params: { resource } });
        const metadataFields = mergeMetadataFields(resource, Array.isArray(data?.fields) ? data.fields : []);
        const lookupResources = [...new Set(metadataFields.map((field) => field.resource).filter(Boolean))];
        const needsContracts = metadataFields.some((field) => field.type === "contract");
        const [lookupEntries, quoteItems] = await Promise.all([
          Promise.all(lookupResources.map(async (resourceName) => [resourceName, await resourceService.listAll(resourceName)])),
          needsContracts ? resourceService.listTradingviewQuotes() : Promise.resolve([]),
        ]);
        if (!active) return;
        const defaults = buildRowDefaults(resource);
        setFields(metadataFields);
        setResourceLabel(data?.label || resources.find((item) => item.value === resource)?.label || resource);
        setLookupOptions(Object.fromEntries(lookupEntries));
        setTradingviewQuotes(Array.isArray(quoteItems) ? quoteItems : []);
        setRows(createDefaultRows(metadataFields, resource, defaults, rowCount));
        setRowMeta(createDefaultRowMeta(rowCount));
        setSelectedCell({ rowIndex: 0, columnIndex: 0 });
        setSelectionRange({ startRowIndex: 0, startColumnIndex: 0, endRowIndex: 0, endColumnIndex: 0 });
        setOpenDropdownCell(null);
      } catch (requestError) {
        if (active) {
          setFields([]);
          setRows([]);
          setRowMeta([]);
          setError(requestError.response?.data?.detail || "Nao foi possivel carregar os campos da base selecionada.");
        }
      } finally {
        if (active) setLoadingMetadata(false);
      }
    };
    loadMetadata();
    return () => {
      active = false;
    };
  }, [resource, resources, rowCount]);

  useEffect(() => {
    if (!fillDrag) return undefined;
    const handleMouseUp = () => {
      setRows((currentRows) => {
        if (!fillDrag?.targetRowIndex || fillDrag.targetRowIndex === fillDrag.sourceRowIndex) return currentRows;
        const field = fields[fillDrag.columnIndex];
        if (!field) return currentRows;
        const startRow = Math.min(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
        const endRow = Math.max(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
        const sourceValue = currentRows[fillDrag.sourceRowIndex]?.[field.name] || "";
        const nextRows = [...currentRows];
        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
          if (rowIndex === fillDrag.sourceRowIndex) continue;
          nextRows[rowIndex] = applyResourceDefaults(resource, { ...nextRows[rowIndex], [field.name]: sourceValue }, fields, lookupOptions);
        }
        return nextRows;
      });
      setRowMeta((currentMeta) =>
        currentMeta.map((meta, index) => {
          if (!fillDrag) return meta;
          const startRow = Math.min(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
          const endRow = Math.max(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
          if (index < startRow || index > endRow) return meta;
          return { ...meta, touched: true, autoCode: meta.autoCode || fields[fillDrag.columnIndex]?.name !== "cod_operacao_mae" };
        }),
      );
      setFillDrag(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [fields, fillDrag, lookupOptions, resource]);

  useEffect(() => {
    if (!isSelecting) return undefined;
    const handleMouseUp = () => setIsSelecting(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isSelecting]);

  const totalFilledRows = useMemo(
    () => rows.filter((row, index) => rowMeta[index]?.touched && rowHasAnyUserValue(row, fields, rowMeta[index])).length,
    [fields, rowMeta, rows],
  );

  const updateRow = (rowIndex, fieldName, value) => {
    setOpenDropdownCell(null);
    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) return row;
        let nextRow = { ...row, [fieldName]: value };
        if (resource === "derivative-operations") {
          if (fieldName !== "cod_operacao_mae") {
            const hasAnyMeaningfulValue = fields.some((field) => field.name !== "cod_operacao_mae" && String(nextRow?.[field.name] || "").trim() !== "");
            if (hasAnyMeaningfulValue && !String(nextRow.cod_operacao_mae || "").trim()) {
              nextRow.cod_operacao_mae = generateUniqueOperationCode(currentRows, rowIndex);
            }
          }
        }
        nextRow = applyResourceDefaults(resource, nextRow, fields, lookupOptions);
        if (resource === "derivative-operations" && fieldName === "bolsa_ref" && nextRow.contrato_derivativo) {
          const contractField = fields.find((field) => field.name === "contrato_derivativo");
          const contractOptions = contractField ? getFieldOptions(contractField, lookupOptions, tradingviewQuotes, nextRow) : [];
          if (!contractOptions.some((option) => option.value === nextRow.contrato_derivativo)) {
            nextRow.contrato_derivativo = "";
          }
        }
        return nextRow;
      }),
    );
    setRowMeta((currentMeta) =>
      currentMeta.map((meta, index) => {
        if (index !== rowIndex) return meta;
        if (fieldName === "cod_operacao_mae") {
          return { ...meta, touched: true, manualCode: String(value || "").trim() !== "", autoCode: false };
        }
        return { ...meta, touched: true, autoCode: resource === "derivative-operations" };
      }),
    );
  };

  const applyPastedText = (clipboard, rowIndex, columnIndex) => {
    if (!clipboard) return;
    const parsedRows = clipboard
      .split(/\r?\n/)
      .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
      .map((line) => line.split("\t"));

    if (!parsedRows.length) return;
    setRows((currentRows) => {
      const nextRows = [...currentRows];
      const missingRows = Math.max(0, rowIndex + parsedRows.length - nextRows.length);
      for (let extraIndex = 0; extraIndex < missingRows; extraIndex += 1) {
        nextRows.push(createEmptyRow(fields, resource, buildRowDefaults(resource)));
      }
      setRowMeta((currentMeta) => {
        const nextMeta = resizeRowMeta(currentMeta, nextRows.length);
        parsedRows.forEach((values, pasteRowOffset) => {
          const absoluteRowIndex = rowIndex + pasteRowOffset;
          let nextRow = { ...nextRows[absoluteRowIndex] };
          values.forEach((rawValue, pasteColumnOffset) => {
            const field = fields[columnIndex + pasteColumnOffset];
            if (!field) return;
            if (isSelectLikeField(field)) {
              nextRow[field.name] = findSelectValue(field, rawValue, lookupOptions, tradingviewQuotes, nextRow);
            } else if (field.type === "date") {
              nextRow[field.name] = normalizeDateValue(rawValue);
            } else {
              nextRow[field.name] = String(rawValue || "").trim();
            }
            nextMeta[absoluteRowIndex] = {
              ...nextMeta[absoluteRowIndex],
              touched: true,
              ...(field.name === "cod_operacao_mae" ? { manualCode: String(rawValue || "").trim() !== "", autoCode: false } : {}),
            };
          });
          if (resource === "derivative-operations") {
            const hasAnyMeaningfulValue = fields.some((field) => field.name !== "cod_operacao_mae" && String(nextRow?.[field.name] || "").trim() !== "");
            if (hasAnyMeaningfulValue && !String(nextRow.cod_operacao_mae || "").trim()) {
              nextRow.cod_operacao_mae = generateUniqueOperationCode(nextRows, absoluteRowIndex);
              nextMeta[absoluteRowIndex] = { ...nextMeta[absoluteRowIndex], autoCode: true, touched: true };
            }
          }
          nextRows[absoluteRowIndex] = applyResourceDefaults(resource, nextRow, fields, lookupOptions);
        });
        return nextMeta;
      });
      return nextRows;
    });
  };

  const handlePaste = (event, rowIndex, columnIndex) => {
    const clipboard = event.clipboardData?.getData("text/plain");
    if (!clipboard) return;
    event.preventDefault();
    applyPastedText(clipboard, rowIndex, columnIndex);
  };

  // Copy selected range as TSV (Excel-compatible)
  const handleCopy = (event) => {
    const startRow = Math.min(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const endRow = Math.max(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const startCol = Math.min(selectionRange.startColumnIndex, selectionRange.endColumnIndex);
    const endCol = Math.max(selectionRange.startColumnIndex, selectionRange.endColumnIndex);

    const isMultiCell = startRow !== endRow || startCol !== endCol;
    const isInputFocused = document.activeElement?.tagName === "INPUT";

    // For single-cell input, let the browser copy the selected text
    if (!isMultiCell && isInputFocused) return;

    const tsv = rows
      .slice(startRow, endRow + 1)
      .map((row) =>
        fields
          .slice(startCol, endCol + 1)
          .map((field) => formatCellDisplayValue(field, row, lookupOptions, tradingviewQuotes) || String(row[field.name] ?? ""))
          .join("\t"),
      )
      .join("\n");

    event.clipboardData.setData("text/plain", tsv);
    event.preventDefault();
  };

  // Clear all cells in the current selection range
  const clearSelectionRange = () => {
    const startRow = Math.min(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const endRow = Math.max(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const startCol = Math.min(selectionRange.startColumnIndex, selectionRange.endColumnIndex);
    const endCol = Math.max(selectionRange.startColumnIndex, selectionRange.endColumnIndex);

    setRows((currentRows) =>
      currentRows.map((row, rowIndex) => {
        if (rowIndex < startRow || rowIndex > endRow) return row;
        const nextRow = { ...row };
        fields.slice(startCol, endCol + 1).forEach((field) => {
          nextRow[field.name] = "";
        });
        return nextRow;
      }),
    );
    setRowMeta((currentMeta) =>
      currentMeta.map((meta, index) => {
        if (index < startRow || index > endRow) return meta;
        return { ...meta, touched: true };
      }),
    );
  };

  const handleSubmit = async () => {
    setError("");
    setNotice("");
    const filledRows = rows.filter((row, index) => rowMeta[index]?.touched && rowHasAnyUserValue(row, fields, rowMeta[index]));
    if (!filledRows.length) {
      setError("Preencha ao menos uma linha antes de importar.");
      return;
    }
    const confirmed = window.confirm(`Deseja importar ${filledRows.length} linha(s) preenchida(s) em ${resourceLabel || resource}?`);
    if (!confirmed) return;

    const payloadRows = filledRows.map((row) =>
      fields.reduce((acc, field) => {
        const rawValue = row[field.name];
        if (field.type === "relation") acc[field.name] = rawValue ? Number(rawValue) : null;
        else if (field.type === "number") acc[field.name] = parseLocalizedNumber(rawValue);
        else if (field.type === "date") acc[field.name] = normalizeDateValue(rawValue);
        else if (field.type === "boolean") acc[field.name] = rawValue === "" ? null : rawValue === true || rawValue === "true";
        else acc[field.name] = rawValue;
        return acc;
      }, {}),
    );

    setSubmitting(true);
    try {
      const { data } = await api.post("/mass-import/apply/", { resource, rows: payloadRows });
      setNotice(`Importacao concluida. ${data.createdCount || 0} registro(s) criados em ${data.label || resourceLabel}.`);
      setRows(createDefaultRows(fields, resource, buildRowDefaults(resource), rowCount));
      setRowMeta(createDefaultRowMeta(rowCount));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Nao foi possivel importar os dados.");
    } finally {
      setSubmitting(false);
    }
  };

  const isCellInSelectionRange = (rowIndex, columnIndex) => {
    const startRow = Math.min(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const endRow = Math.max(selectionRange.startRowIndex, selectionRange.endRowIndex);
    const startColumn = Math.min(selectionRange.startColumnIndex, selectionRange.endColumnIndex);
    const endColumn = Math.max(selectionRange.startColumnIndex, selectionRange.endColumnIndex);
    return rowIndex >= startRow && rowIndex <= endRow && columnIndex >= startColumn && columnIndex <= endColumn;
  };

  const isActiveCell = (rowIndex, columnIndex) =>
    rowIndex === selectedCell.rowIndex && columnIndex === selectedCell.columnIndex;

  const isCellInFillPreview = (rowIndex, columnIndex) => {
    if (!fillDrag || fillDrag.columnIndex !== columnIndex || !fillDrag.targetRowIndex) return false;
    const startRow = Math.min(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
    const endRow = Math.max(fillDrag.sourceRowIndex, fillDrag.targetRowIndex);
    return rowIndex >= startRow && rowIndex <= endRow;
  };

  const focusCell = (rowIndex, columnIndex) => {
    const safeRowIndex = Math.max(0, Math.min(rowIndex, rows.length - 1));
    const safeColumnIndex = Math.max(0, Math.min(columnIndex, fields.length - 1));
    setSelectedCell({ rowIndex: safeRowIndex, columnIndex: safeColumnIndex });
    setSelectionRange({
      startRowIndex: safeRowIndex,
      startColumnIndex: safeColumnIndex,
      endRowIndex: safeRowIndex,
      endColumnIndex: safeColumnIndex,
    });

    window.requestAnimationFrame(() => {
      const element = tableWrapRef.current?.querySelector(`[data-cell="${buildCellKey(safeRowIndex, safeColumnIndex)}"]`);
      element?.focus();
    });
  };

  const handleKeyboardNavigation = (event, rowIndex, columnIndex) => {
    const isInputActive = event.target.tagName === "INPUT";

    // Ctrl/Cmd+A: select all cells
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      event.preventDefault();
      setSelectionRange({
        startRowIndex: 0,
        startColumnIndex: 0,
        endRowIndex: rows.length - 1,
        endColumnIndex: fields.length - 1,
      });
      return;
    }

    // Delete/Backspace on non-input element: clear selection range
    if ((event.key === "Delete" || event.key === "Backspace") && !isInputActive) {
      event.preventDefault();
      clearSelectionRange();
      return;
    }

    // Escape: close dropdown, clear fill drag
    if (event.key === "Escape") {
      setOpenDropdownCell(null);
      setFillDrag(null);
      return;
    }

    // Tab / Shift+Tab: move right / left
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) focusCell(rowIndex, columnIndex - 1);
      else focusCell(rowIndex, columnIndex + 1);
      return;
    }

    // Shift+Arrow: extend selection range without moving active cell
    if (event.shiftKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      setSelectionRange((current) => {
        const next = { ...current };
        if (event.key === "ArrowUp") next.endRowIndex = Math.max(0, next.endRowIndex - 1);
        if (event.key === "ArrowDown") next.endRowIndex = Math.min(rows.length - 1, next.endRowIndex + 1);
        if (event.key === "ArrowLeft") next.endColumnIndex = Math.max(0, next.endColumnIndex - 1);
        if (event.key === "ArrowRight") next.endColumnIndex = Math.min(fields.length - 1, next.endColumnIndex + 1);
        return next;
      });
      return;
    }

    // Arrow key navigation
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(rowIndex - 1, columnIndex);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(rowIndex + 1, columnIndex);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(rowIndex, columnIndex - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(rowIndex, columnIndex + 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      focusCell(rowIndex + 1, columnIndex);
    }
  };

  // Select entire column when clicking a column header
  const handleColumnHeaderClick = (columnIndex) => {
    setSelectedCell({ rowIndex: 0, columnIndex });
    setSelectionRange({
      startRowIndex: 0,
      startColumnIndex: columnIndex,
      endRowIndex: rows.length - 1,
      endColumnIndex: columnIndex,
    });
  };

  // Select entire row when clicking a row number
  const handleRowHeaderClick = (rowIndex) => {
    setSelectedCell({ rowIndex, columnIndex: 0 });
    setSelectionRange({
      startRowIndex: rowIndex,
      startColumnIndex: 0,
      endRowIndex: rowIndex,
      endColumnIndex: fields.length - 1,
    });
  };

  // Select all cells when clicking the corner header cell
  const handleCornerHeaderClick = () => {
    setSelectedCell({ rowIndex: 0, columnIndex: 0 });
    setSelectionRange({
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: rows.length - 1,
      endColumnIndex: fields.length - 1,
    });
  };

  return (
    <div className="mass-update-page">
      <div className="page-header">
        <div>
          <h2>Importacao em Massa</h2>
          <p>Escolha a base de dados, cole os dados da planilha e importe apenas as linhas preenchidas.</p>
        </div>
      </div>

      <section className="mass-update-card">
        <div className="mass-update-grid">
          <label className="form-field">
            <span>Base de dados</span>
            <select className="form-control" value={resource} onChange={(event) => setResource(event.target.value)} disabled={loadingResources}>
              {resources.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mass-update-card">
        <div className="derivative-bulk-import-toolbar">
          <div className="derivative-bulk-import-summary">
            {loadingMetadata ? "Carregando campos..." : `${totalFilledRows} linha(s) preenchida(s) em ${resourceLabel || "..."}`}
          </div>
          <div className="derivative-bulk-import-actions">
            <select
              className="form-control derivative-bulk-import-row-count"
              value={String(rowCount)}
              onChange={(event) => {
                const nextCount = Number(event.target.value) || DEFAULT_VISIBLE_ROWS;
                setRowCount(nextCount);
                setRows((currentRows) => resizeRows(currentRows, fields, resource, nextCount, buildRowDefaults(resource)));
                setRowMeta((currentMeta) => resizeRowMeta(currentMeta, nextCount));
              }}
              disabled={loadingMetadata || !fields.length}
            >
              {ROW_COUNT_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option} linhas
                </option>
              ))}
            </select>
            <button type="button" className="bubble-btn bubble-btn-primary" onClick={handleSubmit} disabled={submitting || loadingMetadata || !fields.length}>
              {submitting ? "Importando..." : "Importar valores"}
            </button>
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}
        {notice ? <div className="derivative-bulk-import-notice">{notice}</div> : null}

        <div className="derivative-bulk-import-hints">
          <span>Ctrl+C copiar</span>
          <span>Ctrl+V colar</span>
          <span>Delete limpar</span>
          <span>Shift+Setas selecionar</span>
          <span>Tab navegar</span>
          <span>Enter próxima linha</span>
        </div>

        <div
          ref={tableWrapRef}
          className="derivative-bulk-import-table-wrap custom-scrollbar"
          tabIndex={0}
          onPaste={(event) => handlePaste(event, selectedCell.rowIndex, selectedCell.columnIndex)}
          onCopy={handleCopy}
        >
          <table className="derivative-bulk-import-table">
            <thead>
              <tr>
                <th
                  className="derivative-sheet-corner-header"
                  title="Selecionar tudo"
                  onClick={handleCornerHeaderClick}
                >
                  #
                </th>
                {fields.map((field, columnIndex) => (
                  <th
                    key={field.name}
                    className="derivative-sheet-col-header"
                    title={`Selecionar coluna "${field.label}"`}
                    onClick={() => handleColumnHeaderClick(columnIndex)}
                  >
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`mass-import-row-${rowIndex}`}>
                  <td
                    className="derivative-sheet-row-header"
                    title={`Selecionar linha ${rowIndex + 1}`}
                    onClick={() => handleRowHeaderClick(rowIndex)}
                  >
                    {rowIndex + 1}
                  </td>
                  {fields.map((field, columnIndex) => {
                    const cellActive = isActiveCell(rowIndex, columnIndex);
                    const cellInRange = isCellInSelectionRange(rowIndex, columnIndex);
                    const fillPreview = isCellInFillPreview(rowIndex, columnIndex);
                    const options = getFieldOptions(field, lookupOptions, tradingviewQuotes, row);
                    const dropdownOpen = openDropdownCell === buildCellKey(rowIndex, columnIndex);

                    const tdClass = [
                      "derivative-bulk-import-td",
                      cellInRange && !cellActive ? "is-in-range" : "",
                      cellActive ? "is-active-cell" : "",
                      fillPreview ? "is-fill-preview" : "",
                    ].filter(Boolean).join(" ");

                    const cellClass = [
                      "derivative-sheet-cell",
                      cellInRange && !cellActive ? "is-in-range" : "",
                      cellActive ? "is-active-cell" : "",
                      fillPreview ? "is-fill-preview" : "",
                    ].filter(Boolean).join(" ");

                    return (
                      <td
                        key={field.name}
                        className={tdClass}
                        onMouseDown={(event) => {
                          if (event.shiftKey) {
                            // Shift+Click: extend selection from current selectedCell
                            event.preventDefault();
                            setSelectionRange((current) => ({
                              ...current,
                              endRowIndex: rowIndex,
                              endColumnIndex: columnIndex,
                            }));
                            setIsSelecting(true);
                          } else {
                            setSelectedCell({ rowIndex, columnIndex });
                            setSelectionRange({
                              startRowIndex: rowIndex,
                              startColumnIndex: columnIndex,
                              endRowIndex: rowIndex,
                              endColumnIndex: columnIndex,
                            });
                            setIsSelecting(true);
                          }
                        }}
                        onClick={() => {
                          setSelectedCell({ rowIndex, columnIndex });
                          if (!isSelectLikeField(field)) setOpenDropdownCell(null);
                          if (isSelectLikeField(field)) {
                            window.requestAnimationFrame(() => {
                              const element = tableWrapRef.current?.querySelector(`[data-cell="${buildCellKey(rowIndex, columnIndex)}"]`);
                              element?.focus();
                            });
                          }
                        }}
                        onMouseEnter={() => {
                          if (fillDrag && fillDrag.columnIndex === columnIndex) {
                            setFillDrag((current) => ({ ...current, targetRowIndex: rowIndex }));
                          }
                          if (isSelecting) {
                            setSelectionRange((current) => ({
                              ...current,
                              endRowIndex: rowIndex,
                              endColumnIndex: columnIndex,
                            }));
                          }
                        }}
                      >
                        <div
                          className={cellClass}
                          data-cell={buildCellKey(rowIndex, columnIndex)}
                          tabIndex={0}
                          onFocus={() => {
                            setSelectedCell({ rowIndex, columnIndex });
                            setSelectionRange({
                              startRowIndex: rowIndex,
                              startColumnIndex: columnIndex,
                              endRowIndex: rowIndex,
                              endColumnIndex: columnIndex,
                            });
                          }}
                          onKeyDown={(event) => handleKeyboardNavigation(event, rowIndex, columnIndex)}
                        >
                          {isSelectLikeField(field) ? (
                            <>
                              <div className="derivative-sheet-display" onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}>
                                {formatCellDisplayValue(field, row, lookupOptions, tradingviewQuotes)}
                              </div>
                              <button
                                className="derivative-sheet-dropdown-toggle"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedCell({ rowIndex, columnIndex });
                                  setOpenDropdownCell((current) => (current === buildCellKey(rowIndex, columnIndex) ? null : buildCellKey(rowIndex, columnIndex)));
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
                                    onChange={(event) => updateRow(rowIndex, field.name, event.target.value)}
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
                              onFocus={() => {
                                setSelectedCell({ rowIndex, columnIndex });
                                setSelectionRange({
                                  startRowIndex: rowIndex,
                                  startColumnIndex: columnIndex,
                                  endRowIndex: rowIndex,
                                  endColumnIndex: columnIndex,
                                });
                              }}
                              onKeyDown={(event) => handleKeyboardNavigation(event, rowIndex, columnIndex)}
                              onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                            />
                          )}
                          {cellActive ? (
                            <div
                              className="derivative-sheet-fill-handle"
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                setFillDrag({ sourceRowIndex: rowIndex, targetRowIndex: rowIndex, columnIndex });
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
