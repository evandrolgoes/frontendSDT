import { useEffect, useMemo, useState } from "react";

import { DataTable } from "../components/DataTable";
import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { ResourceForm } from "../components/ResourceForm";
import { useAuth } from "../contexts/AuthContext";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { api } from "../services/api";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate } from "../utils/date";

const relationResourceLabels = {
  groups: "grupo",
  subgroups: "subgrupo",
  crops: "cultura",
  seasons: "safra",
  counterparties: "obs",
  strategies: "descricao_estrategia",
};

const formatTenantUsageMetric = (currentValue, maxValue) => {
  const current = Number(currentValue || 0);
  const limit = maxValue === null || maxValue === undefined || maxValue === "" ? null : Number(maxValue);
  const unlimited = limit === null || Number.isNaN(limit);

  if (unlimited) {
    return {
      current,
      limitLabel: "Sem limite",
      ratioLabel: "Livre",
      tone: "healthy",
    };
  }

  const ratio = limit > 0 ? current / limit : 0;
  const ratioPercent = Math.round(ratio * 100);

  return {
    current,
    limitLabel: `${limit}`,
    ratioLabel: `${ratioPercent}% usado`,
    tone: ratio >= 1 ? "critical" : ratio >= 0.8 ? "warning" : "healthy",
  };
};

const normalizeDerivativeLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("/", "");

const parseLocalizedNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) {
    return 0;
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
    normalized = parts.length === 2 ? raw : raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatBrazilianNumber = (value, digits = 4) =>
  parseLocalizedNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

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
  const strikeMontagem = parseLocalizedNumber(row.strike_montagem);
  const strikeMercado = parseLocalizedNumber(strikeMtm);
  let usd = 0;

  if (operationName.includes("Venda NDF")) usd = (strikeMontagem - strikeMercado) * volume;
  else if (operationName.includes("Compra NDF")) usd = (strikeMercado - strikeMontagem) * volume;
  else if (operationName.includes("Compra Call")) usd = strikeMercado > strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;
  else if (operationName.includes("Compra Put")) usd = strikeMercado < strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("Venda Call")) usd = strikeMercado > strikeMontagem ? (strikeMontagem - strikeMercado) * volume : 0;
  else if (operationName.includes("Venda Put")) usd = strikeMercado < strikeMontagem ? (strikeMercado - strikeMontagem) * volume : 0;

  const fx = String(row.volume_financeiro_moeda || "").trim() === "U$" ? parseLocalizedNumber(row.dolar_ptax_vencimento) : 1;
  const brl = String(row.volume_financeiro_moeda || "").trim() === "U$" ? usd * fx : usd;

  return { usd, brl };
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

const useLookupRows = (columns, rows) => {
  const [lookupCache, setLookupCache] = useState({});

  useEffect(() => {
    let isMounted = true;
    const relationColumns = columns.filter((column) => column.type === "relation" || column.type === "multirelation");
    const resources = [...new Set(relationColumns.map((column) => column.resource).filter(Boolean))];

    Promise.all(
      resources.map(async (resource) => {
        if (lookupCache[resource]) {
          return [resource, lookupCache[resource]];
        }
        const items = await resourceService.listAll(resource);
        return [resource, items];
      }),
    ).then((entries) => {
      if (isMounted) {
        setLookupCache((current) => ({ ...current, ...Object.fromEntries(entries) }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [columns]);

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
          if (column.type === "multirelation" && column.resource && Array.isArray(row[column.key])) {
            const options = lookupCache[column.resource] || [];
            nextRow[column.key] = row[column.key].map((itemId) => {
              const option = options.find((item) => item.id === itemId);
              return option?.[column.labelKey || relationResourceLabels[column.resource]] || itemId;
            });
          }
        });
        return nextRow;
      }),
    [columns, lookupCache, rows],
  );
};

export function ResourcePage({ definition }) {
  const { user, impersonate } = useAuth();
  const { rows, loading, load, save, remove, filters, setFilters, error, setError } = useResourceCrud(definition.resource, {
    page: 1,
  });
  const [current, setCurrent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [derivativeQuotes, setDerivativeQuotes] = useState({});
  const [editingDerivativeStrike, setEditingDerivativeStrike] = useState({});
  const tableColumns = useMemo(() => buildTableColumns(definition), [definition]);
  const nextDerivativeOperationCode = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return "";
    }

    const highestNumber = rows.reduce((maxValue, row) => {
      const match = String(row.cod_operacao_mae || "").match(/(\d+)$/);
      if (!match) {
        return maxValue;
      }
      return Math.max(maxValue, Number(match[1]));
    }, 0);

    return `DRV-${String(highestNumber + 1).padStart(3, "0")}`;
  }, [definition.customForm, rows]);

  useEffect(() => {
    setCurrent(null);
    setIsModalOpen(false);
    setDetailItem(null);
    setAttachments([]);
    setDerivativeQuotes({});
    setEditingDerivativeStrike({});
    setError("");
  }, [definition.resource, setError]);

  useEffect(() => {
    let isMounted = true;

    const loadDerivativeQuotes = async () => {
      if (definition.customForm !== "derivative-operation") {
        return;
      }

      try {
        const payload = await resourceService.fetchJsonCached(
          "sheety-cotacoes-spot",
          "https://api.sheety.co/90083751cf0794f44c9730c96a94cedf/apiCotacoesSpotGetBubble/planilha1",
        );
        const sourceRows = Array.isArray(payload?.planilha1) ? payload.planilha1 : Array.isArray(payload) ? payload : [];
        const nextQuotes = sourceRows.reduce((acc, item) => {
          const key = String(item?.ctrbolsa || "").trim();
          if (key) {
            acc[key] = parseLocalizedNumber(item?.cotacao);
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

    loadDerivativeQuotes();

    return () => {
      isMounted = false;
    };
  }, [definition.customForm]);

  const normalizedRows = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return rows;
    }
    return rows.map((row) => ({
      ...row,
      siblingRows: rows
        .filter((candidate) => candidate.cod_operacao_mae === row.cod_operacao_mae)
        .sort((left, right) => (left.ordem || 0) - (right.ordem || 0) || left.id - right.id),
      quantidade_derivativos: rows.filter((candidate) => candidate.cod_operacao_mae === row.cod_operacao_mae).length,
      strike_liquid_mtm:
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (row.strike_liquidacao ?? derivativeQuotes[row.contrato_derivativo] ?? 0),
      ajustes_mtm: calculateDerivativeMtm(
        row,
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (row.strike_liquidacao ?? derivativeQuotes[row.contrato_derivativo] ?? 0),
      ).usd,
      ajustes_mtm_brl: calculateDerivativeMtm(
        row,
        editingDerivativeStrike[row.id] !== undefined
          ? editingDerivativeStrike[row.id]
          : (row.strike_liquidacao ?? derivativeQuotes[row.contrato_derivativo] ?? 0),
      ).brl,
    }));
  }, [definition.customForm, rows, derivativeQuotes, editingDerivativeStrike]);

  const effectiveTableColumns = useMemo(() => {
    if (definition.customForm !== "derivative-operation") {
      return tableColumns;
    }

    return [
      { key: "grupo", label: "Grupo", type: "relation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupo", label: "Subgrupo", type: "relation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "cultura", label: "Cultura" },
      { key: "safra", label: "Safra" },
      { key: "cod_operacao_mae", label: "Cod operacao mae" },
      { key: "nome_da_operacao", label: "Operacao" },
      { key: "status_operacao", label: "Status" },
      { key: "bolsa_ref", label: "Bolsa" },
      { key: "contrato_derivativo", label: "Contrato bolsa" },
      { key: "data_contratacao", label: "Data contratacao", type: "date" },
      { key: "tipo_derivativo", label: "Tipo derivativo" },
      { key: "volume", label: "Volume", type: "number" },
      { key: "strike_montagem", label: "Strike montagem", type: "number" },
      {
        key: "strike_liquid_mtm",
        label: "Strike liquid (MTM)",
        type: "number",
        render: (value, row) =>
          String(row.status_operacao || "").trim().toLowerCase() === "em aberto" ? (
            <input
              className="bubble-cell-input"
              inputMode="decimal"
              value={formatBrazilianNumber(value, 4)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const raw = event.target.value;
                setEditingDerivativeStrike((currentState) => ({
                  ...currentState,
                  [row.id]: parseLocalizedNumber(raw),
                }));
              }}
              onBlur={async () => {
                const strikeValue = editingDerivativeStrike[row.id] ?? parseLocalizedNumber(value);
                await resourceService.patch(definition.resource, row.id, {
                  strike_liquidacao: strikeValue,
                });
                setEditingDerivativeStrike((currentState) => {
                  const nextState = { ...currentState };
                  delete nextState[row.id];
                  return nextState;
                });
                await load();
              }}
            />
          ) : (
            formatBrazilianNumber(value, 4)
          ),
      },
      { key: "ajustes_mtm", label: "Ajustes MTM", type: "number" },
      { key: "ajustes_mtm_brl", label: "Ajustes MTM R$", type: "number" },
      { key: "id", label: "ID" },
    ];
  }, [definition.customForm, tableColumns, editingDerivativeStrike, load, definition.resource]);
  const displayRows = useLookupRows(effectiveTableColumns, normalizedRows);
  const rowQuickActions = useMemo(() => {
    if (definition.resource !== "users") {
      return [];
    }

    return [
      {
        key: "run-as-user",
        label: "Run",
        title: "Entrar como este usuario",
        className: "bubble-mini-action-run",
        visible: (row) => Boolean(row?.id) && !row?.is_superuser,
        onClick: async (row) => {
          try {
            const { data } = await api.post(`/auth/impersonate/${row.id}/`);
            impersonate(data);
            window.location.href = "/dashboard/kpis-risco-comercial";
          } catch (requestError) {
            setError(requestError?.response?.data?.detail || "Nao foi possivel acessar como este usuario.");
          }
        },
      },
    ];
  }, [definition.resource, impersonate, setError]);

  useEffect(() => {
    let isMounted = true;
    const attachmentField = definition.fields?.find((field) => field.type === "file-multi") || definition.attachmentField;

    if (!isModalOpen || !current?.id || !attachmentField) {
      setAttachments([]);
      return () => {
        isMounted = false;
      };
    }

    resourceService.listAttachments(definition.resource, current.id).then((items) => {
      if (isMounted) {
        setAttachments(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [current?.id, definition.fields, definition.resource, isModalOpen]);

  const handleCreate = () => {
    setCurrent(
      definition.customForm === "derivative-operation"
        ? {
            cod_operacao_mae: nextDerivativeOperationCode,
            status_operacao: "Em aberto",
            siblingRows: [],
          }
        : null,
    );
    setError("");
    setIsModalOpen(true);
  };

  const handleEdit = (item) => {
    const rawItem =
      definition.customForm === "derivative-operation"
        ? normalizedRows.find((row) => row.id === item.id) || item
        : rows.find((row) => row.id === item.id) || item;
    setCurrent(rawItem);
    setError("");
    setIsModalOpen(true);
  };

  const handleDuplicate = (item) => {
    const rawItem =
      definition.customForm === "derivative-operation"
        ? normalizedRows.find((row) => row.id === item.id) || item
        : rows.find((row) => row.id === item.id) || item;
    const { id, ...copy } = rawItem;
    if (definition.customForm === "derivative-operation") {
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
    } else {
      setCurrent(copy);
    }
    setError("");
    setIsModalOpen(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir este registro de ${definition.title}?`)) {
      return;
    }
    if (definition.customForm === "derivative-operation") {
      await remove(item);
      return;
    }
    await remove(item);
  };

  const handleReadonlyOpen = (item) => {
    setDetailItem(item);
  };

  const tenantUsageCards = useMemo(() => {
    if (definition.resource !== "tenants" || !current) {
      return [];
    }

    return [
      {
        label: "Grupos",
        ...formatTenantUsageMetric(current.current_groups, current.max_groups),
      },
      {
        label: "Subgrupos",
        ...formatTenantUsageMetric(current.current_subgroups, current.max_subgroups),
      },
      {
        label: "Usuários",
        ...formatTenantUsageMetric(current.current_users, current.max_users),
      },
      {
        label: "Convites",
        ...formatTenantUsageMetric(current.current_invitations, current.max_invitations),
      },
    ];
  }, [current, definition.resource]);

  const resourceLimitSummary = useMemo(() => {
    const tenantSummary = user?.tenant_slug
      ? {
          max_groups: user.tenant_max_groups,
          max_subgroups: user.tenant_max_subgroups,
          max_invitations: user.tenant_max_invitations,
          current_groups: user.tenant_current_groups,
          current_subgroups: user.tenant_current_subgroups,
          current_invitations: user.tenant_current_invitations,
        }
      : null;

    if (!tenantSummary) {
      return null;
    }

    if (definition.resource === "groups") {
      const limit = tenantSummary.max_groups;
      const currentValue = tenantSummary.current_groups || 0;
      const remaining = limit === null || limit === undefined || limit === "" ? null : Math.max(Number(limit) - Number(currentValue), 0);
      return {
        title: "Resumo de grupos",
        description: "Acompanhamento do uso contratado para grupos.",
        cards: [
          { label: "Grupos criados", value: `${currentValue}`, detail: "Ja cadastrados", tone: "healthy" },
          { label: "Ainda pode criar", value: remaining === null ? "Sem limite" : `${remaining}`, detail: remaining === null ? "Livre" : `de ${limit}`, tone: remaining === 0 ? "critical" : "warning" },
        ],
      };
    }

    if (definition.resource === "subgroups") {
      const limit = tenantSummary.max_subgroups;
      const currentValue = tenantSummary.current_subgroups || 0;
      const remaining = limit === null || limit === undefined || limit === "" ? null : Math.max(Number(limit) - Number(currentValue), 0);
      return {
        title: "Resumo de subgrupos",
        description: "Acompanhamento do uso contratado para subgrupos.",
        cards: [
          { label: "Subgrupos criados", value: `${currentValue}`, detail: "Ja cadastrados", tone: "healthy" },
          { label: "Ainda pode criar", value: remaining === null ? "Sem limite" : `${remaining}`, detail: remaining === null ? "Livre" : `de ${limit}`, tone: remaining === 0 ? "critical" : "warning" },
        ],
      };
    }

    if (definition.resource === "invitations") {
      const limit = tenantSummary.max_invitations;
      const currentValue = tenantSummary.current_invitations || 0;
      const remaining = limit === null || limit === undefined || limit === "" ? null : Math.max(Number(limit) - Number(currentValue), 0);
      return {
        title: "Resumo de convites",
        description: "Acompanhamento dos convites ativos do tenant.",
        cards: [
          { label: "Convites ja feitos", value: `${currentValue}`, detail: "Pendentes ou enviados", tone: "healthy" },
          { label: "Ainda pode convidar", value: remaining === null ? "Sem limite" : `${remaining}`, detail: remaining === null ? "Livre" : `de ${limit}`, tone: remaining === 0 ? "critical" : "warning" },
        ],
      };
    }

    return null;
  }, [
    definition.resource,
    user?.tenant_slug,
    user?.tenant_max_groups,
    user?.tenant_max_subgroups,
    user?.tenant_max_invitations,
    user?.tenant_current_groups,
    user?.tenant_current_subgroups,
    user?.tenant_current_invitations,
  ]);

  return (
    <div className={`resource-page ${resourceLimitSummary ? "resource-page-with-summary" : ""}`}>
      <PageHeader title={definition.title} description={definition.description} />
      {resourceLimitSummary ? (
        <section className="tenant-usage-panel resource-summary-panel">
          <div className="tenant-usage-header">
            <strong>{resourceLimitSummary.title}</strong>
            <span className="muted">{resourceLimitSummary.description}</span>
          </div>
          <div className="tenant-usage-grid resource-summary-grid">
            {resourceLimitSummary.cards.map((card) => (
              <article key={card.label} className={`tenant-usage-card ${card.tone}`}>
                <span className="tenant-usage-label">{card.label}</span>
                <strong className="tenant-usage-value">{card.value}</strong>
                <span className="tenant-usage-ratio">{card.detail}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <DataTable
        title={loading ? `${definition.title} carregando...` : definition.title}
        columns={effectiveTableColumns}
        rows={displayRows}
        searchValue={filters.search || ""}
        searchPlaceholder={definition.searchPlaceholder || "Buscar..."}
        onSearchChange={(value) => setFilters((currentFilters) => ({ ...currentFilters, search: value, page: 1 }))}
        onCreate={definition.readonly ? undefined : handleCreate}
        onClear={() => {
          setFilters({ page: 1, search: "" });
          setCurrent(null);
        }}
        onEdit={definition.readonly ? handleReadonlyOpen : handleEdit}
        onDuplicate={definition.readonly ? undefined : handleDuplicate}
        onDelete={definition.readonly ? undefined : handleDelete}
        onRowClick={definition.readonly ? handleReadonlyOpen : undefined}
        selectedId={current?.id}
        rowQuickActions={rowQuickActions}
        getRowClassName={
          definition.customForm === "derivative-operation"
            ? (row) => (String(row.status_operacao || "").trim().toLowerCase() === "encerrado" ? "bubble-row-encerrado" : "")
            : undefined
        }
      />

      {isModalOpen && !definition.readonly && definition.customForm === "derivative-operation" ? (
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
          onClose={() => {
            setIsModalOpen(false);
            setCurrent(null);
            setAttachments([]);
            setError("");
          }}
          onSubmit={async (payload, rawValues) => {
            const files = Array.isArray(rawValues.attachments) ? rawValues.attachments : [];
            const siblingRows = Array.isArray(current?.siblingRows) ? current.siblingRows : [];
            const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "attachments" && key !== "itens"));
            const itemPayloads = Array.isArray(payload.itens) ? payload.itens : [];
            let primaryRecord = null;

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
                  keepIds.push(updated.id);
                  if (!primaryRecord || updated.id === current.id) {
                    primaryRecord = updated;
                  }
                } else {
                  const created = await resourceService.create(definition.resource, rowPayload);
                  keepIds.push(created.id);
                  if (!primaryRecord) {
                    primaryRecord = created;
                  }
                }
              }

              const removableRows = existingRows.filter((row) => !keepIds.includes(row.id));
              for (const removableRow of removableRows) {
                await resourceService.remove(definition.resource, removableRow.id);
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
                if (!primaryRecord) {
                  primaryRecord = created;
                }
              }
            }

            await load();

            if (primaryRecord) {
              if (files.length) {
                await resourceService.uploadAttachments(definition.resource, primaryRecord.id, files);
              }
              setIsModalOpen(false);
              setCurrent(null);
              setAttachments([]);
              setError("");
            }
          }}
        />
      ) : null}

      {isModalOpen && !definition.readonly && definition.customForm !== "derivative-operation" ? (
        <ResourceForm
          title={current ? `Editar ${definition.title}` : `Novo ${definition.title}`}
          fields={definition.fields}
          initialValues={current || {}}
          submitLabel={definition.submitLabel || "Salvar"}
          beforeContent={
            definition.resource === "tenants" && current ? (
              <section className="tenant-usage-panel">
                <div className="tenant-usage-header">
                  <strong>Uso atual x limite</strong>
                  <span className="muted">Leitura comercial do pacote contratado.</span>
                </div>
                <div className="tenant-usage-grid">
                  {tenantUsageCards.map((card) => (
                    <article key={card.label} className={`tenant-usage-card ${card.tone}`}>
                      <span className="tenant-usage-label">{card.label}</span>
                      <strong className="tenant-usage-value">
                        {card.current} <span>/ {card.limitLabel}</span>
                      </strong>
                      <span className="tenant-usage-ratio">{card.ratioLabel}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null
          }
          existingAttachments={attachments}
          onDeleteAttachment={async (attachment) => {
            await resourceService.remove("attachments", attachment.id);
            if (current?.id) {
              const items = await resourceService.listAttachments(definition.resource, current.id);
              setAttachments(items);
            }
          }}
          error={error}
          onClose={() => {
            setIsModalOpen(false);
            setCurrent(null);
            setAttachments([]);
            setError("");
          }}
          onSubmit={async (payload, rawValues) => {
            const attachmentField = definition.fields.find((field) => field.type === "file-multi");
            const files = attachmentField && Array.isArray(rawValues[attachmentField.name]) ? rawValues[attachmentField.name] : [];
            const cleanPayload = attachmentField
              ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== attachmentField.name))
              : payload;

            if (definition.resource === "physical-sales" && cleanPayload.cultura_produto) {
              const crops = await resourceService.listAll("crops");
              const selectedCrop = crops.find((item) => item.cultura === cleanPayload.cultura_produto);
              if (selectedCrop) {
                cleanPayload.cultura = selectedCrop.id;
              }
            }

            const saved = await save(cleanPayload, current);
            if (saved) {
              if (attachmentField && files.length) {
                await resourceService.uploadAttachments(definition.resource, saved.id, files);
              }
              setIsModalOpen(false);
              setCurrent(null);
              setAttachments([]);
              setError("");
            }
          }}
        />
      ) : null}

      {detailItem && definition.readonly ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setDetailItem(null)} />
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <strong>{definition.title}</strong>
                <div className="muted">Detalhes completos do registro selecionado.</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setDetailItem(null)}>
                Fechar
              </button>
            </div>
            <div className="form-grid">
              {(definition.detailFields || []).map((field) => (
                <div className={`field${field.type === "textarea" ? " field-full" : ""}`} key={field.name}>
                  <label>{field.label}</label>
                  <div className="detail-value">
                    {field.type === "date" ? formatBrazilianDate(detailItem[field.name], "—") : (detailItem[field.name] || "—")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
