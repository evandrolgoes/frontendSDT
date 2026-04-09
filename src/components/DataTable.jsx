import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

import { formatBrazilianDate, formatBrazilianDateTime, isBrazilianDate, isIsoDate } from "../utils/date";

const DEFAULT_FILTER = { values: [], min: "", max: "", query: "" };
const isBrDate = (value) => isBrazilianDate(value);

const normalizeFilterConfig = (config) => ({
  values: Array.isArray(config?.values) ? config.values.map((item) => String(item)) : [],
  min: config?.min ?? "",
  max: config?.max ?? "",
  query: config?.query ?? "",
});

const serializeColumnFilters = (filters = {}) =>
  JSON.stringify(
    Object.keys(filters)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeFilterConfig(filters[key]);
        return acc;
      }, {}),
  );

const FILTER_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M2 3.25C2 2.56 2.56 2 3.25 2h9.5C13.44 2 14 2.56 14 3.25c0 .3-.11.59-.31.82L10 8.2v3.05c0 .36-.19.69-.5.87l-2 1.14A1 1 0 0 1 6 12.39V8.2L2.31 4.07A1.25 1.25 0 0 1 2 3.25Z"
      fill="currentColor"
    />
  </svg>
);

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
  if (column.type === "relation") {
    return "string";
  }

  if (column.type === "multirelation") {
    return "multirelation";
  }

  if (column.type) {
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

  return "string";
};

const parseValue = (value, type) => {
  if (type === "number") {
    return toNumberLoose(value);
  }
  if (type === "date" || type === "datetime") {
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

const isVolumeField = (column) => {
  const normalizedKey = String(column?.key || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedLabel = String(column?.label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalizedKey.includes("volume") || normalizedLabel.includes("volume");
};

const formatDate = (value) => formatBrazilianDate(value, "—");
const formatDateTime = (value) => formatBrazilianDateTime(value, "—");

const formatPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) {
    return "—";
  }
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const detectWeightKey = (columns) => {
  const numericColumns = (columns || []).filter((column) => column.detectedType === "number");
  const keys = numericColumns.map((column) => column.key);
  const normalizedKeys = keys.map((key) =>
    String(key || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  );

  const preferredMatches = [
    "volume_fisico",
    "volume_fisico_valor",
    "volume_total_operacao",
    "volume_financeiro_valor",
    "volume_financeiro_valor_moeda_original",
    "volume",
  ];

  const preferredIndex = preferredMatches.findIndex((preferredKey) =>
    normalizedKeys.includes(
      String(preferredKey || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    ),
  );

  if (preferredIndex >= 0) {
    return keys[preferredIndex];
  }

  const genericIndex = normalizedKeys.findIndex((key) => key.includes("volume"));
  return genericIndex >= 0 ? keys[genericIndex] : null;
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
  [...new Set(rows.flatMap((row) => {
    if (Array.isArray(row[key])) {
      return row[key].map((item) => String(item ?? ""));
    }
    return [String(row[key] ?? "")];
  }))].sort((left, right) =>
    left.localeCompare(right, "pt-BR"),
  );

const toSearchableText = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toSearchableText(item)).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => toSearchableText(item))
      .join(" ");
  }
  return String(value ?? "");
};

const formatObjectValue = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidates = [
    "grupo_name",
    "subgrupo_name",
    "grupo",
    "subgrupo",
    "contraparte",
    "descricao_estrategia",
    "ativo",
    "safra",
    "nome",
    "name",
    "label",
    "title",
  ];

  for (const key of candidates) {
    const candidateValue = value?.[key];
    if (candidateValue !== null && candidateValue !== undefined && candidateValue !== "") {
      return candidateValue;
    }
  }

  if ("id" in value) {
    return String(value.id);
  }

  return null;
};

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
  if (type === "datetime") {
    return formatDateTime(value);
  }
  if (column.key === "phone" || String(column.label || "").trim().toLowerCase() === "telefone") {
    return formatPhone(value);
  }
  if (type === "number") {
    return formatNumber(value, isVolumeField(column) ? 0 : 4);
  }
  if (type === "boolean") {
    return value ? "Sim" : "Nao";
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "—";
    }
    return value
      .map((item) => (typeof item === "object" ? formatObjectValue(item) : item))
      .filter((item) => item !== null && item !== undefined && item !== "")
      .join(", ");
  }
  if (typeof value === "object") {
    return formatObjectValue(value) || "—";
  }
  return String(value);
};

export function DataTable({
  rows,
  columns,
  cardTitle = null,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onCreate,
  onClear,
  onEdit,
  onDuplicate,
  onDelete,
  onDeleteSelected,
  onRowClick,
  selectedId,
  getRowClassName,
  rowQuickActions = [],
  toolbarActions = [],
  showClearButton = true,
  tableHeight = null,
  inheritedColumnFilters = null,
}) {
  const canCreate = typeof onCreate === "function";
  const canEdit = typeof onEdit === "function";
  const canDuplicate = typeof onDuplicate === "function";
  const canDelete = typeof onDelete === "function";
  const canDeleteSelected = typeof onDeleteSelected === "function";
  const canRowClick = typeof onRowClick === "function";
  const visibleQuickActions = rowQuickActions.filter((action) => typeof action?.onClick === "function");
  const showActions = canEdit || canDuplicate || canDelete || visibleQuickActions.length > 0;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [columnFilters, setColumnFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [activePopover, setActivePopover] = useState(null);
  const [tempFilter, setTempFilter] = useState(DEFAULT_FILTER);
  const [actionRowId, setActionRowId] = useState(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [autoTableShellHeight, setAutoTableShellHeight] = useState(() => {
    if (tableHeight || typeof window === "undefined") {
      return null;
    }
    return Math.max(280, Math.floor(window.innerHeight - 220));
  });
  const shellRef = useRef(null);
  const inheritedFiltersSignatureRef = useRef("");

  useEffect(() => {
    const normalizedInheritedFilters =
      inheritedColumnFilters && typeof inheritedColumnFilters === "object"
        ? Object.entries(inheritedColumnFilters).reduce((acc, [key, config]) => {
            const normalizedConfig = normalizeFilterConfig(config);
            const hasActiveFilter =
              normalizedConfig.values.length > 0 ||
              normalizedConfig.min !== "" ||
              normalizedConfig.max !== "" ||
              String(normalizedConfig.query || "").trim() !== "";
            if (hasActiveFilter) {
              acc[key] = normalizedConfig;
            }
            return acc;
          }, {})
        : {};

    const nextSignature = serializeColumnFilters(normalizedInheritedFilters);
    if (inheritedFiltersSignatureRef.current === nextSignature) {
      return;
    }

    inheritedFiltersSignatureRef.current = nextSignature;
    setColumnFilters((current) => {
      const next = { ...current };
      const managedKeys = new Set([
        ...Object.keys(current).filter((key) => String(key).startsWith("__inherited__:")),
        ...Object.keys(normalizedInheritedFilters),
      ]);

      managedKeys.forEach((key) => {
        delete next[key];
      });

      Object.entries(normalizedInheritedFilters).forEach(([key, config]) => {
        next[key] = config;
      });

      return next;
    });
  }, [inheritedColumnFilters]);

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(rows.map((row) => row.id));
      return new Set([...current].filter((id) => validIds.has(id)));
    });
  }, [rows]);

  useEffect(() => {
    if (!selectionAnchorId) {
      return;
    }
    const validIds = new Set(rows.map((row) => row.id));
    if (!validIds.has(selectionAnchorId)) {
      setSelectionAnchorId(null);
    }
  }, [rows, selectionAnchorId]);

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

  useLayoutEffect(() => {
    if (tableHeight || typeof window === "undefined") {
      setAutoTableShellHeight(null);
      return undefined;
    }

    let frameId = null;

    const syncTableHeight = () => {
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const rect = shell.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const bottomGap = 18;
      const nextHeight = Math.max(280, Math.floor(viewportHeight - rect.top - bottomGap));

      setAutoTableShellHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncTableHeight();
      });
    };

    scheduleSync();
    window.addEventListener("resize", scheduleSync);

    const observers = [];
    if (typeof ResizeObserver !== "undefined") {
      [shellRef.current].filter(Boolean).forEach((element) => {
        const observer = new ResizeObserver(() => {
          scheduleSync();
        });
        observer.observe(element);
        observers.push(observer);
      });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [columnFilters, rows.length, searchValue, selectedIds.size, tableHeight, toolbarActions.length]);

  const preparedColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        detectedType: getColumnType(column, rows),
      })),
    [columns, rows],
  );

  const preparedColumnsByKey = useMemo(
    () => new Map(preparedColumns.map((column) => [column.key, column])),
    [preparedColumns],
  );

  const debouncedSearchValue = useDebounce(searchValue, 300);
  const searchTerms = useMemo(
    () => String(debouncedSearchValue || "").toLowerCase().trim().split(/\s+/).filter(Boolean),
    [debouncedSearchValue],
  );

  const activeColumnFilters = useMemo(
    () =>
      Object.entries(columnFilters).filter(([, config]) =>
        Boolean(
          config &&
            ((config.values && config.values.length > 0) ||
              config.min !== "" ||
              config.max !== "" ||
              String(config.query || "").trim() !== ""),
        ),
      ),
    [columnFilters],
  );

  const rowSearchIndex = useMemo(() => {
    if (!searchTerms.length) {
      return null;
    }

    return new Map(
      rows.map((row) => [
        row.id,
        preparedColumns
          .map((column) => toSearchableText(row?.[column.key]))
          .join(" ")
          .toLowerCase(),
      ]),
    );
  }, [preparedColumns, rows, searchTerms.length]);

  const weightKey = useMemo(() => detectWeightKey(preparedColumns), [preparedColumns]);

  const filteredRows = useMemo(() => {
    if (!searchTerms.length && !activeColumnFilters.length && !sortConfig.key) {
      return rows;
    }

    const nextRows = rows.filter((row) => {
      const searchableText = rowSearchIndex?.get(row.id) || "";
      const globalMatch = searchTerms.length === 0 || searchTerms.every((term) => searchableText.includes(term));

      if (!globalMatch) {
        return false;
      }

      return activeColumnFilters.every(([key, config]) => {
        const column = preparedColumnsByKey.get(key);
        if (!column) {
          return true;
        }
        const rawValue = row[key];
        const type = column.detectedType;

        if (type === "number" || type === "date" || type === "datetime") {
          const current = parseValue(rawValue, type);
          const min = config.min !== "" ? parseValue(config.min, type) : -Infinity;
          const max = config.max !== "" ? parseValue(config.max, type) : Infinity;
          return current >= min && current <= max;
        }

        const normalizedItems = Array.isArray(rawValue)
          ? rawValue.map((item) => String(item ?? "").toLowerCase())
          : [String(rawValue ?? "").toLowerCase()];
        const normalizedValue = normalizedItems.join(", ");
        const query = String(config.query ?? "").trim().toLowerCase();
        const matchesQuery = !query || normalizedValue.includes(query);
        const matchesSelection =
          !config.values?.length ||
          normalizedItems.some((item) => config.values.includes(String(item ?? "").toLowerCase())) ||
          (Array.isArray(rawValue)
            ? rawValue.some((item) => config.values.includes(String(item ?? "")))
            : config.values.includes(String(rawValue ?? "")));
        return matchesQuery && matchesSelection;
      });
    });

    if (!sortConfig.key) {
      return nextRows;
    }

    const sortColumn = preparedColumnsByKey.get(sortConfig.key);
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
  }, [activeColumnFilters, preparedColumnsByKey, rowSearchIndex, rows, searchTerms, sortConfig]);

  const actionColumnWidth = useMemo(() => {
    if (!showActions) {
      return "";
    }
    return `${42 + visibleQuickActions.length * 34}px `;
  }, [showActions, visibleQuickActions.length]);

  const gridTemplateColumns = useMemo(
    () => `${showActions ? actionColumnWidth : ""}repeat(${preparedColumns.length}, 160px)`,
    [actionColumnWidth, preparedColumns.length, showActions],
  );

  const footerStats = useMemo(() => {
    const sourceRows = selectedIds.size ? filteredRows.filter((row) => selectedIds.has(row.id)) : filteredRows;
    const weightTotal = weightKey ? sourceRows.reduce((acc, row) => acc + toNumberLoose(row[weightKey]), 0) : 0;

    return preparedColumns.reduce(
      (acc, column) => {
        if (column.detectedType !== "number") {
          return acc;
        }

        if (typeof column.summary === "function") {
          const customSummary = column.summary(sourceRows, {
            toNumberLoose,
            weightKey,
          });
          if (customSummary) {
            acc[column.key] = customSummary;
          }
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

  const hasActiveFilters = useMemo(() => {
    if (searchTerms.length > 0) {
      return true;
    }

    return activeColumnFilters.length > 0;
  }, [activeColumnFilters, searchTerms.length]);

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

  const selectRange = (rowId) => {
    if (!selectionAnchorId) {
      toggleSelection(rowId);
      setSelectionAnchorId(rowId);
      return;
    }

    const anchorIndex = filteredRows.findIndex((item) => item.id === selectionAnchorId);
    const currentIndex = filteredRows.findIndex((item) => item.id === rowId);
    if (anchorIndex === -1 || currentIndex === -1) {
      toggleSelection(rowId);
      setSelectionAnchorId(rowId);
      return;
    }

    const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
    const rangeIds = filteredRows.slice(start, end + 1).map((item) => item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleRowClick = (row, event) => {
    if (event?.shiftKey) {
      selectRange(row.id);
      return;
    }

    if (canRowClick) {
      onRowClick(row);
      return;
    }
    toggleSelection(row.id);
    setSelectionAnchorId(row.id);
  };

  const selectedRows = useMemo(() => filteredRows.filter((row) => selectedIds.has(row.id)), [filteredRows, selectedIds]);

  const handleDeleteSelectedClick = async () => {
    if (!canDeleteSelected || !selectedRows.length || isDeletingSelected) {
      return;
    }

    try {
      setIsDeletingSelected(true);
      await onDeleteSelected(selectedRows);
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <section
      className="bubble-table-shell"
      ref={shellRef}
      style={
        tableHeight
          ? { height: tableHeight, maxHeight: tableHeight }
          : autoTableShellHeight
            ? { height: `${autoTableShellHeight}px`, maxHeight: `${autoTableShellHeight}px` }
            : undefined
      }
    >
      <div className="bubble-toolbar">
        <div className="bubble-toolbar-left">
          {cardTitle ? <div className="bubble-table-card-title">{cardTitle}</div> : null}
          {canCreate ? (
            <button className="bubble-btn bubble-btn-primary" type="button" onClick={onCreate}>
              Novo
            </button>
          ) : null}
          {toolbarActions.map((action) => (
            <button
              key={action.key || action.label}
              className={action.className || "bubble-btn bubble-btn-light"}
              type="button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
          {canDeleteSelected && selectedRows.length ? (
            <button
              className="bubble-btn bubble-btn-danger"
              type="button"
              onClick={handleDeleteSelectedClick}
              disabled={isDeletingSelected}
            >
              {isDeletingSelected ? `Apagando (${selectedRows.length})...` : `Apagar linhas (${selectedRows.length})`}
            </button>
          ) : null}
          {selectedRows.length ? (
            <button
              className="bubble-btn bubble-btn-light"
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setSelectionAnchorId(null);
              }}
            >
              Limpar seleção
            </button>
          ) : null}
        </div>
        <div className="bubble-toolbar-right">
          {showClearButton && hasActiveFilters ? (
            <button
              className="bubble-btn bubble-btn-danger"
              type="button"
              onClick={() => {
                setColumnFilters({});
                setSelectedIds(new Set());
                setSelectionAnchorId(null);
                onClear();
              }}
            >
              Limpar filtros
            </button>
          ) : null}
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

      <div
        className="bubble-table-wrapper custom-scrollbar"
      >
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
                    setTempFilter({
                      values: [...(current.values || [])],
                      min: current.min || "",
                      max: current.max || "",
                      query: current.query || "",
                    });
                    setActivePopover((openKey) => (openKey === column.key ? null : column.key));
                  }}
                  aria-label={`Filtrar coluna ${column.label}`}
                >
                  <span className="bubble-filter-icon">{FILTER_ICON}</span>
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
                      <>
                        <input
                          className="bubble-filter-search"
                          type="text"
                          placeholder="Digite para filtrar"
                          value={tempFilter.query}
                          onChange={(event) => setTempFilter((current) => ({ ...current, query: event.target.value }))}
                        />
                        <div className="bubble-filter-options custom-scrollbar">
                          {getUniqueValues(rows, column.key)
                            .filter((value) => value.toLowerCase().includes(tempFilter.query.trim().toLowerCase()))
                            .map((value) => (
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
                      </>
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
                          const nextFilter = {
                            values: [...(tempFilter.values || [])],
                            min: tempFilter.min || "",
                            max: tempFilter.max || "",
                            query: tempFilter.query || "",
                          };
                          const hasActiveFilter =
                            nextFilter.values.length > 0 ||
                            nextFilter.min !== "" ||
                            nextFilter.max !== "" ||
                            nextFilter.query.trim() !== "";

                          setColumnFilters((current) => {
                            if (!hasActiveFilter) {
                              const next = { ...current };
                              delete next[column.key];
                              return next;
                            }
                            return { ...current, [column.key]: nextFilter };
                          });
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
                onClick={(event) => handleRowClick(row, event)}
                style={{ gridTemplateColumns }}
              >
                  {showActions ? (
                    <div className="bubble-grid-cell bubble-action-col">
                      {visibleQuickActions.map((action) => {
                        const isVisible = typeof action.visible === "function" ? action.visible(row) : true;
                        if (!isVisible) {
                          return null;
                        }
                        return (
                          <button
                            key={action.key || action.label}
                            className={`bubble-mini-action bubble-mini-action-quick ${action.className || ""}`.trim()}
                            type="button"
                            title={action.title || action.label}
                            onClick={(event) => {
                              event.stopPropagation();
                              action.onClick(row);
                              setActionRowId(null);
                            }}
                          >
                            {action.icon || action.label}
                          </button>
                        );
                      })}
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
                        <span>{selectedIds.size ? "Selecionados" : "Total de itens: "}</span>
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
