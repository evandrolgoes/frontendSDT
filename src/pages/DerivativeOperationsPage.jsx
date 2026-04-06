import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { ResourceTable } from "../components/ResourceTable";
import { useAuth } from "../contexts/AuthContext";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate, parseBrazilianDate } from "../utils/date";

const definition = resourceDefinitions.derivativeOperations;
const DERIVATIVE_ALERT_SESSION_KEY = "sdt_derivatives_deadline_alert_seen";

const toLocalIsoDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysToIsoDate = (baseIsoDate, days) => {
  const [year, month, day] = String(baseIsoDate || "").split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
};

const resolveText = (value, emptyValue = "—") => {
  if (value === null || value === undefined || value === "") {
    return emptyValue;
  }
  if (typeof value === "object") {
    const candidates = [
      "grupo",
      "subgrupo",
      "grupo_name",
      "subgrupo_name",
      "nome_da_operacao",
      "descricao",
      "classificacao",
      "label",
      "name",
      "nome",
    ];
    for (const key of candidates) {
      if (value?.[key]) {
        return value[key];
      }
    }
  }
  return String(value);
};

const resolveLookupLabel = (value, lookupMap, emptyValue = "—") => {
  if (value === null || value === undefined || value === "") {
    return emptyValue;
  }
  if (typeof value === "object") {
    return resolveText(value, emptyValue);
  }
  return lookupMap.get(String(value)) || emptyValue;
};

const sortByDateAsc = (left, right) => String(left.dateValue || "").localeCompare(String(right.dateValue || ""));

const dedupeDerivativeRowsByCode = (items) => {
  const uniqueItems = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(item?.cod_operacao_mae || item?.id || "");
    if (key && !uniqueItems.has(key)) {
      uniqueItems.set(key, item);
    }
  });
  return Array.from(uniqueItems.values());
};

function DerivativeDeadlineAlertModal({ alertState, onClose, onOpenItem }) {
  if (!alertState?.open) {
    return null;
  }

  const sections = [
    {
      key: "overdueDerivatives",
      title: "Operações vencidas",
      description: "Estas operações já venceram e precisam dos valores de liquidação.",
      rows: alertState.overdueDerivatives,
      highlight: "is-critical",
    },
    {
      key: "upcomingDerivatives",
      title: "Derivativos liquidando nos próximos 7 dias",
      description: "Acompanhe estas liquidações para não perder o prazo.",
      rows: alertState.upcomingDerivatives,
      highlight: "",
    },
    {
      key: "upcomingPhysicalPayments",
      title: "Pgtos Físico nos próximos 7 dias",
      description: "Pagamentos físicos programados para a próxima semana.",
      rows: alertState.upcomingPhysicalPayments,
      highlight: "",
    },
    {
      key: "upcomingCashPayments",
      title: "Empréstimos nos próximos 7 dias",
      description: "Empréstimos programados para a próxima semana.",
      rows: alertState.upcomingCashPayments,
      highlight: "",
    },
  ].filter((section) => section.rows.length);

  return (
    <div className="component-popup-backdrop" onClick={onClose}>
      <div className="component-popup derivative-alert-popup" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Alertas de derivativos e pagamentos">
        <button type="button" className="component-popup-close" onClick={onClose} aria-label="Fechar alerta">
          ×
        </button>
        <div className="component-popup-header derivative-alert-popup-header">
          <div>
            <strong>Alertas de vencimento e liquidação</strong>
            <p>
              {alertState.overdueDerivatives.length
                ? "Existem operações vencidas que precisam informar os valores de liquidação."
                : "Existem eventos previstos para os próximos 7 dias."}
            </p>
          </div>
        </div>
        <div className="derivative-alert-popup-body">
          {sections.map((section) => (
            <section key={section.key} className={`derivative-alert-section ${section.highlight}`.trim()}>
              <div className="derivative-alert-section-header">
                <strong>{section.title}</strong>
                <span>{section.rows.length} item(ns)</span>
              </div>
              <p>{section.description}</p>
              <table className="component-popup-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Grupo</th>
                    <th>Subgrupo</th>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th className="component-popup-action-col" />
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((item) => (
                    <tr key={`${section.key}-${item.id}`}>
                      <td>{item.kindLabel}</td>
                      <td>{item.grupoLabel}</td>
                      <td>{item.subgrupoLabel}</td>
                      <td>{item.dateLabel}</td>
                      <td>{item.description}</td>
                      <td className="component-popup-action-cell">
                        <button type="button" className="btn btn-secondary" onClick={() => onOpenItem(item)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
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
  const [alertState, setAlertState] = useState({
    open: false,
    overdueDerivatives: [],
    upcomingDerivatives: [],
    upcomingPhysicalPayments: [],
    upcomingCashPayments: [],
  });
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

  useEffect(() => {
    if (loading || typeof window === "undefined") {
      return;
    }

    if (window.sessionStorage.getItem(DERIVATIVE_ALERT_SESSION_KEY) === "1") {
      return;
    }

    let isMounted = true;

    const todayIsoDate = toLocalIsoDate();
    const nextSevenDaysIsoDate = addDaysToIsoDate(todayIsoDate, 7);

    const buildDerivativeAlertItem = (row, groupLookup, subgroupLookup, kindLabel) => ({
      id: row.id,
      resourcePath: `/derivativos?open=${row.id}`,
      kindLabel,
      grupoLabel: resolveLookupLabel(row.grupo, groupLookup),
      subgrupoLabel: resolveLookupLabel(row.subgrupo, subgroupLookup),
      dateValue: parseBrazilianDate(row.data_liquidacao, ""),
      dateLabel: formatBrazilianDate(row.data_liquidacao, "—"),
      description: [row.cod_operacao_mae, resolveText(row.nome_da_operacao, "Operação sem nome")].filter(Boolean).join(" · "),
    });

    const buildPaymentAlertItem = (row, resourcePath, groupLookup, subgroupLookup, kindLabel) => ({
      id: row.id,
      resourcePath: `${resourcePath}?open=${row.id}`,
      kindLabel,
      grupoLabel: resolveLookupLabel(row.grupo, groupLookup),
      subgrupoLabel: resolveLookupLabel(row.subgrupo, subgroupLookup),
      dateValue: parseBrazilianDate(row.data_pagamento || row.data_vencimento, ""),
      dateLabel: formatBrazilianDate(row.data_pagamento || row.data_vencimento, "—"),
      description: resolveText(row.descricao, resolveText(row.classificacao, kindLabel)),
    });

    Promise.allSettled([
      resourceService.listAll("physical-payments"),
      resourceService.listAll("cash-payments"),
      resourceService.listAll("groups"),
      resourceService.listAll("subgroups"),
    ]).then((results) => {
      if (!isMounted) {
        return;
      }

      const [physicalPaymentsResult, cashPaymentsResult, groupsResult, subgroupsResult] = results;
      const physicalPayments = physicalPaymentsResult.status === "fulfilled" ? physicalPaymentsResult.value : [];
      const cashPayments = cashPaymentsResult.status === "fulfilled" ? cashPaymentsResult.value : [];
      const groups = groupsResult.status === "fulfilled" ? groupsResult.value : [];
      const subgroups = subgroupsResult.status === "fulfilled" ? subgroupsResult.value : [];
      const groupLookup = new Map((groups || []).map((item) => [String(item.id), resolveText(item.grupo, "—")]));
      const subgroupLookup = new Map((subgroups || []).map((item) => [String(item.id), resolveText(item.subgrupo, "—")]));
      const overdueDerivatives = dedupeDerivativeRowsByCode(rows)
        .filter((row) => {
          const settlementDate = parseBrazilianDate(row.data_liquidacao, "");
          const status = String(row.status_operacao || "").trim().toLowerCase();
          return Boolean(settlementDate) && status !== "encerrado" && settlementDate <= todayIsoDate;
        })
        .map((row) => buildDerivativeAlertItem(row, groupLookup, subgroupLookup, "Derivativo vencido"))
        .sort(sortByDateAsc);

      const upcomingDerivatives = dedupeDerivativeRowsByCode(rows)
        .filter((row) => {
          const settlementDate = parseBrazilianDate(row.data_liquidacao, "");
          const status = String(row.status_operacao || "").trim().toLowerCase();
          return Boolean(settlementDate) && status !== "encerrado" && settlementDate > todayIsoDate && settlementDate <= nextSevenDaysIsoDate;
        })
        .map((row) => buildDerivativeAlertItem(row, groupLookup, subgroupLookup, "Derivativo"))
        .sort(sortByDateAsc);

      const upcomingPhysicalPayments = (Array.isArray(physicalPayments) ? physicalPayments : [])
        .filter((row) => {
          const paymentDate = parseBrazilianDate(row.data_pagamento, "");
          return Boolean(paymentDate) && paymentDate >= todayIsoDate && paymentDate <= nextSevenDaysIsoDate;
        })
        .map((row) => buildPaymentAlertItem(row, "/pgtos-fisico", groupLookup, subgroupLookup, "Pgto Físico"))
        .sort(sortByDateAsc);

      const upcomingCashPayments = (Array.isArray(cashPayments) ? cashPayments : [])
        .filter((row) => {
          const paymentDate = parseBrazilianDate(row.data_pagamento || row.data_vencimento, "");
          return Boolean(paymentDate) && paymentDate >= todayIsoDate && paymentDate <= nextSevenDaysIsoDate;
        })
        .map((row) => buildPaymentAlertItem(row, "/pgtos-caixa", groupLookup, subgroupLookup, "Empréstimos"))
        .sort(sortByDateAsc);

      if (!overdueDerivatives.length && !upcomingDerivatives.length && !upcomingPhysicalPayments.length && !upcomingCashPayments.length) {
        return;
      }

      window.sessionStorage.setItem(DERIVATIVE_ALERT_SESSION_KEY, "1");
      setAlertState({
        open: true,
        overdueDerivatives,
        upcomingDerivatives,
        upcomingPhysicalPayments,
        upcomingCashPayments,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [loading, rows]);

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

      <DerivativeDeadlineAlertModal
        alertState={alertState}
        onClose={() => setAlertState((currentState) => ({ ...currentState, open: false }))}
        onOpenItem={(item) => {
          setAlertState((currentState) => ({ ...currentState, open: false }));
          navigate(item.resourcePath);
        }}
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
