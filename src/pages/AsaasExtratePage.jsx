import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";

const ASAAS_API_KEY = import.meta.env.VITE_ASAAS_API_KEY;
const ASAAS_BASE_URL = "https://api.asaas.com/v3";
const PAGE_LIMIT = 20;

const STATUS_LABELS = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  RECEIVED_IN_CASH: "Recebido em caixa",
  REFUND_REQUESTED: "Estorno solicitado",
  CHARGEBACK_REQUESTED: "Chargeback solicitado",
  CHARGEBACK_DISPUTE: "Chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão de chargeback",
  DUNNING_REQUESTED: "Dunning solicitado",
  DUNNING_RECEIVED: "Dunning recebido",
  AWAITING_RISK_ANALYSIS: "Aguardando análise de risco",
};

const BILLING_TYPE_LABELS = {
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  PIX: "PIX",
  UNDEFINED: "Indefinido",
};

const STATUS_STYLES = {
  PENDING: { background: "rgba(234, 179, 8, 0.12)", color: "#b45309" },
  RECEIVED: { background: "rgba(34, 197, 94, 0.12)", color: "#15803d" },
  CONFIRMED: { background: "rgba(34, 197, 94, 0.12)", color: "#15803d" },
  OVERDUE: { background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" },
  REFUNDED: { background: "rgba(148, 163, 184, 0.12)", color: "#64748b" },
  RECEIVED_IN_CASH: { background: "rgba(34, 197, 94, 0.12)", color: "#15803d" },
  REFUND_REQUESTED: { background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" },
  DEFAULT: { background: "rgba(14, 165, 233, 0.12)", color: "#0369a1" },
};

function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.DEFAULT;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function formatCurrency(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function fetchAsaasPayments({ dateCreatedGte, dateCreatedLte, status, billingType, offset = 0 }) {
  const params = { offset, limit: PAGE_LIMIT };
  if (dateCreatedGte) params.dateCreatedGte = dateCreatedGte;
  if (dateCreatedLte) params.dateCreatedLte = dateCreatedLte;
  if (status) params.status = status;
  if (billingType) params.billingType = billingType;

  const response = await axios.get(`${ASAAS_BASE_URL}/payments`, {
    headers: { access_token: ASAAS_API_KEY },
    params,
  });

  return response.data;
}

export function AsaasExtratePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const [filters, setFilters] = useState({
    dateCreatedGte: firstDayOfMonthIso(),
    dateCreatedLte: todayIsoDate(),
    status: "",
    billingType: "",
  });

  const totalPages = Math.ceil(totalCount / PAGE_LIMIT) || 1;

  const load = async ({ pageIndex = 0, appliedFilters = filters } = {}) => {
    if (!ASAAS_API_KEY) {
      setError("Chave de API Asaas não configurada. Defina VITE_ASAAS_API_KEY no arquivo .env.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await fetchAsaasPayments({
        ...appliedFilters,
        offset: pageIndex * PAGE_LIMIT,
      });
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotalCount(data?.totalCount ?? 0);
      setCurrentPage(pageIndex);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.[0]?.description ||
        err?.response?.data?.detail ||
        err?.message ||
        "Erro ao buscar extrato de recebimentos.";
      setError(msg);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearch = () => {
    void load({ pageIndex: 0, appliedFilters: filters });
  };

  const handleClear = () => {
    const reset = {
      dateCreatedGte: firstDayOfMonthIso(),
      dateCreatedLte: todayIsoDate(),
      status: "",
      billingType: "",
    };
    setFilters(reset);
    void load({ pageIndex: 0, appliedFilters: reset });
  };

  const handlePrev = () => {
    if (currentPage > 0) void load({ pageIndex: currentPage - 1 });
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) void load({ pageIndex: currentPage + 1 });
  };

  const totalReceived = useMemo(
    () =>
      rows
        .filter((r) => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(r.status))
        .reduce((sum, r) => sum + Number(r.value || 0), 0),
    [rows],
  );

  return (
    <div className="page-stack asaas-extrato-page">
      <PageHeader
        tag="Admin"
        title="Extrato de Recebimentos"
        description="Consulta de cobranças e pagamentos recebidos via plataforma Asaas."
      />

      {/* Toolbar / Filtros */}
      <section className="panel asaas-extrato-toolbar">
        <div className="asaas-extrato-filters">
          <label className="field">
            <span>Data criação (de)</span>
            <input
              type="date"
              className="form-control"
              value={filters.dateCreatedGte}
              onChange={(e) => handleFilterChange("dateCreatedGte", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Data criação (até)</span>
            <input
              type="date"
              className="form-control"
              value={filters.dateCreatedLte}
              onChange={(e) => handleFilterChange("dateCreatedLte", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              className="form-control"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Forma de pagamento</span>
            <select
              className="form-control"
              value={filters.billingType}
              onChange={(e) => handleFilterChange("billingType", e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(BILLING_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="asaas-extrato-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={loading}>
            Limpar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </section>

      {/* Cards de resumo */}
      <section className="asaas-extrato-summary">
        <article className="asaas-extrato-summary-card">
          <span>Total de cobranças</span>
          <strong>{loading ? "..." : totalCount}</strong>
        </article>
        <article className="asaas-extrato-summary-card">
          <span>Exibindo</span>
          <strong>{loading ? "..." : rows.length}</strong>
        </article>
        <article className="asaas-extrato-summary-card asaas-extrato-summary-card--green">
          <span>Recebido (página)</span>
          <strong>{loading ? "..." : formatCurrency(totalReceived)}</strong>
        </article>
      </section>

      {/* Tabela */}
      <section className="panel asaas-extrato-table-panel">
        {error ? <div className="form-error" style={{ margin: "16px 20px" }}>{error}</div> : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="asaas-extrato-empty">Nenhum recebimento encontrado para os filtros selecionados.</div>
        ) : null}

        {!error ? (
          <div className="table-wrapper">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Cliente (ID)</th>
                  <th>Descrição</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th>Valor líquido</th>
                  <th>Vencimento</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "32px", opacity: 0.6 }}>
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const statusStyle = getStatusStyle(row.status);
                    return (
                      <tr key={row.id}>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: statusStyle.background,
                              color: statusStyle.color,
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {STATUS_LABELS[row.status] || row.status || "—"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "monospace", fontSize: "0.8rem", opacity: 0.8 }}>
                            {row.customer || "—"}
                          </span>
                        </td>
                        <td>{row.description || "—"}</td>
                        <td>{BILLING_TYPE_LABELS[row.billingType] || row.billingType || "—"}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(row.value)}</td>
                        <td>{formatCurrency(row.netValue)}</td>
                        <td>{formatDate(row.dueDate)}</td>
                        <td>{formatDate(row.paymentDate)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Paginação */}
        {!error && !loading && rows.length > 0 ? (
          <div className="asaas-extrato-pagination">
            <button type="button" className="btn btn-secondary" onClick={handlePrev} disabled={currentPage === 0}>
              Anterior
            </button>
            <span className="asaas-extrato-pagination-info">
              Página {currentPage + 1} de {totalPages} &nbsp;·&nbsp; {totalCount} registro{totalCount !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNext}
              disabled={currentPage >= totalPages - 1}
            >
              Próxima
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
