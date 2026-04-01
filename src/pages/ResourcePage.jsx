import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DerivativeOperationForm } from "../components/DerivativeOperationForm";
import { PageHeader } from "../components/PageHeader";
import { ResourceTable, usePreparedResourceTable } from "../components/ResourceTable";
import { ResourceForm } from "../components/ResourceForm";
import { useAuth } from "../contexts/AuthContext";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { api } from "../services/api";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate, formatBrazilianDateTime } from "../utils/date";

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

const addDaysToIsoDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

const formatSignedBrazilianNumber = (value, digits = 2) => {
  const parsed = parseLocalizedNumber(value);
  const signal = parsed > 0 ? "+" : parsed < 0 ? "-" : "";
  return `${signal}${Math.abs(parsed).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
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

const formatBrazilianPhone = (value) => {
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
            const rawValue = row[column.key];
            const preferredKey = column.labelKey || relationResourceLabels[column.resource];
            const relationId = typeof rawValue === "object" ? rawValue?.id : rawValue;
            const option = options.find((item) => item.id === relationId);
            nextRow[column.key] = option?.[preferredKey] || resolveRelationLikeLabel(rawValue, preferredKey);
          }
          if (column.type === "multirelation" && column.resource && Array.isArray(row[column.key])) {
            const options = lookupCache[column.resource] || [];
            const preferredKey = column.labelKey || relationResourceLabels[column.resource];
            nextRow[column.key] = row[column.key].map((itemValue) => {
              const relationId = typeof itemValue === "object" ? itemValue?.id : itemValue;
              const option = options.find((item) => item.id === relationId);
              return option?.[preferredKey] || resolveRelationLikeLabel(itemValue, preferredKey);
            });
          }
        });
        return nextRow;
      }),
    [columns, lookupCache, rows],
  );
};

const formatSimpleTableValue = (column, value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (column.type === "number") {
    return formatBrazilianNumber(value, isVolumeField(column) ? 0 : 2);
  }
  if (column.type === "date") {
    return formatBrazilianDate(value, "—");
  }
  if (column.type === "datetime") {
    return formatBrazilianDateTime(value, "—");
  }
  return String(value);
};

const formatAuditChangeValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const buildTradingviewChartUrl = (row) => {
  const symbolParam = String(row?.ticker || row?.symbol || "").trim();
  if (!symbolParam) {
    return "";
  }
  return `https://br.tradingview.com/chart/QwgamVHA/?symbol=${encodeURIComponent(symbolParam)}`;
};

function SimpleQuotesTable({
  title,
  rows,
  columns,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onClear,
  onTickerClick,
}) {
  const filteredRows = useMemo(() => {
    const search = String(searchValue || "")
      .trim()
      .toLowerCase();

    if (!search) {
      return rows;
    }

    return rows.filter((row) =>
      columns.some((column) => String(row?.[column.key] ?? "").toLowerCase().includes(search)),
    );
  }, [columns, rows, searchValue]);

  return (
    <section className="simple-quotes-shell">
      <div className="simple-quotes-toolbar">
        <div className="simple-quotes-title">{title}</div>
        <div className="simple-quotes-toolbar-actions">
          <input
            className="simple-quotes-search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <button className="bubble-btn bubble-btn-light" type="button" onClick={onClear}>
            Limpar
          </button>
        </div>
      </div>

      <div className="simple-quotes-viewport custom-scrollbar">
        <table className="simple-quotes-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => {
                    const numericValue = parseLocalizedNumber(row?.[column.key]);
                    const toneClass =
                      column.key === "change_value" || column.key === "change_percent"
                        ? numericValue > 0
                          ? " is-positive"
                          : numericValue < 0
                            ? " is-negative"
                            : ""
                        : "";

                    return (
                      <td key={column.key} className={toneClass}>
                        {column.key === "ticker" && typeof onTickerClick === "function" ? (
                          <button
                            type="button"
                            className="simple-quotes-ticker-button"
                            onClick={() => onTickerClick(row)}
                            title={`Abrir grafico de ${row?.symbol || row?.ticker || ""}`}
                          >
                            {formatSimpleTableValue(column, row?.[column.key])}
                          </button>
                        ) : (
                          formatSimpleTableValue(column, row?.[column.key])
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td className="simple-quotes-empty" colSpan={columns.length}>
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="simple-quotes-mobile-list">
        {filteredRows.length ? (
          filteredRows.map((row) => {
            const changeValue = parseLocalizedNumber(row?.change_value);
            const variationClass = changeValue > 0 ? " is-positive" : changeValue < 0 ? " is-negative" : "";
            const tickerLabel = formatSimpleTableValue({ key: "ticker" }, row?.ticker);
            const descriptionLabel = formatSimpleTableValue({ key: "description" }, row?.description);
            const priceLabel = formatBrazilianNumber(row?.price, 2);
            const variationLabel =
              row?.change_value !== null && row?.change_value !== undefined
                ? `${formatSignedBrazilianNumber(row?.change_value, 2)} (${formatSignedBrazilianNumber(row?.change_percent, 2)}%)`
                : "Sem variacao";

            return (
              <article className="simple-quotes-mobile-card" key={`mobile-${row.id}`}>
                <div className="simple-quotes-mobile-symbol">
                  {typeof onTickerClick === "function" ? (
                    <button
                      type="button"
                      className="simple-quotes-mobile-ticker"
                      onClick={() => onTickerClick(row)}
                      title={`Abrir grafico de ${row?.symbol || row?.ticker || ""}`}
                    >
                      {tickerLabel}
                    </button>
                  ) : (
                    <strong className="simple-quotes-mobile-ticker-text">{tickerLabel}</strong>
                  )}
                  <span className="simple-quotes-mobile-description">{descriptionLabel}</span>
                </div>

                <div className="simple-quotes-mobile-price-block">
                  <strong className="simple-quotes-mobile-price">{priceLabel}</strong>
                  <span className={`simple-quotes-mobile-variation${variationClass}`}>{variationLabel}</span>
                </div>
              </article>
            );
          })
        ) : (
          <div className="simple-quotes-mobile-empty">Nenhum registro encontrado.</div>
        )}
      </div>
    </section>
  );
}

const openTradingviewPopupWindow = (url) => {
  if (!url || typeof window === "undefined") {
    return;
  }
  const width = Math.min(1440, Math.max(1100, Math.floor(window.screen.width * 0.86)));
  const height = Math.min(920, Math.max(760, Math.floor(window.screen.height * 0.88)));
  const left = Math.max(0, Math.floor((window.screen.width - width) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - height) / 2));
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "noopener=yes",
    "noreferrer=yes",
  ].join(",");
  window.open(url, "_blank", features);
};

export function ResourcePage({ definition }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, impersonate, refreshProfile } = useAuth();
  const isAuditLogResource = definition.resource === "audit-logs";
  const { rows, loading, load, save, remove, upsertRows, removeRowsById, filters, setFilters, error, setError } = useResourceCrud(
    definition.resource,
    { page: 1 },
    { autoload: !isAuditLogResource },
  );
  const [current, setCurrent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalBusyMessage, setModalBusyMessage] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [accessRequestValues, setAccessRequestValues] = useState([""]);
  const [isAccessRequestOpen, setIsAccessRequestOpen] = useState(false);
  const [pendingAccessRequests, setPendingAccessRequests] = useState([]);
  const marqueeRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const marqueeSequenceRef = useRef(null);
  const marqueeDragStateRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });
  const [isMarqueeInteracting, setIsMarqueeInteracting] = useState(false);
  const [isMarqueeHovered, setIsMarqueeHovered] = useState(false);
  const [isPendingAccessOpen, setIsPendingAccessOpen] = useState(false);
  const [lookupOptions, setLookupOptions] = useState({});
  const [logFilters, setLogFilters] = useState({
    tenant: "",
    user: "",
    action: "",
    formulario: "",
    objectId: "",
    createdAtFrom: "",
    createdAtTo: "",
    search: "",
  });
  const [hasAppliedLogFilters, setHasAppliedLogFilters] = useState(false);
  const requestedOpenId = useMemo(() => {
    const value = new URLSearchParams(location.search).get("open");
    return value ? String(value) : "";
  }, [location.search]);
  const { normalizedRows, effectiveTableColumns, displayRows } = usePreparedResourceTable(definition, rows);
  const supportsAccessWorkflow = false;
  const summaryCards = useMemo(() => {
    if (definition.resource === "groups") {
      return [
        {
          label: "Grupos como proprietario",
          ...formatTenantUsageMetric(user?.owned_groups_count, user?.max_owned_groups),
        },
      ];
    }
    if (definition.resource === "subgroups") {
      return [
        {
          label: "Subgrupos como proprietario",
          ...formatTenantUsageMetric(user?.owned_subgroups_count, user?.max_owned_subgroups),
        },
      ];
    }
    if (definition.resource === "admin-invitations") {
      return [
        {
          label: "Convites administrativos",
          ...formatTenantUsageMetric(user?.active_admin_invitations_count, user?.max_admin_invitations),
        },
      ];
    }
    return [];
  }, [
    definition.resource,
    user?.active_admin_invitations_count,
    user?.max_admin_invitations,
    user?.max_owned_groups,
    user?.max_owned_subgroups,
    user?.owned_groups_count,
    user?.owned_subgroups_count,
  ]);
  const filterCards = useMemo(() => {
    if (definition.resource !== "tradingview-watchlist-quotes") {
      return [];
    }

    const sectionStats = rows.reduce((acc, row) => {
      const key = String(row.section_name || "Sem secao").trim() || "Sem secao";
      if (!acc[key]) {
        acc[key] = { count: 0, firstRow: row };
      }
      acc[key].count += 1;
      const currentFirstOrder = Number(acc[key].firstRow?.sort_order || Number.MAX_SAFE_INTEGER);
      const nextOrder = Number(row?.sort_order || Number.MAX_SAFE_INTEGER);
      if (nextOrder < currentFirstOrder) {
        acc[key].firstRow = row;
      }
      return acc;
    }, {});

    return Object.entries(sectionStats)
      .filter(([label]) => {
        const normalizedLabel = String(label || "").trim().toLowerCase();
        return normalizedLabel && !["indices", "índices", "soja b3", "sem secao"].includes(normalizedLabel);
      })
      .map(([label, stats]) => ({
        key: label,
        label,
        search: label,
        firstRow: stats.firstRow,
      }));
  }, [definition.resource, rows]);
  const activeFilterCardKey = useMemo(() => {
    const currentSearch = String(filters.search || "").trim();
    if (!currentSearch) {
      return "";
    }
    return filterCards.find((item) => item.search === currentSearch)?.key || "";
  }, [filterCards, filters.search]);

  const latestSyncLabel = useMemo(() => {
    if (definition.resource !== "tradingview-watchlist-quotes" || !rows.length) {
      return "";
    }

    const latestRow = [...rows].sort(
      (left, right) => new Date(right?.synced_at || 0).getTime() - new Date(left?.synced_at || 0).getTime(),
    )[0];

    if (!latestRow?.synced_at) {
      return "";
    }

    const date = new Date(latestRow.synced_at);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const timeLabel = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
    return `Ultima atualizacao: ${timeLabel} de ${dateLabel}`;
  }, [definition.resource, rows]);

  const getMarqueeLoopWidth = () => {
    const track = marqueeTrackRef.current;
    const sequence = marqueeSequenceRef.current;
    if (!track || !sequence || typeof window === "undefined") {
      return 0;
    }

    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    return sequence.offsetWidth + gap;
  };

  const normalizeMarqueeScroll = () => {
    const container = marqueeRef.current;
    const loopWidth = getMarqueeLoopWidth();
    if (!container || !loopWidth) {
      return;
    }

    while (container.scrollLeft >= loopWidth) {
      container.scrollLeft -= loopWidth;
    }

    while (container.scrollLeft < 0) {
      container.scrollLeft += loopWidth;
    }
  };

  const applyFilterCardSearch = (search) => {
    setFilters((currentFilters) => ({ ...currentFilters, search, page: 1 }));
  };

  const beginMarqueeInteraction = (clientX, scrollLeft) => {
    marqueeDragStateRef.current = {
      active: true,
      moved: false,
      startX: clientX,
      startScrollLeft: scrollLeft,
    };
  };

  const handleMarqueeMouseDown = (event) => {
    const container = marqueeRef.current;
    if (!container || filterCards.length <= 1) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    beginMarqueeInteraction(event.clientX, container.scrollLeft);
  };

  const handleMarqueeMouseMove = (event) => {
    const container = marqueeRef.current;
    const drag = marqueeDragStateRef.current;
    if (!container || !drag.active) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }
    if (!drag.moved) {
      marqueeDragStateRef.current = {
        ...drag,
        moved: true,
      };
      setIsMarqueeInteracting(true);
    }
    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  const stopMarqueeInteraction = () => {
    marqueeDragStateRef.current = {
      active: false,
      moved: false,
      startX: 0,
      startScrollLeft: marqueeRef.current?.scrollLeft || 0,
    };
    setIsMarqueeInteracting(false);
  };

  const handleMarqueeMouseLeave = () => {
    stopMarqueeInteraction();
    setIsMarqueeHovered(false);
  };

  const handleMarqueeTouchStart = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    if (!container || !touch || filterCards.length <= 1) {
      return;
    }

    beginMarqueeInteraction(touch.clientX, container.scrollLeft);
  };

  const handleMarqueeTouchMove = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    const drag = marqueeDragStateRef.current;
    if (!container || !touch || !drag.active) {
      return;
    }

    const deltaX = touch.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }

    if (!drag.moved) {
      marqueeDragStateRef.current = {
        ...drag,
        moved: true,
      };
      setIsMarqueeInteracting(true);
    }

    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  const handleMarqueeTouchEnd = () => {
    stopMarqueeInteraction();
  };
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
    setAccessRequestValues([""]);
    setIsAccessRequestOpen(false);
    setPendingAccessRequests([]);
    setIsPendingAccessOpen(false);
    setError("");
    setLogFilters({
      tenant: "",
      user: "",
      action: "",
      formulario: "",
      objectId: "",
      createdAtFrom: "",
      createdAtTo: "",
      search: "",
    });
    setHasAppliedLogFilters(false);
  }, [definition.resource, setError]);

  const hasAnyLogFilter = useMemo(
    () =>
      Object.values(logFilters).some((value) => String(value || "").trim() !== ""),
    [logFilters],
  );

  const buildAuditLogParams = () => {
    const params = {};
    if (logFilters.tenant) params.tenant = logFilters.tenant;
    if (logFilters.user) params.user = logFilters.user;
    if (logFilters.action) params.action = logFilters.action;
    if (logFilters.formulario) params.formulario = logFilters.formulario;
    if (logFilters.objectId) params.object_id = logFilters.objectId;
    if (logFilters.createdAtFrom) params.created_at_from = logFilters.createdAtFrom;
    if (logFilters.createdAtTo) params.created_at_to = logFilters.createdAtTo;
    if (logFilters.search) params.search = logFilters.search;
    return params;
  };

  useEffect(() => {
    let isMounted = true;

    const loadPendingAccessRequests = async () => {
      if (!supportsAccessWorkflow || !user?.id) {
        return;
      }
      try {
        const { data } = await api.get(`/${definition.resource}/pending-access-requests/`);
        if (isMounted) {
          const items = Array.isArray(data) ? data : [];
          setPendingAccessRequests(items);
          setIsPendingAccessOpen(items.length > 0);
        }
      } catch {
        if (isMounted) {
          setPendingAccessRequests([]);
          setIsPendingAccessOpen(false);
        }
      }
    };

    loadPendingAccessRequests();

    return () => {
      isMounted = false;
    };
  }, [definition.resource, supportsAccessWorkflow, user?.id]);

  useEffect(() => {
    if (!definition.autoRefreshIntervalMs) {
      return undefined;
    }

    const refreshRows = async () => {
      try {
        await load({ force: true });
      } catch {
        // Keep the table usable even if an automatic refresh attempt fails.
      }
    };

    const intervalId = window.setInterval(async () => {
      await refreshRows();
    }, definition.autoRefreshIntervalMs);

    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === "visible") {
        await refreshRows();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [definition.autoRefreshIntervalMs, load]);

  useEffect(() => {
    if (definition.resource !== "tradingview-watchlist-quotes" || filterCards.length <= 1) {
      const container = marqueeRef.current;
      if (container) {
        container.scrollLeft = 0;
      }
      return undefined;
    }

    const container = marqueeRef.current;
    if (!container || typeof window === "undefined") {
      return undefined;
    }

    let animationFrameId = 0;
    let lastTimestamp = 0;
    const speedPxPerSecond = 28;

    const step = (timestamp) => {
      if (!container) {
        return;
      }

      if (!lastTimestamp) {
        lastTimestamp = timestamp;
      }

      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      if (!marqueeDragStateRef.current.active && !isMarqueeHovered) {
        container.scrollLeft += (delta * speedPxPerSecond) / 1000;
        normalizeMarqueeScroll();
      }

      animationFrameId = window.requestAnimationFrame(step);
    };

    const handleResize = () => {
      normalizeMarqueeScroll();
    };

    normalizeMarqueeScroll();
    animationFrameId = window.requestAnimationFrame(step);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [definition.resource, filterCards, isMarqueeHovered]);

  const clearOpenQuery = () => {
    if (!requestedOpenId) {
      return;
    }
    navigate(location.pathname, { replace: true });
  };

  useEffect(() => {
    if (!requestedOpenId || loading || definition.readonly) {
      return;
    }
    if (isModalOpen && String(current?.id || "") === requestedOpenId) {
      return;
    }

    const sourceRows = definition.customForm === "derivative-operation" ? normalizedRows : rows;
    const match = sourceRows.find((item) => String(item?.id || "") === requestedOpenId);
    if (!match) {
      return;
    }

    setCurrent(match);
    setError("");
    setIsModalOpen(true);
  }, [current?.id, definition.customForm, definition.readonly, isModalOpen, loading, normalizedRows, requestedOpenId, rows, setError]);

  const useSimpleQuotesTable = definition.resource === "tradingview-watchlist-quotes";
  const logActionOptions = [
    { value: "", label: "Todas" },
    { value: "criado", label: "Criado" },
    { value: "alterado", label: "Alterado" },
    { value: "excluido", label: "Excluido" },
  ];
  const logFormOptions = useMemo(() => {
    const values = [...new Set(rows.map((item) => String(item?.formulario || "").trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, "pt-BR"),
    );

    if (logFilters.formulario && !values.includes(logFilters.formulario)) {
      values.unshift(logFilters.formulario);
    }

    return [{ value: "", label: "Todos" }, ...values.map((value) => ({ value, label: value }))];
  }, [logFilters.formulario, rows]);

  useEffect(() => {
    if (!isAuditLogResource) {
      return;
    }

    let active = true;
    const resourcesToLoad = user?.is_superuser ? ["users", "tenants"] : ["users"];

    const loadLogLookups = async () => {
      try {
        const results = await Promise.all(
          resourcesToLoad.map(async (resourceName) => [resourceName, await resourceService.listAll(resourceName)]),
        );
        if (active) {
          setLookupOptions((currentState) => ({ ...currentState, ...Object.fromEntries(results) }));
        }
      } catch {
        if (active) {
          setLookupOptions((currentState) => ({ ...currentState, users: [], tenants: [] }));
        }
      }
    };

    loadLogLookups();
    return () => {
      active = false;
    };
  }, [isAuditLogResource, user?.is_superuser]);

  const rowQuickActions = useMemo(() => {
    if (definition.resource !== "users" || definition.enableRunActions === false) {
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

  const activeFormFields = useMemo(() => {
    const baseFields = current ? definition.editFields || definition.fields : definition.fields;
    if (definition.resource === "users") {
      return baseFields.filter((field) => !(field.name === "tenant" && !user?.is_superuser));
    }
    if (definition.resource === "admin-invitations") {
      return baseFields.filter((field) => {
        if (!user?.is_superuser && user?.tenant_slug !== "admin" && ["target_tenant_slug", "master_user"].includes(field.name)) {
          return false;
        }
        return true;
      });
    }
    if (definition.resource !== "admin-invitations") {
      return baseFields;
    }
    return baseFields.filter((field) => field.name !== "tenant" || user?.is_superuser);
  }, [current, definition.editFields, definition.fields, definition.resource, user?.is_superuser, user?.tenant_slug]);

  const canCreateRecord = useMemo(() => {
    if (definition.allowCreate === false) {
      return false;
    }
    if (definition.readonly) {
      return false;
    }
    if (definition.resource === "groups") {
      if (!(user?.tenant_can_register_groups || user?.is_superuser)) {
        return false;
      }
      if (user?.is_superuser || user?.max_owned_groups === null || user?.max_owned_groups === undefined) {
        return true;
      }
      return Number(user?.owned_groups_count || 0) < Number(user?.max_owned_groups);
    }
    if (definition.resource === "subgroups") {
      if (!(user?.tenant_can_register_subgroups || user?.is_superuser)) {
        return false;
      }
      if (user?.is_superuser || user?.max_owned_subgroups === null || user?.max_owned_subgroups === undefined) {
        return true;
      }
      return Number(user?.owned_subgroups_count || 0) < Number(user?.max_owned_subgroups);
    }
    if (definition.resource === "admin-invitations") {
      if (!(user?.tenant_can_send_invitations || user?.is_superuser)) {
        return false;
      }
      if (user?.is_superuser || user?.max_admin_invitations === null || user?.max_admin_invitations === undefined) {
        return true;
      }
      return Number(user?.active_admin_invitations_count || 0) < Number(user?.max_admin_invitations);
    }
    return true;
  }, [
    definition.allowCreate,
    definition.readonly,
    definition.resource,
    user?.active_admin_invitations_count,
    user?.is_superuser,
    user?.max_admin_invitations,
    user?.max_owned_groups,
    user?.max_owned_subgroups,
    user?.owned_groups_count,
    user?.owned_subgroups_count,
    user?.tenant_can_register_groups,
    user?.tenant_can_register_subgroups,
    user?.tenant_can_send_invitations,
  ]);

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
        : definition.resource === "users"
          ? {}
        : definition.resource === "admin-invitations"
            ? {
                expires_at: addDaysToIsoDate(7),
                access_status: "active",
                ...(user?.is_superuser || user?.tenant_slug === "admin" ? {} : { target_tenant_slug: "usuario" }),
              }
        : null,
    );
    setError("");
    setIsModalOpen(true);
  };

  const handleEdit = async (item) => {
    if (definition.resource === "users") {
      try {
        const detailedItem = await resourceService.getOne(definition.resource, item.id, { force: true });
        setCurrent(detailedItem);
        setError("");
        setIsModalOpen(true);
      } catch (requestError) {
        setError(requestError?.response?.data?.detail || "Nao foi possivel carregar o usuario para edicao.");
      }
      return;
    }
    const rawItem =
      definition.customForm === "derivative-operation"
        ? normalizedRows.find((row) => row.id === item.id) || item
        : rows.find((row) => row.id === item.id) || item;
    setCurrent(
      definition.resource === "admin-invitations" && !user?.is_superuser && user?.tenant_slug !== "admin"
        ? {
            ...rawItem,
            target_tenant_slug: rawItem.target_tenant_slug || "usuario",
          }
        : rawItem,
    );
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
      const removed = await remove(item);
      if (removed) {
        await refreshProfile();
      }
      return;
    }
    const removed = await remove(item);
    if (removed) {
      await refreshProfile();
    }
  };

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
      await refreshProfile();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Nao foi possivel excluir as linhas selecionadas.");
    }
  };

  const handleReadonlyOpen = (item) => {
    setDetailItem(item);
  };

  const toolbarActions = useMemo(() => {
    if (!supportsAccessWorkflow) {
      return [];
    }
    return [
      {
        key: "request-access",
        label: definition.requestAccessLabel || "Solicitar acesso",
        className: "bubble-btn bubble-btn-light",
        onClick: () => {
          setAccessRequestValues([""]);
          setIsAccessRequestOpen(true);
        },
      },
    ];
  }, [definition.requestAccessLabel, supportsAccessWorkflow]);

  const handleApplyLogFilters = async () => {
    if (!hasAnyLogFilter) {
      setError("Aplique pelo menos um filtro antes de abrir a tabela de log.");
      setHasAppliedLogFilters(false);
      return;
    }
    setError("");
    setHasAppliedLogFilters(true);
    await load({ params: buildAuditLogParams(), force: true });
  };

  const handleClearLogFilters = () => {
    setLogFilters({
      tenant: "",
      user: "",
      action: "",
      formulario: "",
      objectId: "",
      createdAtFrom: "",
      createdAtTo: "",
      search: "",
    });
    setHasAppliedLogFilters(false);
    setFilters({ page: 1, search: "" });
    setCurrent(null);
    setError("");
  };

  const handleSubmitAccessRequest = async () => {
    const names = accessRequestValues.map((item) => item.trim()).filter(Boolean);
    if (!names.length) {
      setError("Informe pelo menos um nome para solicitar acesso.");
      return;
    }
    try {
      const { data } = await api.post(`/${definition.resource}/request-access/`, { names });
      setError("");
      window.alert(data?.detail || "Solicitacao enviada.");
      setIsAccessRequestOpen(false);
      setAccessRequestValues([""]);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Nao foi possivel enviar a solicitacao.");
    }
  };

  const handleReviewAccessRequest = async (requestId, actionName) => {
    try {
      await api.post(`/${definition.resource}/${actionName}-access-request/`, { request_id: requestId });
      setPendingAccessRequests((currentState) => currentState.filter((item) => item.id !== requestId));
      await load();
      await refreshProfile();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Nao foi possivel processar a solicitacao.");
    }
  };

  return (
    <div
      className={`resource-page${summaryCards.length ? " resource-page-with-summary" : ""}${
        filterCards.length ? " resource-page-with-filters" : ""
      }${latestSyncLabel ? " resource-page-with-meta" : ""}`}
    >
      <PageHeader title={definition.title} description={definition.description} />
      {latestSyncLabel ? (
        <div className="resource-last-sync">
          <span>{latestSyncLabel}</span>
          {loading ? <span className="resource-last-sync-status">atualizando</span> : null}
        </div>
      ) : null}
      {summaryCards.length ? (
        <section className="tenant-usage-panel resource-summary-panel">
          <div className="tenant-usage-header">
            <strong>Limites do usuario</strong>
          </div>
          <div className="tenant-usage-grid resource-summary-grid">
            {summaryCards.map((item) => (
              <article className={`tenant-usage-card ${item.tone}`} key={item.label}>
                <span className="tenant-usage-label">{item.label}</span>
                <div className="tenant-usage-value">
                  <strong>{item.current}</strong>
                  <span>/ {item.limitLabel}</span>
                </div>
                <span className="tenant-usage-ratio">{item.ratioLabel}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {filterCards.length ? (
        <section className="resource-filter-panel">
          <div
            ref={marqueeRef}
            className={`resource-filter-marquee${isMarqueeInteracting ? " is-interacting" : ""}`}
            onMouseDown={handleMarqueeMouseDown}
            onMouseMove={handleMarqueeMouseMove}
            onMouseUp={stopMarqueeInteraction}
            onMouseEnter={() => setIsMarqueeHovered(true)}
            onMouseLeave={handleMarqueeMouseLeave}
            onTouchStart={handleMarqueeTouchStart}
            onTouchMove={handleMarqueeTouchMove}
            onTouchEnd={handleMarqueeTouchEnd}
            onTouchCancel={handleMarqueeTouchEnd}
            onScroll={normalizeMarqueeScroll}
          >
            <div ref={marqueeTrackRef} className="resource-filter-track">
              {[filterCards, ...(filterCards.length > 1 ? [filterCards] : [])].map((sequence, sequenceIndex) => (
                <div
                  key={`resource-filter-sequence-${sequenceIndex}`}
                  ref={sequenceIndex === 0 ? marqueeSequenceRef : undefined}
                  className="resource-filter-sequence"
                  aria-hidden={sequenceIndex > 0 ? "true" : undefined}
                >
                  {sequence.map((item) => (
                    <button
                      key={`${item.key}-${sequenceIndex}`}
                      type="button"
                      className={`resource-filter-card${activeFilterCardKey === item.key ? " is-active" : ""}`}
                      onClick={() => applyFilterCardSearch(item.search)}
                      onMouseUp={() => {
                        if (!marqueeDragStateRef.current.moved) {
                          applyFilterCardSearch(item.search);
                        }
                      }}
                    >
                      <span className="resource-filter-card-label">{item.label}</span>
                      <strong>{item.firstRow?.price !== null && item.firstRow?.price !== undefined ? formatBrazilianNumber(item.firstRow.price, 2) : "—"}</strong>
                      <span
                        className={`resource-filter-card-variation${
                          parseLocalizedNumber(item.firstRow?.change_value) > 0
                            ? " is-positive"
                            : parseLocalizedNumber(item.firstRow?.change_value) < 0
                              ? " is-negative"
                              : ""
                        }`}
                      >
                        {item.firstRow?.change_value !== null && item.firstRow?.change_value !== undefined
                          ? `${formatSignedBrazilianNumber(item.firstRow.change_value, 2)} (${formatSignedBrazilianNumber(item.firstRow.change_percent, 2)}%)`
                          : "Sem variacao"}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {isAuditLogResource ? (
        <section className="audit-log-filters-card">
          <div className="form-header audit-log-filters-head">
            <div>
              <h3>Filtros do Log</h3>
              <div className="muted">A tabela so sera carregada depois que pelo menos um filtro for aplicado.</div>
            </div>
            <div className="audit-log-filters-actions">
              <button type="button" className="bubble-btn bubble-btn-light" onClick={handleClearLogFilters}>
                Limpar
              </button>
              <button
                type="button"
                className="bubble-btn bubble-btn-primary"
                onClick={handleApplyLogFilters}
                disabled={loading || !hasAnyLogFilter}
              >
                {loading ? "Filtrando..." : "Aplicar filtros"}
              </button>
            </div>
          </div>
          <div className="form-grid audit-log-filters-grid">
            {user?.is_superuser ? (
              <div className="field">
                <label htmlFor="audit-log-tenant">Tenant</label>
                <select
                  id="audit-log-tenant"
                  className="form-control"
                  value={logFilters.tenant}
                  onChange={(event) => setLogFilters((currentState) => ({ ...currentState, tenant: event.target.value }))}
                >
                  <option value="">Todos</option>
                  {(lookupOptions.tenants || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="audit-log-user">Alterado por</label>
              <select
                id="audit-log-user"
                className="form-control"
                value={logFilters.user}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, user: event.target.value }))}
              >
                <option value="">Todos</option>
                {(lookupOptions.users || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name || item.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="audit-log-action">Acao</label>
              <select
                id="audit-log-action"
                className="form-control"
                value={logFilters.action}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, action: event.target.value }))}
              >
                {logActionOptions.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="audit-log-formulario">Formulario</label>
              <select
                id="audit-log-formulario"
                className="form-control"
                value={logFilters.formulario}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, formulario: event.target.value }))}
              >
                {logFormOptions.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="audit-log-object-id">ID alterado</label>
              <input
                id="audit-log-object-id"
                className="form-control"
                type="number"
                min="1"
                value={logFilters.objectId}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, objectId: event.target.value }))}
                placeholder="Ex.: 15"
              />
            </div>
            <div className="field">
              <label htmlFor="audit-log-created-at-from">Data inicial</label>
              <input
                id="audit-log-created-at-from"
                className="form-control"
                type="date"
                value={logFilters.createdAtFrom}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, createdAtFrom: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="audit-log-created-at-to">Data final</label>
              <input
                id="audit-log-created-at-to"
                className="form-control"
                type="date"
                value={logFilters.createdAtTo}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, createdAtTo: event.target.value }))}
              />
            </div>
            <div className="field field-full">
              <label htmlFor="audit-log-search">Busca textual</label>
              <input
                id="audit-log-search"
                className="form-control"
                type="text"
                value={logFilters.search}
                onChange={(event) => setLogFilters((currentState) => ({ ...currentState, search: event.target.value }))}
                placeholder="Descricao ou formulario"
              />
            </div>
          </div>
          {!hasAppliedLogFilters ? <div className="audit-log-filters-hint field-help">Nenhum registro sera exibido ate que voce aplique os filtros.</div> : null}
        </section>
      ) : null}
      {isAuditLogResource && !hasAppliedLogFilters ? null : useSimpleQuotesTable ? (
        <SimpleQuotesTable
          title={loading ? `${definition.title} carregando...` : definition.title}
          columns={effectiveTableColumns}
          rows={displayRows}
          searchValue={filters.search || ""}
          searchPlaceholder={definition.searchPlaceholder || "Buscar..."}
          onSearchChange={(value) => setFilters((currentFilters) => ({ ...currentFilters, search: value, page: 1 }))}
          onClear={() => {
            setFilters({ page: 1, search: "" });
            setCurrent(null);
          }}
          onTickerClick={(row) => openTradingviewPopupWindow(buildTradingviewChartUrl(row))}
        />
      ) : (
        <ResourceTable
          definition={definition}
          rows={rows}
          searchValue={filters.search || ""}
          searchPlaceholder={definition.searchPlaceholder || "Buscar..."}
          onSearchChange={(value) => setFilters((currentFilters) => ({ ...currentFilters, search: value, page: 1 }))}
          onCreate={canCreateRecord ? handleCreate : undefined}
          onClear={() => {
            setFilters({ page: 1, search: "" });
            setCurrent(null);
          }}
          onEdit={definition.allowEdit === false ? undefined : (definition.readonly ? (definition.disableReadonlyDetails ? undefined : handleReadonlyOpen) : handleEdit)}
          onDuplicate={definition.readonly || definition.allowDuplicate === false ? undefined : handleDuplicate}
          onDelete={definition.allowDelete === false || !user?.is_superuser || (definition.readonly && definition.allowDelete !== true) ? undefined : handleDelete}
          onDeleteSelected={definition.allowDelete === false || !user?.is_superuser || (definition.readonly && definition.allowDelete !== true) ? undefined : handleDeleteSelected}
          onRowClick={definition.readonly ? (definition.disableReadonlyDetails ? undefined : handleReadonlyOpen) : undefined}
          selectedId={current?.id}
          rowQuickActions={rowQuickActions}
          toolbarActions={toolbarActions}
          showClearButton={definition.showClearButton !== false}
          tableHeight={definition.tableHeight}
        />
      )}

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
            if (modalBusyMessage) {
              return;
            }
            setIsModalOpen(false);
            setCurrent(null);
            setAttachments([]);
            setError("");
            clearOpenQuery();
          }}
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
                  posicao: itemPayload.posicao || "",
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
                  if (!primaryRecord || updated.id === current.id) {
                    primaryRecord = updated;
                  }
                } else {
                  const created = await resourceService.create(definition.resource, rowPayload);
                  savedRows.push(created);
                  keepIds.push(created.id);
                  if (!primaryRecord) {
                    primaryRecord = created;
                  }
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
                  posicao: itemPayload.posicao || "",
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
                if (!primaryRecord) {
                  primaryRecord = created;
                }
              }
            }
            if (savedRows.length) {
              upsertRows(savedRows);
            }
            if (removedIds.length) {
              removeRowsById(removedIds);
            }
            await refreshProfile();

            if (primaryRecord) {
              if (files.length) {
                await resourceService.uploadAttachments(definition.resource, primaryRecord.id, files);
              }
              setIsModalOpen(false);
              setCurrent(null);
              setAttachments([]);
              setError("");
              clearOpenQuery();
            }
          }}
        />
      ) : null}

      {isModalOpen && !definition.readonly && definition.customForm !== "derivative-operation" ? (
        <ResourceForm
          title={current ? `Editar ${definition.title}` : `Novo ${definition.title}`}
          fields={activeFormFields}
          initialValues={current || {}}
          submitLabel={definition.submitLabel || "Salvar"}
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
            clearOpenQuery();
          }}
          onSubmit={async (payload, rawValues) => {
            const formFields = activeFormFields;
            const attachmentField = formFields.find((field) => field.type === "file-multi");
            const files = attachmentField && Array.isArray(rawValues[attachmentField.name]) ? rawValues[attachmentField.name] : [];
            let cleanPayload = attachmentField
              ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== attachmentField.name))
              : payload;

            try {
              if (definition.resource === "admin-invitations" && !user?.is_superuser && user?.tenant_slug !== "admin") {
                cleanPayload = {
                  ...cleanPayload,
                  target_tenant_slug: "usuario",
                };
              }

              if (definition.resource === "admin-invitations") {
                setModalBusyMessage("Enviando...");
              }

              if (definition.resource === "physical-sales" && cleanPayload.cultura_produto) {
                const crops = await resourceService.listAll("crops");
                const selectedCrop = crops.find((item) => (item.ativo || item.cultura) === cleanPayload.cultura_produto);
                if (selectedCrop) {
                  cleanPayload.cultura = selectedCrop.id;
                }
              }

              const saved = await save(cleanPayload, current);
              if (saved) {
                await refreshProfile();
                if (attachmentField && files.length) {
                  await resourceService.uploadAttachments(definition.resource, saved.id, files);
                }
                setIsModalOpen(false);
                setCurrent(null);
                setAttachments([]);
                setError("");
                clearOpenQuery();
              }
            } finally {
              setModalBusyMessage("");
            }
          }}
        />
      ) : null}
      {modalBusyMessage ? (
        <div className="modal-busy-backdrop" role="status" aria-live="polite">
          <div className="modal-busy-card">
            <strong>{modalBusyMessage}</strong>
          </div>
        </div>
      ) : null}

      {isAccessRequestOpen ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setIsAccessRequestOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <strong>{definition.requestAccessTitle || "Solicitar acesso"}</strong>
                <div className="muted">Informe um ou mais nomes e envie para aprovacao do proprietario.</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setIsAccessRequestOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="form-grid">
              {accessRequestValues.map((item, index) => (
                <div className="field field-full" key={`${definition.resource}-request-${index}`}>
                  <label>{definition.requestAccessPlaceholder || "Nome"}</label>
                  <input
                    value={item}
                    onChange={(event) =>
                      setAccessRequestValues((currentState) =>
                        currentState.map((currentItem, currentIndex) => (currentIndex === index ? event.target.value : currentItem)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setAccessRequestValues((currentState) => [...currentState, ""])}>
                Adicionar mais um
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSubmitAccessRequest}>
                Enviar solicitacao
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPendingAccessOpen && pendingAccessRequests.length ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setIsPendingAccessOpen(false)} />
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <strong>Solicitacoes pendentes</strong>
                <div className="muted">Aprove ou rejeite os pedidos de acesso aos seus registros.</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setIsPendingAccessOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="access-request-list">
              {pendingAccessRequests.map((item) => (
                <div className="access-request-item" key={item.id}>
                  <div className="access-request-copy">
                    <div className="access-request-badge">
                      {definition.resource === "groups" ? "Grupo" : "Subgrupo"}
                    </div>
                    <strong>{item.group_name || item.subgroup_name}</strong>
                    <div className="access-request-user">
                      <span>{item.requester_name || "Usuario solicitante"}</span>
                      <small>Email: {item.requester_email || "nao informado"}</small>
                    </div>
                  </div>
                  <div className="access-request-actions">
                    <button className="btn btn-secondary" type="button" onClick={() => handleReviewAccessRequest(item.id, "reject")}>
                      Rejeitar
                    </button>
                    <button className="btn btn-primary" type="button" onClick={() => handleReviewAccessRequest(item.id, "approve")}>
                      Aprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
                <div
                  className={`field${
                    field.type === "textarea" || (definition.resource === "audit-logs" && field.name === "description") ? " field-full" : ""
                  }`}
                  key={field.name}
                >
                  <label>{field.label}</label>
                  <div className="detail-value">
                    {definition.resource === "audit-logs" && field.name === "description" && Array.isArray(detailItem.alteracoes) && detailItem.alteracoes.length ? (
                      <div className="table-wrapper audit-log-detail-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Campo</th>
                              <th>De</th>
                              <th>Para</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailItem.alteracoes.map((item, index) => (
                              <tr key={`${item?.campo || "campo"}-${index}`}>
                                <td>{formatAuditChangeValue(item?.campo)}</td>
                                <td>{formatAuditChangeValue(item?.de)}</td>
                                <td>{formatAuditChangeValue(item?.para)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : field.type === "date"
                      ? formatBrazilianDate(detailItem[field.name], "—")
                      : field.type === "datetime"
                        ? formatBrazilianDateTime(detailItem[field.name], "—")
                      : field.name === "phone" || String(field.label || "").trim().toLowerCase() === "telefone"
                        ? formatBrazilianPhone(detailItem[field.name])
                        : (detailItem[field.name] || "—")}
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
