import { Chart, registerables } from "chart.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";

Chart.register(...registerables);

// ─── Constants ────────────────────────────────────────────────────────────────
const K = 2.2046;
const BRAND = "#ff6600";

const TYPE_LABEL = {
  CBOT_SHORT: "Venda CBOT Futuro",
  USD_SHORT: "Venda USD Futuro (Receita)",
  USD_LONG: "Compra USD Futuro (Insumos)",
};

// ─── Pure math / RNG ──────────────────────────────────────────────────────────
function erfApprox(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normCdf(z) { return 0.5 * (1 + erfApprox(z / Math.SQRT2)); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (a >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rng) {
  let u = 0, v = 0;
  while (u <= 1e-12) u = rng();
  while (v <= 1e-12) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function round2(x) { return Math.round(x * 100) / 100; }

function genSeedU32() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  }
}
function checksumBase36(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % (36 * 36)).toString(36).toUpperCase().padStart(2, "0");
}
function seedToCode(seed) {
  const core = (seed >>> 0).toString(36).toUpperCase();
  return `HG-${core}-${checksumBase36(core)}`;
}
function codeToSeed(code) {
  if (!code) return null;
  const clean = code.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^HG-([0-9A-Z]+)-([0-9A-Z]{2})$/.exec(clean);
  if (!m) return null;
  const [, core, chk] = m;
  if (checksumBase36(core) !== chk) return null;
  const seed = parseInt(core, 36);
  return isFinite(seed) ? seed >>> 0 : null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────
const PLANT = new Date("2026-09-10T00:00:00");
const HARV = new Date("2027-03-30T00:00:00");

function addDays(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

const MOMENT_DATES = [
  addDays(PLANT, -360),
  addDays(PLANT, -180),
  addDays(PLANT, -30),
  addDays(HARV, -30),
  addDays(HARV, +120),
];

function dateToBR(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function dateToShortBR(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt2 = (n) => (isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const fmt0 = (n) => (isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—");
function fmtWhen(ts) {
  const t = Number(ts);
  if (!isFinite(t) || t <= 0) return "—";
  try { return new Date(t).toLocaleString("pt-BR"); } catch { return "—"; }
}

// ─── Scenario generator ───────────────────────────────────────────────────────
function buildScenariosFromSeed(seed, basisHistVal) {
  const rng = mulberry32(seed);
  const cbotMin = 10.50, cbotMax = 14.80;
  const usdMin = 4.50, usdMax = 6.20;
  const rhoCbotUsd = -0.70;
  const rhoBasisCbot = 0.75;

  function correlatedPair(rho) {
    const e1 = randn(rng), e2 = randn(rng);
    const z1 = e1;
    const z2 = rho * z1 + Math.sqrt(Math.max(1 - rho * rho, 0)) * e2;
    return { z1, z2 };
  }

  return MOMENT_DATES.map((dt, i) => {
    const { z1: zC, z2: zU } = correlatedPair(rhoCbotUsd);
    const pC = clamp(normCdf(zC), 1e-6, 1 - 1e-6);
    const pU = clamp(normCdf(zU), 1e-6, 1 - 1e-6);
    const cbot = round2(cbotMin + (cbotMax - cbotMin) * pC);
    const usd = round2(usdMin + (usdMax - usdMin) * pU);

    let basis;
    if (i === 4) {
      basis = round2(basisHistVal + 0.50);
    } else {
      const eB = randn(rng);
      const zB = (-rhoBasisCbot * zC) + Math.sqrt(Math.max(1 - rhoBasisCbot * rhoBasisCbot, 0)) * eB;
      const uB = clamp(normCdf(zB), 1e-6, 1 - 1e-6);
      const shock = -2.00 + (uB * 2.50);
      basis = round2(basisHistVal + shock);
    }
    return { name: `Momento ${i + 1}`, cbot, basis, usd, date: dt };
  });
}

// ─── Inline style objects ─────────────────────────────────────────────────────
const S = {
  // Layout
  page: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", minHeight: "100%", background: "#f8fafc", color: "#0f172a" },
  maxW: { maxWidth: 1280, margin: "0 auto", padding: "16px 16px 32px" },

  // Cover (dark overlay)
  cover: { position: "fixed", inset: 0, zIndex: 9999, background: "linear-gradient(180deg, #0b1220, #0f172a 35%, #0b1220)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 },
  coverCard: { width: "min(980px, 100%)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 22, background: "rgba(255,255,255,.06)", backdropFilter: "blur(10px)", padding: 18, boxShadow: "0 18px 60px rgba(0,0,0,.45)" },
  coverTitle: { fontSize: 22, fontWeight: 900, letterSpacing: ".2px" },
  coverSub: { fontSize: 12, color: "rgba(255,255,255,.75)" },
  coverInput: { width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", padding: ".70rem .9rem", color: "#fff", fontSize: 12, outline: "none" },
  coverBtn: { borderRadius: 14, padding: ".70rem 1rem", fontWeight: 900, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", fontSize: 12, cursor: "pointer", color: "#fff" },
  coverBtnPrimary: { borderRadius: 14, padding: ".70rem 1rem", fontWeight: 900, border: "1px solid transparent", background: BRAND, fontSize: 12, cursor: "pointer", color: "#fff" },
  divider: { height: 1, background: "rgba(255,255,255,.10)", margin: "12px 0" },
  coverPanel: { padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.05)" },

  // Cards
  kpi: { border: "1px solid rgba(0,0,0,.07)", borderRadius: 14, padding: 10, background: "#fff" },
  kpiGood: { border: "1px solid rgba(34,197,94,.16)", borderRadius: 14, padding: 10, background: "#f0fdf4" },
  kpiWarn: { border: "1px solid rgba(255,102,0,.22)", borderRadius: 14, padding: 10, background: "#fff7ed" },
  kpiSlate: { border: "1px solid rgba(0,0,0,.07)", borderRadius: 14, padding: 10, background: "#f8fafc" },
  innerCell: { padding: "10px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc" },
  innerCellWhite: { padding: "10px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" },

  // Buttons
  btn: { borderRadius: 12, padding: ".45rem .75rem", fontWeight: 800, border: "1px solid rgba(0,0,0,.10)", background: "#fff", fontSize: 12, cursor: "pointer", color: "#0f172a" },
  btnPrimary: { borderRadius: 12, padding: ".45rem .75rem", fontWeight: 800, border: "1px solid transparent", background: BRAND, fontSize: 12, cursor: "pointer", color: "#fff" },
  btnDisabled: { opacity: 0.45, cursor: "not-allowed" },

  // Tabs
  tab: { padding: ".42rem .7rem", borderRadius: 12, border: "1px solid rgba(0,0,0,.10)", fontWeight: 800, fontSize: 12, cursor: "pointer", background: "#fff", color: "#0f172a" },
  tabActive: { padding: ".42rem .7rem", borderRadius: 12, border: "1px solid #0f172a", fontWeight: 800, fontSize: 12, cursor: "pointer", background: "#0f172a", color: "#fff" },

  // Chip
  chip: { fontSize: 11, padding: ".18rem .5rem", borderRadius: 999, border: "1px solid rgba(0,0,0,.08)", background: "#fff", display: "inline-flex", alignItems: "center", gap: 4 },

  // Typography
  muted: { color: "#64748b" },
  mono: { fontVariantNumeric: "tabular-nums" },
  label11: { fontSize: 11, color: "#64748b", marginBottom: 4 },
  bold: { fontWeight: 800 },
  textSm: { fontSize: 12 },
  textXs: { fontSize: 11 },
  textLg: { fontSize: 18, fontWeight: 800 },
  textBase: { fontSize: 14, fontWeight: 800 },

  // Table
  tableWrap: { overflowX: "auto", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" },
  th: { padding: "8px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", textAlign: "left", fontSize: 11, color: "#334155", background: "#f8fafc", whiteSpace: "nowrap", fontWeight: 700 },
  td: { padding: "8px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", fontSize: 12, verticalAlign: "top" },

  // Input / Select
  input: { borderRadius: 12, border: "1px solid #e2e8f0", padding: ".5rem .75rem", fontSize: 12, outline: "none", width: "100%", fontVariantNumeric: "tabular-nums" },
  select: { borderRadius: 12, border: "1px solid #e2e8f0", padding: ".5rem .75rem", fontSize: 12, outline: "none", width: "100%", background: "#fff" },

  // Chart wrapper
  chartWrap: { border: "1px solid rgba(0,0,0,.07)", borderRadius: 14, padding: 10, background: "#fff" },

  // Grid helpers (inline flex/grid)
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  colSpan2: { gridColumn: "span 2" },

  // Alert
  alert: { padding: 12, borderRadius: 12, background: "#fff7ed", border: "1px solid rgba(255,102,0,.22)", marginBottom: 8 },
};

// ─── Leaderboard columns ──────────────────────────────────────────────────────
const LB_COLS = [
  { key: "__rank", label: "#", render: (r, i) => String(i + 1) },
  { key: "player_name", label: "Nome", render: (r) => r.player_name || "—", style: { fontWeight: 800 } },
  { key: "h_m1", label: "HM1", render: (r) => isFinite(r.h_m1) ? `${fmt2(r.h_m1)}%` : "—", style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "h_m2", label: "HM2", render: (r) => isFinite(r.h_m2) ? `${fmt2(r.h_m2)}%` : "—", style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "h_m3", label: "HM3", render: (r) => isFinite(r.h_m3) ? `${fmt2(r.h_m3)}%` : "—", style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "h_m4", label: "HM4", render: (r) => isFinite(r.h_m4) ? `${fmt2(r.h_m4)}%` : "—", style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "h_m5", label: "HM5", render: (r) => isFinite(r.h_m5) ? `${fmt2(r.h_m5)}%` : "—", style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "final_price", label: "Preço final (R$/sc)", render: (r) => fmt2(r.final_price), style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "avg_phys", label: "Preço méd. físico (R$/sc)", render: (r) => fmt2(r.avg_phys), style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "margin", label: "Margem (R$/sc)", render: (r) => fmt2(r.margin), style: { fontVariantNumeric: "tabular-nums", fontWeight: 800 } },
  { key: "adj_total", label: "Ajustes derivativos (R$)", render: (r) => fmt2(r.adj_total), style: { fontVariantNumeric: "tabular-nums" } },
  { key: "vol_phys", label: "Vol físico (sc)", render: (r) => fmt0(r.vol_phys), style: { fontVariantNumeric: "tabular-nums" } },
  { key: "ts", label: "Quando", render: (r) => fmtWhen(r.ts), style: { fontSize: 11, color: "#64748b" } },
];

// ─── Component ────────────────────────────────────────────────────────────────
export function GamingPage() {
  // Page state
  const [page, setPage] = useState("cover"); // cover | config | game | results
  const [activeTab, setActiveTab] = useState("game");

  // Identity
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState(null);
  const [seed, setSeed] = useState(null);
  const [isNewGame, setIsNewGame] = useState(false);

  // Staged code for new game (before host confirms)
  const [stagedCode, setStagedCode] = useState(null);
  const [stagedSeed, setStagedSeed] = useState(null);

  // Config
  const [config, setConfig] = useState({
    cost_rsc: 105,
    area_ha: 1500,
    yield_scha: 65,
    production_sc: 97500,
    basis_hist: -0.50,
  });
  const [productionManual, setProductionManual] = useState(false);

  // Game state
  const [momentIdx, setMomentIdx] = useState(0);
  const [scenarios, setScenarios] = useState([]);
  const [physSales, setPhysSales] = useState([]);
  const [positions, setPositions] = useState([]);
  const [nextPosId, setNextPosId] = useState(1);
  const [adjLog, setAdjLog] = useState([]);
  const [derivEvents, setDerivEvents] = useState([]);

  // UI inputs
  const [inpPlayerName, setInpPlayerName] = useState("");
  const [inpApplyCode, setInpApplyCode] = useState("");
  const [inpPhysSc, setInpPhysSc] = useState(0);
  const [inpOpenType, setInpOpenType] = useState("CBOT_SHORT");
  const [inpOpenVol, setInpOpenVol] = useState(0);
  const [selClosePosId, setSelClosePosId] = useState("");
  const [inpCloseVol, setInpCloseVol] = useState(0);

  // Feedback
  const [alertMsg, setAlertMsg] = useState(null);
  const [coverErr, setCoverErr] = useState(false);
  const [coverNameErr, setCoverNameErr] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState("");

  // Charts
  const hedgeCanvasRef = useRef(null);
  const hedgeCanvasFinalRef = useRef(null);
  const hedgeChartRef = useRef(null);
  const hedgeChartFinalRef = useRef(null);

  // ── Derived calcs ────────────────────────────────────────────────────────────
  const prodSc = config.production_sc || 0;

  const sumPhysUpTo = useCallback((mIdx, sales = physSales) => {
    const rows = sales.filter((x) => x.momentIdx <= mIdx);
    const vol = rows.reduce((a, x) => a + x.sc, 0);
    const val = rows.reduce((a, x) => a + x.valueBRL, 0);
    return { vol, val, avg: vol > 0 ? val / vol : 0 };
  }, [physSales]);

  const openDerivCbotScAtMoment = useCallback((i, evts = derivEvents) => {
    return Math.max(0, evts.filter((e) => e.momentIdx <= i).reduce((a, e) => a + e.deltaSc, 0));
  }, [derivEvents]);

  const mtmOpenAtMoment = useCallback((mIdx, scens = scenarios, pos = positions) => {
    if (!scens[mIdx]) return 0;
    const s = scens[mIdx];
    return pos.reduce((acc, p) => {
      if (!(p.openVol > 0)) return acc;
      if (p.type === "CBOT_SHORT") return acc + (p.entryPrice - s.cbot) * K * s.usd * p.openVol;
      if (p.type === "USD_SHORT") return acc + (p.entryPrice - s.usd) * p.openVol;
      if (p.type === "USD_LONG") return acc + (s.usd - p.entryPrice) * p.openVol;
      return acc;
    }, 0);
  }, [scenarios, positions]);

  const cumAdjUpTo = useCallback((mIdx, log = adjLog) => {
    return log.filter((x) => x.momentIdx <= mIdx).reduce((a, x) => a + x.pnlBRL, 0);
  }, [adjLog]);

  const hedgePctTotalAtMoment = useCallback((i) => {
    if (!(prodSc > 0)) return 0;
    const physCum = sumPhysUpTo(i).vol;
    const derivOpen = openDerivCbotScAtMoment(i);
    return round2(clamp(((physCum + derivOpen) / prodSc) * 100, 0, 999));
  }, [sumPhysUpTo, openDerivCbotScAtMoment, prodSc]);

  const hedgeProdPctAtMoment = useCallback((mIdx) => {
    if (!(prodSc > 0)) return 0;
    return clamp((sumPhysUpTo(mIdx).vol / prodSc) * 100, 0, 999);
  }, [sumPhysUpTo, prodSc]);

  const physPriceRsc = useCallback((mIdx, scens = scenarios) => {
    const s = scens[mIdx];
    if (!s) return 0;
    return (s.cbot + s.basis) * K * s.usd;
  }, [scenarios]);

  // ── Chart update ─────────────────────────────────────────────────────────────
  const buildHedgeSeries = useCallback((upToIdx) => {
    const labels = [], physCum = [], derivOpen = [], total = [];
    for (let i = 0; i <= upToIdx; i++) {
      const s = scenarios[i];
      if (!s) break;
      labels.push(dateToShortBR(s.date));
      const p = sumPhysUpTo(i).vol;
      const d = openDerivCbotScAtMoment(i);
      physCum.push(p);
      derivOpen.push(d);
      total.push(p + d);
    }
    return { labels, physCum, derivOpen, total };
  }, [scenarios, sumPhysUpTo, openDerivCbotScAtMoment]);

  const applyHedgeSeriesToChart = useCallback((chart, upToIdx) => {
    if (!chart) return;
    const { labels, physCum, derivOpen, total } = buildHedgeSeries(upToIdx);
    chart.data.labels = labels;
    chart.data.datasets = [
      {
        label: "Vendas Físico (sc)",
        data: physCum,
        backgroundColor: "rgba(234,179,8,.45)",
        borderColor: "rgba(234,179,8,1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        order: 2,
      },
      {
        label: "Derivativos CBOT abertos (sc)",
        data: derivOpen,
        backgroundColor: "rgba(249,115,22,.35)",
        borderColor: "rgba(249,115,22,1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        order: 3,
      },
      {
        label: "Total Hedge (sc)",
        data: total,
        type: "line",
        borderColor: "#0f172a",
        borderWidth: 2,
        pointRadius: 4,
        fill: false,
        tension: 0.3,
        order: 1,
      },
    ];
    chart.options.scales.y.max = prodSc || 100000;
    chart.update();
  }, [buildHedgeSeries, prodSc]);

  const initChart = useCallback((canvas, chartRef, forFinal = false) => {
    if (!canvas || chartRef.current) return;
    const ctx = canvas.getContext("2d");
    chartRef.current = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 14, boxHeight: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt0(ctx.parsed.y)} sc`,
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 11 } } },
          y: {
            min: 0,
            max: prodSc || 100000,
            stacked: true,
            ticks: {
              font: { size: 11 },
              callback: (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "."),
            },
          },
        },
      },
    });
  }, [prodSc]);

  // Init game chart when game page is shown
  useEffect(() => {
    if (page === "game" && hedgeCanvasRef.current) {
      initChart(hedgeCanvasRef.current, hedgeChartRef, false);
    }
  }, [page, initChart]);

  // Init final chart when results page is shown
  useEffect(() => {
    if (page === "results" && activeTab === "results" && hedgeCanvasFinalRef.current) {
      initChart(hedgeCanvasFinalRef.current, hedgeChartFinalRef, true);
    }
  }, [page, activeTab, initChart]);

  // Update charts when game data changes
  useEffect(() => {
    if (scenarios.length === 0) return;
    if (hedgeChartRef.current) applyHedgeSeriesToChart(hedgeChartRef.current, momentIdx);
    if (hedgeChartFinalRef.current) applyHedgeSeriesToChart(hedgeChartFinalRef.current, 4);
  }, [scenarios, physSales, positions, derivEvents, momentIdx, applyHedgeSeriesToChart]);

  // ── API helpers ───────────────────────────────────────────────────────────────
  async function apiSaveConfig(code, cfg) {
    await api.post("/gaming-sessions/", {
      game_code: code,
      kind: "CONFIG",
      ts: Date.now(),
      cost_rsc: cfg.cost_rsc,
      area_ha: cfg.area_ha,
      yield_scha: cfg.yield_scha,
      production_sc: cfg.production_sc,
      basis_hist: cfg.basis_hist,
    });
  }

  async function apiFetchConfig(code) {
    const res = await api.get(`/gaming-sessions/?game_code=${encodeURIComponent(code)}&kind=CONFIG&ordering=-ts`);
    const results = res.data?.results ?? res.data;
    return Array.isArray(results) ? results[0] ?? null : null;
  }

  async function apiSaveResult(code, pName, result) {
    await api.post("/gaming-sessions/", {
      game_code: code,
      kind: "RESULT",
      player_name: pName,
      ts: Date.now(),
      ...result,
    });
  }

  async function apiFetchLeaderboard(code) {
    const res = await api.get(`/gaming-sessions/?game_code=${encodeURIComponent(code)}&kind=RESULT&ordering=-final_price`);
    const results = res.data?.results ?? res.data;
    return Array.isArray(results) ? results : [];
  }

  // ── Game bootstrap ────────────────────────────────────────────────────────────
  function startGame(code, seedVal, cfg) {
    const scens = buildScenariosFromSeed(seedVal, cfg.basis_hist);
    setSeed(seedVal);
    setGameCode(code);
    setConfig(cfg);
    setScenarios(scens);
    setMomentIdx(0);
    setPhysSales([]);
    setPositions([]);
    setNextPosId(1);
    setAdjLog([]);
    setDerivEvents([]);
    setAlertMsg(null);
    setActiveTab("game");
    setPage("game");
  }

  // ── Cover handlers ────────────────────────────────────────────────────────────
  function handleNewGame() {
    const name = inpPlayerName.trim();
    if (!name) { setCoverNameErr(true); return; }
    setCoverNameErr(false);
    setPlayerName(name);
    const s = genSeedU32();
    const c = seedToCode(s);
    setStagedSeed(s);
    setStagedCode(c);
    setIsNewGame(true);
    setProductionManual(false);
    setConfig({ cost_rsc: 105, area_ha: 1500, yield_scha: 65, production_sc: 97500, basis_hist: -0.50 });
    setPage("config");
  }

  async function handleApplyGame() {
    const name = inpPlayerName.trim();
    if (!name) { setCoverNameErr(true); return; }
    setCoverNameErr(false);
    const code = inpApplyCode.trim().toUpperCase();
    const s = codeToSeed(code);
    if (!s) { setCoverErr(true); return; }
    setCoverErr(false);
    setPlayerName(name);
    try {
      const row = await apiFetchConfig(code);
      const cfg = row
        ? { cost_rsc: row.cost_rsc ?? 105, area_ha: row.area_ha ?? 1500, yield_scha: row.yield_scha ?? 65, production_sc: row.production_sc ?? 97500, basis_hist: row.basis_hist ?? -0.5 }
        : { cost_rsc: 105, area_ha: 1500, yield_scha: 65, production_sc: 97500, basis_hist: -0.50 };
      setIsNewGame(false);
      startGame(code, s, cfg);
    } catch {
      setCoverErr(true);
    }
  }

  function handleDemo() {
    setInpApplyCode("HG-1-01");
    setCoverErr(false);
  }

  // ── Config handlers ───────────────────────────────────────────────────────────
  async function handleConfirmConfig() {
    const cfg = { ...config };
    try {
      await apiSaveConfig(stagedCode, cfg);
    } catch {
      // continue even if save fails — game still works locally
    }
    startGame(stagedCode, stagedSeed, cfg);
  }

  function handleConfigChange(field, value) {
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      if ((field === "area_ha" || field === "yield_scha") && !productionManual) {
        const area = field === "area_ha" ? value : prev.area_ha;
        const yld = field === "yield_scha" ? value : prev.yield_scha;
        next.production_sc = Math.max(0, Math.round(area) * Math.round(yld));
      }
      if (field === "production_sc") {
        setProductionManual(true);
      }
      return next;
    });
  }

  // ── Physical sale ─────────────────────────────────────────────────────────────
  function handleAddPhys() {
    const vol = Math.round(Number(inpPhysSc));
    if (!(vol > 0)) { setAlertMsg("Volume deve ser um inteiro positivo."); return; }
    const alreadySold = physSales.reduce((a, x) => a + x.sc, 0);
    if (alreadySold + vol > prodSc) { setAlertMsg(`Volume excede o saldo. Disponível: ${fmt0(prodSc - alreadySold)} sc.`); return; }
    if (!scenarios[momentIdx]) return;
    const price = physPriceRsc(momentIdx);
    setPhysSales((prev) => [...prev, {
      id: Date.now(),
      momentIdx,
      momentName: scenarios[momentIdx].name,
      date: scenarios[momentIdx].date,
      sc: vol,
      priceBRL: price,
      valueBRL: price * vol,
    }]);
    setInpPhysSc(0);
    setAlertMsg(null);
  }

  // ── Open derivative ───────────────────────────────────────────────────────────
  function handleOpenDeriv() {
    const vol = Math.round(Number(inpOpenVol));
    if (!(vol > 0)) { setAlertMsg("Volume deve ser um inteiro positivo."); return; }
    if (!scenarios[momentIdx]) return;
    const s = scenarios[momentIdx];
    const entryPrice = inpOpenType === "CBOT_SHORT" ? s.cbot : s.usd;
    const newId = nextPosId;
    setNextPosId((n) => n + 1);
    setPositions((prev) => [...prev, {
      id: newId,
      type: inpOpenType,
      momentIdx,
      momentName: s.name,
      date: s.date,
      entryPrice,
      openVol: vol,
    }]);
    if (inpOpenType === "CBOT_SHORT") {
      setDerivEvents((prev) => [...prev, { momentIdx, deltaSc: vol }]);
    }
    setInpOpenVol(0);
    setAlertMsg(null);
  }

  // ── Close derivative ──────────────────────────────────────────────────────────
  function handleCloseDeriv() {
    const pos = positions.find((p) => String(p.id) === String(selClosePosId));
    if (!pos) { setAlertMsg("Selecione uma posição em aberto."); return; }
    const closeVol = Math.round(Number(inpCloseVol));
    if (!(closeVol > 0)) { setAlertMsg("Volume a fechar deve ser positivo."); return; }
    if (closeVol > pos.openVol) { setAlertMsg(`Volume excede o aberto (${fmt0(pos.openVol)}).`); return; }
    if (!scenarios[momentIdx]) return;
    const s = scenarios[momentIdx];

    let pnlBRL = 0;
    if (pos.type === "CBOT_SHORT") {
      pnlBRL = (pos.entryPrice - s.cbot) * K * s.usd * closeVol;
    } else if (pos.type === "USD_SHORT") {
      pnlBRL = (pos.entryPrice - s.usd) * closeVol;
    } else if (pos.type === "USD_LONG") {
      pnlBRL = (s.usd - pos.entryPrice) * closeVol;
    }

    setAdjLog((prev) => [...prev, {
      id: Date.now(),
      momentIdx,
      momentName: s.name,
      date: s.date,
      type: pos.type,
      typeLabel: TYPE_LABEL[pos.type],
      entryPrice: pos.entryPrice,
      exitPrice: pos.type === "CBOT_SHORT" ? s.cbot : s.usd,
      vol: closeVol,
      pnlBRL,
    }]);

    setPositions((prev) => prev.map((p) => p.id === pos.id ? { ...p, openVol: p.openVol - closeVol } : p));

    if (pos.type === "CBOT_SHORT") {
      setDerivEvents((prev) => [...prev, { momentIdx, deltaSc: -closeVol }]);
    }

    setInpCloseVol(0);
    setAlertMsg(null);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    const hasOpen = positions.some((p) => p.openVol > 0);
    if (hasOpen) { setAlertMsg("Feche todos os derivativos em aberto antes de finalizar."); return; }
    const totalSold = physSales.reduce((a, x) => a + x.sc, 0);
    if (totalSold < prodSc) { setAlertMsg(`Volume físico vendido (${fmt0(totalSold)} sc) é menor que a produção total (${fmt0(prodSc)} sc).`); return; }

    const physData = (() => {
      const vol = physSales.reduce((a, x) => a + x.sc, 0);
      const val = physSales.reduce((a, x) => a + x.valueBRL, 0);
      return { vol, val, avg: vol > 0 ? val / vol : 0 };
    })();
    const adjTotal = adjLog.reduce((a, x) => a + x.pnlBRL, 0);
    const finalPrice = physData.avg + (physData.vol > 0 ? adjTotal / physData.vol : 0);
    const margin = finalPrice - config.cost_rsc;
    const mtmFinal = mtmOpenAtMoment(Math.min(momentIdx, scenarios.length - 1));

    const hPcts = {
      h_m1: hedgePctTotalAtMoment(0),
      h_m2: hedgePctTotalAtMoment(1),
      h_m3: hedgePctTotalAtMoment(2),
      h_m4: hedgePctTotalAtMoment(3),
      h_m5: hedgePctTotalAtMoment(4),
    };

    const result = {
      final_price: round2(finalPrice),
      adj_total: round2(adjTotal),
      vol_phys: physData.vol,
      avg_phys: round2(physData.avg),
      margin: round2(margin),
      ...hPcts,
    };

    try {
      await apiSaveResult(gameCode, playerName, result);
    } catch {
      // non-blocking
    }

    setActiveTab("results");
    setPage("results");
    // Load leaderboard
    setLeaderboardStatus("Carregando…");
    try {
      const rows = await apiFetchLeaderboard(gameCode);
      setLeaderboard(rows);
      setLeaderboardStatus(`${rows.length} resultado(s)`);
    } catch {
      setLeaderboardStatus("Erro ao carregar ranking");
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────────
  function handleReset() {
    setPage("cover");
    setActiveTab("game");
    setPlayerName("");
    setInpPlayerName("");
    setGameCode(null);
    setSeed(null);
    setStagedCode(null);
    setStagedSeed(null);
    setIsNewGame(false);
    setConfig({ cost_rsc: 105, area_ha: 1500, yield_scha: 65, production_sc: 97500, basis_hist: -0.50 });
    setMomentIdx(0);
    setScenarios([]);
    setPhysSales([]);
    setPositions([]);
    setNextPosId(1);
    setAdjLog([]);
    setDerivEvents([]);
    setAlertMsg(null);
    setCoverErr(false);
    setCoverNameErr(false);
    setLeaderboard([]);
    // Destroy charts
    if (hedgeChartRef.current) { hedgeChartRef.current.destroy(); hedgeChartRef.current = null; }
    if (hedgeChartFinalRef.current) { hedgeChartFinalRef.current.destroy(); hedgeChartFinalRef.current = null; }
  }

  // ── Tab switch ────────────────────────────────────────────────────────────────
  async function handleTabResults() {
    setActiveTab("results");
    setPage("results");
    if (gameCode) {
      setLeaderboardStatus("Carregando…");
      try {
        const rows = await apiFetchLeaderboard(gameCode);
        setLeaderboard(rows);
        setLeaderboardStatus(`${rows.length} resultado(s)`);
      } catch {
        setLeaderboardStatus("Erro ao carregar ranking");
      }
    }
  }

  // ── Open position select options ──────────────────────────────────────────────
  const openPositions = useMemo(() => positions.filter((p) => p.openVol > 0), [positions]);

  // ── Derived results (for results page) ───────────────────────────────────────
  const results = useMemo(() => {
    const vol = physSales.reduce((a, x) => a + x.sc, 0);
    const val = physSales.reduce((a, x) => a + x.valueBRL, 0);
    const avg = vol > 0 ? val / vol : 0;
    const adjTotal = adjLog.reduce((a, x) => a + x.pnlBRL, 0);
    const finalPrice = avg + (vol > 0 ? adjTotal / vol : 0);
    const margin = finalPrice - config.cost_rsc;
    const mtmFinal = scenarios.length > 0 ? mtmOpenAtMoment(scenarios.length - 1) : 0;
    return { vol, avg, adjTotal, finalPrice, margin, mtmFinal, adjPlusMtm: adjTotal + mtmFinal };
  }, [physSales, adjLog, config.cost_rsc, scenarios, mtmOpenAtMoment]);

  // ── Current moment data ───────────────────────────────────────────────────────
  const curScen = scenarios[momentIdx];
  const curPhysPrice = curScen ? (curScen.cbot + curScen.basis) * K * curScen.usd : null;
  const curAdj = cumAdjUpTo(momentIdx);
  const curMtm = curScen ? mtmOpenAtMoment(momentIdx) : 0;
  const saldoVender = prodSc - sumPhysUpTo(momentIdx).vol;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* ── COVER ── */}
      {page === "cover" && (
        <div style={S.cover}>
          <div style={S.coverCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={S.coverTitle}>SDT Position Simulator</div>
                <div style={{ ...S.coverSub, marginTop: 4 }}>
                  Gere um <b>novo jogo</b> (código/seed) ou aplique um código existente.<br />
                  Se for <b>novo jogo</b>, você será encaminhado para a <b>configuração</b> antes de iniciar.
                </div>
              </div>
              <div style={{ ...S.chip, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.8)", fontSize: 11 }}>
                Seed-sync • SDT API
              </div>
            </div>

            <div style={S.divider} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {/* Player name */}
              <div style={S.coverPanel}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Seu nome</div>
                <div style={{ ...S.coverSub, marginTop: 4 }}>Vai para o ranking.</div>
                <div style={{ marginTop: 12 }}>
                  <input
                    style={S.coverInput}
                    placeholder="Ex: G1 — João / Maria"
                    value={inpPlayerName}
                    onChange={(e) => { setInpPlayerName(e.target.value); setCoverNameErr(false); }}
                  />
                </div>
                {coverNameErr && <div style={{ ...S.coverSub, color: "#fca5a5", marginTop: 8 }}>Informe seu nome para prosseguir.</div>}
              </div>

              {/* New game */}
              <div style={S.coverPanel}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Novo jogo</div>
                <div style={{ ...S.coverSub, marginTop: 4 }}>Gera um código do jogo e vai para a configuração.</div>
                <div style={{ marginTop: 12 }}>
                  <button style={S.coverBtnPrimary} onClick={handleNewGame}>Novo jogo</button>
                </div>
                <div style={{ ...S.coverSub, marginTop: 12 }}>
                  <b>Obs:</b> a configuração abre <b>somente</b> para novo jogo. Depois, fica <b>travada</b>.
                </div>
              </div>

              {/* Apply game */}
              <div style={S.coverPanel}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Aplicar jogo</div>
                <div style={{ ...S.coverSub, marginTop: 4 }}>Cole o código e entre direto no jogo.</div>
                <div style={{ marginTop: 12 }}>
                  <input
                    style={{ ...S.coverInput, fontVariantNumeric: "tabular-nums" }}
                    placeholder="Ex: HG-8K3JQ2-7F"
                    value={inpApplyCode}
                    onChange={(e) => { setInpApplyCode(e.target.value); setCoverErr(false); }}
                  />
                </div>
                <div style={{ ...S.row, marginTop: 12 }}>
                  <button style={S.coverBtnPrimary} onClick={handleApplyGame}>Aplicar</button>
                  <button style={S.coverBtn} onClick={handleDemo}>Demo</button>
                </div>
                {coverErr && <div style={{ ...S.coverSub, color: "#fca5a5", marginTop: 8 }}>Código inválido. Confira e tente novamente.</div>}
              </div>
            </div>

            <div style={S.divider} />
            <div style={S.coverSub}>
              Físico: <b>((CBOT + Basis) × 2,2046 × USD Futuro)</b> • Basis por momento: <b>histórico ± 2,00</b> com correlação <b>negativa</b> com CBOT.
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT (config / game / results) ── */}
      <div style={S.maxW}>

        {/* Header */}
        {page !== "cover" && (
          <header style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 12, background: "#0f172a", color: "#fff", fontWeight: 900, fontSize: 14 }}>SDT</span>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>SDT Position Simulator — Hedging Game (Soja)</h1>
                <p style={{ margin: 0, fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  Plantio: <b>10/09/2026</b> • Colheita: <b>30/04/2027</b> • Físico (R$/sc) = ((CBOT + Basis) × 2,2046 × USD Futuro).
                </p>
              </div>
            </div>
            <div style={S.row}>
              <span style={S.chip}>Jogador: <b>{playerName || "—"}</b></span>
              <span style={{ ...S.chip, ...S.mono }}>Código: <b>{gameCode || "—"}</b></span>
              {page !== "config" && (
                <>
                  <button style={activeTab === "game" ? S.tabActive : S.tab} onClick={() => { setActiveTab("game"); setPage("game"); }}>Jogo</button>
                  <button style={activeTab === "results" ? S.tabActive : S.tab} onClick={handleTabResults}>Resultados</button>
                </>
              )}
              <button style={S.btn} onClick={handleReset}>Resetar</button>
              {page === "game" && <button style={S.btnPrimary} onClick={handleFinalize}>Finalizar</button>}
            </div>
          </header>
        )}

        {/* Alert */}
        {alertMsg && page !== "cover" && (
          <div style={{ ...S.alert, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Atenção</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{alertMsg}</div>
          </div>
        )}

        {/* ── CONFIG PAGE ── */}
        {page === "config" && (
          <div style={S.kpi}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Configuração do jogo (somente para novo jogo)</div>
                <div style={{ ...S.muted, fontSize: 11, marginTop: 4 }}>
                  Após confirmar, a configuração fica <b>travada</b> durante todos os momentos.<br />
                  Área, produtividade e produção são sempre <b>inteiros</b>.
                </div>
              </div>
              <span style={S.chip}>config travada após confirmar</span>
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {/* Parâmetros de Produção */}
              <div style={S.kpiSlate}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Parâmetros de Produção</div>
                <div style={{ ...S.grid2, marginTop: 12 }}>
                  <label style={{ fontSize: 12 }}>
                    <div style={S.label11}>Custo (R$/sc)</div>
                    <input style={S.input} type="number" step="0.01" value={config.cost_rsc} onChange={(e) => handleConfigChange("cost_rsc", parseFloat(e.target.value) || 0)} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    <div style={S.label11}>Área (ha) — inteiro</div>
                    <input style={S.input} type="number" step="1" min="0" value={config.area_ha} onChange={(e) => handleConfigChange("area_ha", Math.round(parseInt(e.target.value) || 0))} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    <div style={S.label11}>Produtividade (sc/ha) — inteiro</div>
                    <input style={S.input} type="number" step="1" min="0" value={config.yield_scha} onChange={(e) => handleConfigChange("yield_scha", Math.round(parseInt(e.target.value) || 0))} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    <div style={S.label11}>Produção total (sc) — inteiro</div>
                    <input style={S.input} type="number" step="1" min="0" value={config.production_sc} onChange={(e) => handleConfigChange("production_sc", Math.round(parseInt(e.target.value) || 0))} />
                    <div style={{ ...S.label11, marginTop: 4 }}>
                      {productionManual ? "Manual — editado manualmente." : "Auto = área × produtividade."}
                    </div>
                  </label>
                  <div style={{ gridColumn: "span 2" }}>
                    <button style={S.btn} onClick={() => {
                      const prod = Math.max(0, config.area_ha * config.yield_scha);
                      setConfig((c) => ({ ...c, production_sc: prod }));
                      setProductionManual(false);
                    }}>
                      Recalcular (área × prod)
                    </button>
                    <span style={{ ...S.chip, marginLeft: 8 }}>{productionManual ? "Produção: manual" : "Produção: auto"}</span>
                  </div>
                </div>
              </div>

              {/* Basis */}
              <div style={S.kpiSlate}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Basis histórico</div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12 }}>
                    <div style={S.label11}>Basis histórico (U$/bushel)</div>
                    <input style={S.input} type="number" step="0.01" value={config.basis_hist} onChange={(e) => handleConfigChange("basis_hist", parseFloat(e.target.value) || 0)} />
                    <div style={{ ...S.label11, marginTop: 8 }}>
                      Regra: cada momento varia em até <b>±2,00</b> em relação ao histórico,
                      com correlação <b>negativa</b> com CBOT.
                    </div>
                  </label>
                </div>
                <div style={{ ...S.innerCellWhite, marginTop: 12 }}>
                  <div style={S.label11}>Plantio / Colheita (fixo)</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Plantio: <b>10/09/2026</b> • Colheita: <b>30/04/2027</b><br />
                    Datas dos momentos: 1 ano antes do plantio até 60 dias após colheita.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...S.row, marginTop: 16 }}>
              <button style={S.btn} onClick={() => setPage("cover")}>← Voltar à capa</button>
              <button style={S.btnPrimary} onClick={handleConfirmConfig}>Confirmar e iniciar →</button>
            </div>
          </div>
        )}

        {/* ── GAME PAGE ── */}
        {page === "game" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Hedge Chart */}
            <div style={S.chartWrap}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Evolução de Hedge (sc)</div>
                  <div style={{ ...S.muted, fontSize: 11, marginTop: 4 }}>
                    Amarelo = <b>Vendas via Físico</b> (acumulado) • Laranja = <b>Derivativos CBOT abertos</b> (sc) • Linha = <b>Total</b>.
                  </div>
                </div>
                <span style={S.chip}>stacked real</span>
              </div>
              <div style={{ marginTop: 12, height: 260 }}>
                <canvas ref={hedgeCanvasRef} style={{ width: "100%", height: "100%" }} />
              </div>
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {/* Config KPIs */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Configuração — Produtor</div>
                  <span style={S.chip}>travada</span>
                </div>
                <div style={{ ...S.grid2, marginTop: 12 }}>
                  {[
                    ["Custo (R$/sc)", fmt2(config.cost_rsc)],
                    ["Área (ha)", fmt0(config.area_ha)],
                    ["Produtividade (sc/ha)", fmt0(config.yield_scha)],
                    ["Produção total (sc)", fmt0(prodSc)],
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={S.innerCell}>
                      <div style={S.label11}>{lbl}</div>
                      <div style={{ ...S.textBase, ...S.mono }}>{val}</div>
                    </div>
                  ))}
                  <div style={{ ...S.innerCell, gridColumn: "span 2" }}>
                    <div style={S.label11}>Basis histórico (U$/bushel)</div>
                    <div style={{ ...S.textBase, ...S.mono }}>{fmt2(config.basis_hist)}</div>
                  </div>
                  <div style={{ ...S.innerCell, gridColumn: "span 2" }}>
                    <div style={S.label11}>Regras</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: "#64748b" }}>
                      1) Volume físico vendido <b>não pode exceder</b> a produção total •{" "}
                      2) Não finaliza se houver <b>derivativos em aberto</b> ou físico &lt; produção.
                    </div>
                  </div>
                </div>
              </div>

              {/* Momento Atual */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Momento Atual</div>
                  <span style={S.chip}>Momento {momentIdx + 1}/5</span>
                </div>
                {curScen && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <div style={S.label11}>Data do momento</div>
                      <span style={{ ...S.chip, ...S.mono }}>{dateToBR(curScen.date)}</span>
                    </div>
                    <div style={{ ...S.grid2, marginTop: 12 }}>
                      {[
                        ["CBOT (US$)", fmt2(curScen.cbot)],
                        ["USD Futuro", fmt2(curScen.usd)],
                        ["Basis (US$)", fmt2(curScen.basis)],
                        ["Físico (R$/sc)", fmt2(curPhysPrice)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={S.innerCellWhite}>
                          <div style={S.label11}>{lbl}</div>
                          <div style={{ ...S.textLg, ...S.mono }}>{val}</div>
                        </div>
                      ))}
                      <div style={{ ...S.innerCellWhite, gridColumn: "span 2" }}>
                        <div style={S.label11}>Ajustes liquidados (R$) — acumulado</div>
                        <div style={{ ...S.textLg, ...S.mono, color: curAdj >= 0 ? "#166534" : "#991b1b" }}>{fmt2(curAdj)}</div>
                      </div>
                      <div style={{ ...S.innerCellWhite, gridColumn: "span 2" }}>
                        <div style={S.label11}>MTM em aberto (R$) — no momento</div>
                        <div style={{ ...S.textLg, ...S.mono, color: curMtm >= 0 ? "#166534" : "#991b1b" }}>{fmt2(curMtm)}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Navegação */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Navegação</div>
                  <span style={S.chip}>revela momentos</span>
                </div>
                <div style={{ ...S.grid2, marginTop: 12 }}>
                  <button
                    style={momentIdx === 0 ? { ...S.btn, ...S.btnDisabled } : S.btn}
                    disabled={momentIdx === 0}
                    onClick={() => { setMomentIdx((i) => Math.max(0, i - 1)); setAlertMsg(null); }}
                  >← Voltar</button>
                  <button
                    style={momentIdx >= 4 ? { ...S.btnPrimary, ...S.btnDisabled } : S.btnPrimary}
                    disabled={momentIdx >= 4}
                    onClick={() => { setMomentIdx((i) => Math.min(4, i + 1)); setAlertMsg(null); }}
                  >Avançar →</button>
                </div>
                <div style={{ ...S.muted, fontSize: 11, marginTop: 12 }}>
                  A tabela de cenários mostra apenas <b>momentos já revelados</b> (até o momento atual).
                </div>
              </div>
            </div>

            {/* Scenarios table */}
            <div style={S.kpi}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Cenários (momentos revelados)</div>
                <span style={S.chip}>histórico</span>
              </div>
              <div style={{ ...S.tableWrap, marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Momento", "Data", "CBOT (US$)", "Basis (US$)", "USD Futuro", "Físico (R$/sc)", "% Hedge (físico/produção)"].map((h) => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.slice(0, momentIdx + 1).map((s, i) => (
                      <tr key={i} style={i === momentIdx ? { background: "#f0f9ff" } : {}}>
                        <td style={S.td}><b>{s.name}</b></td>
                        <td style={{ ...S.td, ...S.mono }}>{dateToBR(s.date)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmt2(s.cbot)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmt2(s.basis)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmt2(s.usd)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmt2((s.cbot + s.basis) * K * s.usd)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmt2(hedgeProdPctAtMoment(i))}%</td>
                      </tr>
                    ))}
                    {scenarios.length === 0 && (
                      <tr><td colSpan={7} style={{ ...S.td, ...S.muted }}>Nenhum cenário gerado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {/* Venda Física */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Ação: Venda Física</div>
                  <span style={S.chip}>fixa preço</span>
                </div>
                <div style={{ ...S.innerCell, marginTop: 8 }}>
                  <div style={S.label11}>Saldo para vender (sc)</div>
                  <div style={{ ...S.textBase, ...S.mono }}>{fmt0(Math.max(0, prodSc - physSales.reduce((a, x) => a + x.sc, 0)))}</div>
                  <div style={{ ...S.label11, marginTop: 4 }}>Produção − vendido acumulado</div>
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={S.label11}>Volume (sacas) — inteiro</div>
                    <input style={S.input} type="number" min="0" step="1" value={inpPhysSc} onChange={(e) => setInpPhysSc(e.target.value)} />
                    <div style={{ ...S.label11, marginTop: 4 }}>Limite: acumulado ≤ produção total.</div>
                  </div>
                  <button style={{ ...S.btnPrimary, width: "100%" }} onClick={handleAddPhys}>Registrar venda física</button>
                </div>
              </div>

              {/* Abrir Derivativo */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Ação: Abrir Derivativo</div>
                  <span style={S.chip}>posição</span>
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={S.label11}>Tipo</div>
                    <select style={S.select} value={inpOpenType} onChange={(e) => setInpOpenType(e.target.value)}>
                      <option value="CBOT_SHORT">Venda CBOT Futuro — hedge queda (volume em sc)</option>
                      <option value="USD_SHORT">Venda USD Futuro (Receita) — hedge baixa USD (volume em USD)</option>
                      <option value="USD_LONG">Compra USD Futuro (Insumos) — hedge alta USD (volume em USD)</option>
                    </select>
                  </div>
                  <div>
                    <div style={S.label11}>Volume {inpOpenType === "CBOT_SHORT" ? "(sacas)" : "(USD)"}</div>
                    <input style={S.input} type="number" min="0" step="1" value={inpOpenVol} onChange={(e) => setInpOpenVol(e.target.value)} />
                    <div style={{ ...S.label11, marginTop: 4 }}>Unidade: {inpOpenType === "CBOT_SHORT" ? "sacas (sc)" : "USD"}</div>
                  </div>
                  <button style={{ ...S.btnPrimary, width: "100%" }} onClick={handleOpenDeriv}>Abrir posição</button>
                </div>
              </div>

              {/* Fechar Derivativo */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Ação: Fechar (Desmontar)</div>
                  <span style={S.chip}>gera ajuste</span>
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={S.label11}>Posição em aberto</div>
                    <select style={S.select} value={selClosePosId} onChange={(e) => setSelClosePosId(e.target.value)}>
                      <option value="">— selecione —</option>
                      {openPositions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {TYPE_LABEL[p.type]} | {p.momentName} | Entrada {fmt2(p.entryPrice)} | Aberto {fmt0(p.openVol)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={S.label11}>Volume a fechar</div>
                    <input style={S.input} type="number" min="0" step="1" value={inpCloseVol} onChange={(e) => setInpCloseVol(e.target.value)} />
                    {selClosePosId && (() => {
                      const p = openPositions.find((x) => String(x.id) === String(selClosePosId));
                      return p ? <div style={{ ...S.label11, marginTop: 4 }}>Em aberto: {fmt0(p.openVol)} {p.type === "CBOT_SHORT" ? "sc" : "USD"}</div> : null;
                    })()}
                  </div>
                  <button style={{ ...S.btnPrimary, width: "100%" }} onClick={handleCloseDeriv}>Fechar e liquidar ajuste</button>
                </div>
              </div>
            </div>

            {/* Logs row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
              {/* Vendas Físicas */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Vendas Físicas</div>
                  <span style={S.chip}>log</span>
                </div>
                <div style={{ ...S.tableWrap, marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Momento", "Data", "Volume (sc)", "Preço (R$/sc)", "Valor (R$)"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {physSales.map((x) => (
                        <tr key={x.id}>
                          <td style={S.td}>{x.momentName}</td>
                          <td style={{ ...S.td, ...S.mono }}>{dateToBR(x.date)}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt0(x.sc)}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt2(x.priceBRL)}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt2(x.valueBRL)}</td>
                        </tr>
                      ))}
                      {physSales.length === 0 && <tr><td colSpan={5} style={{ ...S.td, ...S.muted }}>Nenhuma venda física registrada.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ajustes Liquidados */}
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Ajustes Liquidados (Fechamentos)</div>
                  <span style={S.chip}>R$</span>
                </div>
                <div style={{ ...S.tableWrap, marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Momento", "Data", "Tipo", "Vol", "Entrada", "Saída", "Ajuste (R$)"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {adjLog.map((x) => (
                        <tr key={x.id}>
                          <td style={S.td}>{x.momentName}</td>
                          <td style={{ ...S.td, ...S.mono }}>{dateToBR(x.date)}</td>
                          <td style={S.td}>{x.typeLabel}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt0(x.vol)}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt2(x.entryPrice)}</td>
                          <td style={{ ...S.td, ...S.mono }}>{fmt2(x.exitPrice)}</td>
                          <td style={{ ...S.td, ...S.mono, color: x.pnlBRL >= 0 ? "#166534" : "#991b1b", fontWeight: 800 }}>{fmt2(x.pnlBRL)}</td>
                        </tr>
                      ))}
                      {adjLog.length === 0 && <tr><td colSpan={7} style={{ ...S.td, ...S.muted }}>Nenhum ajuste liquidado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── RESULTS PAGE ── */}
        {page === "results" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Hedge chart final */}
            <div style={S.chartWrap}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Evolução de Hedge (sc) — Final</div>
                  <div style={{ ...S.muted, fontSize: 11, marginTop: 4 }}>Mesmo gráfico do jogo, para leitura final.</div>
                </div>
                <span style={S.chip}>stacked real</span>
              </div>
              <div style={{ marginTop: 12, height: 260 }}>
                <canvas ref={hedgeCanvasFinalRef} style={{ width: "100%", height: "100%" }} />
              </div>
            </div>

            {/* Results KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div style={S.kpiGood}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Preço Final (regra)</div>
                  <span style={S.chip}>médio físico + ajustes/sc</span>
                </div>
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  <div style={S.muted}>Preço final da saca =</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>Preço médio físico + (Ajustes Liquidados ÷ Volume físico total)</div>
                </div>
              </div>
              <div style={S.kpi}>
                <div style={S.label11}>Volume físico total (sc)</div>
                <div style={{ ...S.textLg, ...S.mono }}>{fmt0(results.vol)}</div>
                <div style={{ ...S.label11, marginTop: 12 }}>Preço médio físico (R$/sc)</div>
                <div style={{ ...S.textLg, ...S.mono }}>{fmt2(results.avg)}</div>
              </div>
              <div style={S.kpi}>
                <div style={S.label11}>Ajustes liquidados total (R$)</div>
                <div style={{ ...S.textLg, ...S.mono, color: results.adjTotal >= 0 ? "#166534" : "#991b1b" }}>{fmt2(results.adjTotal)}</div>
                <div style={{ ...S.label11, marginTop: 12 }}>Preço final (R$/sc)</div>
                <div style={{ ...S.textLg, ...S.mono, fontWeight: 900, color: BRAND }}>{fmt2(results.finalPrice)}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Margem Final</div>
                  <span style={S.chip}>preço final − custo</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={S.label11}>Custo (R$/sc)</div>
                  <div style={{ ...S.textBase, ...S.mono }}>{fmt2(config.cost_rsc)}</div>
                  <div style={{ ...S.label11, marginTop: 12 }}>Margem final (R$/sc)</div>
                  <div style={{ ...S.textLg, ...S.mono, color: results.margin >= 0 ? "#166534" : "#991b1b" }}>{fmt2(results.margin)}</div>
                </div>
              </div>
              <div style={S.kpi}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>MTM em Aberto (Momento final)</div>
                  <span style={S.chip}>R$</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={S.label11}>Saldo MTM (R$)</div>
                  <div style={{ ...S.textLg, ...S.mono, color: results.mtmFinal >= 0 ? "#166534" : "#991b1b" }}>{fmt2(results.mtmFinal)}</div>
                  <div style={{ ...S.label11, marginTop: 12 }}>Liquidados + MTM (R$)</div>
                  <div style={{ ...S.textLg, ...S.mono }}>{fmt2(results.adjPlusMtm)}</div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div style={S.kpi}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Ranking — filtrado pelo código do jogo</div>
                <span style={S.chip}>{leaderboardStatus || "SDT API"}</span>
              </div>
              <div style={{ ...S.tableWrap, marginTop: 12, maxHeight: 500, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{LB_COLS.map((c) => <th key={c.key} style={S.th}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {leaderboard.length > 0
                      ? leaderboard.map((row, idx) => (
                        <tr key={row.id || idx} style={idx === 0 ? { background: "#fff7ed" } : {}}>
                          {LB_COLS.map((col) => (
                            <td key={col.key} style={{ ...S.td, ...(col.style || {}) }}>{col.render(row, idx)}</td>
                          ))}
                        </tr>
                      ))
                      : (
                        <tr><td colSpan={LB_COLS.length} style={{ ...S.td, ...S.muted }}>
                          {leaderboardStatus === "Carregando…" ? "Carregando ranking…" : "Nenhum resultado encontrado para este código."}
                        </td></tr>
                      )
                    }
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        {page !== "cover" && (
          <footer style={{ ...S.muted, fontSize: 11, paddingTop: 16, paddingBottom: 24 }}>
            Soja • Plantio 10/09/2026 • Colheita 30/04/2027 • Físico: ((CBOT + Basis) × 2,2046 × USD).
          </footer>
        )}

      </div>
    </div>
  );
}
