export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
export const isBrazilianDate = (value) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || "").trim());

export const formatBrazilianDate = (value, emptyValue = "") => {
  if (value === "" || value === undefined || value === null) {
    return emptyValue;
  }
  if (typeof value === "string" && isBrazilianDate(value)) {
    return value;
  }
  if (typeof value === "string" && isIsoDate(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

export const parseBrazilianDate = (value, emptyValue = undefined) => {
  if (value === "" || value === undefined || value === null) {
    return emptyValue;
  }
  const raw = String(value).trim();
  if (!raw) {
    return emptyValue;
  }
  if (isIsoDate(raw)) {
    return raw;
  }
  if (isBrazilianDate(raw)) {
    const [day, month, year] = raw.split("/");
    return `${year}-${month}-${day}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return emptyValue;
  }
  return date.toISOString().slice(0, 10);
};

export const normalizeBrazilianDateInput = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const toDateInputValue = (value) => parseBrazilianDate(value, "");
