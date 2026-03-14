export function formatCurrency(value, currency = "BRL") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}
