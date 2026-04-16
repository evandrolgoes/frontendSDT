import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";

// ─── Column definitions ────────────────────────────────────────────────────
const COLUMNS = [
  { key: "c1", label: "Cenário Atual", year: "2026", date: "20/09/2025", section: "ANÁLISES REALIZADAS" },
  { key: "c2", label: "Simulação 1", year: "2026", date: "20/09/2026", section: "ANÁLISES REALIZADAS" },
  { key: "c3", label: "Simulação 2", year: "2026", date: "20/09/2026", section: "ANÁLISES REALIZADAS" },
  { key: "c4", label: "2027", year: "2027", date: "20/09/2026", section: "PROJEÇÕES" },
  { key: "c5", label: "2028", year: "2028", date: "20/09/2027", section: "PROJEÇÕES" },
];

// ─── Balanço rows ──────────────────────────────────────────────────────────
// type: "total" | "section" | "subrow" | "row" | "divider"
const BALANCO_ROWS = [
  { type: "total", label: "ATIVO TOTAL", values: [174624, 145919, 149824, 166411, 148406] },
  { type: "section", label: "Ativo Circulante" },
  { type: "subrow", label: "Caixa / Grãos", values: [9710, 9710, 9710, 9487, 9487] },
  { type: "subrow", label: "Estoque Grãos", values: [1701, 1701, 1701, null, null] },
  { type: "subrow", label: "Estoque Insumos", values: [2096, 2096, 2096, 2821, 2821] },
  { type: "subrow", label: "Ativo Biológico", values: [2570, 2570, 2570, 2570, 2570] },
  { type: "subrow", label: "Outras Ativo Circulante", values: [null, null, null, null, null] },
  { type: "subrow", label: "Arrendamentos (R$)", values: [2346, 2346, 2346, 7407, 2570] },
  { type: "subrow", label: "Arrendamentos (USD)", values: [null, null, null, 770, null] },
  { type: "section", label: "Ativo Longo Prazo" },
  { type: "subrow", label: "Ativo Biológico LP", values: [null, null, null, null, null] },
  { type: "subrow", label: "Arrendamentos LP", values: [414, 414, 414, 414, 414] },
  { type: "subrow", label: "Imobilizado LP", values: [null, null, null, null, null] },
  { type: "section", label: "Ativo Permanente" },
  { type: "subrow", label: "Terras e Equipamentos", values: [1500, 1500, 1500, 1500, 1500] },
  { type: "subrow", label: "Benfeitorias", values: [3000, 3000, 3000, 3000, 3000] },
  { type: "subrow", label: "Silos / Armazéns", values: [null, null, null, null, null] },
  { type: "subrow", label: "Imóveis Urbanos", values: [null, null, null, null, null] },
  { type: "subrow", label: "Participações", values: [null, null, null, null, null] },
  { type: "subrow", label: "Outros", values: [160000, 150000, 135000, 150000, 152020] },
  { type: "divider" },
  { type: "total", label: "PASSIVO TOTAL", values: [28705, 18705, 13798, 21028, 18029] },
  { type: "section", label: "Passivo Circulante" },
  { type: "subrow", label: "Banco Receb. CDCB", values: [null, null, null, null, null] },
  { type: "subrow", label: "Banco Recep.", values: [2344, 2344, 2344, 2344, 2344] },
  { type: "subrow", label: "Fornecedores Custeio", values: [null, null, null, null, null] },
  { type: "subrow", label: "Arrendamentos CF", values: [null, null, null, null, null] },
  { type: "subrow", label: "Fornec. / Dist. Lucros", values: [21001, 16361, 3001, 11221, 11221] },
  { type: "section", label: "Passivo Longo Prazo" },
  { type: "subrow", label: "Banco Recep.", values: [8137, null, 8137, 8137, 8137] },
  { type: "subrow", label: "Arrendamentos LP", values: [1137, null, 137, 137, 137] },
  { type: "subrow", label: "Outros", values: [null, null, null, null, null] },
  { type: "subrow", label: "Debêntures", values: [2714, null, 179, null, null] },
  { type: "divider" },
  { type: "total", label: "PATRIMÔNIO LÍQUIDO", values: [145919, 145919, 135919, 143386, 148406] },
];

// ─── DRE rows ──────────────────────────────────────────────────────────────
// format: "number" (default) | "pct" | "plain"
const DRE_ROWS = [
  { type: "total", label: "Vendas Líquidas", values: [11276, 11276, 11276, 14408, 14414] },
  { type: "section", label: "Soja - Faturamento" },
  { type: "subrow", label: "Produção Total (Sc)", values: [1701, 1701, 1701, null, null] },
  { type: "subrow", label: "Retenção (%)", values: [null, null, null, null, null] },
  { type: "subrow", label: "Preço médio (R$/sc)", values: [130, 130, 130, null, null], format: "plain" },
  { type: "subrow", label: "Custo Total (R$)", values: [780, 780, 780, 2530, 2530] },
  { type: "subrow", label: "Ebitda (%)", values: [52, 52, 52, null, null], format: "pct" },
  { type: "section", label: "Milho - Faturamento" },
  { type: "subrow", label: "Produção Total (Sc)", values: [null, null, null, null, null] },
  { type: "subrow", label: "Preço médio (R$/sc)", values: [null, null, null, null, null], format: "plain" },
  { type: "section", label: "Pecuária - Faturamento" },
  { type: "subrow", label: "Produção Total (Cab)", values: [5700, 5700, 5700, 5700, 5700] },
  { type: "subrow", label: "Arroba / Cab", values: [475, 475, 475, 475, 475], format: "plain" },
  { type: "subrow", label: "Preço médio (@)", values: [99, 99, 99, 99, 99], format: "plain" },
  { type: "subrow", label: "Custo Total (R$)", values: [305, 305, 305, 300, 300] },
  { type: "subrow", label: "Ebitda (%)", values: [15, 15, 15, 15, 15], format: "pct" },
  { type: "section", label: "Pecuária - Faturamento (Arrendamentos)" },
  { type: "subrow", label: "Produção Total (Cab)", values: [5213, 5213, 5213, 5700, 5700] },
  { type: "subrow", label: "Arroba / Cab", values: [490, 490, 490, 550, 550], format: "plain" },
  { type: "divider" },
  { type: "total", label: "CMV Total", values: [-6548, -6548, -6548, -9166, -9160] },
  { type: "total", label: "Lucro Bruto", values: [4477, 4477, 4477, 4982, 4977] },
  { type: "divider" },
  { type: "row", label: "Resultado Após D.F.", values: [-691, 1109, 3009, 402, 938] },
  { type: "row", label: "IR + CS", values: [null, null, 1042, null, null] },
  { type: "row", label: "Resultado Líquido", values: [-691, 1042, 1888, 378, 881] },
  { type: "row", label: "EBITDA Operacional (%)", values: [20, 39, 39, null, null], format: "pct" },
  { type: "row", label: "EBITDA Total com investimentos (R$)", values: [4737, 4737, 4737, 5342, 5348] },
  { type: "row", label: "NCE Total", values: [5799, 5691, 5437, 6458, 6438] },
];

// ─── Tresholds ─────────────────────────────────────────────────────────────
const TRESHOLDS_ROWS = [
  { label: "Dívida / Receita", values: [2.42, 1.53, 1.09, 1.36, 1.15] },
  { label: "Alavancagem Operacional (Dívida/Ebitda)", values: [5.76, 3.65, 2.60, 3.74, 3.17] },
  { label: "Dívida Total / Ativo Imobilizado", values: [0.17, 0.11, 0.09, 0.13, 0.11] },
  { label: "Cobertura Serviço da Dívida", values: [0.76, 0.41, 0.45, 0.44, 1.22] },
  { label: "Liquidez Corrente", values: [0.42, 0.95, 1.85, 0.76, 0.76] },
  { label: "Solvência (Patrimônio sobre o Ativo)", values: [0.94, 0.94, 0.93, 0.94, 0.94] },
];

// ─── Rating de Crédito ─────────────────────────────────────────────────────
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

// ─── Build initial edit values from rows ───────────────────────────────────
// Only subrow/row types are editable; stored as { [rowIndex]: { [colIndex]: number|null } }
function buildInitialValues(rows) {
  const vals = {};
  rows.forEach((row, ri) => {
    if (row.type === "subrow" || row.type === "row") {
      vals[ri] = {};
      COLUMNS.forEach((_, ci) => {
        vals[ri][ci] = row.values ? (row.values[ci] ?? null) : null;
      });
    }
  });
  return vals;
}

// ─── Compute section sums from current editable values ─────────────────────
// Each "section" row becomes the sum of all following "subrow" rows
// until the next section/total/divider.
function computeSectionSums(rows, editValues) {
  const sums = {};
  let activeSectionIdx = null;

  rows.forEach((row, ri) => {
    if (row.type === "section") {
      activeSectionIdx = ri;
      sums[ri] = new Array(COLUMNS.length).fill(null);
    } else if (row.type === "subrow" && activeSectionIdx !== null) {
      COLUMNS.forEach((_, ci) => {
        const v = editValues[ri]?.[ci];
        const n = v != null && v !== "" ? Number(v) : null;
        if (n !== null && !Number.isNaN(n)) {
          sums[activeSectionIdx][ci] = (sums[activeSectionIdx][ci] ?? 0) + n;
        }
      });
    } else {
      // total / divider / row resets the active section
      activeSectionIdx = null;
    }
  });

  return sums;
}

// ─── Table state hook ──────────────────────────────────────────────────────
function useTableState(rows) {
  const [editValues, setEditValues] = useState(() => buildInitialValues(rows));
  const [editing, setEditing] = useState(null); // { ri, ci }
  const [draft, setDraft] = useState("");

  const sectionSums = useMemo(() => computeSectionSums(rows, editValues), [rows, editValues]);

  const startEdit = useCallback(
    (ri, ci) => {
      const current = editValues[ri]?.[ci];
      setEditing({ ri, ci });
      setDraft(current != null ? String(current) : "");
    },
    [editValues],
  );

  const commitEdit = useCallback((ri, ci, raw) => {
    const cleaned = raw.trim().replace(",", ".");
    const num = cleaned === "" ? null : Number(cleaned);
    setEditValues((prev) => ({
      ...prev,
      [ri]: { ...prev[ri], [ci]: num === null || Number.isNaN(num) ? null : num },
    }));
    setEditing(null);
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  return { editValues, sectionSums, editing, draft, setDraft, startEdit, commitEdit, cancelEdit };
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

// ─── Column header ─────────────────────────────────────────────────────────
function TableColumnHeaders({ columns }) {
  const sections = columns.reduce((acc, col) => {
    const last = acc[acc.length - 1];
    if (last && last.label === col.section) {
      last.span += 1;
    } else {
      acc.push({ label: col.section, span: 1 });
    }
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
          <th key={col.key} className="dre-table-year">
            {col.year}
          </th>
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

// ─── Financial row ─────────────────────────────────────────────────────────
function FinancialRow({ row, rowIndex, columns, tableState }) {
  const { editValues, sectionSums, editing, draft, setDraft, startEdit, commitEdit, cancelEdit } = tableState;

  if (row.type === "divider") {
    return (
      <tr className="dre-table-divider">
        <td colSpan={columns.length + 1} />
      </tr>
    );
  }

  const rowClass =
    {
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
          value = editValues[rowIndex]?.[ci] ?? null;
        } else {
          // total rows: static (not editable)
          value = row.values ? row.values[ci] : null;
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

// ─── Financial table (Balanço / DRE) ───────────────────────────────────────
function FinancialTable({ title, rows, columns }) {
  const tableState = useTableState(rows);

  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>{title}</td>
            </tr>
            {rows.map((row, i) => (
              <FinancialRow key={i} row={row} rowIndex={i} columns={columns} tableState={tableState} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tresholds table (editable) ────────────────────────────────────────────
function TresholdsTable({ rows, columns }) {
  const [editValues, setEditValues] = useState(() => {
    const vals = {};
    rows.forEach((row, ri) => {
      vals[ri] = {};
      COLUMNS.forEach((_, ci) => {
        vals[ri][ci] = row.values ? (row.values[ci] ?? null) : null;
      });
    });
    return vals;
  });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  const startEdit = (ri, ci) => {
    setEditing({ ri, ci });
    setDraft(editValues[ri]?.[ci] != null ? String(editValues[ri][ci]) : "");
  };

  const commitEdit = (ri, ci, raw) => {
    const cleaned = raw.trim().replace(",", ".");
    const num = cleaned === "" ? null : Number(cleaned);
    setEditValues((prev) => ({
      ...prev,
      [ri]: { ...prev[ri], [ci]: num === null || Number.isNaN(num) ? null : num },
    }));
    setEditing(null);
  };

  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>TRESHOLDS</td>
            </tr>
            {rows.map((row, ri) => (
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
                          onBlur={() => commitEdit(ri, ci, draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(ri, ci, draft);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <span
                          className="dre-cell-value dre-cell-editable"
                          onClick={() => startEdit(ri, ci)}
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

// ─── Rating de Crédito table (read-only) ───────────────────────────────────
function RatingTable({ rows, columns, finalNumeric, finalLabel }) {
  return (
    <div className="dre-table-block">
      <div className="dre-table-scroll">
        <table className="dre-table">
          <TableColumnHeaders columns={columns} />
          <tbody>
            <tr className="dre-table-block-title">
              <td colSpan={columns.length + 1}>RATING DE CRÉDITO</td>
            </tr>
            {rows.map((row, i) => (
              <tr key={i} className="dre-row-data">
                <td className="dre-table-label">{row.label}</td>
                {columns.map((col, j) => {
                  const score = row.values ? row.values[j] : null;
                  const style = score != null ? getRatingStyle(score) : {};
                  return (
                    <td key={col.key} className="dre-table-value dre-rating-cell" style={style}>
                      {score != null ? score : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="dre-row-rating-final">
              <td className="dre-table-label">Rating Final</td>
              {columns.map((col, j) => {
                const score = finalNumeric[j];
                const style = score != null ? getRatingFinalStyle(score) : {};
                return (
                  <td key={col.key} className="dre-table-value dre-rating-cell dre-rating-final-cell" style={style}>
                    {score != null ? fmtNumber(score, 1) : "–"}
                  </td>
                );
              })}
            </tr>
            <tr className="dre-row-rating-final">
              <td className="dre-table-label">Rating Final</td>
              {columns.map((col, j) => {
                const score = finalNumeric[j];
                const label = finalLabel[j];
                const style = score != null && label && label !== "—" ? getRatingFinalStyle(score) : {};
                return (
                  <td key={col.key} className="dre-table-value dre-rating-cell dre-rating-final-cell" style={style}>
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
  return (
    <div className="resource-page dre-balanco-page">
      <PageHeader
        title="DRE e Balanço"
        description="Demonstrativo de resultados, balanço patrimonial e indicadores financeiros"
      />
      <div className="dre-balanco-content">
        <div className="dre-mock-notice">Dados de exemplo — integração com API em desenvolvimento</div>
        <FinancialTable title="BALANÇO" rows={BALANCO_ROWS} columns={COLUMNS} />
        <FinancialTable title="DRE" rows={DRE_ROWS} columns={COLUMNS} />
        <TresholdsTable rows={TRESHOLDS_ROWS} columns={COLUMNS} />
        <RatingTable
          rows={RATING_ROWS}
          columns={COLUMNS}
          finalNumeric={RATING_FINAL_NUMERIC}
          finalLabel={RATING_FINAL_LABEL}
        />
      </div>
    </div>
  );
}
