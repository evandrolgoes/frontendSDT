import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { api } from "../services/api";

// ─── Column definitions ────────────────────────────────────────────────────
// scenario matches the backend SCENARIO_CHOICES key
const COLUMNS = [
  { key: "c1", scenario: "current", label: "Cenário Atual", year: "2026", date: "20/09/2025", section: "ANÁLISES REALIZADAS" },
  { key: "c2", scenario: "sim_1", label: "Simulação 1", year: "2026", date: "20/09/2026", section: "ANÁLISES REALIZADAS" },
  { key: "c3", scenario: "sim_2", label: "Simulação 2", year: "2026", date: "20/09/2026", section: "ANÁLISES REALIZADAS" },
  { key: "c4", scenario: "proj_2027", label: "2027", year: "2027", date: "20/09/2026", section: "PROJEÇÕES" },
  { key: "c5", scenario: "proj_2028", label: "2028", year: "2028", date: "20/09/2027", section: "PROJEÇÕES" },
];

// ─── Static Balanço row definitions ───────────────────────────────────────
// key: stable identifier used to read/write from the API
// type: "total" | "section" | "subrow" | "row" | "divider"
// computed: if true the row shows auto-sum of its children sections
const BALANCO_ROWS = [
  { type: "total", key: "ativo_total", label: "ATIVO TOTAL" },
  { type: "section", key: "ativo_circulante", label: "Ativo Circulante" },
  { type: "subrow", key: "caixa_graos", label: "Caixa / Grãos" },
  { type: "subrow", key: "estoque_graos", label: "Estoque Grãos" },
  { type: "subrow", key: "estoque_insumos", label: "Estoque Insumos" },
  { type: "subrow", key: "ativo_biologico", label: "Ativo Biológico" },
  { type: "subrow", key: "outras_ativo_circulante", label: "Outras Ativo Circulante" },
  { type: "subrow", key: "arrendamentos_rs", label: "Arrendamentos (R$)" },
  { type: "subrow", key: "arrendamentos_usd", label: "Arrendamentos (USD)" },
  { type: "section", key: "ativo_lp", label: "Ativo Longo Prazo" },
  { type: "subrow", key: "ativo_biologico_lp", label: "Ativo Biológico LP" },
  { type: "subrow", key: "arrendamentos_lp_ativo", label: "Arrendamentos LP" },
  { type: "subrow", key: "imobilizado_lp", label: "Imobilizado LP" },
  { type: "section", key: "ativo_permanente", label: "Ativo Permanente" },
  { type: "subrow", key: "terras_equipamentos", label: "Terras e Equipamentos" },
  { type: "subrow", key: "benfeitorias", label: "Benfeitorias" },
  { type: "subrow", key: "silos_armazens", label: "Silos / Armazéns" },
  { type: "subrow", key: "imoveis_urbanos", label: "Imóveis Urbanos" },
  { type: "subrow", key: "participacoes", label: "Participações" },
  { type: "subrow", key: "ativo_permanente_outros", label: "Outros" },
  { type: "divider" },
  { type: "total", key: "passivo_total", label: "PASSIVO TOTAL" },
  { type: "section", key: "passivo_circulante", label: "Passivo Circulante" },
  { type: "subrow", key: "banco_receb_cdcb", label: "Banco Receb. CDCB" },
  { type: "subrow", key: "banco_recep_cp", label: "Banco Recep." },
  { type: "subrow", key: "fornecedores_custeio", label: "Fornecedores Custeio" },
  { type: "subrow", key: "arrendamentos_cf", label: "Arrendamentos CF" },
  { type: "subrow", key: "fornec_dist_lucros", label: "Fornec. / Dist. Lucros" },
  { type: "section", key: "passivo_lp", label: "Passivo Longo Prazo" },
  { type: "subrow", key: "banco_recep_lp", label: "Banco Recep." },
  { type: "subrow", key: "arrendamentos_lp_passivo", label: "Arrendamentos LP" },
  { type: "subrow", key: "passivo_lp_outros", label: "Outros" },
  { type: "subrow", key: "debentures", label: "Debêntures" },
  { type: "divider" },
  { type: "total", key: "patrimonio_liquido", label: "PATRIMÔNIO LÍQUIDO" },
];

// ─── Static DRE summary rows (below the dynamic crop sections) ────────────
const DRE_SUMMARY_ROWS = [
  { type: "total", key: "cmv_total", label: "CMV Total" },
  { type: "total", key: "lucro_bruto", label: "Lucro Bruto" },
  { type: "divider" },
  { type: "row", key: "resultado_derivativos", label: "Resultado Derivativos" },
  { type: "row", key: "outras_entradas", label: "Outras Entradas" },
  { type: "row", key: "outras_saidas", label: "Outras Saídas" },
  { type: "row", key: "despesas_financeiras", label: "Despesas Financeiras" },
  { type: "row", key: "resultado_apos_df", label: "Resultado Após D.F." },
  { type: "divider" },
  { type: "row", key: "ebitda_total", label: "EBITDA Total (R$)", format: "number" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmtNumber(value, decimals = 0) {
  if (value == null) return "–";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtValue(value, format = "number") {
  if (value == null) return "–";
  if (format === "pct") return `${fmtNumber(value, 0)}%`;
  return fmtNumber(value, 0);
}

function getRatingStyle(score) {
  if (score <= 3) return { background: "#fecaca", color: "#991b1b" };
  if (score <= 5) return { background: "#fef08a", color: "#713f12" };
  return { background: "#bbf7d0", color: "#14532d" };
}

function getRatingFinalStyle(score) {
  if (score < 3.5) return { background: "#ef4444", color: "#fff" };
  if (score < 5.5) return { background: "#f59e0b", color: "#fff" };
  return { background: "#22c55e", color: "#fff" };
}

// ─── Section sum computation ───────────────────────────────────────────────
function computeSectionSums(rows, getValueFn) {
  const sums = {};
  let activeSectionIdx = null;

  rows.forEach((row, ri) => {
    if (row.type === "section") {
      activeSectionIdx = ri;
      sums[ri] = new Array(COLUMNS.length).fill(null);
    } else if (row.type === "subrow" && activeSectionIdx !== null) {
      COLUMNS.forEach((col, ci) => {
        const v = getValueFn(row, col);
        const n = v != null ? Number(v) : null;
        if (n !== null && !Number.isNaN(n)) {
          sums[activeSectionIdx][ci] = (sums[activeSectionIdx][ci] ?? 0) + n;
        }
      });
    } else {
      activeSectionIdx = null;
    }
  });

  return sums;
}

// ─── Build API query string from filter ────────────────────────────────────
function buildFilterParams(filter) {
  const params = new URLSearchParams();
  (filter.grupo || []).forEach((id) => params.append("grupo[]", id));
  (filter.subgrupo || []).forEach((id) => params.append("subgrupo[]", id));
  (filter.cultura || []).forEach((id) => params.append("cultura[]", id));
  (filter.safra || []).forEach((id) => params.append("safra[]", id));
  return params.toString();
}

// ─── Column header ─────────────────────────────────────────────────────────
function TableColumnHeaders({ columns }) {
  const sections = columns.reduce((acc, col) => {
    const last = acc[acc.length - 1];
    if (last && last.label === col.section) last.span += 1;
    else acc.push({ label: col.section, span: 1 });
    return acc;
  }, []);

  return (
    <thead>
      <tr className="dre-table-section-row">
        <th className="dre-table-label-col" rowSpan={3} />
        {sections.map((s, i) => (
          <th key={i} colSpan={s.span} className="dre-table-section-header">
            {s.label}
          </th>
        ))}
      </tr>
      <tr className="dre-table-year-row">
        {columns.map((col) => (
          <th key={col.key} className="dre-table-year">{col.year}</th>
        ))}
      </tr>
      <tr className="dre-table-date-row">
        {columns.map((col) => (
          <th key={col.key} className="dre-table-col-header">
            <div className="dre-col-label">{col.label}</div>
            <div className="dre-col-date">{col.date}</div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Editable cell ─────────────────────────────────────────────────────────
function EditableCell({ value, format, isEditing, draft, onDraftChange, onStartEdit, onCommit, onCancel }) {
  if (isEditing) {
    return (
      <input
        className="dre-input"
        type="number"
        value={draft}
        autoFocus
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }
  const isNegative = typeof value === "number" && value < 0;
  return (
    <span
      className={`dre-cell-value dre-cell-editable${isNegative ? " dre-value-negative" : ""}`}
      onClick={onStartEdit}
      title="Clique para editar"
    >
      {fmtValue(value, format)}
    </span>
  );
}

// ─── Table state hook ──────────────────────────────────────────────────────
// rows: array of row defs with `key`
// getApiValue(rowKey, scenario): function to get computed/stored value from API
// onSave(rowKey, scenario, colIndex, valor): callback to persist changes
function useTableState(rows, getApiValue, onSave) {
  // Local overrides: { rowKey: { colIndex: value } }
  const [localValues, setLocalValues] = useState({});
  const [editing, setEditing] = useState(null); // { ri, ci }
  const [draft, setDraft] = useState("");

  // Reset local overrides when API data changes (new filter selection)
  const resetLocal = useCallback(() => setLocalValues({}), []);

  const getValue = useCallback(
    (row, col, ci) => {
      if (!row.key) return null;
      // Local override takes priority
      if (localValues[row.key]?.[ci] !== undefined) return localValues[row.key][ci];
      // Then API value
      return getApiValue(row.key, col.scenario);
    },
    [localValues, getApiValue],
  );

  const sectionSums = useMemo(
    () =>
      computeSectionSums(rows, (row, col) => {
        const ci = COLUMNS.indexOf(col);
        return getValue(row, col, ci);
      }),
    [rows, getValue],
  );

  const startEdit = useCallback(
    (ri, ci) => {
      const row = rows[ri];
      const col = COLUMNS[ci];
      const current = getValue(row, col, ci);
      setEditing({ ri, ci });
      setDraft(current != null ? String(current) : "");
    },
    [rows, getValue],
  );

  const commitEdit = useCallback(
    (ri, ci, raw) => {
      const cleaned = raw.trim().replace(",", ".");
      const num = cleaned === "" ? null : Number(cleaned);
      const finalVal = num === null || Number.isNaN(num) ? null : num;
      const rowKey = rows[ri]?.key;
      if (rowKey) {
        setLocalValues((prev) => ({
          ...prev,
          [rowKey]: { ...prev[rowKey], [ci]: finalVal },
        }));
        onSave(rowKey, COLUMNS[ci].scenario, ci, finalVal);
      }
      setEditing(null);
    },
    [rows, onSave],
  );

  const cancelEdit = useCallback(() => setEditing(null), []);

  return { getValue, sectionSums, editing, draft, setDraft, startEdit, commitEdit, cancelEdit, resetLocal };
}

// ─── Generic financial row ─────────────────────────────────────────────────
function FinancialRow({ row, rowIndex, columns, tableState }) {
  const { getValue, sectionSums, editing, draft, setDraft, startEdit, commitEdit, cancelEdit } = tableState;

  if (row.type === "divider") {
    return <tr className="dre-table-divider"><td colSpan={columns.length + 1} /></tr>;
  }

  const rowClass = {
    total: "dre-row-total",
    section: "dre-row-section",
    subrow: "dre-row-sub",
    row: "dre-row-data",
  }[row.type] || "dre-row-data";

  const isEditable = row.type === "subrow" || row.type === "row";
  const isSection = row.type === "section";

  return (
    <tr className={rowClass}>
      <td className="dre-table-label">{row.label}</td>
      {columns.map((col, ci) => {
        let value;
        if (isSection) {
          value = sectionSums[rowIndex]?.[ci] ?? null;
        } else if (isEditable) {
          value = getValue(row, col, ci);
        } else {
          // total rows: getValue with no section sum
          value = getValue(row, col, ci);
        }

        const isNegative = typeof value === "number" && value < 0;
        const isEditingCell = editing?.ri === rowIndex && editing?.ci === ci;

        return (
          <td key={col.key} className={`dre-table-value${isNegative && !isEditable ? " dre-value-negative" : ""}`}>
            {isEditable ? (
              <EditableCell
                value={value}
                format={row.format}
                isEditing={isEditingCell}
                draft={draft}
                onDraftChange={setDraft}
                onStartEdit={() => startEdit(rowIndex, ci)}
                onCommit={(raw) => commitEdit(rowIndex, ci, raw)}
                onCancel={cancelEdit}
              />
            ) : (
              <span className={isNegative ? "dre-value-negative" : ""}>{fmtValue(value, row.format)}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Balanço table ─────────────────────────────────────────────────────────
function BalancoTable({ apiData, onSave, columns }) {
  const getApiValue = useCallback(
    (key, scenario) => {
      // Balanço: always from stored entries
      return apiData?.entries?.balanco?.[scenario]?.[key] ?? null;
    },
    [apiData],
  );

  const tableState = useTableState(BALANCO_ROWS, getApiValue, (key, scenario, _ci, valor) => {
    onSave({ table: "balanco", key, scenario, valor });
  });

  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>BALANÇO</td>
            </tr>
            {BALANCO_ROWS.map((row, i) => (
              <FinancialRow key={i} row={row} rowIndex={i} columns={columns} tableState={tableState} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DRE table ─────────────────────────────────────────────────────────────
function DRETable({ apiData, onSave, columns }) {
  // Build dynamic DRE rows: one section per cultura from API + static summary rows
  const culturas = apiData?.dre_current?.culturas || [];

  const dreRows = useMemo(() => {
    const rows = [
      { type: "total", key: "vendas_liquidas", label: "Vendas Líquidas" },
    ];

    culturas.forEach((crop) => {
      const prefix = `crop_${crop.id}`;
      rows.push({ type: "section", key: `${prefix}_section`, label: `${crop.nome} - Faturamento` });
      rows.push({ type: "subrow", key: `${prefix}_producao_total`, label: "Produção Total" });
      rows.push({ type: "subrow", key: `${prefix}_retencao_pct`, label: "Retenção (%)", format: "pct" });
      rows.push({ type: "subrow", key: `${prefix}_preco_medio`, label: "Preço Médio" });
      rows.push({ type: "subrow", key: `${prefix}_custo_realizado`, label: "Custo Total (R$)" });
      rows.push({ type: "subrow", key: `${prefix}_ebitda_pct`, label: "Ebitda (%)", format: "pct" });
    });

    rows.push({ type: "divider" });
    rows.push(...DRE_SUMMARY_ROWS);
    return rows;
  }, [culturas]);

  const getApiValue = useCallback(
    (key, scenario) => {
      if (scenario === "current") {
        // Map row keys to computed summary values
        const summary = apiData?.dre_current?.summary || {};
        if (summary[key] !== undefined) return summary[key];

        // Per-crop keys: "crop_{id}_{field}"
        const match = key.match(/^crop_(\d+)_(.+)$/);
        if (match) {
          const cropId = parseInt(match[1], 10);
          const field = match[2];
          const crop = (apiData?.dre_current?.culturas || []).find((c) => c.id === cropId);
          return crop ? (crop[field] ?? null) : null;
        }
      }
      // Other scenarios: from stored entries
      return apiData?.entries?.dre?.[scenario]?.[key] ?? null;
    },
    [apiData],
  );

  const tableState = useTableState(dreRows, getApiValue, (key, scenario, _ci, valor) => {
    onSave({ table: "dre", key, scenario, valor });
  });

  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>DRE</td>
            </tr>
            {dreRows.map((row, i) => (
              <FinancialRow key={i} row={row} rowIndex={i} columns={columns} tableState={tableState} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tresholds (static / editable) ─────────────────────────────────────────
const TRESHOLDS_ROWS = [
  { label: "Dívida / Receita", values: [2.42, 1.53, 1.09, 1.36, 1.15] },
  { label: "Alavancagem Operacional (Dívida/Ebitda)", values: [5.76, 3.65, 2.60, 3.74, 3.17] },
  { label: "Dívida Total / Ativo Imobilizado", values: [0.17, 0.11, 0.09, 0.13, 0.11] },
  { label: "Cobertura Serviço da Dívida", values: [0.76, 0.41, 0.45, 0.44, 1.22] },
  { label: "Liquidez Corrente", values: [0.42, 0.95, 1.85, 0.76, 0.76] },
  { label: "Solvência (Patrimônio sobre o Ativo)", values: [0.94, 0.94, 0.93, 0.94, 0.94] },
];

const RATING_ROWS = [
  { label: "Dívida / Receita", values: [1, 1, 5, 2, 4] },
  { label: "Alavancagem Operacional (Dívida/Ebitda)", values: [3, 5, 6, 5, 5] },
  { label: "Dívida Total / Ativo Imobilizado", values: [7, 8, 9, 8, 8] },
  { label: "Cobertura Serviço da Dívida", values: [2, 1, 1, 1, 5] },
  { label: "Liquidez Corrente", values: [1, 4, 8, 3, 3] },
  { label: "Solvência (Patrimônio sobre o Ativo)", values: [10, 10, 10, 10, 10] },
];

const RATING_FINAL_NUMERIC = [2.9, 4.5, 6.3, 4.0, 5.0];
const RATING_FINAL_LABEL = ["B3", "B2 / B1", "Ba6 / Ba5", "—", "—"];

function TresholdsTable({ columns }) {
  const [editValues, setEditValues] = useState(() =>
    TRESHOLDS_ROWS.map((row) => [...(row.values || [])]),
  );
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>TRESHOLDS</td>
            </tr>
            {TRESHOLDS_ROWS.map((row, ri) => (
              <tr key={ri} className="dre-row-data">
                <td className="dre-table-label">{row.label}</td>
                {columns.map((col, ci) => {
                  const value = editValues[ri]?.[ci] ?? null;
                  const isEditingCell = editing?.ri === ri && editing?.ci === ci;
                  return (
                    <td key={col.key} className="dre-table-value">
                      {isEditingCell ? (
                        <input
                          className="dre-input"
                          type="number"
                          value={draft}
                          autoFocus
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            const n = draft.trim() === "" ? null : Number(draft.replace(",", "."));
                            setEditValues((prev) => {
                              const next = prev.map((r) => [...r]);
                              next[ri][ci] = n ?? null;
                              return next;
                            });
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.target.blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <span
                          className="dre-cell-value dre-cell-editable"
                          onClick={() => {
                            setEditing({ ri, ci });
                            setDraft(value != null ? String(value) : "");
                          }}
                          title="Clique para editar"
                        >
                          {fmtNumber(value, 2)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RatingTable({ columns }) {
  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>RATING DE CRÉDITO</td>
            </tr>
            {RATING_ROWS.map((row, i) => (
              <tr key={i} className="dre-row-data">
                <td className="dre-table-label">{row.label}</td>
                {columns.map((col, j) => {
                  const score = row.values ? row.values[j] : null;
                  return (
                    <td key={col.key} className="dre-table-value dre-rating-cell" style={score != null ? getRatingStyle(score) : {}}>
                      {score ?? "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="dre-row-rating-final">
              <td className="dre-table-label">Rating Final</td>
              {columns.map((col, j) => {
                const score = RATING_FINAL_NUMERIC[j];
                return (
                  <td key={col.key} className="dre-table-value dre-rating-cell dre-rating-final-cell" style={getRatingFinalStyle(score)}>
                    {fmtNumber(score, 1)}
                  </td>
                );
              })}
            </tr>
            <tr className="dre-row-rating-final">
              <td className="dre-table-label">Rating Final</td>
              {columns.map((col, j) => {
                const score = RATING_FINAL_NUMERIC[j];
                const label = RATING_FINAL_LABEL[j];
                return (
                  <td key={col.key} className="dre-table-value dre-rating-cell dre-rating-final-cell"
                    style={label && label !== "—" ? getRatingFinalStyle(score) : {}}>
                    {label || "–"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export function DreBalacoPage() {
  const { filter } = useDashboardFilter();
  const [apiData, setApiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stable serialization of filter so useEffect only fires when values actually change
  const filterKey = JSON.stringify({
    grupo: [...(filter.grupo || [])].sort(),
    subgrupo: [...(filter.subgrupo || [])].sort(),
    cultura: [...(filter.cultura || [])].sort(),
    safra: [...(filter.safra || [])].sort(),
  });

  useEffect(() => {
    const params = buildFilterParams(filter);
    setLoading(true);
    setError(null);
    api
      .get(`/dashboard/dre-balanco/${params ? `?${params}` : ""}`)
      .then(({ data }) => setApiData(data))
      .catch((err) => setError(err?.response?.data?.detail || "Erro ao carregar dados."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const handleSave = useCallback(
    ({ table, key, scenario, valor }) => {
      api
        .post("/dashboard/dre-balanco/", {
          table,
          key,
          scenario,
          valor: valor != null ? String(valor) : null,
          grupo: filter.grupo?.[0] || null,
          safra: filter.safra?.[0] || null,
        })
        .catch(console.error);
    },
    [filter.grupo, filter.safra],
  );

  return (
    <div className="resource-page dre-balanco-page">
      <PageHeader
        title="DRE e Balanço"
        description="Demonstrativo de resultados, balanço patrimonial e indicadores financeiros"
      />
      <div className="dre-balanco-content">
        {loading && <div className="dre-loading">Carregando dados...</div>}
        {error && <div className="dre-error">{error}</div>}
        {!loading && (
          <>
            <BalancoTable apiData={apiData} onSave={handleSave} columns={COLUMNS} />
            <DRETable apiData={apiData} onSave={handleSave} columns={COLUMNS} />
            <TresholdsTable columns={COLUMNS} />
            <RatingTable columns={COLUMNS} />
          </>
        )}
      </div>
    </div>
  );
}
