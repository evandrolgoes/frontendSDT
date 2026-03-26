import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DataTable } from "../components/DataTable";
import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";

const definition = resourceDefinitions.derivativeOperations;
const TRADINGVIEW_REFRESH_MS = resourceDefinitions.tradingviewWatchlistQuotes.autoRefreshIntervalMs || 60000;

const relationResourceLabels = {
  groups: "grupo",
  subgroups: "subgrupo",
};

const parseLocalizedNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  else if (hasComma) normalized = raw.replace(/,/g, ".");
  else if (hasDot) normalized = raw.split(".").length === 2 ? raw : raw.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatBrazilianNumber = (value, digits = 4) =>
  parseLocalizedNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const resolveStrikeFactor = (currencyUnit) => {
  const normalized = String(currencyUnit || "").trim().toLowerCase();
  return normalized.startsWith("c") ? 0.01 : 1;
};

const calculateDerivativeMtm = (row, strikeMtm) => {
  const status = String(row.status_operacao || "").trim().toLowerCase();
  if (status !== "em aberto") {
    return {
      usd: parseLocalizedNumber(row.ajustes_totais_usd),
      brl: parseLocalizedNumber(row.ajustes_totais_brl),
    };
  }

  const operationName = String(row.nome_da_operacao || "");
  const volume = parseLocalizedNumber(row.volume ?? row.volume_fisico);
  const strikeFactor = resolveStrikeFactor(row.moeda_unidade);
  const strikeMontagem = parseLocalizedNumber(row.strike_montagem) * strikeFactor;
  const strikeMercado = parseLocalizedNumber(strikeMtm) * strikeFactor;
  let usd = 0;

  if (operationName.includes("Venda NDF")) usd = (strikeMontagem - strikeMercado) * volume;
  else if (operationName.includes("Compra NDF")) usd = (strikeMercado - strikeMontagem) * volume;
  else if (operationName.includes("Compra Call")) usd = strikeMercado > strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;
  else if (operationName.includes("Compra Put")) usd = strikeMercado < strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("Venda Call")) usd = strikeMercado > strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("Venda Put")) usd = strikeMercado < strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;

  const fx = String(row.volume_financeiro_moeda || "").trim() === "U$" ? parseLocalizedNumber(row.dolar_ptax_vencimento) : 1;
  return { usd, brl: String(row.volume_financeiro_moeda || "").trim() === "U$" ? usd * fx : usd };
};

function useLookupRows(columns, rows) {
  const [lookupCache, setLookupCache] = useState({});
  const resources = useMemo(
    () => [...new Set(columns.filter((column) => column.type === "relation").map((column) => column.resource).filter(Boolean))],
    [columns],
  );

  useEffect(() => {
    let isMounted = true;
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
  }, [lookupCache, resources]);

  return useMemo(
    () =>
      rows.map((row) => {
        const nextRow = { ...row };
        columns.forEach((column) => {
          if (column.type === "relation" && column.resource && row[column.key]) {
            const options = lookupCache[column.resource] || [];
            const option = options.find((item) => item.id === row[column.key]);
            nextRow[column.key] = option?.[column.labelKey || relationResourceLabels[column.resource]] || row[column.key];
          }
        });
        return nextRow;
      }),
    [columns, lookupCache, rows],
  );
}

export function DerivativeOperationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rows, loading, filters, setFilters, error, setError, remove, upsertRows, removeRowsById } = useResourceCrud(definition.resource, { page: 1 });
  const [current, setCurrent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [derivativeQuotes, setDerivativeQuotes] = useState({});
  const [editingDerivativeStrike, setEditingDerivativeStrike] = useState({});
  const [editingDerivativeStrikeInput, setEditingDerivativeStrikeInput] = useState({});
  const requestedOpenId = useMemo(() => {
    const value = new URLSearchParams(location.search).get("open");
    return value ? String(value) : "";
  }, [location.search]);

  const nextDerivativeOperationCode = useMemo(() => {
    const highestNumber = rows.reduce((maxValue, row) => {
      const match = String(row.cod_operacao_mae || "").match(/(\d+)$/);
      return match ? Math.max(maxValue, Number(match[1])) : maxValue;
    }, 0);
    return `DRV-${String(highestNumber + 1).padStart(3, "0")}`;
  }, [rows]);

  useEffect(() => {
    let isMounted = true;

    const loadDerivativeQuotes = async () => {
      try {
        const sourceRows = await resourceService.listTradingviewQuotes({ force: true });
        const nextQuotes = sourceRows.reduce((acc, item) => {
          const key = String(item?.ticker || "").trim();
          if (key) acc[key] = parseLocalizedNumber(item?.price);
          return acc;
        }, {});
        if (isMounted) setDerivativeQuotes(nextQuotes);
      } catch {
        if (isMounted) setDerivativeQuotes({});
      }
    };

    loadDerivativeQuotes();
    const intervalId = window.setInterval(loadDerivativeQuotes, TRADINGVIEW_REFRESH_MS);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        loadDerivativeQuotes();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isModalOpen || !current?.id) {
      setAttachments([]);
      return () => {
        isMounted = false;
      };
    }

    resourceService.listAttachments(definition.resource, current.id).then((items) => {
      if (isMounted) setAttachments(items);
    });

    return () => {
      isMounted = false;
    };
  }, [current?.id, isModalOpen]);

  const normalizedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
      siblingRows: rows
        .filter((candidate) => candidate.cod_operacao_mae === row.cod_operacao_mae)
        .sort((left, right) => (left.ordem || 0) - (right.ordem || 0) || left.id - right.id),
      strike_liquid_mtm:
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (derivativeQuotes[row.contrato_derivativo] ?? 0),
      ajustes_mtm: calculateDerivativeMtm(
        row,
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (derivativeQuotes[row.contrato_derivativo] ?? 0),
      ).usd,
      ajustes_mtm_brl: calculateDerivativeMtm(
        row,
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (derivativeQuotes[row.contrato_derivativo] ?? 0),
      ).brl,
    })),
    [rows, derivativeQuotes, editingDerivativeStrike],
  );

  const columns = useMemo(
    () => [
      { key: "grupo", label: "Grupo", type: "relation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupo", label: "Subgrupo", type: "relation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "cultura", label: "Ativo" },
      { key: "safra", label: "Safra" },
      { key: "cod_operacao_mae", label: "Cod operacao mae" },
      { key: "nome_da_operacao", label: "Operacao" },
      { key: "status_operacao", label: "Status" },
      { key: "bolsa_ref", label: "Bolsa" },
      { key: "contrato_derivativo", label: "Contrato bolsa" },
      { key: "data_contratacao", label: "Data contratacao", type: "date" },
      { key: "tipo_derivativo", label: "Tipo derivativo" },
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
                setEditingDerivativeStrikeInput((currentState) => ({
                  ...currentState,
                  [row.id]: formatBrazilianNumber(value, 4),
                }));
              }}
              onChange={(event) => {
                const raw = event.target.value;
                setEditingDerivativeStrikeInput((currentState) => ({
                  ...currentState,
                  [row.id]: raw,
                }));
                setEditingDerivativeStrike((currentState) => ({
                  ...currentState,
                  [row.id]: parseLocalizedNumber(raw),
                }));
              }}
              onBlur={async () => {
                const strikeValue =
                  editingDerivativeStrike[row.id] ??
                  parseLocalizedNumber(editingDerivativeStrikeInput[row.id]) ??
                  parseLocalizedNumber(value);
                setEditingDerivativeStrike((currentState) => {
                  const nextState = {
                    ...currentState,
                    [row.id]: strikeValue,
                  };
                  return nextState;
                });
                setEditingDerivativeStrikeInput((currentState) => {
                  const nextState = { ...currentState };
                  delete nextState[row.id];
                  return nextState;
                });
              }}
            />
          ) : (
            formatBrazilianNumber(value, 4)
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
      { key: "id", label: "ID" },
    ],
    [editingDerivativeStrike, editingDerivativeStrikeInput],
  );

  const displayRows = useLookupRows(columns, normalizedRows);

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrent(null);
    setAttachments([]);
    setError("");
    if (requestedOpenId) {
      navigate(location.pathname, { replace: true });
    }
  };

  useEffect(() => {
    if (!requestedOpenId || loading) {
      return;
    }
    if (isModalOpen && String(current?.id || "") === requestedOpenId) {
      return;
    }

    const match = normalizedRows.find((item) => String(item?.id || "") === requestedOpenId);
    if (!match) {
      return;
    }

    setCurrent(match);
    setError("");
    setIsModalOpen(true);
  }, [current?.id, isModalOpen, loading, normalizedRows, requestedOpenId]);

  const handleDeleteSelected = async (items) => {
    if (!Array.isArray(items) || !items.length) {
      return;
    }
    const confirmed = window.confirm(`Excluir ${items.length} linha(s) de ${definition.title}?`);
    if (!confirmed) {
      return;
    }
    try {
      for (const item of items) {
        await resourceService.remove(definition.resource, item.id);
      }
      removeRowsById(items.map((item) => item.id));
    } catch {
      setError("Nao foi possivel excluir as linhas selecionadas.");
    }
  };

  return (
    <div className="resource-page">
      <PageHeader title={definition.title} description={definition.description} />
      <DataTable
        columns={columns}
        rows={displayRows}
        searchValue={filters.search || ""}
        searchPlaceholder={definition.searchPlaceholder || "Buscar..."}
        onSearchChange={(value) => setFilters((currentFilters) => ({ ...currentFilters, search: value, page: 1 }))}
        onCreate={() => {
          setCurrent({ cod_operacao_mae: nextDerivativeOperationCode, status_operacao: "Em aberto", siblingRows: [] });
          setError("");
          setIsModalOpen(true);
        }}
        onClear={() => setFilters({ page: 1, search: "" })}
        onEdit={(item) => {
          const rawItem = normalizedRows.find((row) => row.id === item.id) || item;
          setCurrent(rawItem);
          setError("");
          setIsModalOpen(true);
        }}
        onDuplicate={(item) => {
          const rawItem = normalizedRows.find((row) => row.id === item.id) || item;
          const { id, ...copy } = rawItem;
          const nextCode = nextDerivativeOperationCode;
          setCurrent({
            ...copy,
            id: undefined,
            cod_operacao_mae: nextCode,
            siblingRows: [
              {
                ...copy,
                id: undefined,
                cod_operacao_mae: nextCode,
              },
            ],
          });
          setError("");
          setIsModalOpen(true);
        }}
        onDelete={
          user?.is_superuser
            ? async (item) => {
                if (!window.confirm(`Excluir este registro de ${definition.title}?`)) return;
                await remove(item);
              }
            : undefined
        }
        onDeleteSelected={user?.is_superuser ? handleDeleteSelected : undefined}
        selectedId={current?.id}
        getRowClassName={(row) => (String(row.status_operacao || "").trim().toLowerCase() === "encerrado" ? "bubble-row-encerrado" : "")}
      />

      {isModalOpen ? (
        <DerivativeOperationForm
          title={current ? `Editar ${definition.title}` : `Novo ${definition.title}`}
          initialValues={current || {}}
          existingAttachments={attachments}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (current?.id) {
              const items = await resourceService.listAttachments(definition.resource, current.id);
              setAttachments(items);
            }
          }}
          error={error}
          onClose={closeModal}
          onSubmit={async (payload, rawValues) => {
            const files = Array.isArray(rawValues.attachments) ? rawValues.attachments : [];
            const siblingRows = Array.isArray(current?.siblingRows) ? current.siblingRows : [];
            const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "attachments" && key !== "itens"));
            const itemPayloads = Array.isArray(payload.itens) ? payload.itens : [];
            let primaryRecord = null;
            const savedRows = [];
            const removedIds = [];

            if (current?.id) {
              const existingRows = siblingRows.length ? siblingRows : rows.filter((row) => row.cod_operacao_mae === current.cod_operacao_mae);
              const keepIds = [];

              for (let index = 0; index < itemPayloads.length; index += 1) {
                const itemPayload = itemPayloads[index];
                const existingRow = existingRows[index];
                const rowPayload = {
                  ...cleanPayload,
                  grupo_montagem: itemPayload.grupo_montagem || "",
                  tipo_derivativo: itemPayload.tipo_derivativo || "",
                  numero_lotes: itemPayload.numero_lotes,
                  strike_montagem: itemPayload.strike_montagem,
                  custo_total_montagem_brl: itemPayload.custo_total_montagem_brl,
                  strike_liquidacao: itemPayload.strike_liquidacao,
                  ajustes_totais_brl: itemPayload.ajustes_totais_brl,
                  ajustes_totais_usd: itemPayload.ajustes_totais_usd,
                  ordem: index + 1,
                  volume: itemPayload.volume,
                  volume_financeiro_valor_moeda_original: itemPayload.volume_financeiro_valor_moeda_original,
                };

                if (existingRow?.id) {
                  const updated = await resourceService.update(definition.resource, existingRow.id, rowPayload);
                  savedRows.push(updated);
                  keepIds.push(updated.id);
                  if (!primaryRecord || updated.id === current.id) primaryRecord = updated;
                } else {
                  const created = await resourceService.create(definition.resource, rowPayload);
                  savedRows.push(created);
                  keepIds.push(created.id);
                  if (!primaryRecord) primaryRecord = created;
                }
              }

              const removableRows = existingRows.filter((row) => !keepIds.includes(row.id));
              for (const removableRow of removableRows) {
                await resourceService.remove(definition.resource, removableRow.id);
                removedIds.push(removableRow.id);
              }
            } else {
              for (let index = 0; index < itemPayloads.length; index += 1) {
                const itemPayload = itemPayloads[index];
                const created = await resourceService.create(definition.resource, {
                  ...cleanPayload,
                  grupo_montagem: itemPayload.grupo_montagem || "",
                  tipo_derivativo: itemPayload.tipo_derivativo || "",
                  numero_lotes: itemPayload.numero_lotes,
                  strike_montagem: itemPayload.strike_montagem,
                  custo_total_montagem_brl: itemPayload.custo_total_montagem_brl,
                  strike_liquidacao: itemPayload.strike_liquidacao,
                  ajustes_totais_brl: itemPayload.ajustes_totais_brl,
                  ajustes_totais_usd: itemPayload.ajustes_totais_usd,
                  ordem: index + 1,
                  volume: itemPayload.volume,
                  volume_financeiro_valor_moeda_original: itemPayload.volume_financeiro_valor_moeda_original,
                });
                savedRows.push(created);
                if (!primaryRecord) primaryRecord = created;
              }
            }
            if (savedRows.length) {
              upsertRows(savedRows);
            }
            if (removedIds.length) {
              removeRowsById(removedIds);
            }

            if (primaryRecord) {
              if (files.length) {
                await resourceService.uploadAttachments(definition.resource, primaryRecord.id, files);
              }
              closeModal();
            }
          }}
        />
      ) : null}
    </div>
  );
}
