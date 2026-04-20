import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_CODE_MAP = { 1:"F",2:"G",3:"H",4:"J",5:"K",6:"M",7:"N",8:"Q",9:"U",10:"V",11:"X",12:"Z" };
const MONTH_NAMES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "graos",   label: "Grãos & Cereais" },
  { id: "softs",   label: "Softs" },
  { id: "carnes",  label: "Proteínas" },
  { id: "energia", label: "Energia" },
  { id: "metais",  label: "Metais" },
  { id: "cambio",  label: "Câmbio" },
];

const SORT_OPTIONS = [
  { id: "default",     label: "Padrão" },
  { id: "change_desc", label: "Maior alta" },
  { id: "change_asc",  label: "Maior queda" },
  { id: "name",        label: "Nome A-Z" },
];

// exchange suffix + active delivery months (1-indexed) + max contracts to show
// invertPrice: true → Yahoo returns USD/BRL, we show 1/price as BRL/USD
const FUTURES_CONFIG = {
  "ZS=F":  { base:"ZS",  sfx:".CBT", months:[1,3,5,7,8,9,11], n:8  },
  "ZC=F":  { base:"ZC",  sfx:".CBT", months:[3,5,7,9,12],      n:8  },
  "ZW=F":  { base:"ZW",  sfx:".CBT", months:[3,5,7,9,12],      n:8  },
  "KE=F":  { base:"KE",  sfx:".CBT", months:[3,5,7,9,12],      n:8  },
  "ZM=F":  { base:"ZM",  sfx:".CBT", months:[1,3,5,7,8,9,10,12], n:8 },
  "ZL=F":  { base:"ZL",  sfx:".CBT", months:[1,3,5,7,8,9,10,12], n:8 },
  "ZO=F":  { base:"ZO",  sfx:".CBT", months:[3,5,7,9,12],      n:6  },
  "ZR=F":  { base:"ZR",  sfx:".CBT", months:[1,3,5,7,9,11],    n:6  },
  "KC=F":  { base:"KC",  sfx:".NYB", months:[3,5,7,9,12],      n:8  },
  "SB=F":  { base:"SB",  sfx:".NYB", months:[3,5,7,10],        n:8  },
  "CC=F":  { base:"CC",  sfx:".NYB", months:[3,5,7,9,12],      n:8  },
  "CT=F":  { base:"CT",  sfx:".NYB", months:[3,5,7,10,12],     n:8  },
  "OJ=F":  { base:"OJ",  sfx:".NYB", months:[1,3,5,7,9,11],    n:6  },
  "LE=F":  { base:"LE",  sfx:".CME", months:[2,4,6,8,10,12],   n:8  },
  "GF=F":  { base:"GF",  sfx:".CME", months:[1,3,4,5,8,9,10,11], n:8 },
  "HE=F":  { base:"HE",  sfx:".CME", months:[2,4,5,6,7,8,10,12], n:8 },
  "CL=F":  { base:"CL",  sfx:".NYM", months:[1,2,3,4,5,6,7,8,9,10,11,12], n:12 },
  "BZ=F":  { base:"BZ",  sfx:".NYM", months:[1,2,3,4,5,6,7,8,9,10,11,12], n:12 },
  "GC=F":  { base:"GC",  sfx:".CMX", months:[2,4,6,8,10,12],  n:8  },
  "SI=F":  { base:"SI",  sfx:".CMX", months:[3,5,7,9,12],     n:8  },
  // Dólar / Real — Brazilian Real futures on CME (6L)
  // Yahoo returns price in USD per BRL (e.g. 0.200); we invert to show BRL/USD (e.g. 5.00)
  "6L=F":  { base:"6L",  sfx:".CME", months:[1,2,3,4,5,6,7,8,9,10,11,12], n:8, invertPrice:true },
};

const COMMODITIES = [
  { symbol:"ZS=F",  name:"Soja",          short:"Soja CBOT",     unit:"US¢/bu",  exchange:"CBOT",  category:"graos",   flag:"🌱" },
  { symbol:"ZC=F",  name:"Milho",         short:"Milho CBOT",    unit:"US¢/bu",  exchange:"CBOT",  category:"graos",   flag:"🌽" },
  { symbol:"ZW=F",  name:"Trigo CBOT",    short:"Trigo CBOT",    unit:"US¢/bu",  exchange:"CBOT",  category:"graos",   flag:"🌾" },
  { symbol:"KE=F",  name:"Trigo KC",      short:"Trigo KC",      unit:"US¢/bu",  exchange:"KCBT",  category:"graos",   flag:"🌾" },
  { symbol:"ZM=F",  name:"Farelo de Soja",short:"Farelo Soja",   unit:"USD/ton", exchange:"CBOT",  category:"graos",   flag:"🫘" },
  { symbol:"ZL=F",  name:"Óleo de Soja",  short:"Óleo Soja",     unit:"US¢/lb",  exchange:"CBOT",  category:"graos",   flag:"🫙" },
  { symbol:"ZO=F",  name:"Aveia",         short:"Aveia",         unit:"US¢/bu",  exchange:"CBOT",  category:"graos",   flag:"🥣" },
  { symbol:"ZR=F",  name:"Arroz",         short:"Arroz",         unit:"USD/cwt", exchange:"CBOT",  category:"graos",   flag:"🍚" },
  { symbol:"KC=F",  name:"Café Arábica",  short:"Café",          unit:"US¢/lb",  exchange:"ICE",   category:"softs",   flag:"☕" },
  { symbol:"SB=F",  name:"Açúcar #11",    short:"Açúcar",        unit:"US¢/lb",  exchange:"ICE",   category:"softs",   flag:"🍬" },
  { symbol:"CC=F",  name:"Cacau",         short:"Cacau",         unit:"USD/MT",  exchange:"ICE",   category:"softs",   flag:"🍫" },
  { symbol:"CT=F",  name:"Algodão",       short:"Algodão",       unit:"US¢/lb",  exchange:"ICE",   category:"softs",   flag:"🧶" },
  { symbol:"OJ=F",  name:"Suco Laranja",  short:"Suco Laranja",  unit:"US¢/lb",  exchange:"ICE",   category:"softs",   flag:"🍊" },
  { symbol:"LE=F",  name:"Boi Gordo",     short:"Boi Gordo",     unit:"US¢/lb",  exchange:"CME",   category:"carnes",  flag:"🐄" },
  { symbol:"GF=F",  name:"Boi Magro",     short:"Boi Magro",     unit:"US¢/lb",  exchange:"CME",   category:"carnes",  flag:"🐂" },
  { symbol:"HE=F",  name:"Suíno",         short:"Suíno",         unit:"US¢/lb",  exchange:"CME",   category:"carnes",  flag:"🐷" },
  { symbol:"CL=F",  name:"Petróleo WTI",  short:"WTI",           unit:"USD/bbl", exchange:"NYMEX", category:"energia", flag:"🛢️" },
  { symbol:"BZ=F",  name:"Petróleo Brent",short:"Brent",         unit:"USD/bbl", exchange:"ICE",   category:"energia", flag:"⛽" },
  { symbol:"GC=F",  name:"Ouro",          short:"Ouro",          unit:"USD/oz",  exchange:"COMEX", category:"metais",  flag:"🥇" },
  { symbol:"SI=F",  name:"Prata",         short:"Prata",         unit:"USD/oz",  exchange:"COMEX", category:"metais",  flag:"🥈" },
  { symbol:"BRL=X", name:"Dólar Spot",    short:"USD/BRL Spot",  unit:"BRL/USD", exchange:"FOREX", category:"cambio",  flag:"💵" },
  { symbol:"6L=F",  name:"Dólar Futuro", short:"USD/BRL Futuro",unit:"BRL/USD", exchange:"CME",   category:"cambio",  flag:"🇧🇷", invertPrice:true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toUnixTs = (date) => Math.floor(date.getTime() / 1000);

const buildPeriods = (days = 35) => {
  const now = new Date();
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { period1: toUnixTs(past), period2: toUnixTs(now) };
};

const fmt = (value, dec = 2) => {
  if (value == null || isNaN(value)) return "—";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const fmtChg = (value) => {
  if (value == null || isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
};

/**
 * Extract OHLCV series from Yahoo Finance chart response.
 * @param {object} data  - raw Yahoo Finance JSON
 * @param {boolean} invert - if true, compute 1/close (for 6L BRL/USD inversion)
 */
const extractSeries = (data, invert = false) => {
  try {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const rawRows = timestamps
      .map((ts, i) => ({ date: ts, close: closes[i] }))
      .filter((r) => r.close != null && !isNaN(r.close) && r.close !== 0);
    if (!rawRows.length) return null;
    const rows = invert
      ? rawRows.map((r) => ({ date: r.date, close: 1 / r.close }))
      : rawRows;
    const latest = rows[rows.length - 1];
    const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
    const changeAbs = prev ? latest.close - prev.close : null;
    const changePct = prev && prev.close !== 0 ? ((latest.close - prev.close) / prev.close) * 100 : null;
    return { price: latest.close, changeAbs, changePct, rows };
  } catch { return null; }
};

/** Generate upcoming futures contract symbols for a given continuous symbol */
function generateContracts(continuousSymbol) {
  const cfg = FUTURES_CONFIG[continuousSymbol];
  if (!cfg) return [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const contracts = [];
  let iterations = 0;
  while (contracts.length < cfg.n && iterations < 36) {
    iterations++;
    if (cfg.months.includes(month)) {
      const monthCode = MONTH_CODE_MAP[month];
      const yearCode = String(year).slice(-2);
      contracts.push({
        symbol: `${cfg.base}${monthCode}${yearCode}${cfg.sfx}`,
        label: `${MONTH_NAMES_PT[month - 1]}/${year}`,
        month, year, monthCode,
      });
    }
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return contracts;
}

// ─── Sparkline (for cards) ────────────────────────────────────────────────────

function Sparkline({ rows, positive }) {
  if (!rows || rows.length < 2) return <div style={{ height: 40 }} />;
  const values = rows.map((r) => r.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 40;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`);
  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${W},${H} L 0,${H} Z`;
  const stroke = positive ? "#22c55e" : "#ef4444";
  const fill   = positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:40, display:"block" }} preserveAspectRatio="none">
      <path d={areaD} fill={fill} />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Continuous price chart (detail panel) ───────────────────────────────────

function DetailChart({ rows, positive }) {
  if (!rows || rows.length < 2) return null;
  const values = rows.map((r) => r.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 600, H = 140;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * W},${H - ((v - min) / range) * (H - 20) - 10}`
  );
  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${W},${H} L 0,${H} Z`;
  const stroke = positive ? "#22c55e" : "#ef4444";
  const fill   = positive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
  const step = Math.max(1, Math.floor(rows.length / 5));
  const labels = [];
  for (let i = 0; i < rows.length; i += step) {
    const d = new Date(rows[i].date * 1000);
    labels.push({
      x: (i / (rows.length - 1)) * W,
      label: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`,
    });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width:"100%", height:160, display:"block" }} preserveAspectRatio="none">
      <path d={areaD} fill={fill} />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {labels.map(({ x, label }, i) => (
        <text key={i} x={x} y={H + 16} fontSize="9" fill="#94a3b8" textAnchor="middle"
          style={{ fontFamily:"Arial, sans-serif" }}>{label}</text>
      ))}
    </svg>
  );
}

// ─── Futures term structure mini-bar ─────────────────────────────────────────

function TermBar({ values, highlightIdx }) {
  if (!values || values.length < 2) return null;
  const valid = values.filter((v) => v != null && !isNaN(v));
  if (!valid.length) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:28 }}>
      {values.map((v, i) => {
        const pct = v != null ? ((v - min) / range) * 80 + 20 : 0;
        const isHl = i === highlightIdx;
        return (
          <div
            key={i}
            title={v != null ? fmt(v) : "—"}
            style={{
              flex:1,
              height:`${pct}%`,
              minHeight: v != null ? 4 : 0,
              borderRadius:"2px 2px 0 0",
              background: v == null
                ? "rgba(148,163,184,0.15)"
                : isHl
                ? "#ea580c"
                : "rgba(99,102,241,0.55)",
              transition:"background 0.2s",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Commodity card ───────────────────────────────────────────────────────────

function CommodityCard({ commodity, quote, loading, error, onClick, selected }) {
  const positive = quote?.changePct == null ? null : quote.changePct >= 0;
  const chgColor = positive === null ? "#94a3b8" : positive ? "#22c55e" : "#ef4444";
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "rgba(234,88,12,0.07)" : "rgba(255,255,255,0.76)",
        border: selected ? "1.5px solid #ea580c" : "1px solid rgba(148,163,184,0.22)",
        borderRadius: 14,
        padding: "16px 18px 12px",
        cursor: "pointer",
        transition: "box-shadow 0.18s, border-color 0.18s, transform 0.15s",
        boxShadow: selected ? "0 0 0 3px rgba(234,88,12,0.13)" : "0 2px 10px rgba(15,23,42,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
      onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.boxShadow="0 6px 20px rgba(15,23,42,0.12)"; e.currentTarget.style.transform="translateY(-1px)"; }}}
      onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.boxShadow="0 2px 10px rgba(15,23,42,0.06)"; e.currentTarget.style.transform="translateY(0)"; }}}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
          <span style={{ fontSize:20, lineHeight:1 }}>{commodity.flag}</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {commodity.short}
            </div>
            <div style={{ fontSize:10, color:"#94a3b8", letterSpacing:"0.04em" }}>{commodity.exchange}</div>
          </div>
        </div>
        {!loading && !error && quote && (
          <div style={{ background: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color:chgColor, borderRadius:6, padding:"2px 7px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
            {fmtChg(quote.changePct)}
          </div>
        )}
        {loading && <div style={{ width:50, height:18, borderRadius:6, background:"rgba(148,163,184,0.2)", animation:"pulse 1.5s ease-in-out infinite" }} />}
      </div>

      <div style={{ minHeight:34 }}>
        {loading ? (
          <div style={{ width:80, height:24, borderRadius:6, background:"rgba(148,163,184,0.2)", marginTop:4, animation:"pulse 1.5s ease-in-out infinite" }} />
        ) : error ? (
          <div style={{ fontSize:11, color:"#ef4444", marginTop:4 }}>Indisponível</div>
        ) : quote ? (
          <>
            <div style={{ fontSize:20, fontWeight:800, color:"#0f172a", lineHeight:1.2, letterSpacing:"-0.02em" }}>{fmt(quote.price)}</div>
            <div style={{ fontSize:10, color:"#94a3b8", marginTop:1 }}>{commodity.unit}</div>
          </>
        ) : null}
      </div>

      <div style={{ marginTop:2 }}>
        {loading
          ? <div style={{ height:40, borderRadius:6, background:"rgba(148,163,184,0.1)", animation:"pulse 1.5s ease-in-out infinite" }} />
          : <Sparkline rows={quote?.rows} positive={positive} />
        }
      </div>

      {!loading && !error && quote && quote.changeAbs != null && (
        <div style={{ fontSize:10, color:"#64748b", textAlign:"right" }}>
          {`${quote.changeAbs >= 0 ? "+" : ""}${fmt(quote.changeAbs)} hoje`}
        </div>
      )}
    </div>
  );
}

// ─── Futures contracts panel ──────────────────────────────────────────────────

function FuturesPanel({ commodity, onClose }) {
  const contracts = useMemo(() => generateContracts(commodity.symbol), [commodity.symbol]);
  const invert = commodity.invertPrice ?? false;
  const [prices, setPrices]     = useState({});
  const [loading, setLoading]   = useState({});
  const [errors, setErrors]     = useState({});
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const abortMap = useRef({});

  const fetchContract = useCallback(async (contractSymbol) => {
    if (abortMap.current[contractSymbol]) abortMap.current[contractSymbol].abort();
    const ctrl = new AbortController();
    abortMap.current[contractSymbol] = ctrl;
    setLoading((p) => ({ ...p, [contractSymbol]: true }));
    setErrors((p)  => ({ ...p, [contractSymbol]: false }));
    const { period1, period2 } = buildPeriods(10);
    try {
      const res = await api.get("/mercado/yahoo-proxy/", {
        params: { symbol: contractSymbol, period1, period2 },
        signal: ctrl.signal,
      });
      const series = extractSeries(res.data, invert);
      if (!series) throw new Error("no data");
      setPrices((p) => ({ ...p, [contractSymbol]: series }));
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
        setErrors((p) => ({ ...p, [contractSymbol]: true }));
      }
    } finally {
      setLoading((p) => ({ ...p, [contractSymbol]: false }));
    }
  }, []);

  useEffect(() => {
    contracts.forEach((c) => fetchContract(c.symbol));
    return () => Object.values(abortMap.current).forEach((ctrl) => ctrl?.abort?.());
  }, [contracts, fetchContract]);

  // build term structure values array (for bar chart)
  const termValues = contracts.map((c) => prices[c.symbol]?.price ?? null);
  const frontPrice = termValues.find((v) => v != null);
  const isContango = termValues.filter(Boolean).length >= 2
    ? termValues[termValues.lastIndexOf(termValues.find(Boolean))] > frontPrice
    : null;

  const loadingCount = contracts.filter((c) => loading[c.symbol]).length;
  const allLoaded    = loadingCount === 0;

  return (
    <div style={{
      background: "rgba(255,255,255,0.96)",
      border: "1.5px solid rgba(99,102,241,0.22)",
      borderRadius: 18,
      padding: "22px 26px 20px",
      marginBottom: 20,
      boxShadow: "0 8px 32px rgba(15,23,42,0.1)",
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:32 }}>{commodity.flag}</span>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>
              {commodity.name} — Curva de Futuros
            </div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>
              {commodity.exchange} · {commodity.unit} · {contracts.length} vencimentos
              {!allLoaded && <span style={{ marginLeft:8, color:"#6366f1" }}>carregando {loadingCount}…</span>}
            </div>
          </div>
          {/* Contango / Backwardation badge */}
          {isContango !== null && allLoaded && (
            <div style={{
              background: isContango ? "rgba(99,102,241,0.1)" : "rgba(234,88,12,0.1)",
              color: isContango ? "#4f46e5" : "#c2410c",
              border: `1px solid ${isContango ? "rgba(99,102,241,0.25)" : "rgba(234,88,12,0.25)"}`,
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}>
              {isContango ? "CONTANGO" : "BACKWARDATION"}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background:"none", border:"1px solid rgba(148,163,184,0.3)", borderRadius:8, padding:"4px 10px", fontSize:13, color:"#64748b", cursor:"pointer", fontFamily:"inherit" }}
        >
          ✕ Fechar
        </button>
      </div>

      {/* Term structure mini bar */}
      {allLoaded && termValues.some(Boolean) && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>Estrutura a Termo</div>
          <TermBar values={termValues} highlightIdx={hoveredIdx} />
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
            <span style={{ fontSize:9, color:"#94a3b8" }}>{contracts[0]?.label}</span>
            <span style={{ fontSize:9, color:"#94a3b8" }}>{contracts[contracts.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {/* Contracts table */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:"2px solid rgba(148,163,184,0.15)" }}>
              {["Vencimento","Símbolo","Último Preço","Var. Dia","Var. %","Spread vs Front"].map((h,i) => (
                <th key={i} style={{ padding:"8px 10px", textAlign: i === 0 ? "left" : "right", color:"#64748b", fontWeight:600, fontSize:11, whiteSpace:"nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract, idx) => {
              const q      = prices[contract.symbol];
              const isLoad = loading[contract.symbol];
              const isErr  = errors[contract.symbol];
              const positive = q?.changePct == null ? null : q.changePct >= 0;
              const chgColor = positive === null ? "#94a3b8" : positive ? "#16a34a" : "#dc2626";
              const spread   = q?.price != null && frontPrice != null
                ? q.price - frontPrice
                : null;
              const isFirst  = idx === 0;

              return (
                <tr
                  key={contract.symbol}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    borderBottom: "1px solid rgba(148,163,184,0.09)",
                    background: hoveredIdx === idx ? "rgba(99,102,241,0.04)" : "transparent",
                    transition: "background 0.12s",
                  }}
                >
                  {/* Vencimento */}
                  <td style={{ padding:"9px 10px", fontWeight: isFirst ? 700 : 500, color:"#0f172a", whiteSpace:"nowrap" }}>
                    {contract.label}
                    {isFirst && (
                      <span style={{ marginLeft:6, fontSize:9, background:"rgba(234,88,12,0.12)", color:"#c2410c", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>
                        FRONT
                      </span>
                    )}
                  </td>
                  {/* Símbolo */}
                  <td style={{ padding:"9px 10px", textAlign:"right", fontFamily:"monospace", fontSize:12, color:"#64748b" }}>
                    {contract.symbol}
                  </td>
                  {/* Último Preço */}
                  <td style={{ padding:"9px 10px", textAlign:"right", fontWeight:700, color:"#0f172a" }}>
                    {isLoad ? (
                      <div style={{ width:60, height:14, borderRadius:4, background:"rgba(148,163,184,0.2)", marginLeft:"auto", animation:"pulse 1.5s ease-in-out infinite" }} />
                    ) : isErr ? (
                      <span style={{ color:"#ef4444", fontSize:11 }}>—</span>
                    ) : q ? fmt(q.price) : "—"}
                  </td>
                  {/* Var. Dia abs */}
                  <td style={{ padding:"9px 10px", textAlign:"right", color:chgColor, fontWeight:600 }}>
                    {isLoad ? "…" : isErr ? "—" : q?.changeAbs != null
                      ? `${q.changeAbs >= 0 ? "+" : ""}${fmt(q.changeAbs)}`
                      : "—"}
                  </td>
                  {/* Var. % */}
                  <td style={{ padding:"9px 10px", textAlign:"right" }}>
                    {isLoad ? "…" : isErr ? "—" : q?.changePct != null ? (
                      <span style={{
                        background: positive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                        color: chgColor,
                        borderRadius: 5,
                        padding: "2px 6px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {fmtChg(q.changePct)}
                      </span>
                    ) : "—"}
                  </td>
                  {/* Spread vs Front */}
                  <td style={{ padding:"9px 10px", textAlign:"right", color: spread == null ? "#94a3b8" : spread > 0 ? "#6366f1" : "#ea580c", fontWeight:600, fontSize:12 }}>
                    {isFirst ? (
                      <span style={{ color:"#94a3b8", fontSize:11 }}>base</span>
                    ) : spread != null ? (
                      `${spread >= 0 ? "+" : ""}${fmt(spread)}`
                    ) : isLoad ? "…" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize:10, color:"#94a3b8", marginTop:12, textAlign:"right" }}>
        Fonte: Yahoo Finance · Preços com até 15-20 min de delay · Contratos futuros ativos
      </div>
    </div>
  );
}

// ─── Continuous price detail panel ───────────────────────────────────────────

function ContinuousPanel({ commodity, quote, onClose }) {
  const positive = quote?.changePct == null ? null : quote.changePct >= 0;
  return (
    <div style={{
      background: "rgba(255,255,255,0.94)",
      border: "1.5px solid rgba(234,88,12,0.2)",
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 20,
      boxShadow: "0 4px 20px rgba(15,23,42,0.08)",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:36, lineHeight:1 }}>{commodity.flag}</span>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{commodity.name}</div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>{commodity.symbol} · {commodity.exchange} · Contínuo</div>
          </div>
          <div style={{
            background: positive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: positive ? "#16a34a" : "#dc2626",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 16,
            fontWeight: 800,
          }}>
            {fmtChg(quote.changePct)}
          </div>
        </div>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>Último Preço</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>{fmt(quote.price)}</div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>{commodity.unit}</div>
          </div>
          <div>
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>Variação</div>
            <div style={{ fontSize:18, fontWeight:700, color: positive ? "#16a34a" : "#dc2626" }}>
              {quote.changeAbs != null ? `${quote.changeAbs >= 0 ? "+" : ""}${fmt(quote.changeAbs)}` : "—"}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background:"none", border:"1px solid rgba(148,163,184,0.3)", borderRadius:8, padding:"4px 10px", fontSize:13, color:"#64748b", cursor:"pointer", fontFamily:"inherit" }}
        >
          ✕ Fechar
        </button>
      </div>
      <DetailChart rows={quote.rows} positive={positive} />
      <div style={{ fontSize:10, color:"#94a3b8", marginTop:4, textAlign:"right" }}>
        Fonte: Yahoo Finance · {commodity.symbol} · Contrato Contínuo
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CotacoesV2Page() {
  const [quotes, setQuotes]       = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [errorMap, setErrorMap]   = useState({});
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [sortBy, setSortBy]       = useState("default");
  const [selectedSymbol, setSelectedSymbol]     = useState(null);
  const [showFutures, setShowFutures]           = useState(false);
  const [lastUpdate, setLastUpdate]             = useState(null);
  const [refreshing, setRefreshing]             = useState(false);
  const abortRefs = useRef({});

  const fetchQuote = useCallback(async (symbol) => {
    if (abortRefs.current[symbol]) abortRefs.current[symbol].abort();
    const ctrl = new AbortController();
    abortRefs.current[symbol] = ctrl;
    setLoadingMap((p) => ({ ...p, [symbol]: true }));
    setErrorMap((p)   => ({ ...p, [symbol]: false }));
    const { period1, period2 } = buildPeriods(35);
    const invert = COMMODITIES.find((c) => c.symbol === symbol)?.invertPrice ?? false;
    try {
      const res = await api.get("/mercado/yahoo-proxy/", {
        params: { symbol, period1, period2 },
        signal: ctrl.signal,
      });
      const series = extractSeries(res.data, invert);
      if (!series) throw new Error("no data");
      setQuotes((p) => ({ ...p, [symbol]: series }));
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
        setErrorMap((p) => ({ ...p, [symbol]: true }));
      }
    } finally {
      setLoadingMap((p) => ({ ...p, [symbol]: false }));
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled(COMMODITIES.map((c) => fetchQuote(c.symbol)));
    setLastUpdate(new Date());
    setRefreshing(false);
  }, [fetchQuote]);

  useEffect(() => {
    fetchAll();
    return () => Object.values(abortRefs.current).forEach((ctrl) => ctrl?.abort?.());
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const filtered = useMemo(() => {
    let list = selectedCategory === "todos" ? COMMODITIES : COMMODITIES.filter((c) => c.category === selectedCategory);
    if (sortBy === "change_desc") list = [...list].sort((a,b) => (quotes[b.symbol]?.changePct ?? -Infinity) - (quotes[a.symbol]?.changePct ?? -Infinity));
    else if (sortBy === "change_asc")  list = [...list].sort((a,b) => (quotes[a.symbol]?.changePct ?? Infinity) - (quotes[b.symbol]?.changePct ?? Infinity));
    else if (sortBy === "name")        list = [...list].sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }, [selectedCategory, sortBy, quotes]);

  const selectedCommodity = COMMODITIES.find((c) => c.symbol === selectedSymbol);
  const selectedQuote     = selectedSymbol ? quotes[selectedSymbol] : null;
  const hasFuturesConfig  = selectedSymbol ? Boolean(FUTURES_CONFIG[selectedSymbol]) : false;

  // Summary stats
  const loadedQuotes = COMMODITIES.map((c) => quotes[c.symbol]).filter(Boolean);
  const rising  = loadedQuotes.filter((q) => (q.changePct ?? 0) > 0).length;
  const falling = loadedQuotes.filter((q) => (q.changePct ?? 0) < 0).length;
  const bestIdx  = loadedQuotes.length ? loadedQuotes.reduce((bi,q,i,a) => q.changePct > a[bi].changePct ? i : bi, 0) : -1;
  const worstIdx = loadedQuotes.length ? loadedQuotes.reduce((wi,q,i,a) => q.changePct < a[wi].changePct ? i : wi, 0) : -1;
  const bestSym  = bestIdx  >= 0 ? COMMODITIES.find((c) => c.symbol === (COMMODITIES.find((x) => quotes[x.symbol] === loadedQuotes[bestIdx])?.symbol)) : null;
  const worstSym = worstIdx >= 0 ? COMMODITIES.find((c) => c.symbol === (COMMODITIES.find((x) => quotes[x.symbol] === loadedQuotes[worstIdx])?.symbol)) : null;

  const handleCardClick = (symbol) => {
    if (selectedSymbol === symbol) {
      setSelectedSymbol(null);
      setShowFutures(false);
    } else {
      setSelectedSymbol(symbol);
      setShowFutures(false);
    }
  };

  return (
    <div style={{ padding:"24px 28px", minHeight:"100vh", fontFamily:"Manrope, sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .cv2-pill { border:none; border-radius:20px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer; transition:background 0.15s,color 0.15s; white-space:nowrap; font-family:inherit; }
        .cv2-pill:hover { filter:brightness(1.05); }
        .cv2-select { border:1px solid rgba(148,163,184,0.28); border-radius:8px; padding:6px 10px; font-size:12px; font-weight:600; background:rgba(255,255,255,0.9); color:#0f172a; cursor:pointer; font-family:inherit; outline:none; }
        .cv2-tab { border:none; border-radius:8px; padding:7px 14px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:background 0.15s,color 0.15s; }
        .cv2-tab:hover { filter:brightness(0.97); }
      `}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>
                Cotações 2
              </h2>
              <div style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700, letterSpacing:"0.06em" }}>
                YAHOO FINANCE
              </div>
            </div>
            <p style={{ margin:0, fontSize:13, color:"#64748b" }}>
              Commodities agrícolas e softs · Futuros internacionais · Clique num ativo para ver a curva de futuros
            </p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {lastUpdate && (
              <div style={{ fontSize:11, color:"#94a3b8" }}>
                Atualizado às {lastUpdate.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
              </div>
            )}
            <button
              onClick={fetchAll}
              disabled={refreshing}
              style={{
                background: refreshing ? "#e2e8f0" : "linear-gradient(135deg,#ea580c,#c2410c)",
                color: refreshing ? "#94a3b8" : "#fff",
                border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700,
                cursor: refreshing ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", gap:6, fontFamily:"inherit",
              }}
            >
              <span style={{ display:"inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>↻</span>
              {refreshing ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {loadedQuotes.length > 0 && (
          <div style={{ display:"flex", gap:12, marginTop:16, flexWrap:"wrap" }}>
            {[
              { label:"Em alta",   value:`${rising} ativo${rising!==1?"s":""}`,  color:"#22c55e", bg:"rgba(34,197,94,0.08)"  },
              { label:"Em queda",  value:`${falling} ativo${falling!==1?"s":""}`,color:"#ef4444", bg:"rgba(239,68,68,0.08)"  },
              bestSym  && { label:"Maior alta",  value:`${bestSym.short} ${fmtChg(quotes[bestSym.symbol]?.changePct)}`,  color:"#22c55e", bg:"rgba(34,197,94,0.06)"  },
              worstSym && { label:"Maior queda", value:`${worstSym.short} ${fmtChg(quotes[worstSym.symbol]?.changePct)}`,color:"#ef4444", bg:"rgba(239,68,68,0.06)"  },
            ].filter(Boolean).map((item, i) => (
              <div key={i} style={{ background:item.bg, border:`1px solid ${item.color}22`, borderRadius:10, padding:"8px 14px", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, color:"#64748b" }}>{item.label}</span>
                <span style={{ fontSize:13, fontWeight:700, color:item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, marginBottom:20 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button key={cat.id} className="cv2-pill" onClick={() => setSelectedCategory(cat.id)}
                style={{ background: active ? "linear-gradient(135deg,#ea580c,#c2410c)" : "rgba(255,255,255,0.85)", color: active ? "#fff" : "#475569", border: active ? "none" : "1px solid rgba(148,163,184,0.3)", boxShadow: active ? "0 2px 8px rgba(234,88,12,0.28)" : "none" }}>
                {cat.label}
              </button>
            );
          })}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>Ordenar por</span>
          <select className="cv2-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Detail panels ────────────────────────────────────────────────── */}
      {selectedCommodity && selectedQuote && (
        <>
          {/* Tab bar */}
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <button className="cv2-tab"
              onClick={() => setShowFutures(false)}
              style={{ background: !showFutures ? "linear-gradient(135deg,#ea580c,#c2410c)" : "rgba(255,255,255,0.85)", color: !showFutures ? "#fff" : "#475569", border: !showFutures ? "none" : "1px solid rgba(148,163,184,0.25)" }}>
              📈 Gráfico Contínuo
            </button>
            {hasFuturesConfig && (
              <button className="cv2-tab"
                onClick={() => setShowFutures(true)}
                style={{ background: showFutures ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "rgba(255,255,255,0.85)", color: showFutures ? "#fff" : "#475569", border: showFutures ? "none" : "1px solid rgba(148,163,184,0.25)" }}>
                📋 Contratos Futuros
              </button>
            )}
          </div>

          {!showFutures ? (
            <ContinuousPanel
              commodity={selectedCommodity}
              quote={selectedQuote}
              onClose={() => { setSelectedSymbol(null); setShowFutures(false); }}
            />
          ) : (
            <FuturesPanel
              commodity={selectedCommodity}
              onClose={() => { setSelectedSymbol(null); setShowFutures(false); }}
            />
          )}
        </>
      )}

      {/* ── Cards grid ───────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))", gap:14 }}>
        {filtered.map((commodity) => (
          <CommodityCard
            key={commodity.symbol}
            commodity={commodity}
            quote={quotes[commodity.symbol]}
            loading={!!loadingMap[commodity.symbol]}
            error={!!errorMap[commodity.symbol]}
            selected={selectedSymbol === commodity.symbol}
            onClick={() => handleCardClick(commodity.symbol)}
          />
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop:32, paddingTop:16, borderTop:"1px solid rgba(148,163,184,0.16)", textAlign:"center" }}>
        <span style={{ fontSize:11, color:"#94a3b8" }}>
          Dados: Yahoo Finance · Futuros internacionais · Preços com até 15-20 min de delay
        </span>
      </div>
    </div>
  );
}
