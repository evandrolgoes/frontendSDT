import { useEffect, useRef, useState, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_CODE_MAP = { 1:"F",2:"G",3:"H",4:"J",5:"K",6:"M",7:"N",8:"Q",9:"U",10:"V",11:"X",12:"Z" };
const MONTH_NAMES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const CATEGORIES = [
  { id: "todos",  label: "Todos" },
  { id: "graos",  label: "Grãos & Cereais" },
  { id: "softs",  label: "Softs" },
  { id: "carnes", label: "Proteínas" },
];

// TradingView continuous contract symbols + futures generation config
// months: active delivery months (1-indexed), n: max contracts to show
const TV_FUTURES_CONFIG = {
  "CBOT:ZS1!":  { base:"ZS",  exchange:"CBOT",  months:[1,3,5,7,8,9,11],      n:8 },
  "CBOT:ZC1!":  { base:"ZC",  exchange:"CBOT",  months:[3,5,7,9,12],           n:8 },
  "CBOT:ZW1!":  { base:"ZW",  exchange:"CBOT",  months:[3,5,7,9,12],           n:8 },
  "KCBT:KE1!":  { base:"KE",  exchange:"KCBT",  months:[3,5,7,9,12],           n:8 },
  "CBOT:ZM1!":  { base:"ZM",  exchange:"CBOT",  months:[1,3,5,7,8,9,10,12],   n:8 },
  "CBOT:ZL1!":  { base:"ZL",  exchange:"CBOT",  months:[1,3,5,7,8,9,10,12],   n:8 },
  "CBOT:ZO1!":  { base:"ZO",  exchange:"CBOT",  months:[3,5,7,9,12],           n:6 },
  "CBOT:ZR1!":  { base:"ZR",  exchange:"CBOT",  months:[1,3,5,7,9,11],         n:6 },
  "ICEUS:KC1!": { base:"KC",  exchange:"ICEUS", months:[3,5,7,9,12],           n:8 },
  "ICEUS:SB1!": { base:"SB",  exchange:"ICEUS", months:[3,5,7,10],             n:8 },
  "ICEUS:CC1!": { base:"CC",  exchange:"ICEUS", months:[3,5,7,9,12],           n:8 },
  "ICEUS:CT1!": { base:"CT",  exchange:"ICEUS", months:[3,5,7,10,12],          n:8 },
  "ICEUS:OJ1!": { base:"OJ",  exchange:"ICEUS", months:[1,3,5,7,9,11],         n:6 },
  "CME:LE1!":   { base:"LE",  exchange:"CME",   months:[2,4,6,8,10,12],        n:8 },
  "CME:GF1!":   { base:"GF",  exchange:"CME",   months:[1,3,4,5,8,9,10,11],   n:8 },
  "CME:HE1!":   { base:"HE",  exchange:"CME",   months:[2,4,5,6,7,8,10,12],   n:8 },
};

const COMMODITIES = [
  { symbol:"CBOT:ZS1!",  name:"Soja",           short:"Soja CBOT",     unit:"US¢/bu",  exchange:"CBOT",  category:"graos",  flag:"🌱" },
  { symbol:"CBOT:ZC1!",  name:"Milho",          short:"Milho CBOT",    unit:"US¢/bu",  exchange:"CBOT",  category:"graos",  flag:"🌽" },
  { symbol:"CBOT:ZW1!",  name:"Trigo CBOT",     short:"Trigo CBOT",    unit:"US¢/bu",  exchange:"CBOT",  category:"graos",  flag:"🌾" },
  { symbol:"KCBT:KE1!",  name:"Trigo KC",       short:"Trigo KC",      unit:"US¢/bu",  exchange:"KCBT",  category:"graos",  flag:"🌾" },
  { symbol:"CBOT:ZM1!",  name:"Farelo de Soja", short:"Farelo Soja",   unit:"USD/ton", exchange:"CBOT",  category:"graos",  flag:"🫘" },
  { symbol:"CBOT:ZL1!",  name:"Óleo de Soja",   short:"Óleo Soja",     unit:"US¢/lb",  exchange:"CBOT",  category:"graos",  flag:"🫙" },
  { symbol:"CBOT:ZO1!",  name:"Aveia",          short:"Aveia",         unit:"US¢/bu",  exchange:"CBOT",  category:"graos",  flag:"🥣" },
  { symbol:"CBOT:ZR1!",  name:"Arroz",          short:"Arroz",         unit:"USD/cwt", exchange:"CBOT",  category:"graos",  flag:"🍚" },
  { symbol:"ICEUS:KC1!", name:"Café Arábica",   short:"Café",          unit:"US¢/lb",  exchange:"ICE",   category:"softs",  flag:"☕" },
  { symbol:"ICEUS:SB1!", name:"Açúcar #11",     short:"Açúcar",        unit:"US¢/lb",  exchange:"ICE",   category:"softs",  flag:"🍬" },
  { symbol:"ICEUS:CC1!", name:"Cacau",          short:"Cacau",         unit:"USD/MT",  exchange:"ICE",   category:"softs",  flag:"🍫" },
  { symbol:"ICEUS:CT1!", name:"Algodão",        short:"Algodão",       unit:"US¢/lb",  exchange:"ICE",   category:"softs",  flag:"🧶" },
  { symbol:"ICEUS:OJ1!", name:"Suco Laranja",   short:"Suco Laranja",  unit:"US¢/lb",  exchange:"ICE",   category:"softs",  flag:"🍊" },
  { symbol:"CME:LE1!",   name:"Boi Gordo",      short:"Boi Gordo",     unit:"US¢/lb",  exchange:"CME",   category:"carnes", flag:"🐄" },
  { symbol:"CME:GF1!",   name:"Boi Magro",      short:"Boi Magro",     unit:"US¢/lb",  exchange:"CME",   category:"carnes", flag:"🐂" },
  { symbol:"CME:HE1!",   name:"Suíno",          short:"Suíno",         unit:"US¢/lb",  exchange:"CME",   category:"carnes", flag:"🐷" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate upcoming futures contract symbols in TradingView format (EXCHANGE:BASEMONTHYEAR) */
function generateTVContracts(continuousSymbol) {
  const cfg = TV_FUTURES_CONFIG[continuousSymbol];
  if (!cfg) return [];
  const now = new Date();
  let year  = now.getFullYear();
  let month = now.getMonth() + 1;
  const contracts = [];
  let iterations  = 0;
  while (contracts.length < cfg.n && iterations < 36) {
    iterations++;
    if (cfg.months.includes(month)) {
      const monthCode = MONTH_CODE_MAP[month];
      const yearCode  = String(year).slice(-2);
      contracts.push({
        // TradingView format: CBOT:ZSK25
        symbol: `${cfg.exchange}:${cfg.base}${monthCode}${yearCode}`,
        label:  `${MONTH_NAMES_PT[month - 1]}/${year}`,
        month, year,
      });
    }
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return contracts;
}

// ─── TradingView Widget (generic embed) ──────────────────────────────────────

function TradingViewWidget({ widgetType, config, height = 220 }) {
  const ref = useRef(null);
  // Stringify config once to use as effect dependency
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.height = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widgetType}.js`;
    script.async = true;
    script.innerHTML = configKey;

    wrapper.appendChild(widgetDiv);
    wrapper.appendChild(script);
    container.appendChild(wrapper);

    return () => {
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetType, configKey]);

  return <div ref={ref} style={{ height, width: "100%", overflow: "hidden" }} />;
}

// ─── Commodity card ───────────────────────────────────────────────────────────

function CommodityCard({ commodity, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "rgba(234,88,12,0.05)" : "rgba(255,255,255,0.9)",
        border: selected ? "2px solid #ea580c" : "1px solid rgba(148,163,184,0.22)",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.18s, border-color 0.18s, transform 0.15s",
        boxShadow: selected
          ? "0 0 0 3px rgba(234,88,12,0.13)"
          : "0 2px 10px rgba(15,23,42,0.06)",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(15,23,42,0.12)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = "0 2px 10px rgba(15,23,42,0.06)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      {/* Card header with name and exchange */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px 6px",
        borderBottom: "1px solid rgba(148,163,184,0.1)",
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{commodity.flag}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            fontSize: 12,
            color: "#0f172a",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "Manrope, sans-serif",
          }}>
            {commodity.short}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "Manrope, sans-serif" }}>
            {commodity.exchange} · {commodity.unit}
          </div>
        </div>
        {selected && (
          <div style={{
            marginLeft: "auto",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ea580c",
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* TradingView mini chart widget */}
      <TradingViewWidget
        widgetType="mini-symbol-overview"
        config={{
          symbol: commodity.symbol,
          width: "100%",
          height: 200,
          locale: "pt",
          dateRange: "3M",
          colorTheme: "light",
          isTransparent: true,
          autosize: true,
          largeChartUrl: "",
          noTimeScale: false,
          chartOnly: false,
          hideLegend: false,
        }}
        height={200}
      />
    </div>
  );
}

// ─── Advanced Chart Panel ─────────────────────────────────────────────────────

function AdvancedChartPanel({ symbol, commodityName }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.96)",
      border: "1.5px solid rgba(234,88,12,0.2)",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 4px 20px rgba(15,23,42,0.08)",
    }}>
      <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
        <div style={{ fontSize: 12, color: "#64748b", fontFamily: "Manrope, sans-serif" }}>
          {commodityName} · <span style={{ fontFamily: "monospace", color: "#475569" }}>{symbol}</span>
        </div>
      </div>
      <TradingViewWidget
        widgetType="advanced-chart"
        config={{
          autosize: true,
          symbol,
          interval: "D",
          timezone: "America/Sao_Paulo",
          theme: "light",
          style: "1",
          locale: "pt",
          allow_symbol_change: false,
          calendar: false,
          support_host: "https://www.tradingview.com",
        }}
        height={450}
      />
    </div>
  );
}

// ─── Futures Contracts Panel ──────────────────────────────────────────────────

function FuturesPanel({ commodity, onClose }) {
  const contracts = useMemo(() => generateTVContracts(commodity.symbol), [commodity.symbol]);
  const [selectedContract, setSelectedContract] = useState(null);

  const displaySymbol = selectedContract ?? commodity.symbol;
  const displayName   = selectedContract
    ? contracts.find((c) => c.symbol === selectedContract)?.label ?? selectedContract
    : `${commodity.name} (Contínuo)`;

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
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>{commodity.flag}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", fontFamily: "Manrope, sans-serif" }}>
              {commodity.name} — Curva de Futuros
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Manrope, sans-serif" }}>
              {commodity.exchange} · {commodity.unit} · {contracts.length} vencimentos · clique num vencimento para ver o gráfico
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid rgba(148,163,184,0.3)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 13,
            color: "#64748b",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✕ Fechar
        </button>
      </div>

      {/* Chart for selected contract */}
      <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(148,163,184,0.15)" }}>
        <AdvancedChartPanel symbol={displaySymbol} commodityName={displayName} />
      </div>

      {/* Contracts table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(148,163,184,0.15)" }}>
              {["Vencimento", "Símbolo TradingView", ""].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "8px 10px",
                    textAlign: i === 0 ? "left" : i === 2 ? "center" : "left",
                    color: "#64748b",
                    fontWeight: 600,
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    fontFamily: "Manrope, sans-serif",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract, idx) => {
              const isFirst    = idx === 0;
              const isSelected = selectedContract === contract.symbol;
              return (
                <tr
                  key={contract.symbol}
                  onClick={() =>
                    setSelectedContract((prev) =>
                      prev === contract.symbol ? null : contract.symbol
                    )
                  }
                  style={{
                    borderBottom: "1px solid rgba(148,163,184,0.09)",
                    background: isSelected
                      ? "rgba(234,88,12,0.05)"
                      : "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      e.currentTarget.style.background = "rgba(99,102,241,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* Vencimento */}
                  <td style={{
                    padding: "10px 10px",
                    fontWeight: isFirst ? 700 : 500,
                    color: "#0f172a",
                    whiteSpace: "nowrap",
                    fontFamily: "Manrope, sans-serif",
                  }}>
                    {contract.label}
                    {isFirst && (
                      <span style={{
                        marginLeft: 6,
                        fontSize: 9,
                        background: "rgba(234,88,12,0.12)",
                        color: "#c2410c",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontWeight: 700,
                      }}>
                        FRONT
                      </span>
                    )}
                  </td>
                  {/* Símbolo */}
                  <td style={{
                    padding: "10px 10px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "#475569",
                  }}>
                    {contract.symbol}
                  </td>
                  {/* Ação */}
                  <td style={{ padding: "10px 10px", textAlign: "center" }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isSelected ? "#ea580c" : "#6366f1",
                      fontFamily: "Manrope, sans-serif",
                    }}>
                      {isSelected ? "● Ver" : "Ver gráfico"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        fontSize: 10,
        color: "#94a3b8",
        marginTop: 12,
        textAlign: "right",
        fontFamily: "Manrope, sans-serif",
      }}>
        Fonte: TradingView · Contratos gerados automaticamente a partir de hoje · Tempo real
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CotacoesV3TradingviewPage() {
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [selectedSymbol,   setSelectedSymbol]   = useState(null);
  const [showFutures,      setShowFutures]       = useState(false);

  const filtered = useMemo(() => {
    if (selectedCategory === "todos") return COMMODITIES;
    return COMMODITIES.filter((c) => c.category === selectedCategory);
  }, [selectedCategory]);

  const selectedCommodity  = COMMODITIES.find((c) => c.symbol === selectedSymbol);
  const hasFuturesConfig   = selectedSymbol ? Boolean(TV_FUTURES_CONFIG[selectedSymbol]) : false;

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
    <div style={{ padding: "24px 28px", minHeight: "100vh", fontFamily: "Manrope, sans-serif" }}>
      <style>{`
        @keyframes tv3-spin { to { transform: rotate(360deg); } }
        .tv3-pill {
          border: none; border-radius: 20px; padding: 6px 14px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: background 0.15s, color 0.15s; white-space: nowrap;
          font-family: Manrope, sans-serif;
        }
        .tv3-pill:hover { filter: brightness(1.05); }
        .tv3-tab {
          border: none; border-radius: 8px; padding: 7px 14px;
          font-size: 12px; font-weight: 700; cursor: pointer;
          font-family: Manrope, sans-serif; transition: background 0.15s, color 0.15s;
        }
        .tv3-tab:hover { filter: brightness(0.97); }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                Cotações 3
              </h2>
              <div style={{
                background: "linear-gradient(135deg,#2962ff,#1565c0)",
                color: "#fff",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}>
                TRADINGVIEW
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Commodities agrícolas · Dados TradingView em tempo real · Contratos futuros atualizados automaticamente
            </p>
          </div>
        </div>
      </div>

      {/* ── Category filters ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              className="tv3-pill"
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                background: active
                  ? "linear-gradient(135deg,#ea580c,#c2410c)"
                  : "rgba(255,255,255,0.85)",
                color: active ? "#fff" : "#475569",
                border: active ? "none" : "1px solid rgba(148,163,184,0.3)",
                boxShadow: active ? "0 2px 8px rgba(234,88,12,0.28)" : "none",
              }}
            >
              {cat.label}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {filtered.length} ativo{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Detail panels ────────────────────────────────────────────────── */}
      {selectedCommodity && (
        <>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              className="tv3-tab"
              onClick={() => setShowFutures(false)}
              style={{
                background: !showFutures
                  ? "linear-gradient(135deg,#ea580c,#c2410c)"
                  : "rgba(255,255,255,0.85)",
                color: !showFutures ? "#fff" : "#475569",
                border: !showFutures ? "none" : "1px solid rgba(148,163,184,0.25)",
              }}
            >
              📈 Gráfico Avançado
            </button>
            {hasFuturesConfig && (
              <button
                className="tv3-tab"
                onClick={() => setShowFutures(true)}
                style={{
                  background: showFutures
                    ? "linear-gradient(135deg,#2962ff,#1565c0)"
                    : "rgba(255,255,255,0.85)",
                  color: showFutures ? "#fff" : "#475569",
                  border: showFutures ? "none" : "1px solid rgba(148,163,184,0.25)",
                }}
              >
                📋 Contratos Futuros
              </button>
            )}
            <button
              className="tv3-tab"
              onClick={() => { setSelectedSymbol(null); setShowFutures(false); }}
              style={{
                background: "rgba(255,255,255,0.85)",
                color: "#64748b",
                border: "1px solid rgba(148,163,184,0.25)",
                marginLeft: "auto",
              }}
            >
              ✕ Fechar
            </button>
          </div>

          {!showFutures ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                padding: "10px 16px",
                background: "rgba(255,255,255,0.9)",
                border: "1.5px solid rgba(234,88,12,0.2)",
                borderRadius: "12px 12px 0 0",
                borderBottom: "none",
              }}>
                <span style={{ fontSize: 24 }}>{selectedCommodity.flag}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                    {selectedCommodity.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {selectedCommodity.symbol} · {selectedCommodity.exchange} · Contrato Contínuo
                  </div>
                </div>
              </div>
              <div style={{
                border: "1.5px solid rgba(234,88,12,0.2)",
                borderTop: "none",
                borderRadius: "0 0 16px 16px",
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(15,23,42,0.08)",
              }}>
                <TradingViewWidget
                  widgetType="advanced-chart"
                  config={{
                    autosize: true,
                    symbol: selectedCommodity.symbol,
                    interval: "D",
                    timezone: "America/Sao_Paulo",
                    theme: "light",
                    style: "1",
                    locale: "pt",
                    allow_symbol_change: false,
                    calendar: false,
                    support_host: "https://www.tradingview.com",
                  }}
                  height={450}
                />
              </div>
            </div>
          ) : (
            <FuturesPanel
              commodity={selectedCommodity}
              onClose={() => { setSelectedSymbol(null); setShowFutures(false); }}
            />
          )}
        </>
      )}

      {/* ── Cards grid ───────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {filtered.map((commodity) => (
          <CommodityCard
            key={commodity.symbol}
            commodity={commodity}
            selected={selectedSymbol === commodity.symbol}
            onClick={() => handleCardClick(commodity.symbol)}
          />
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 32,
        paddingTop: 16,
        borderTop: "1px solid rgba(148,163,184,0.16)",
        textAlign: "center",
      }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          Dados: TradingView · Contrato Contínuo (1!) · Contratos futuros atualizados automaticamente · Tempo real
        </span>
      </div>
    </div>
  );
}
