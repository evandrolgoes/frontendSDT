import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { ResourceTable } from "../components/ResourceTable";
import { useAuth } from "../contexts/AuthContext";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";

const definition = resourceDefinitions.derivativeOperations;

export function DerivativeOperationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rows, loading, filters, setFilters, error, setError, remove, upsertRows, removeRowsById } = useResourceCrud(definition.resource, { page: 1 });
  const [current, setCurrent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const requestedOpenId = useMemo(() => {
    const value = new URLSearchParams(location.search).get("open");
    return value ? String(value) : "";
  }, [location.search]);
  const siblingRowsByCode = useMemo(() => {
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
  }, [rows]);

  const resolveTableRow = (item) => {
    if (!item) {
      return item;
    }
    const siblingRows = siblingRowsByCode.get(item.cod_operacao_mae ?? "") || [item];
    return {
      ...item,
      siblingRows,
    };
  };

  const nextDerivativeOperationCode = useMemo(() => {
    const highestNumber = rows.reduce((maxValue, row) => {
      const match = String(row.cod_operacao_mae || "").match(/(\d+)$/);
      return match ? Math.max(maxValue, Number(match[1])) : maxValue;
    }, 0);
    return `DRV-${String(highestNumber + 1).padStart(3, "0")}`;
  }, [rows]);

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

    const match = rows.find((item) => String(item?.id || "") === requestedOpenId);
    if (!match) {
      return;
    }

    setCurrent(resolveTableRow(match));
    setError("");
    setIsModalOpen(true);
  }, [current?.id, isModalOpen, loading, requestedOpenId, rows, setError, siblingRowsByCode]);

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
      <ResourceTable
        definition={definition}
        rows={rows}
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
          const rawItem = rows.find((row) => row.id === item.id) || item;
          setCurrent(resolveTableRow(rawItem));
          setError("");
          setIsModalOpen(true);
        }}
        onDuplicate={(item) => {
          const rawItem = resolveTableRow(rows.find((row) => row.id === item.id) || item);
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
                  volume_fisico_valor: itemPayload.volume_fisico_valor,
                  volume_financeiro_valor: itemPayload.volume_financeiro_valor,
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
                  volume_fisico_valor: itemPayload.volume_fisico_valor,
                  volume_financeiro_valor: itemPayload.volume_financeiro_valor,
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
