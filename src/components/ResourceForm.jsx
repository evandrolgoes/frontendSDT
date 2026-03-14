import { useEffect, useState } from "react";

export function ResourceForm({ title, fields, initialValues = {}, onSubmit, submitLabel = "Salvar" }) {
  const [values, setValues] = useState(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const handleChange = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <form
      className="form-shell"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="form-header">
        <div>
          <strong>{title}</strong>
          <div className="muted">Formulario generico para operacoes CRUD</div>
        </div>
      </div>
      <div className="form-grid">
        {fields.map((field) => (
          <div className="field" key={field.name}>
            <label htmlFor={field.name}>{field.label}</label>
            {field.type === "textarea" ? (
              <textarea
                id={field.name}
                rows="4"
                value={values[field.name] || ""}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            ) : field.type === "select" ? (
              <select
                id={field.name}
                value={values[field.name] || ""}
                onChange={(event) => handleChange(field.name, event.target.value)}
              >
                <option value="">Selecione</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                type={field.type || "text"}
                value={values[field.name] || ""}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
