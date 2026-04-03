export function formatCurrency(value, currency = "BRL") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}

export const parseLocalizedNumber = (value) => {
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

export const formatBrazilianNumber = (value, digits = 4) => {
  if (value === "" || value === undefined || value === null) {
    return "";
  }
  return parseLocalizedNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const normalizeLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("/", "");

export const inferExchangeFromBolsaLabel = (bolsaLabel, exchanges = []) => {
  const normalized = normalizeLookupValue(bolsaLabel);

  if (!normalized) {
    return null;
  }

  const exactMatch = exchanges.find((item) => normalizeLookupValue(item.nome) === normalized);
  if (exactMatch) {
    return exactMatch;
  }

  if (normalized.includes("soybean") || normalized.includes("soja")) {
    return exchanges.find((item) => normalizeLookupValue(item.ativo || item.cultura) === "soja") || null;
  }
  if (normalized.includes("corn") || normalized.includes("milho")) {
    return exchanges.find((item) => normalizeLookupValue(item.ativo || item.cultura) === "milho") || null;
  }
  if (normalized.includes("dollar") || normalized.includes("dolar") || normalized.includes("usd")) {
    return exchanges.find((item) => normalizeLookupValue(item.ativo || item.cultura) === "dolar") || null;
  }

  return null;
};
