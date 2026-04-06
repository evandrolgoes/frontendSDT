import { useEffect, useMemo, useState } from "react";

import { DatePickerField } from "./DatePickerField";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate, parseBrazilianDate } from "../utils/date";
import { formatBrazilianNumber, inferExchangeFromBolsaLabel, normalizeLookupValue, parseLocalizedNumber } from "../utils/formatters";
import { BRAZILIAN_STATES } from "../utils/constants";


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

const parseBrazilianNumber = (value) => {
  const result = parseLocalizedNumber(value);
  return result === 0 && (value === "" || value === undefined || value === null) ? undefined : result;
};

const isPhoneField = (field) => field?.type === "phone" || field?.name === "phone" || String(field?.label || "").trim().toLowerCase() === "telefone";

const formatBrazilianPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) {
    return "";
  }
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
};


const normalizeFieldValue = (field, value) => {
  if (field.type === "relation" && field.optional && value === "") {
    return null;
  }
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
  if (field.type === "json") {
    if (typeof value === "string" && !value.trim()) {
      return field.optional ? undefined : {};
    }
    if (typeof value !== "string") {
      return value ?? (field.optional ? undefined : {});
    }
    return JSON.parse(value);
  }
  if (isPhoneField(field)) {
    return formatBrazilianPhone(value);
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
  if (typeof field.getOptions === "function") {
    return field.getOptions({ lookupOptions, values, getOptionLabel }).filter(
      (option) => String(option?.value ?? "").trim() && String(option?.label ?? "").trim(),
    );
  }
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

const getRelationOptions = (field, lookupOptions, values) => {
  let options = typeof field.getOptions === "function"
    ? field.getOptions({ lookupOptions, values, getOptionLabel })
    : lookupOptions[field.resource] || [];

  if (field.filterByCurrent) {
    options = options.filter((option) => matchesCurrentFilters(option, field.filterByCurrent, values));
  }

  return options;
};

const getSelectedSelectMultiLabels = (field, lookupOptions, values) => {
  const options = getSelectOptions(field, lookupOptions, values);
  const labelsByValue = new Map(options.map((option) => [String(option.value ?? ""), option.label]));
  const selectedValues = Array.isArray(values?.[field.name]) ? values[field.name] : [];
  return selectedValues.map((value) => labelsByValue.get(String(value)) || String(value)).filter(Boolean);
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

const isFieldVisible = (field, values, lookupOptions) => {
  if (!field.visibleWhen) {
    return true;
  }

  if (typeof field.visibleWhen.predicate === "function") {
    return field.visibleWhen.predicate(values, lookupOptions);
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

const hasClearableValue = (field, value) => {
  if (field.readOnly) {
    return false;
  }
  if (field.type === "select-multi") {
    return Array.isArray(value) ? value.length > 0 : false;
  }
  if (field.type === "multirelation" && !field.single) {
    return Array.isArray(value) ? value.length > 0 : false;
  }
  return false;
};

const getClearedFieldValue = (field) => {
  if (field.type === "select-multi" || field.type === "multirelation") {
    return [];
  }
  return "";
};

const groupVisibleFields = (fields, values, lookupOptions) => {
  const visibleFields = fields.filter((field) => isFieldVisible(field, values, lookupOptions));
  const sections = [];
  let currentSection = null;

  visibleFields.forEach((field) => {
    const title = field.section || "";
    if (!currentSection || currentSection.title !== title) {
      currentSection = { title, fields: [] };
      sections.push(currentSection);
    }
    currentSection.fields.push(field);
  });

  return sections;
};

const isFieldFullWidth = (field) =>
  Boolean(
    field.fullWidth
      || field.type === "textarea"
      || field.type === "file"
      || field.type === "file-multi"
      || field.type === "localidade-list"
      || field.type === "select-multi"
      || field.accessManager
      || field.checkboxList
      || (field.type === "multirelation" && !field.single),
  );

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
  const [accessSearch, setAccessSearch] = useState({});
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
        if (field.type === "json") {
          return [field.name, currentValue ? JSON.stringify(currentValue, null, 2) : ""];
        }
        if (isPhoneField(field)) {
          return [field.name, formatBrazilianPhone(currentValue)];
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
    setValues((currentValues) => {
      let hasChanges = false;
      const nextValues = { ...currentValues };

      fields.forEach((field) => {
        const options = field.type === "relation" || field.type === "multirelation"
          ? getRelationOptions(field, lookupOptions, currentValues)
          : getSelectOptions(field, lookupOptions, currentValues);
        const allowedValues = new Set(
          options.map((option) =>
            String(
              field.type === "relation" || field.type === "multirelation"
                ? option.id ?? option.value ?? ""
                : option.value ?? "",
            )
          ),
        );

        if (field.type === "select") {
          const currentValue = currentValues[field.name];
          if (
            currentValue !== ""
            && currentValue !== undefined
            && currentValue !== null
            && options.length
            && !allowedValues.has(String(currentValue))
          ) {
            nextValues[field.name] = "";
            hasChanges = true;
          }
          return;
        }

        if (field.type === "select-multi") {
          const currentSelection = Array.isArray(currentValues[field.name]) ? currentValues[field.name] : [];
          const filteredSelection = currentSelection.filter((value) => allowedValues.has(String(value)));
          if (filteredSelection.length !== currentSelection.length) {
            nextValues[field.name] = filteredSelection;
            hasChanges = true;
          }
          return;
        }

        if ((!field.filterByCurrent && typeof field.getOptions !== "function") || !field.resource) {
          return;
        }

        if (field.type === "relation") {
          const currentValue = currentValues[field.name];
          if (currentValue !== "" && currentValue !== undefined && currentValue !== null) {
            if (!allowedValues.has(String(currentValue))) {
              nextValues[field.name] = "";
              hasChanges = true;
            }
          }
          return;
        }

        if (field.type === "multirelation") {
          if (field.single) {
            const currentValue = Array.isArray(currentValues[field.name])
              ? String(currentValues[field.name][0] ?? "")
              : String(currentValues[field.name] ?? "");
            if (currentValue && !allowedValues.has(currentValue)) {
              nextValues[field.name] = [];
              hasChanges = true;
            }
            return;
          }

          const currentSelection = Array.isArray(currentValues[field.name]) ? currentValues[field.name] : [];
          const filteredSelection = currentSelection.filter((value) => allowedValues.has(String(value)));
          if (filteredSelection.length !== currentSelection.length) {
            nextValues[field.name] = filteredSelection;
            hasChanges = true;
          }
        }
      });

      return hasChanges ? nextValues : currentValues;
    });
  }, [fields, lookupOptions, values]);

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
      const results = await Promise.allSettled(
        uniqueResources.map(async (resource) => ({
          resource,
          items: await resourceService.listAll(resource, {}, { force: true }),
        })),
      );

      results.forEach((result, index) => {
        const resource = uniqueResources[index];
        if (result.status === "fulfilled") {
          loaded[result.value.resource] = result.value.items;
          return;
        }
        loaded[resource] = [];
      });

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
    const selectedExchange = inferExchangeFromBolsaLabel(values.bolsa_ref, exchanges);
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
    const exchanges = lookupOptions.exchanges || [];
    const selectedExchange = inferExchangeFromBolsaLabel(values.bolsa_ref, exchanges);

    if (!values.bolsa_ref || !selectedExchange?.nome || String(values.bolsa_ref) === String(selectedExchange.nome)) {
      return;
    }

    setValues((current) => {
      if (!current.bolsa_ref || String(current.bolsa_ref) === String(selectedExchange.nome)) {
        return current;
      }

      const currentSelectedExchange = inferExchangeFromBolsaLabel(current.bolsa_ref, exchanges);
      if (!currentSelectedExchange?.nome || String(currentSelectedExchange.nome) !== String(selectedExchange.nome)) {
        return current;
      }

      return {
        ...current,
        bolsa_ref: selectedExchange.nome,
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
        fields.map((field) => {
          if (field.type !== "relation" && field.type !== "multirelation") {
            return [field.name, {}];
          }
          const options = getRelationOptions(field, lookupOptions, values);
          const labelsFromOptions = Object.fromEntries(
            options.map((option) => [String(option.id), getOptionLabel(field, option)]),
          );

          if (field.type !== "multirelation" || !field.displayField) {
            return [field.name, labelsFromOptions];
          }

          const selectedValues = Array.isArray(values[field.name]) ? values[field.name] : [];
          const displayValues = Array.isArray(values[field.displayField]) ? values[field.displayField] : [];
          const labelsFromDisplay = selectedValues.reduce((acc, value, index) => {
            const displayLabel = displayValues[index];
            if (!displayLabel) {
              return acc;
            }
            acc[String(value)] = displayLabel;
            return acc;
          }, {});

          return [field.name, { ...labelsFromDisplay, ...labelsFromOptions }];
        }),
      ),
    [fields, lookupOptions, values],
  );

  const handleChange = (field, value) => {
    const nextValue = isPhoneField(field) ? formatBrazilianPhone(value) : value;
    setValues((current) => ({ ...current, [field.name]: nextValue }));
  };

  const handleClearField = (field) => {
    setValues((current) => ({
      ...current,
      [field.name]: getClearedFieldValue(field),
    }));
  };

  const formatAccessUserLabel = (field, userOption) => {
    if (!userOption) {
      return "";
    }
    const label = getOptionLabel(field, userOption);
    if (userOption.email) {
      return `${label} (${userOption.email})`;
    }
    return label;
  };

  const getAccessManagerSearchKeys = (field) =>
    field.accessManagerSearchKeys || [field.labelKey, "nome", "name", "grupo", "subgrupo", "email", "username", "full_name"];

  const formatAccessManagerLabel = (field, option) => {
    if (!option) {
      return "";
    }
    const label = getOptionLabel(field, option);
    if (field.resource === "users" && option.email) {
      return `${label} (${option.email})`;
    }
    return label;
  };

  const handleAccessUserAdd = (field, userId) => {
    if (!userId) {
      return;
    }
    setValues((current) => {
      const currentValues = Array.isArray(current[field.name]) ? current[field.name].map(String) : [];
      if (currentValues.includes(String(userId))) {
        return current;
      }
      return {
        ...current,
        [field.name]: [...currentValues, String(userId)],
      };
    });
    setAccessSearch((current) => ({ ...current, [field.name]: "" }));
  };

  const handleAccessUserRemove = (field, userId) => {
    setValues((current) => ({
      ...current,
      [field.name]: (Array.isArray(current[field.name]) ? current[field.name] : []).filter((item) => String(item) !== String(userId)),
    }));
  };

  const handleSelectMultiAdd = (field, optionValue) => {
    if (!optionValue) {
      return;
    }
    setValues((current) => {
      const currentValues = Array.isArray(current[field.name]) ? current[field.name].map(String) : [];
      const normalizedValue = String(optionValue);
      if (currentValues.includes(normalizedValue)) {
        return current;
      }
      return {
        ...current,
        [field.name]: [...currentValues, normalizedValue],
      };
    });
    setAccessSearch((current) => ({ ...current, [field.name]: "" }));
  };

  const handleSelectMultiRemove = (field, optionValue) => {
    setValues((current) => ({
      ...current,
      [field.name]: (Array.isArray(current[field.name]) ? current[field.name] : []).filter((item) => String(item) !== String(optionValue)),
    }));
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

    if (field.type === "json") {
      return (
        <textarea
          className="form-control form-control-textarea"
          id={field.name}
          rows="6"
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
      if (field.dualList) {
        const searchValue = accessSearch[field.name] || "";
        const normalizedSearch = searchValue.trim().toLowerCase();
        const selectedOptions = selectedValues
          .map((value) => options.find((option) => String(option.value) === value))
          .filter(Boolean);
        const availableOptions = options.filter((option) => !selectedValues.includes(String(option.value)));
        const filteredAvailableOptions = !normalizedSearch
          ? availableOptions
          : availableOptions.filter((option) => String(option.label || "").toLowerCase().includes(normalizedSearch));

        return (
          <div className="dual-list-field">
            <div className="dual-list-panel">
              <div className="dual-list-panel-header">Disponiveis</div>
              <input
                className="form-control"
                id={field.name}
                type="text"
                placeholder={field.searchPlaceholder || "Buscar modulo"}
                value={searchValue}
                disabled={field.readOnly}
                onChange={(event) =>
                  setAccessSearch((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
              <div className="dual-list-options">
                {filteredAvailableOptions.length ? (
                  filteredAvailableOptions.map((option) => (
                    <button
                      className="dual-list-option"
                      key={option.value}
                      type="button"
                      disabled={field.readOnly}
                      onClick={() => handleSelectMultiAdd(field, option.value)}
                    >
                      <span>{option.label}</span>
                      <strong>Adicionar</strong>
                    </button>
                  ))
                ) : (
                  <div className="field-help">Nenhum modulo disponivel.</div>
                )}
              </div>
            </div>
            <div className="dual-list-panel">
              <div className="dual-list-panel-header">Selecionados</div>
              <div className="dual-list-options dual-list-options-selected">
                {selectedOptions.length ? (
                  selectedOptions.map((option) => (
                    <div className="dual-list-selected-item" key={option.value}>
                      <span>{option.label}</span>
                      <button
                        className="dual-list-remove"
                        type="button"
                        disabled={field.readOnly}
                        onClick={() => handleSelectMultiRemove(field, option.value)}
                      >
                        Remover
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="field-help">Nenhum modulo selecionado.</div>
                )}
              </div>
            </div>
          </div>
        );
      }
      const orderedOptions = [
        ...options.filter((option) => selectedValues.includes(String(option.value))),
        ...options.filter((option) => !selectedValues.includes(String(option.value))),
      ];
      const selectKey = `${field.name}:${selectedValues.join("|")}:${orderedOptions.map((option) => String(option.value)).join("|")}`;

      return (
        <select
          key={selectKey}
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
          {orderedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "relation") {
      const options = getRelationOptions(field, lookupOptions, values);
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
      const options = getRelationOptions(field, lookupOptions, values);
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

      if (field.checkboxList) {
        return (
          <div className="checkbox-list-field">
            {options.map((option) => {
              const optionId = String(option.id);
              const checked = selectedValues.includes(optionId);
              return (
                <label className="checkbox-list-option" key={option.id} htmlFor={`${field.name}_${option.id}`}>
                  <input
                    id={`${field.name}_${option.id}`}
                    type="checkbox"
                    checked={checked}
                    disabled={field.readOnly}
                    onChange={(event) =>
                      handleChange(
                        field,
                        event.target.checked
                          ? [...selectedValues, optionId]
                          : selectedValues.filter((value) => value !== optionId),
                      )
                    }
                  />
                  <span>{getOptionLabel(field, option)}</span>
                </label>
              );
            })}
            {!options.length ? <div className="field-help">Nenhuma opcao disponivel.</div> : null}
          </div>
        );
      }

      if (field.accessManager) {
        const selectedUsers = selectedValues
          .map((value) => options.find((option) => String(option.id) === String(value)))
          .filter(Boolean);
        const searchValue = accessSearch[field.name] || "";
        const normalizedSearch = searchValue.trim().toLowerCase();
        const availableUsers = options.filter((option) => !selectedValues.includes(String(option.id)));
        const searchKeys = getAccessManagerSearchKeys(field);
        const filteredUsers = (!normalizedSearch || field.accessManagerShowAllOptions)
          ? availableUsers.slice(0, field.accessManagerShowAllOptions ? 100 : 12)
          : availableUsers
              .filter((option) =>
                searchKeys
                  .map((key) => option?.[key])
                  .filter(Boolean)
                  .some((item) => String(item).toLowerCase().includes(normalizedSearch)),
              )
              .slice(0, 12);

        return (
          <div className="access-manager">
            <div className="access-manager-selected">
              {selectedUsers.length ? (
                selectedUsers.map((userOption) => (
                  <div className="access-manager-chip" key={userOption.id}>
                    <button
                      className="access-manager-remove"
                      type="button"
                      disabled={field.readOnly}
                      onClick={() => handleAccessUserRemove(field, userOption.id)}
                      title={field.accessManagerRemoveTitle || "Remover item"}
                    >
                      ←
                    </button>
                    <span>{formatAccessManagerLabel(field, userOption)}</span>
                  </div>
                ))
              ) : (
                <div className="field-help">{field.accessManagerEmptyText || "Nenhum item selecionado."}</div>
              )}
            </div>
            <div className="access-manager-search">
              {field.accessManagerTitle ? <div className="access-manager-title">{field.accessManagerTitle}</div> : null}
              {!field.hideSearchInput ? (
                <input
                  className="form-control"
                  id={field.name}
                  type="text"
                  placeholder={field.searchPlaceholder || "Digite para pesquisar"}
                  value={searchValue}
                  disabled={field.readOnly}
                  onChange={(event) =>
                    setAccessSearch((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              ) : null}
              <div className={`access-manager-results${field.accessManagerInlineResults ? " access-manager-results-inline" : ""}`}>
                {filteredUsers.length ? (
                  filteredUsers.map((userOption) => (
                    <button
                      className={`access-manager-result${field.accessManagerInlineResults ? " access-manager-result-inline" : ""}`}
                      key={userOption.id}
                      type="button"
                      disabled={field.readOnly}
                      onClick={() => handleAccessUserAdd(field, userOption.id)}
                    >
                      {field.resource === "users" ? (
                        <>
                          <strong>{getOptionLabel(field, userOption)}</strong>
                          <span>{formatAccessManagerLabel(field, userOption)}</span>
                        </>
                      ) : (
                        <strong>{getOptionLabel(field, userOption)}</strong>
                      )}
                    </button>
                  ))
                ) : field.accessManagerNotFoundText ? (
                  <div className="field-help">{field.accessManagerNotFoundText || "Nenhum item encontrado."}</div>
                ) : null}
              </div>
            </div>
          </div>
        );
      }

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
          <div className="modal-header-actions">
            <button className="btn btn-primary" type="submit">
              {submitLabel}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        {beforeContent}
        <div className="form-grid">
          {groupVisibleFields(fields, values, lookupOptions).map((section, sectionIndex) => (
            <div className="form-section" key={`${section.title || "default"}-${sectionIndex}`}>
              {section.title ? <div className="form-section-title">{section.title}</div> : null}
              {section.fields.map((field) => (
                <div className={`field${isFieldFullWidth(field) ? " field-full" : ""}`} key={field.name}>
                  <label htmlFor={field.checkboxList ? undefined : field.name}>{field.label}</label>
                  {renderField(field)}
                  {hasClearableValue(field, values[field.name]) ? (
                    <div className="field-clear-row">
                      <button
                        className="field-clear-button"
                        type="button"
                        onClick={() => handleClearField(field)}
                      >
                        Limpar
                      </button>
                    </div>
                  ) : null}
                  {field.type === "multirelation" && !field.accessManager ? (
                    <div className="field-help">
                      {Array.isArray(values[field.name]) && values[field.name].length
                        ? values[field.name].map((item) => relationLabelMap[field.name]?.[String(item)] || item).join(", ")
                        : field.single
                          ? ""
                          : field.checkboxList
                            ? "Marque uma ou mais opcoes."
                            : "Segure Command/Ctrl para selecionar mais de um item."}
                    </div>
                  ) : null}
                  {field.type === "select-multi" && !field.dualList ? (
                    <div className="field-help">
                      {getSelectedSelectMultiLabels(field, lookupOptions, values).join(", ")}
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
