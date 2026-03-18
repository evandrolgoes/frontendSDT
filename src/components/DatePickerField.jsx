import { parseBrazilianDate } from "../utils/date";

export function DatePickerField({
  id,
  value,
  onChange,
  disabled = false,
  className = "form-control",
}) {
  return (
    <input
      className={`${className} native-date-input`}
      id={id}
      type="date"
      lang="pt-BR"
      value={parseBrazilianDate(value, "")}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
