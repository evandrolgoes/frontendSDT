import { useEffect, useState } from "react";

import { DatePickerField } from "./DatePickerField";
import { resourceService } from "../services/resourceService";
import { parseLocalizedNumber } from "../utils/formatters";

const EXCLUDED_TYPES = new Set(["file-multi", "file", "localidade-list", "json", "json-list"]);

const getOptionLabel = (field, option) => {
  if (!option) {
    return "";
  }
  const configured = field.labelKey ? option[field.labelKey] : "";
  return configured || option.nome || option.name || option.title || option.label || `#${option.id}`;
};

const getSelectOptions = (field, lookupOptions) => {
  if (typeof field.getOptions === "function") {
    return field.getOptions({ lookupOptions, values: {}, getOptionLabel }).filter(
      (option) => String(option?.value ?? "").trim() && String(option?.label ?? "").trim(),
    );
  }
  if (field.resource) {
    const options = lookupOptions[field.resource] || [];
    if (field.listField) {
      return options.flatMap((option) => {
        const valuesList = Array.isArray(option[field.listField]) ? option[field.listField] : [];
        return valuesList.map((item) => ({ value: item, label: item }));
      });
    }
    const mapped = options.map((option) => ({
      value: option[field.valueKey || "nome"] ?? option.id,
      label: getOptionLabel(field, option),
    }));
    const filtered = mapped.filter((option) => String(option.value ?? "").trim() && String(option.label ?? "").trim());
    if (field.dedupeByValue) {
      return filtered.filter((option, index, self) => self.findIndex((item) => item.value === option.value) === index);
    }
    return filtered;
  }
  return field.options || [];
};

const getRelationOptions = (field, lookupOptions) =>
  typeof field.getOptions === "function"
    ? field.getOptions({ lookupOptions, values: {}, getOptionLabel })
    : lookupOptions[field.resource] || [];

const normalizeValue = (field, rawValue) => {
  if (rawValue === "" || rawValue === undefined || rawValue === null) {
    return field.optional ? null : undefined;
  }
  if (field.type === "number") {
    return parseLocalizedNumber(rawValue);
  }
  if (field.type === "relation") {
    return Number(rawValue);
  }
  if (field.type === "multirelation" && field.single) {
    return rawValue ? [Number(rawValue)] : [];
  }
  return rawValue;
};

const isEditableField = (field) => {
  if (field.readOnly) return false;
  if (EXCLUDED_TYPES.has(field.type)) return false;
  if (field.accessManager) return false;
  if (field.checkboxList) return false;
  return true;
};

const makeEntry = () => ({ id: Math.random().toString(36).slice(2), fieldName: "", rawValue: "" });

function FieldValueInput({ field, value, onChange, lookupOptions, inputId }) {
  if (field.type === "date") {
    return (
      <DatePickerField
        id={inputId}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "select" || field.type === "select-multi") {
    const options = getSelectOptions(field, lookupOptions);
    return (
      <select className="form-control" id={inputId} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "relation" || (field.type === "multirelation" && field.single)) {
    const options = getRelationOptions(field, lookupOptions);
    return (
      <select className="form-control" id={inputId} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{getOptionLabel(field, option)}</option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        className="form-control form-control-textarea"
        id={inputId}
        rows="3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        className="form-control"
        id={inputId}
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      className="form-control"
      id={inputId}
      type={field.type === "email" ? "email" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function BulkEditModal({ fields, items, onClose, onSubmit }) {
  const [entries, setEntries] = useState([makeEntry()]);
  const [lookupOptions, setLookupOptions] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const editableFields = fields.filter(isEditableField);

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      const lookupFields = editableFields.filter(
        (field) =>
          ((field.type === "relation" || field.type === "multirelation" || field.type === "select" || field.type === "select-multi") && field.resource)
          || (Array.isArray(field.resources) && field.resources.length),
      );

      const uniqueResources = [
        ...new Set(
          lookupFields.flatMap((field) => {
            if (Array.isArray(field.resources) && field.resources.length) return field.resources;
            return field.resource ? [field.resource] : [];
          }),
        ),
      ];

      if (!uniqueResources.length) return;

      const results = await Promise.allSettled(
        uniqueResources.map(async (resource) => ({
          resource,
          items: await resourceService.listAll(resource, {}, { force: true }),
        })),
      );

      const loaded = {};
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          loaded[result.value.resource] = result.value.items;
        }
      });

      if (isMounted) setLookupOptions(loaded);
    };

    loadLookups();
    return () => { isMounted = false; };
  }, []);

  const updateEntry = (id, patch) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const handleFieldChange = (id, fieldName) => {
    updateEntry(id, { fieldName, rawValue: "" });
    setError("");
  };

  const addEntry = () => {
    setEntries((current) => [...current, makeEntry()]);
  };

  const removeEntry = (id) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSubmit = async () => {
    const validEntries = entries.filter((entry) => entry.fieldName);
    if (!validEntries.length) {
      setError("Selecione pelo menos um campo para alterar.");
      return;
    }

    const payload = {};
    for (const entry of validEntries) {
      const field = editableFields.find((f) => f.name === entry.fieldName);
      if (field) {
        payload[field.name] = normalizeValue(field, entry.rawValue);
      }
    }

    setIsSubmitting(true);
    setError("");
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err?.message || "Erro ao alterar em massa.");
      setIsSubmitting(false);
    }
  };

  const usedFieldNames = new Set(entries.map((e) => e.fieldName).filter(Boolean));

  return (
    <div className="modal-shell">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <strong>Alterar em massa</strong>
            <div className="muted">
              {items.length} {items.length === 1 ? "linha selecionada" : "linhas selecionadas"}
            </div>
          </div>
          <div className="modal-header-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !entries.some((e) => e.fieldName)}
            >
              Salvar
            </button>
          </div>
        </div>

        <div style={{ padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {entries.map((entry, index) => {
            const selectedField = editableFields.find((f) => f.name === entry.fieldName) || null;
            const inputId = `bulk-edit-value-${entry.id}`;
            const fieldId = `bulk-edit-field-${entry.id}`;

            return (
              <div
                key={entry.id}
                style={{
                  border: "1px solid var(--color-border, #e5e7eb)",
                  borderRadius: "6px",
                  padding: "0.75rem 1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <label className="form-label" htmlFor={fieldId} style={{ margin: 0 }}>
                    Campo {index + 1}
                  </label>
                  {entries.length > 1 ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      disabled={isSubmitting}
                      style={{ padding: "2px 10px", fontSize: "0.8rem" }}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>

                <select
                  className="form-control"
                  id={fieldId}
                  value={entry.fieldName}
                  onChange={(e) => handleFieldChange(entry.id, e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Selecione o campo</option>
                  {editableFields.map((field) => (
                    <option
                      key={field.name}
                      value={field.name}
                      disabled={usedFieldNames.has(field.name) && field.name !== entry.fieldName}
                    >
                      {field.label}
                    </option>
                  ))}
                </select>

                {selectedField ? (
                  <div>
                    <label className="form-label" htmlFor={inputId}>
                      Novo valor para <strong>{selectedField.label}</strong>
                    </label>
                    <FieldValueInput
                      field={selectedField}
                      value={entry.rawValue}
                      onChange={(val) => updateEntry(entry.id, { rawValue: val })}
                      lookupOptions={lookupOptions}
                      inputId={inputId}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            className="btn btn-secondary"
            type="button"
            onClick={addEntry}
            disabled={isSubmitting || entries.length >= editableFields.length}
            style={{ alignSelf: "flex-start" }}
          >
            + Adicionar campo
          </button>

          {error ? (
            <div style={{ color: "var(--color-danger, #dc2626)", fontSize: "0.875rem" }}>
              {error}
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !entries.some((e) => e.fieldName)}
          >
            {isSubmitting
              ? `Alterando ${items.length} ${items.length === 1 ? "linha" : "linhas"}...`
              : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
