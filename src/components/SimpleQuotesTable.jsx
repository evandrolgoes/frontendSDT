import { useMemo } from "react";

import { formatBrazilianDate, formatBrazilianDateTime } from "../utils/date";
import { formatBrazilianNumber, parseLocalizedNumber } from "../utils/formatters";

const formatSignedBrazilianNumber = (value, digits = 2) => {
  const parsed = parseLocalizedNumber(value);
  const signal = parsed > 0 ? "+" : parsed < 0 ? "-" : "";
  return `${signal}${Math.abs(parsed).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const isVolumeField = (column) => {
  const normalizedKey = String(column?.key || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const normalizedLabel = String(column?.label || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  return normalizedKey.includes("volume") || normalizedLabel.includes("volume");
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

const expandFuturesTicker = (rawTicker, rowType) => {
  const raw = String(rawTicker || "").trim();
  if (!raw) return raw;
  const tipo = String(rowType || "").trim().toLowerCase();
  if (tipo !== "futures") return raw;
  const match = raw.match(/^([A-Za-z]+)(\d{2})$/);
  if (!match) return raw;
  return `${match[1]}20${match[2]}`;
};

export const resolveTradingviewSymbol = (row) => {
  const ticker = expandFuturesTicker(row?.ticker, row?.tipo);
  return String(ticker || row?.symbol || "").trim();
};

export const buildTradingviewChartUrl = (row) => {
  const symbolParam = resolveTradingviewSymbol(row);
  if (!symbolParam) {
    return "";
  }
  return `https://br.tradingview.com/chart/QwgamVHA/?symbol=${encodeURIComponent(symbolParam)}`;
};

export const openTradingviewPopupWindow = (url) => {
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

export function SimpleQuotesTable({
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

                    const displayValue =
                      column.key === "ticker"
                        ? expandFuturesTicker(row?.ticker, row?.tipo)
                        : row?.[column.key];

                    return (
                      <td key={column.key} className={toneClass}>
                        {column.key === "ticker" && typeof onTickerClick === "function" ? (
                          <button
                            type="button"
                            className="simple-quotes-ticker-button"
                            onClick={() => onTickerClick(row)}
                            title={`Abrir grafico de ${row?.symbol || displayValue || ""}`}
                          >
                            {formatSimpleTableValue(column, displayValue)}
                          </button>
                        ) : (
                          formatSimpleTableValue(column, displayValue)
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
            const tickerLabel = formatSimpleTableValue(
              { key: "ticker" },
              expandFuturesTicker(row?.ticker, row?.tipo),
            );
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
                      title={`Abrir grafico de ${row?.symbol || tickerLabel || ""}`}
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
