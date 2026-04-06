import { useEffect, useMemo, useState } from "react";

import { DataTable } from "./DataTable";
import { resourceService } from "../services/resourceService";
import { parseBrazilianDate } from "../utils/date";
import { formatBrazilianNumber, normalizeLookupValue, parseLocalizedNumber } from "../utils/formatters";

const TRADINGVIEW_REFRESH_MS = 60000;

const relationResourceLabels = {
  groups: "grupo",
  subgroups: "subgrupo",
  crops: "ativo",
  seasons: "safra",
  counterparties: "contraparte",
  strategies: "descricao_estrategia",
};

const resolveRelationLikeLabel = (value, preferredKey = "") => {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => resolveRelationLikeLabel(item, preferredKey))
      .filter((item) => item !== null && item !== undefined && item !== "")
      .join(", ");
  }

  if (typeof value === "object") {
    const candidates = [
      preferredKey,
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
    ].filter(Boolean);

    for (const key of candidates) {
      const candidateValue = value?.[key];
      if (candidateValue !== null && candidateValue !== undefined && candidateValue !== "") {
        return candidateValue;
      }
    }

    if ("id" in value) {
      return value.id;
    }
  }

  return value;
};

const normalizeOperationText = (value) => String(value || "").trim().toLowerCase();

const resolveDerivativeOperationName = (row) => {
  const explicitName = String(row.nome_da_operacao || "").trim();
  if (explicitName) {
    return explicitName;
  }

  const position = String(row.posicao || "").trim();
  const derivativeType = String(row.tipo_derivativo || "").trim();
  return `${position} ${derivativeType}`.trim();
};

const resolveDerivativeVolume = (row) => {
  const mode = normalizeOperationText(row.moeda_ou_cmdtye);
  if (mode === "moeda") {
    return parseLocalizedNumber(
      row.volume_financeiro_valor_moeda_original ?? row.volume_financeiro_valor,
    );
  }

  return parseLocalizedNumber(row.volume ?? row.volume_fisico_valor ?? row.volume_fisico);
};

const resolveUsdBrlQuote = (quotesByTicker = {}) => {
  const directValue = parseLocalizedNumber(quotesByTicker.USDBRL);
  if (directValue > 0) {
    return directValue;
  }

  const matchingKey = Object.keys(quotesByTicker).find(
    (key) => normalizeOperationText(key).replace(/[^a-z0-9]/g, "") === "usdbrl",
  );
  return matchingKey ? parseLocalizedNumber(quotesByTicker[matchingKey]) : 0;
};

const calculateDerivativeMtm = (row, strikeMtm, openUsdBrlQuote = 0) => {
  const status = String(row.status_operacao || "").trim().toLowerCase();
  if (status !== "em aberto") {
    return {
      usd: parseLocalizedNumber(row.ajustes_totais_usd),
      brl: parseLocalizedNumber(row.ajustes_totais_brl),
    };
  }

  const operationName = resolveDerivativeOperationName(row);
  const normalizedOperationName = normalizeOperationText(operationName);
  const volume = resolveDerivativeVolume(row);
  const strikeUnit = String((row.moeda_unidade ?? row.strike_moeda_unidade) || "").trim().toLowerCase();
  const strikeFactor = strikeUnit.startsWith("c") ? 0.01 : 1;
  const strikeMontagem = parseLocalizedNumber(row.strike_montagem) * strikeFactor;
  const strikeMercado = parseLocalizedNumber(strikeMtm) * strikeFactor;
  let usd = 0;

  if (normalizedOperationName.includes("venda ndf")) usd = (strikeMontagem - strikeMercado) * volume;
  else if (normalizedOperationName.includes("compra ndf")) usd = (strikeMercado - strikeMontagem) * volume;
  else if (normalizedOperationName.includes("compra call")) usd = strikeMercado > strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;
  else if (normalizedOperationName.includes("compra put")) usd = strikeMercado < strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (normalizedOperationName.includes("venda call")) usd = strikeMercado > strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (normalizedOperationName.includes("venda put")) usd = strikeMercado < strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;

  const isUsdOperation = String(row.volume_financeiro_moeda || "").trim() === "U$";
  const fx = isUsdOperation ? (openUsdBrlQuote || parseLocalizedNumber(row.dolar_ptax_vencimento)) : 1;
  const brl = String(row.volume_financeiro_moeda || "").trim() === "U$" ? usd * fx : usd;

  return { usd, brl };
};

const toLocalIsoDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isDerivativeOverdue = (row) => {
  const settlementDate = parseBrazilianDate(row?.data_liquidacao, "");
  const status = String(row?.status_operacao || "").trim().toLowerCase();

  if (!settlementDate || status === "encerrado") {
    return false;
  }

  return settlementDate <= toLocalIsoDate();
};

const buildTableColumns = (definition) => {
  const existingColumns = (definition.columns || []).filter((column) => column.key !== "id");
  const fields = definition.fields || [];
  const existingKeys = new Set(existingColumns.map((column) => column.key));

  const fieldColumns = fields
    .filter((field) => !existingKeys.has(field.name))
    .map((field) => ({
      key: field.name,
      label: field.label,
      type: field.type,
      resource: field.resource,
      labelKey: field.labelKey,
    }));

  return [...existingColumns, ...fieldColumns, { key: "id", label: "ID" }];
};

const reorderColumns = (columns, orderedKeys = [], trailingKeys = []) => {
  const orderedSet = new Set(orderedKeys);
  const trailingSet = new Set(trailingKeys);
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));

  const leadingColumns = orderedKeys.map((key) => columnsByKey.get(key)).filter(Boolean);
  const middleColumns = columns.filter((column) => !orderedSet.has(column.key) && !trailingSet.has(column.key));
  const tailColumns = trailingKeys.map((key) => columnsByKey.get(key)).filter(Boolean);

  return [...leadingColumns, ...middleColumns, ...tailColumns];
};

const prioritizePrimaryDateColumns = (columns) => {
  const availableKeys = new Set(columns.map((column) => column.key));
  const primaryDateKey = ["data_negociacao", "data_contratacao"].find((key) => availableKeys.has(key));
  const secondaryDateKeys = ["data_vencimento", "data_liquidacao", "data_pagamento"].filter((key) => availableKeys.has(key));
  const orderedKeys = [
    ...(primaryDateKey ? [primaryDateKey] : []),
    ...secondaryDateKeys,
  ].filter((key, index, items) => items.indexOf(key) === index);

  if (!orderedKeys.length) {
    return columns;
  }

  return reorderColumns(columns, orderedKeys);
};

const useLookupRows = (columns, rows) => {
  const [lookupCache, setLookupCache] = useState({});

  useEffect(() => {
    let isMounted = true;
    const relationColumns = columns.filter((column) => column.type === "relation" || column.type === "multirelation");
    const resources = [...new Set(relationColumns.map((column) => column.resource).filter(Boolean))];
    const missingResources = resources.filter((resource) => !lookupCache[resource]);

    if (!missingResources.length) {
      return () => {
        isMounted = false;
      };
    }

    Promise.all(
      missingResources.map(async (resource) => {
        const items = await resourceService.listAll(resource);
        return [resource, items];
      }),
    ).then((entries) => {
      if (isMounted && entries.length) {
        setLookupCache((current) => ({ ...current, ...Object.fromEntries(entries) }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [columns, lookupCache]);

  const lookupIndex = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(lookupCache).map(([resource, items]) => [resource, new Map((items || []).map((item) => [item.id, item]))]),
      ),
    [lookupCache],
  );

  return useMemo(
    () =>
      rows.map((row) => {
        const nextRow = { ...row };
        columns.forEach((column) => {
          if (column.type === "relation" && column.resource && row[column.key]) {
            const rawValue = row[column.key];
            const preferredKey = column.labelKey || relationResourceLabels[column.resource];
            const relationId = typeof rawValue === "object" ? rawValue?.id : rawValue;
            const option = lookupIndex[column.resource]?.get(relationId);
            nextRow[column.key] = option?.[preferredKey] || resolveRelationLikeLabel(rawValue, preferredKey);
          }
          if (column.type === "multirelation" && column.resource && Array.isArray(row[column.key])) {
            const preferredKey = column.labelKey || relationResourceLabels[column.resource];
            nextRow[column.key] = row[column.key].map((itemValue) => {
              const relationId = typeof itemValue === "object" ? itemValue?.id : itemValue;
              const option = lookupIndex[column.resource]?.get(relationId);
              return option?.[preferredKey] || resolveRelationLikeLabel(itemValue, preferredKey);
            });
          }
        });

        if (
          (nextRow.grupo === row.grupo || nextRow.grupo === null || nextRow.grupo === undefined || /^\d+$/.test(String(nextRow.grupo)))
          && row.subgrupo
        ) {
          const subgroupId = typeof row.subgrupo === "object" ? row.subgrupo?.id : row.subgrupo;
          const subgroupOption = lookupIndex.subgroups?.get(subgroupId);
          const inferredGroupLabel =
            subgroupOption?.grupo_name
            || resolveRelationLikeLabel(subgroupOption?.grupo, "grupo")
            || resolveRelationLikeLabel(subgroupOption, "grupo_name");
          if (inferredGroupLabel) {
            nextRow.grupo = inferredGroupLabel;
          }
        }

        return nextRow;
      }),
    [columns, lookupIndex, rows],
  );
};

export function usePreparedResourceTable(definition, rows) {
  const [derivativeQuotes, setDerivativeQuotes] = useState({});
  const [editingDerivativeStrike, setEditingDerivativeStrike] = useState({});
  const [editingDerivativeStrikeInput, setEditingDerivativeStrikeInput] = useState({});
  const tableColumns = useMemo(() => buildTableColumns(definition), [definition]);

  useEffect(() => {
    setDerivativeQuotes({});
    setEditingDerivativeStrike({});
    setEditingDerivativeStrikeInput({});
  }, [definition.resource]);

  useEffect(() => {
    let isMounted = true;
    let idleRequestId = null;
    let fallbackTimeoutId = null;

    const loadDerivativeQuotes = async (force = false) => {
      if (definition.customForm !== "derivative-operation") {
        return;
      }

      try {
        const sourceRows = await resourceService.listTradingviewQuotes(force ? { force: true } : {});
        const nextQuotes = sourceRows.reduce((acc, item) => {
          const key = String(item?.ticker || "").trim();
          if (key) {
            acc[key] = parseLocalizedNumber(item?.price);
          }
          return acc;
        }, {});
        if (isMounted) {
          setDerivativeQuotes(nextQuotes);
        }
      } catch {
        if (isMounted) {
          setDerivativeQuotes({});
        }
      }
    };

    const scheduleInitialDerivativeLoad = () => {
      if (typeof window === "undefined") {
        return;
      }

      if (typeof window.requestIdleCallback === "function") {
        idleRequestId = window.requestIdleCallback(() => {
          idleRequestId = null;
          loadDerivativeQuotes();
        });
        return;
      }

      fallbackTimeoutId = window.setTimeout(() => {
        fallbackTimeoutId = null;
        loadDerivativeQuotes();
      }, 0);
    };

    scheduleInitialDerivativeLoad();
    const intervalId = window.setInterval(() => loadDerivativeQuotes(true), TRADINGVIEW_REFRESH_MS);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        loadDerivativeQuotes(true);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      if (idleRequestId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleRequestId);
      }
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [definition.customForm]);

  const derivativeSiblingRowsByCode = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return new Map();
    }

    const groupedRows = new Map();
    rows.forEach((row) => {
      const code = row.cod_operacao_mae ?? "";
      if (!groupedRows.has(code)) {
        groupedRows.set(code, []);
      }
      groupedRows.get(code).push(row);
    });

    groupedRows.forEach((items) => {
      items.sort((left, right) => (left.ordem || 0) - (right.ordem || 0) || left.id - right.id);
    });

    return groupedRows;
  }, [definition.customForm, rows]);

  const derivativeRowIdsByContract = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return new Map();
    }

    const groupedRows = new Map();
    rows.forEach((row) => {
      const contractKey = String(row.contrato_derivativo || "").trim();
      if (!contractKey) {
        return;
      }

      if (!groupedRows.has(contractKey)) {
        groupedRows.set(contractKey, []);
      }
      groupedRows.get(contractKey).push(row.id);
    });

    return groupedRows;
  }, [definition.customForm, rows]);

  const normalizedRows = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return rows;
    }
    const openUsdBrlQuote = resolveUsdBrlQuote(derivativeQuotes);
    return rows.map((row) => {
      const strikeLiquidMtm =
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (derivativeQuotes[row.contrato_derivativo] ?? 0);
      const mtm = calculateDerivativeMtm(row, strikeLiquidMtm, openUsdBrlQuote);
      const siblingRows = derivativeSiblingRowsByCode.get(row.cod_operacao_mae ?? "") || [row];

      return {
        ...row,
        volume: row.volume ?? row.volume_fisico_valor,
        unidade: row.unidade ?? row.volume_fisico_unidade,
        moeda_unidade: row.moeda_unidade ?? row.strike_moeda_unidade,
        volume_financeiro_valor_moeda_original: row.volume_financeiro_valor_moeda_original ?? row.volume_financeiro_valor,
        siblingRows,
        quantidade_derivativos: siblingRows.length,
        strike_liquid_mtm: strikeLiquidMtm,
        ajustes_mtm: mtm.usd,
        ajustes_mtm_brl: mtm.brl,
      };
    });
  }, [definition.customForm, derivativeQuotes, derivativeSiblingRowsByCode, editingDerivativeStrike, rows]);

  const effectiveTableColumns = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      if (definition.resource === "physical-sales") {
        const physicalSalesColumns = tableColumns
          .filter((column) => column.key !== "id")
          .filter((column) => column.key !== "moeda_unidade")
          .map((column) =>
            column.key === "cultura_produto"
              ? {
                  key: "cultura",
                  label: column.label,
                  type: "relation",
                  resource: "crops",
                  labelKey: "ativo",
                  render: (value, row) => value || row.cultura_produto || "—",
                }
              : column.key === "preco"
                ? {
                  ...column,
                  render: (value, row) => `${formatBrazilianNumber(value, 4)}${row.moeda_unidade ? ` ${row.moeda_unidade}` : ""}`,
                }
                : column,
          );
        return prioritizePrimaryDateColumns(
          reorderColumns(
            physicalSalesColumns,
            ["cultura", "volume_fisico", "preco", "safra"],
            ["grupo", "subgrupo"],
          ),
        );
      }
      if (definition.resource === "physical-payments") {
        const physicalPaymentColumns = tableColumns
          .filter((column) => column.key !== "id")
          .filter((column) => column.key !== "unidade")
          .map((column) =>
            column.key === "volume"
              ? {
                  ...column,
                  render: (value, row) => `${formatBrazilianNumber(value, 4)}${row.unidade ? ` ${row.unidade}` : ""}`,
                }
              : column,
          );
        return prioritizePrimaryDateColumns(
          reorderColumns(
            physicalPaymentColumns,
            ["fazer_frente_com", "volume", "classificacao", "data_pagamento"],
            ["grupo", "subgrupo"],
          ),
        );
      }
      if (definition.resource === "cash-payments") {
        const cashPaymentColumns = tableColumns
          .filter((column) => column.key !== "id")
          .filter((column) => !["contraparte", "fazer_frente_com", "safra"].includes(column.key))
          .map((column) =>
            column.key === "valor"
              ? {
                  ...column,
                  render: (value, row) => `${formatBrazilianNumber(value, 2)}${row.moeda ? ` ${row.moeda}` : ""}`,
                }
              : column,
          );
        return prioritizePrimaryDateColumns(
          reorderColumns(
            cashPaymentColumns,
            ["descricao", "valor", "data_vencimento", "data_pagamento", "contraparte_texto"],
            ["grupo", "subgrupo"],
          ),
        );
      }
      return prioritizePrimaryDateColumns(tableColumns);
    }

    return prioritizePrimaryDateColumns([
      { key: "nome_da_operacao", label: "Operacao" },
      { key: "bolsa_ref", label: "Bolsa" },
      { key: "contrato_derivativo", label: "Contrato bolsa" },
      {
        key: "volume",
        label: "Volume",
        type: "number",
        render: (value, row) => `${formatBrazilianNumber(value, 0)}${row.unidade ? ` ${row.unidade}` : ""}`,
      },
      {
        key: "strike_montagem",
        label: "Strike montagem",
        type: "number",
        render: (value, row) => `${formatBrazilianNumber(value, 4)}${row.moeda_unidade ? ` ${row.moeda_unidade}` : ""}`,
      },
      {
        key: "strike_liquid_mtm",
        label: "Strike liquid (MTM)",
        type: "number",
        render: (value, row) =>
          String(row.status_operacao || "").trim().toLowerCase() === "em aberto" ? (
            <input
              className="bubble-cell-input"
              inputMode="decimal"
              value={
                editingDerivativeStrikeInput[row.id] !== undefined
                  ? editingDerivativeStrikeInput[row.id]
                  : formatBrazilianNumber(value, 4)
              }
              onClick={(event) => event.stopPropagation()}
              onFocus={() => {
                const contractRowIds = derivativeRowIdsByContract.get(String(row.contrato_derivativo || "").trim()) || [row.id];
                const formattedValue = formatBrazilianNumber(value, 4);
                setEditingDerivativeStrikeInput((currentState) => {
                  const nextState = { ...currentState };
                  contractRowIds.forEach((rowId) => {
                    nextState[rowId] = formattedValue;
                  });
                  return nextState;
                });
              }}
              onChange={(event) => {
                const raw = event.target.value;
                const parsedValue = parseLocalizedNumber(raw);
                const contractRowIds = derivativeRowIdsByContract.get(String(row.contrato_derivativo || "").trim()) || [row.id];
                setEditingDerivativeStrikeInput((currentState) => {
                  const nextState = { ...currentState };
                  contractRowIds.forEach((rowId) => {
                    nextState[rowId] = raw;
                  });
                  return nextState;
                });
                setEditingDerivativeStrike((currentState) => {
                  const nextState = { ...currentState };
                  contractRowIds.forEach((rowId) => {
                    nextState[rowId] = parsedValue;
                  });
                  return nextState;
                });
              }}
              onBlur={() => {
                const strikeValue =
                  editingDerivativeStrike[row.id] ??
                  parseLocalizedNumber(editingDerivativeStrikeInput[row.id]) ??
                  parseLocalizedNumber(value);
                const contractRowIds = derivativeRowIdsByContract.get(String(row.contrato_derivativo || "").trim()) || [row.id];
                setEditingDerivativeStrike((currentState) => {
                  const nextState = { ...currentState };
                  contractRowIds.forEach((rowId) => {
                    nextState[rowId] = strikeValue;
                  });
                  return nextState;
                });
                setEditingDerivativeStrikeInput((currentState) => {
                  const nextState = { ...currentState };
                  contractRowIds.forEach((rowId) => {
                    delete nextState[rowId];
                  });
                  return nextState;
                });
              }}
            />
          ) : (
            formatBrazilianNumber(row.strike_liquidacao, 4)
          ),
      },
      {
        key: "ajustes_mtm",
        label: "Ajustes MTM",
        type: "number",
        render: (value, row) => `${formatBrazilianNumber(value, 0)}${row.volume_financeiro_moeda ? ` ${row.volume_financeiro_moeda}` : ""}`,
      },
      {
        key: "ajustes_mtm_brl",
        label: "Ajustes MTM R$",
        type: "number",
        render: (value) => formatBrazilianNumber(value, 0),
      },
      { key: "ativo", label: "Ativo", type: "relation", resource: "crops", labelKey: "ativo" },
      { key: "safra", label: "Safra", type: "relation", resource: "seasons", labelKey: "safra" },
      { key: "cod_operacao_mae", label: "Cod operacao mae" },
      { key: "status_operacao", label: "Status" },
      { key: "data_contratacao", label: "Data contratacao", type: "date" },
      { key: "data_liquidacao", label: "Data liquidacao", type: "date" },
      { key: "tipo_derivativo", label: "Tipo derivativo" },
      { key: "grupo", label: "Grupo", type: "relation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupo", label: "Subgrupo", type: "relation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "id", label: "ID" },
    ]);
  }, [
    definition.customForm,
    definition.resource,
    derivativeRowIdsByContract,
    editingDerivativeStrike,
    editingDerivativeStrikeInput,
    tableColumns,
  ]);

  const displayRows = useLookupRows(effectiveTableColumns, normalizedRows);
  const getRowClassName =
    definition.customForm === "derivative-operation"
      ? (row) => {
          if (isDerivativeOverdue(row)) {
            return "bubble-row-vencido";
          }
          return String(row.status_operacao || "").trim().toLowerCase() === "encerrado" ? "bubble-row-encerrado" : "";
        }
      : undefined;

  return { normalizedRows, effectiveTableColumns, displayRows, getRowClassName };
}

export function ResourceTable({
  definition,
  rows,
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
  rowQuickActions = [],
  toolbarActions = [],
  showClearButton = true,
  tableHeight = null,
}) {
  const { effectiveTableColumns, displayRows, getRowClassName } = usePreparedResourceTable(definition, rows);

  return (
    <DataTable
      columns={effectiveTableColumns}
      rows={displayRows}
      cardTitle={cardTitle}
      searchValue={searchValue}
      searchPlaceholder={searchPlaceholder}
      onSearchChange={onSearchChange}
      onCreate={onCreate}
      onClear={onClear}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onDeleteSelected={onDeleteSelected}
      onRowClick={onRowClick}
      selectedId={selectedId}
      rowQuickActions={rowQuickActions}
      toolbarActions={toolbarActions}
      showClearButton={showClearButton}
      tableHeight={tableHeight}
      getRowClassName={getRowClassName}
    />
  );
}
