import { useEffect, useMemo, useState } from "react";

import { DatePickerField } from "./DatePickerField";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate, isBrazilianDate, isIsoDate, parseBrazilianDate } from "../utils/date";

const BRAZILIAN_STATES = [
  { id: "AC", sigla: "AC", nome: "Acre" },
  { id: "AL", sigla: "AL", nome: "Alagoas" },
  { id: "AP", sigla: "AP", nome: "Amapa" },
  { id: "AM", sigla: "AM", nome: "Amazonas" },
  { id: "BA", sigla: "BA", nome: "Bahia" },
  { id: "CE", sigla: "CE", nome: "Ceara" },
  { id: "DF", sigla: "DF", nome: "Distrito Federal" },
  { id: "ES", sigla: "ES", nome: "Espirito Santo" },
  { id: "GO", sigla: "GO", nome: "Goias" },
  { id: "MA", sigla: "MA", nome: "Maranhao" },
  { id: "MT", sigla: "MT", nome: "Mato Grosso" },
  { id: "MS", sigla: "MS", nome: "Mato Grosso do Sul" },
  { id: "MG", sigla: "MG", nome: "Minas Gerais" },
  { id: "PA", sigla: "PA", nome: "Para" },
  { id: "PB", sigla: "PB", nome: "Paraiba" },
  { id: "PR", sigla: "PR", nome: "Parana" },
  { id: "PE", sigla: "PE", nome: "Pernambuco" },
  { id: "PI", sigla: "PI", nome: "Piaui" },
  { id: "RJ", sigla: "RJ", nome: "Rio de Janeiro" },
  { id: "RN", sigla: "RN", nome: "Rio Grande do Norte" },
  { id: "RS", sigla: "RS", nome: "Rio Grande do Sul" },
  { id: "RO", sigla: "RO", nome: "Rondonia" },
  { id: "RR", sigla: "RR", nome: "Roraima" },
  { id: "SC", sigla: "SC", nome: "Santa Catarina" },
  { id: "SP", sigla: "SP", nome: "Sao Paulo" },
  { id: "SE", sigla: "SE", nome: "Sergipe" },
  { id: "TO", sigla: "TO", nome: "Tocantins" },
];

const fetchCitiesFromIbgeBrowser = async (uf) => {
  const data = await resourceService.fetchJsonCached(
    "ibge-municipios-orderBy-nome",
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
  );
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(
    (city) =>
      city?.microrregiao?.mesorregiao?.UF?.sigla?.toUpperCase?.() === uf,
  );
};

const parseLocalizedNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const raw = String(value).trim().replace(/\s+/g, "");
  if (!raw) {
    return undefined;
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
    if (parts.length === 2) {
      normalized = raw;
    } else {
      normalized = raw.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatBrazilianNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return "";
  }
  const numericValue = parseLocalizedNumber(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return numericValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
};

const parseBrazilianNumber = (value) => {
  return parseLocalizedNumber(value);
};

const normalizeFieldValue = (field, value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  if (field.type === "file-multi") {
    return undefined;
  }
  if (field.type === "file") {
    return value;
  }
  if (field.type === "select-multi") {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }
  if (field.type === "number") {
    return parseBrazilianNumber(value);
  }
  if (field.type === "date") {
    return parseBrazilianDate(value);
  }
  if (field.type === "relation") {
    return Number(value);
  }
  if (field.type === "multirelation") {
    if (field.single) {
      return value ? [Number(value)] : [];
    }
    return (Array.isArray(value) ? value : []).map((item) => Number(item));
  }
  if (field.type === "json-list") {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (field.type === "localidade-list") {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
};

const normalizePayload = (fields, values) =>
  Object.fromEntries(
    fields
      .map((field) => [field.name, normalizeFieldValue(field, values[field.name])])
      .filter(([, value]) => value !== undefined),
  );

const getOptionLabel = (field, option) => {
  if (!option) {
    return "";
  }
  const configured = field.labelKey ? option[field.labelKey] : "";
  return configured || option.nome || option.name || option.title || option.label || `#${option.id}`;
};

const getSelectOptions = (field, lookupOptions, values) => {
  if (field.resource) {
    let options = lookupOptions[field.resource] || [];

    if (field.filterByCurrent) {
      options = options.filter((option) =>
        Object.entries(field.filterByCurrent).every(([optionField, currentField]) => {
          const currentValue = values[currentField];
          if (currentValue === "" || currentValue === undefined || currentValue === null) {
            return true;
          }
          const optionValue = option[optionField];
          if (Array.isArray(optionValue)) {
            return optionValue.map(String).includes(String(currentValue));
          }
          return String(optionValue ?? "") === String(currentValue);
        }),
      );
    }

    const mapped = field.listField
      ? options.flatMap((option) => {
          const valuesList = Array.isArray(option[field.listField]) ? option[field.listField] : [];
          return valuesList.map((item) => ({
            value: item,
            label: item,
          }));
        })
      : options.map((option) => ({
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

const matchesCurrentFilters = (option, filterByCurrent, values) =>
  Object.entries(filterByCurrent || {}).every(([optionField, currentField]) => {
    const currentValue = values[currentField];
    if (currentValue === "" || currentValue === undefined || currentValue === null) {
      return true;
    }

    const normalizedCurrentValues = Array.isArray(currentValue)
      ? currentValue.map(String)
      : [String(currentValue)];
    const optionValue = option[optionField];

    if (Array.isArray(optionValue)) {
      return optionValue.map(String).some((value) => normalizedCurrentValues.includes(value));
    }

    return normalizedCurrentValues.includes(String(optionValue ?? ""));
  });

const isFieldVisible = (field, values) => {
  if (!field.visibleWhen) {
    return true;
  }

  const currentValue = values[field.visibleWhen.field];
  if (field.visibleWhen.equals !== undefined) {
    return currentValue === field.visibleWhen.equals;
  }
  if (field.visibleWhen.notEquals !== undefined) {
    return currentValue !== field.visibleWhen.notEquals;
  }
  return true;
};

export function ResourceForm({
  title,
  fields,
  initialValues = {},
  beforeContent = null,
  existingAttachments = [],
  onDeleteAttachment,
  onSubmit,
  onClose,
  submitLabel = "Salvar",
  error = "",
}) {
  const [values, setValues] = useState(initialValues);
  const [lookupOptions, setLookupOptions] = useState({});
  const [stateOptions, setStateOptions] = useState(BRAZILIAN_STATES);
  const [cityOptionsByKey, setCityOptionsByKey] = useState({});
  const [localidadeEntries, setLocalidadeEntries] = useState([{ uf: "", cidade: "" }]);

  useEffect(() => {
    const formattedValues = Object.fromEntries(
      fields.map((field) => {
        const currentValue = initialValues[field.name];
        if (field.type === "number") {
          return [field.name, formatBrazilianNumber(currentValue)];
        }
        if (field.type === "date") {
          return [field.name, formatBrazilianDate(currentValue)];
        }
        if (field.type === "multirelation" && field.single) {
          return [field.name, Array.isArray(currentValue) ? String(currentValue[0] ?? "") : String(currentValue ?? "")];
        }
        if (field.type === "select-multi") {
          return [field.name, Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : []];
        }
        if (field.type === "localidade-list") {
          return [field.name, Array.isArray(currentValue) ? currentValue : []];
        }
        return [field.name, currentValue];
      }),
    );
    setValues({ ...initialValues, ...formattedValues });
  }, [initialValues]);

  useEffect(() => {
    const localidadeValue = initialValues.localidade;
    if (!Array.isArray(localidadeValue) || !localidadeValue.length) {
      setLocalidadeEntries([{ uf: "", cidade: "" }]);
      return;
    }

    setLocalidadeEntries(
      localidadeValue.map((item) => {
        if (typeof item !== "string" || !item.includes("/")) {
          return { uf: "", cidade: "" };
        }
        const [uf, ...cityParts] = item.split("/");
        return { uf, cidade: cityParts.join("/").trim() };
      }),
    );
  }, [initialValues.localidade]);

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      const lookupFields = fields.filter(
        (field) =>
          ((field.type === "relation" || field.type === "multirelation" || field.type === "select" || field.type === "select-multi") && field.resource)
          || (Array.isArray(field.resources) && field.resources.length),
      );
      const uniqueResources = [
        ...new Set(
          lookupFields.flatMap((field) => {
            if (Array.isArray(field.resources) && field.resources.length) {
              return field.resources;
            }
            return field.resource ? [field.resource] : [];
          }),
        ),
      ];

      const loaded = {};
      await Promise.all(
        uniqueResources.map(async (resource) => {
          loaded[resource] = await resourceService.listAll(resource);
        }),
      );

      if (isMounted) {
        setLookupOptions(loaded);
      }
    };

    loadLookups();

    return () => {
      isMounted = false;
    };
  }, [fields]);

  useEffect(() => {
    let isMounted = true;

    const loadStates = async () => {
      if (!fields.some((field) => field.type === "localidade-list")) {
        return;
      }

      try {
        const data = await resourceService.listIbgeStates();
        if (isMounted) {
          setStateOptions(Array.isArray(data) && data.length ? data : BRAZILIAN_STATES);
        }
      } catch (error) {
        if (isMounted) {
          setStateOptions(BRAZILIAN_STATES);
        }
      }
    };

    loadStates();

    return () => {
      isMounted = false;
    };
  }, [fields]);

  useEffect(() => {
    let isMounted = true;
    const ufs = [...new Set(localidadeEntries.map((entry) => entry.uf).filter(Boolean))];

    const loadCities = async () => {
      await Promise.all(
        ufs.map(async (uf) => {
          if (cityOptionsByKey[uf]) {
            return;
          }
          try {
            let data = await resourceService.listIbgeCities(uf);
            if (!Array.isArray(data) || !data.length) {
              data = await fetchCitiesFromIbgeBrowser(uf);
            }
            if (isMounted) {
              setCityOptionsByKey((current) => ({
                ...current,
                [uf]: Array.isArray(data) ? data : [],
              }));
            }
          } catch (error) {
            try {
              const fallbackData = await fetchCitiesFromIbgeBrowser(uf);
              if (isMounted) {
                setCityOptionsByKey((current) => ({
                  ...current,
                  [uf]: Array.isArray(fallbackData) ? fallbackData : [],
                }));
              }
            } catch (fallbackError) {
              if (isMounted) {
                setCityOptionsByKey((current) => ({
                  ...current,
                  [uf]: [],
                }));
              }
            }
          }
        }),
      );
    };

    loadCities();

    return () => {
      isMounted = false;
    };
  }, [cityOptionsByKey, localidadeEntries]);

  useEffect(() => {
    const exchanges = lookupOptions.exchanges || [];
    const selectedExchange = exchanges.find((item) => item.nome === values.bolsa_ref);
    const nextBasis = selectedExchange?.moeda_unidade_padrao || "";

    setValues((current) => {
      if ((current.basis_moeda || "") === nextBasis) {
        return current;
      }
      return {
        ...current,
        basis_moeda: nextBasis,
      };
    });
  }, [lookupOptions.exchanges, values.bolsa_ref]);

  useEffect(() => {
    if (values.moeda_contrato !== "R$" || !values.objetivo_venda_dolarizada) {
      return;
    }

    setValues((current) => ({
      ...current,
      objetivo_venda_dolarizada: "",
    }));
  }, [values.moeda_contrato, values.objetivo_venda_dolarizada]);

  const relationLabelMap = useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field.name,
          Object.fromEntries(
            (lookupOptions[field.resource] || []).map((option) => [option.id, getOptionLabel(field, option)]),
          ),
        ]),
      ),
    [fields, lookupOptions],
  );

  const handleChange = (field, value) => {
    setValues((current) => ({ ...current, [field.name]: value }));
  };

  const syncLocalidadeValues = (entries) => {
    const normalized = entries.filter((entry) => entry.uf && entry.cidade).map((entry) => `${entry.uf}/${entry.cidade}`);
    setLocalidadeEntries(entries);
    setValues((current) => ({
      ...current,
      localidade: normalized,
    }));
  };

  const handleLocalidadeUfChange = (index, uf) => {
    const nextEntries = localidadeEntries.map((entry, currentIndex) =>
      currentIndex === index ? { uf, cidade: "" } : entry,
    );
    syncLocalidadeValues(nextEntries);
  };

  const handleLocalidadeCityChange = (index, cidade) => {
    const nextEntries = localidadeEntries.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, cidade } : entry,
    );
    syncLocalidadeValues(nextEntries);
  };

  const handleAddLocalidade = () => {
    syncLocalidadeValues([...localidadeEntries, { uf: "", cidade: "" }]);
  };

  const handleRemoveLocalidade = (index) => {
    const nextEntries = localidadeEntries.filter((_, currentIndex) => currentIndex !== index);
    syncLocalidadeValues(nextEntries.length ? nextEntries : [{ uf: "", cidade: "" }]);
  };

  const renderField = (field) => {
    const derivedValue =
      field.name === "faturamento_total_contrato"
        ? (() => {
            const preco = parseBrazilianNumber(values.preco);
            const volumeFisico = parseBrazilianNumber(values.volume_fisico);
            if (preco === undefined || volumeFisico === undefined) {
              return values[field.name];
            }
            return formatBrazilianNumber(preco * volumeFisico);
          })()
        : field.name === "producao_total"
          ? (() => {
              const area = parseBrazilianNumber(values.area);
              const produtividade = parseBrazilianNumber(values.produtividade);
              if (area === undefined || produtividade === undefined) {
                return values[field.name];
              }
              return formatBrazilianNumber(area * produtividade);
            })()
        : values[field.name];
    const currentValue = derivedValue;

    if (field.type === "textarea") {
      return (
        <textarea
          className="form-control form-control-textarea"
          id={field.name}
          rows="3"
          value={currentValue || ""}
          disabled={field.readOnly}
          onChange={(event) => handleChange(field, event.target.value)}
        />
      );
    }

    if (field.type === "select") {
      const options = getSelectOptions(field, lookupOptions, values);
      return (
        <select className="form-control" id={field.name} value={currentValue ?? ""} disabled={field.readOnly} onChange={(event) => handleChange(field, event.target.value)}>
          <option value="">Selecione</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "select-multi") {
      const options = getSelectOptions(field, lookupOptions, values);
      const selectedValues = Array.isArray(currentValue) ? currentValue.map(String) : [];

      return (
        <select
          className="form-control form-control-multi"
          id={field.name}
          multiple
          disabled={field.readOnly}
          value={selectedValues}
          onChange={(event) =>
            handleChange(
              field,
              Array.from(event.target.selectedOptions).map((option) => option.value),
            )
          }
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "relation") {
      const options = (lookupOptions[field.resource] || []).filter((option) => matchesCurrentFilters(option, field.filterByCurrent, values));
      return (
        <select className="form-control" id={field.name} value={currentValue ?? ""} disabled={field.readOnly} onChange={(event) => handleChange(field, event.target.value)}>
          <option value="">Selecione</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {getOptionLabel(field, option)}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "multirelation") {
      const options = (lookupOptions[field.resource] || []).filter((option) => matchesCurrentFilters(option, field.filterByCurrent, values));
      if (field.single) {
        const selectedValue = Array.isArray(currentValue) ? String(currentValue[0] ?? "") : (currentValue ?? "");

        return (
          <select className="form-control" id={field.name} value={selectedValue} disabled={field.readOnly} onChange={(event) => handleChange(field, event.target.value)}>
            <option value="">Selecione</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {getOptionLabel(field, option)}
              </option>
            ))}
          </select>
        );
      }
      const selectedValues = Array.isArray(currentValue) ? currentValue.map(String) : [];

      return (
        <select
          className="form-control form-control-multi"
          id={field.name}
          multiple
          disabled={field.readOnly}
          value={selectedValues}
          onChange={(event) =>
            handleChange(
              field,
              Array.from(event.target.selectedOptions).map((option) => option.value),
            )
          }
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {getOptionLabel(field, option)}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "json-list") {
      return (
        <textarea
          className="form-control form-control-textarea"
          id={field.name}
          rows="3"
          value={Array.isArray(currentValue) ? currentValue.join(", ") : currentValue || ""}
          disabled={field.readOnly}
          onChange={(event) => handleChange(field, event.target.value)}
        />
      );
    }

    if (field.type === "file-multi") {
      return (
        <input
          className="form-control"
          id={field.name}
          type="file"
          multiple
          disabled={field.readOnly}
          onChange={(event) => handleChange(field, Array.from(event.target.files || []))}
        />
      );
    }

    if (field.type === "file") {
      return (
        <div className="file-single-field">
          <input
            className="form-control"
            id={field.name}
            type="file"
            accept={field.accept}
            disabled={field.readOnly}
            onChange={(event) => handleChange(field, event.target.files?.[0] || null)}
          />
          {typeof currentValue === "string" && currentValue ? (
            <a className="attachment-link" href={currentValue} target="_blank" rel="noreferrer">
              Abrir imagem atual
            </a>
          ) : null}
          {currentValue && typeof currentValue === "object" && currentValue.name ? (
            <div className="field-help">{currentValue.name}</div>
          ) : null}
        </div>
      );
    }

    if (field.type === "localidade-list") {
      return (
        <div className="localidade-list">
          {localidadeEntries.map((entry, index) => (
            <div className="localidade-row" key={`${field.name}-${index}`}>
              <div className="localidade-grid">
                <select className="form-control" id={`${field.name}_uf_${index}`} value={entry.uf} onChange={(event) => handleLocalidadeUfChange(index, event.target.value)}>
                  <option value="">UF</option>
                  {stateOptions.map((state) => (
                    <option key={state.id || state.sigla} value={state.sigla}>
                      {state.sigla}
                    </option>
                  ))}
                </select>
                <select
                  className="form-control"
                  id={`${field.name}_cidade_${index}`}
                  value={entry.cidade}
                  disabled={!entry.uf}
                  onChange={(event) => handleLocalidadeCityChange(index, event.target.value)}
                >
                  <option value="">{entry.uf ? "Selecione a cidade" : "Escolha a UF"}</option>
                  {(cityOptionsByKey[entry.uf] || []).map((city) => (
                    <option key={city.id || city.nome} value={city.nome}>
                      {city.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-secondary localidade-remove" type="button" onClick={() => handleRemoveLocalidade(index)}>
                Excluir
              </button>
            </div>
          ))}
          <button className="btn btn-secondary localidade-add" type="button" onClick={handleAddLocalidade}>
            Adicionar local
          </button>
        </div>
      );
    }

    if (field.type === "price-unit-builder") {
      const currencies = getSelectOptions({ resource: "currencies", labelKey: "nome", valueKey: "nome" }, lookupOptions, values);
      const units = getSelectOptions({ resource: "units", labelKey: "nome", valueKey: "nome" }, lookupOptions, values);
      const [selectedCurrency = "", selectedUnit = ""] = String(currentValue || "").split("/");

      return (
        <div className="localidade-grid">
          <select
            className="form-control"
            id={`${field.name}_currency`}
            value={selectedCurrency}
            onChange={(event) => {
              const nextCurrency = event.target.value;
              handleChange(field, nextCurrency && selectedUnit ? `${nextCurrency}/${selectedUnit}` : nextCurrency);
            }}
          >
            <option value="">Moeda</option>
            {currencies.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="form-control"
            id={`${field.name}_unit`}
            value={selectedUnit}
            onChange={(event) => {
              const nextUnit = event.target.value;
              handleChange(field, selectedCurrency && nextUnit ? `${selectedCurrency}/${nextUnit}` : "");
            }}
          >
            <option value="">Unidade</option>
            {units.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "date") {
      return <DatePickerField id={field.name} value={currentValue ?? ""} disabled={field.readOnly} onChange={(value) => handleChange(field, value)} />;
    }

    return (
      <input
        className="form-control"
        id={field.name}
        type={field.type === "number" ? "text" : field.type || "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={currentValue ?? ""}
        disabled={field.readOnly}
        onChange={(event) => handleChange(field, event.target.value)}
      />
    );
  };

  return (
    <div className="modal-shell">
      <div className="modal-backdrop" onClick={onClose} />
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(normalizePayload(fields, values), values);
        }}
      >
        <div className="modal-header">
          <div>
            <strong>{title}</strong>
            <div className="muted">Edite os campos da linha selecionada ou crie um novo registro.</div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        {beforeContent}
        <div className="form-grid">
          {fields.filter((field) => isFieldVisible(field, values)).map((field) => (
            <div className={`field${field.type === "textarea" ? " field-full" : ""}`} key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              {renderField(field)}
              {field.type === "multirelation" ? (
                <div className="field-help">
                  {Array.isArray(values[field.name]) && values[field.name].length
                    ? values[field.name].map((item) => relationLabelMap[field.name]?.[item] || item).join(", ")
                    : field.single
                      ? ""
                      : "Segure Command/Ctrl para selecionar mais de um item."}
                </div>
              ) : null}
              {field.type === "select-multi" ? (
                <div className="field-help">
                  {Array.isArray(values[field.name]) && values[field.name].length ? values[field.name].join(", ") : ""}
                </div>
              ) : null}
              {field.type === "file-multi" ? (
                <>
                  <div className="field-help">
                    {Array.isArray(values[field.name]) && values[field.name].length
                      ? values[field.name].map((file) => file.name).join(", ")
                      : "Selecione um ou mais arquivos para anexar ao lancamento."}
                  </div>
                  {existingAttachments.length ? (
                    <div className="field-help">
                      {existingAttachments.map((attachment) => (
                        <div className="attachment-row" key={attachment.id}>
                          <a className="attachment-link" href={attachment.file} target="_blank" rel="noreferrer">
                            {attachment.original_name}
                          </a>
                          <button
                            className="btn btn-secondary attachment-delete"
                            type="button"
                            onClick={() => onDeleteAttachment?.(attachment)}
                          >
                            Excluir
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
              {field.helpText ? <div className="field-help">{field.helpText}</div> : null}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
