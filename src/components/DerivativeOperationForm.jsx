import { useEffect, useMemo, useState } from "react";

import { DatePickerField } from "./DatePickerField";
import { InfoPopup } from "./InfoPopup";
import { resourceService } from "../services/resourceService";
import { formatBrazilianDate, isBrazilianDate, isIsoDate, parseBrazilianDate } from "../utils/date";

const buySellOptions = [
  { value: "Compra", label: "Compra" },
  { value: "Venda", label: "Venda" },
];

const derivativeTypeOptions = [
  { value: "Call", label: "Call" },
  { value: "Put", label: "Put" },
  { value: "NDF", label: "NDF" },
];

const statusOptions = [
  { value: "Em aberto", label: "Em aberto" },
  { value: "Encerrado", label: "Encerrado" },
];

const normalizeLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("/", "");

const listDerivativeContractsFromBrowser = async (bolsa) => {
  const payload = await resourceService.fetchJsonCached(
    "sheety-cotacoes-spot",
    "https://api.sheety.co/90083751cf0794f44c9730c96a94cedf/apiCotacoesSpotGetBubble/planilha1",
  );
  const rows = Array.isArray(payload?.planilha1) ? payload.planilha1 : Array.isArray(payload) ? payload : [];
  const normalizedBolsa = normalizeLookupValue(bolsa);

  const options = rows
    .filter((row) => normalizeLookupValue(row?.bolsa) === normalizedBolsa)
    .map((row) => ({
      value: row?.ctrbolsa || "",
      label: row?.ctrbolsa || "",
    }))
    .filter((option) => option.value);

  return options.filter((option, index, self) => self.findIndex((item) => item.value === option.value) === index);
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
    normalized = parts.length === 2 ? raw : raw.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatBrazilianNumber = (value, decimals = 4) => {
  if (value === "" || value === undefined || value === null) {
    return "";
  }
  const numericValue = parseLocalizedNumber(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return numericValue.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatInitialNumber = (value, decimals = 4) => formatBrazilianNumber(value, decimals);

const normalizeItem = (item = {}, index = 0, options = {}) => {
  const isMoedaMode = normalizeLookupValue(options.moedaOuCmdtye) === "moeda";
  const rawFinancialVolume =
    item.volume_financeiro_valor_moeda_original ??
    (isMoedaMode ? item.volume : undefined);

  return {
    id: item.id,
    ordem: item.ordem || index + 1,
    grupo_montagem: item.grupo_montagem || "",
    tipo_derivativo: item.tipo_derivativo || "",
    numero_lotes: formatInitialNumber(item.numero_lotes, 4),
    volume: formatInitialNumber(item.volume ?? item.volume_fisico, 4),
    volume_financeiro_valor_moeda_original: formatInitialNumber(rawFinancialVolume, 4),
    strike_montagem: formatInitialNumber(item.strike_montagem, 4),
    custo_total_montagem_brl: formatInitialNumber(item.custo_total_montagem_brl, 4),
    strike_liquidacao: formatInitialNumber(item.strike_liquidacao, 4),
    ajustes_totais_brl: formatInitialNumber(item.ajustes_totais_brl, 4),
    ajustes_totais_usd: formatInitialNumber(item.ajustes_totais_usd, 4),
  };
};

const createEmptyItem = (index = 0, options = {}) => normalizeItem({}, index, options);

const relationLabel = (option, key) => option?.[key] || option?.nome || option?.label || `#${option?.id ?? ""}`;

const buildFinancialVolumeLabel = (currency) =>
  `Volume Financeiro${currency ? ` (${currency})` : " (moeda selecionada em Volume financeiro moeda)"}`;

const buildPhysicalVolumeLabel = (unit) =>
  `Volume fisico${unit ? ` (${unit})` : " (unidade selecionada no dropdown Unidade)"}`;

const buildStrikeLabel = (currencyUnit) =>
  `Strike montagem${currencyUnit ? ` (${currencyUnit})` : " (Moeda/unidade)"}`;

const deriveItemValues = ({ item, contractSize }) => {
  const strike = parseLocalizedNumber(item.strike_montagem) || 0;
  const lotes = parseLocalizedNumber(item.numero_lotes) || 0;
  const physicalVolume = lotes * contractSize;
  const financialVolume = physicalVolume * strike;

  return {
    ...item,
    volume: physicalVolume ? formatBrazilianNumber(physicalVolume, 4) : "",
    volume_financeiro_valor_moeda_original: financialVolume
      ? formatBrazilianNumber(financialVolume, 4)
      : "",
  };
};

export function DerivativeOperationForm({
  title,
  initialValues = {},
  existingAttachments = [],
  onDeleteAttachment,
  onSubmit,
  onClose,
  error = "",
}) {
  const [values, setValues] = useState({});
  const [lookupOptions, setLookupOptions] = useState({});
  const [contractOptions, setContractOptions] = useState([]);
  const [premiumHelpOpen, setPremiumHelpOpen] = useState(false);
  const selectedExchange = useMemo(
    () =>
      (lookupOptions.exchanges || []).find(
        (item) => normalizeLookupValue(item.nome) === normalizeLookupValue(values.bolsa_ref),
      ),
    [lookupOptions.exchanges, values.bolsa_ref],
  );
  const isMoedaMode = normalizeLookupValue(values.moeda_ou_cmdtye) === "moeda";

  useEffect(() => {
    const sourceItems = Array.isArray(initialValues.siblingRows) && initialValues.siblingRows.length
      ? initialValues.siblingRows
      : Array.isArray(initialValues.itens) && initialValues.itens.length
        ? initialValues.itens
        : [];
    setValues({
      ...initialValues,
      grupo: initialValues.grupo ? String(initialValues.grupo) : "",
      subgrupo: initialValues.subgrupo ? String(initialValues.subgrupo) : "",
      cultura: initialValues.cultura ? String(initialValues.cultura) : "",
      destino_cultura: initialValues.destino_cultura ? String(initialValues.destino_cultura) : "",
      safra: initialValues.safra ? String(initialValues.safra) : "",
      contraparte: initialValues.contraparte ? String(initialValues.contraparte) : "",
      data_contratacao: formatBrazilianDate(initialValues.data_contratacao),
      data_liquidacao: formatBrazilianDate(initialValues.data_liquidacao),
      cod_operacao_mae: initialValues.cod_operacao_mae || "",
      bolsa_ref: initialValues.bolsa_ref || "",
      status_operacao: initialValues.status_operacao || "Em aberto",
      contrato_derivativo: initialValues.contrato_derivativo || "",
      moeda_ou_cmdtye: initialValues.moeda_ou_cmdtye || "",
      moeda_unidade: initialValues.moeda_unidade || "",
      nome_da_operacao: initialValues.nome_da_operacao || "",
      unidade: initialValues.unidade || "",
      volume_financeiro_moeda: initialValues.volume_financeiro_moeda || "",
      dolar_ptax_vencimento: formatInitialNumber(initialValues.dolar_ptax_vencimento, 4),
      attachments: [],
      itens: sourceItems.length
        ? sourceItems.map((item, index) => {
            const isCurrentOpenedRow = String(item.id || "") === String(initialValues.id || "");
            return normalizeItem(
              {
                ...item,
                volume_financeiro_valor_moeda_original:
                  item.volume_financeiro_valor_moeda_original ??
                  (isCurrentOpenedRow ? initialValues.volume_financeiro_valor_moeda_original : undefined) ??
                  initialValues.volume_financeiro_valor_moeda_original,
              },
              index,
              { moedaOuCmdtye: initialValues.moeda_ou_cmdtye },
            );
          })
        : [createEmptyItem(0, { moedaOuCmdtye: initialValues.moeda_ou_cmdtye })],
    });
  }, [initialValues]);

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      const [groups, subgroups, crops, seasons, counterparties, exchanges, units, derivativeNames] = await Promise.all([
        resourceService.listAll("groups"),
        resourceService.listAll("subgroups"),
        resourceService.listAll("crops"),
        resourceService.listAll("seasons"),
        resourceService.listAll("counterparties"),
        resourceService.listAll("exchanges"),
        resourceService.listAll("units"),
        resourceService.listAll("derivative-operation-names"),
      ]);

      if (!isMounted) {
        return;
      }

      setLookupOptions({
        groups,
        subgroups,
        crops,
        seasons,
        counterparties,
        exchanges,
        units,
        derivativeNames,
      });
    };

    loadLookups();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadContracts = async () => {
      if (!values.bolsa_ref) {
        setContractOptions([]);
        return;
      }

      try {
        let options = await resourceService.listDerivativeContracts(values.bolsa_ref);
        if (!Array.isArray(options) || !options.length) {
          options = await listDerivativeContractsFromBrowser(values.bolsa_ref);
        }
        if (isMounted) {
          setContractOptions(Array.isArray(options) ? options : []);
        }
      } catch {
        try {
          const fallbackOptions = await listDerivativeContractsFromBrowser(values.bolsa_ref);
          if (isMounted) {
            setContractOptions(Array.isArray(fallbackOptions) ? fallbackOptions : []);
          }
        } catch {
          if (isMounted) {
            setContractOptions([]);
          }
        }
      }
    };

    loadContracts();

    return () => {
      isMounted = false;
    };
  }, [values.bolsa_ref]);

  useEffect(() => {
    if (!selectedExchange?.nome || !values.bolsa_ref) {
      return;
    }
    if (String(values.bolsa_ref) === String(selectedExchange.nome)) {
      return;
    }
    if (normalizeLookupValue(values.bolsa_ref) !== normalizeLookupValue(selectedExchange.nome)) {
      return;
    }
    setValues((current) => ({ ...current, bolsa_ref: selectedExchange.nome }));
  }, [selectedExchange, values.bolsa_ref]);

  useEffect(() => {
    if (!values.bolsa_ref || !selectedExchange) {
      return;
    }
    const nextMoedaCmdtye = selectedExchange?.moeda_cmdtye || "";
    const nextMoedaUnidade = selectedExchange?.moeda_unidade_padrao || "";
    const nextVolumeMoeda = selectedExchange?.moeda_bolsa || "";
    const nextUnidade = selectedExchange?.unidade_bolsa || "";

    setValues((current) => {
      const nextValues = {
        ...current,
        moeda_ou_cmdtye: nextMoedaCmdtye,
        moeda_unidade: nextMoedaUnidade,
        unidade: nextUnidade,
        volume_financeiro_moeda: nextVolumeMoeda,
      };
      if (
        current.moeda_ou_cmdtye === nextValues.moeda_ou_cmdtye &&
        current.moeda_unidade === nextValues.moeda_unidade &&
        current.unidade === nextValues.unidade &&
        current.volume_financeiro_moeda === nextValues.volume_financeiro_moeda
      ) {
        return current;
      }
      return nextValues;
    });
  }, [selectedExchange]);

  const bolsaOptions = useMemo(() => {
    const exchanges = lookupOptions.exchanges || [];
    if (!values.cultura) {
      return exchanges;
    }
    const selectedCrop = (lookupOptions.crops || []).find((item) => String(item.id) === String(values.cultura));
    const allowedBolsaRefs = Array.isArray(selectedCrop?.bolsa_ref)
      ? selectedCrop.bolsa_ref.map((value) => normalizeLookupValue(value))
      : selectedCrop?.bolsa_ref
        ? [normalizeLookupValue(selectedCrop.bolsa_ref)]
        : [];

    if (!allowedBolsaRefs.length) {
      return exchanges;
    }

    return exchanges.filter(
      (item) =>
        allowedBolsaRefs.includes(normalizeLookupValue(item.nome)) ||
        allowedBolsaRefs.includes(String(item.id)) ||
        normalizeLookupValue(item.cultura) === normalizeLookupValue(selectedCrop?.cultura),
    );
  }, [lookupOptions.crops, lookupOptions.exchanges, values.cultura]);

  useEffect(() => {
    if (!values.bolsa_ref) {
      return;
    }
    if (!bolsaOptions.length) {
      return;
    }
    const bolsaStillAllowed = bolsaOptions.some(
      (option) => normalizeLookupValue(option.nome) === normalizeLookupValue(values.bolsa_ref),
    );
    if (bolsaStillAllowed) {
      return;
    }
    setValues((current) => ({
      ...current,
      bolsa_ref: "",
      contrato_derivativo: "",
    }));
  }, [bolsaOptions, values.bolsa_ref]);

  useEffect(() => {
    if (!contractOptions.length || !values.contrato_derivativo) {
      return;
    }
    const contractStillAllowed = contractOptions.some(
      (option) => normalizeLookupValue(option.value) === normalizeLookupValue(values.contrato_derivativo),
    );
    if (contractStillAllowed) {
      return;
    }
    setValues((current) => ({ ...current, contrato_derivativo: "" }));
  }, [contractOptions, values.contrato_derivativo]);

  const groupOptions = lookupOptions.groups || [];
  const subgroupOptions = lookupOptions.subgroups || [];
  const canAddDerivativeItem = !["ndf", "call", "put"].some((token) =>
    normalizeLookupValue(values.nome_da_operacao).includes(token),
  );
  const counterpartyOptions = useMemo(
    () =>
      (lookupOptions.counterparties || []).filter((option) => {
        if (values.grupo && String(option.grupo ?? "") !== String(values.grupo)) {
          return false;
        }
        if (values.subgrupo && String(option.subgrupo ?? "") !== String(values.subgrupo)) {
          return false;
        }
        return true;
      }),
    [lookupOptions.counterparties, values.grupo, values.subgrupo],
  );

  const updateValue = (key, value) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if ((key === "grupo" || key === "subgrupo") && current.contraparte) {
        const validCounterparty = (lookupOptions.counterparties || []).some((option) => {
          if (String(option.id) !== String(current.contraparte)) {
            return false;
          }
          if (next.grupo && String(option.grupo ?? "") !== String(next.grupo)) {
            return false;
          }
          if (next.subgrupo && String(option.subgrupo ?? "") !== String(next.subgrupo)) {
            return false;
          }
          return true;
        });
        if (!validCounterparty) {
          next.contraparte = "";
        }
      }
      return next;
    });
  };

  const updateItem = (index, key, value) => {
    const contractSize = parseLocalizedNumber(selectedExchange?.volume_padrao_contrato) || 0;

    setValues((current) => ({
      ...current,
      itens: current.itens.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }
        if (isMoedaMode || (key !== "numero_lotes" && key !== "strike_montagem")) {
          return { ...item, [key]: value };
        }
        return deriveItemValues({
          item: { ...item, [key]: value },
          contractSize,
        });
      }),
    }));
  };

  const addItem = () => {
    if (!window.confirm("Você realmente deseja adicionar uma nova operação nessa mesma estratégia?")) {
      return;
    }
    setValues((current) => ({
      ...current,
      itens: [...current.itens, createEmptyItem(current.itens.length, { moedaOuCmdtye: current.moeda_ou_cmdtye })],
    }));
  };

  const removeItem = (index) => {
    setValues((current) => ({
      ...current,
      itens: current.itens.filter((_, currentIndex) => currentIndex !== index).map((item, itemIndex) => ({
        ...item,
        ordem: itemIndex + 1,
      })),
    }));
  };

  const buildPayload = () => ({
    grupo: values.grupo ? Number(values.grupo) : null,
    subgrupo: values.subgrupo ? Number(values.subgrupo) : null,
    cultura: values.cultura ? Number(values.cultura) : null,
    destino_cultura: values.destino_cultura ? Number(values.destino_cultura) : null,
    safra: values.safra ? Number(values.safra) : null,
    contraparte: values.contraparte ? Number(values.contraparte) : null,
    cod_operacao_mae: values.cod_operacao_mae || "",
    bolsa_ref: values.bolsa_ref || "",
    status_operacao: values.status_operacao || "Em aberto",
    contrato_derivativo: values.contrato_derivativo || "",
    data_contratacao: parseBrazilianDate(values.data_contratacao),
    data_liquidacao: parseBrazilianDate(values.data_liquidacao),
    moeda_ou_cmdtye: values.moeda_ou_cmdtye || "",
    moeda_unidade: values.moeda_unidade || "",
    nome_da_operacao: values.nome_da_operacao || "",
    unidade: values.unidade || "",
    volume_financeiro_moeda: values.volume_financeiro_moeda || "",
    dolar_ptax_vencimento: parseLocalizedNumber(values.dolar_ptax_vencimento),
    itens: (values.itens || []).map((item, index) => ({
      ...(item.id ? { id: item.id } : {}),
      ordem: index + 1,
      grupo_montagem: item.grupo_montagem || "",
      tipo_derivativo: item.tipo_derivativo || "",
      numero_lotes: parseLocalizedNumber(item.numero_lotes),
      volume: parseLocalizedNumber(item.volume),
      volume_financeiro_valor_moeda_original: parseLocalizedNumber(item.volume_financeiro_valor_moeda_original),
      strike_montagem: parseLocalizedNumber(item.strike_montagem),
      custo_total_montagem_brl: parseLocalizedNumber(item.custo_total_montagem_brl),
      strike_liquidacao: parseLocalizedNumber(item.strike_liquidacao),
      ajustes_totais_brl: parseLocalizedNumber(item.ajustes_totais_brl),
      ajustes_totais_usd: parseLocalizedNumber(item.ajustes_totais_usd),
    })),
  });

  const renderSelect = (id, currentValue, options, onChange, placeholder = "Selecione", disabled = false) => (
    <select className="form-control" id={id} value={currentValue ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value ?? option.id} value={option.value ?? option.id}>
          {option.label ?? relationLabel(option, option.labelKey)}
        </option>
      ))}
    </select>
  );

  const renderNumberInput = (id, value, onChange, readOnly = false) => (
    <input
      className="form-control"
      id={id}
      type="text"
      inputMode="decimal"
      value={value ?? ""}
      disabled={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  const renderDateInput = (id, value, onChange) => (
    <DatePickerField id={id} value={value ?? ""} onChange={onChange} />
  );

  return (
    <div className="modal-shell">
      <div className="modal-backdrop" onClick={onClose} />
      <form
        className="modal-card derivative-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(buildPayload(), values);
        }}
      >
        <div className="modal-header">
          <div className="derivative-modal-heading">
            <div className="derivative-modal-title-row">
              <strong>{title}</strong>
              <span className="derivative-code-chip">Codigo operacao mae: {values.cod_operacao_mae || "—"}</span>
            </div>
            <div className="muted">Operacao mae com derivativos filhos vinculados ao mesmo codigo.</div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="form-grid derivative-form-grid">
          <div className="field">
            <label>Grupo</label>
            {renderSelect(
              "grupo",
              values.grupo,
              groupOptions.map((option) => ({ value: option.id, label: option.grupo })),
              (value) => updateValue("grupo", value),
            )}
          </div>
          <div className="field">
            <label>Subgrupo</label>
            {renderSelect(
              "subgrupo",
              values.subgrupo,
              subgroupOptions.map((option) => ({ value: option.id, label: option.subgrupo })),
              (value) => updateValue("subgrupo", value),
            )}
          </div>
          <div className="field">
            <label>Ativo</label>
            {renderSelect(
              "cultura",
              values.cultura,
              (lookupOptions.crops || []).map((option) => ({ value: option.id, label: option.cultura })),
              (value) => updateValue("cultura", value),
            )}
          </div>
          <div className="field">
            <label>Bolsa</label>
            {renderSelect(
              "bolsa_ref",
              values.bolsa_ref,
              bolsaOptions.map((option) => ({ value: option.nome, label: option.nome })),
              (value) => updateValue("bolsa_ref", value),
            )}
          </div>
          {normalizeLookupValue(values.moeda_ou_cmdtye) === "moeda" ? (
            <div className="field">
              <label>Cultura de destino dessa operacao</label>
              {renderSelect(
                "destino_cultura",
                values.destino_cultura,
                (lookupOptions.crops || []).map((option) => ({ value: option.id, label: option.cultura })),
                (value) => updateValue("destino_cultura", value),
              )}
            </div>
          ) : null}
          <div className="field">
            <label>Contrato derivativo</label>
            {renderSelect(
              "contrato_derivativo",
              values.contrato_derivativo,
              contractOptions,
              (value) => updateValue("contrato_derivativo", value),
              values.bolsa_ref ? "Selecione" : "Selecione a bolsa",
            )}
          </div>
          <div className="field">
            <label>Safra</label>
            {renderSelect(
              "safra",
              values.safra,
              (lookupOptions.seasons || []).map((option) => ({ value: option.id, label: option.safra })),
              (value) => updateValue("safra", value),
            )}
          </div>
          <div className="field">
            <label>Nome da operacao</label>
            {renderSelect(
              "nome_da_operacao",
              values.nome_da_operacao,
              (lookupOptions.derivativeNames || []).map((option) => ({ value: option.nome, label: option.nome })),
              (value) => updateValue("nome_da_operacao", value),
            )}
          </div>
          <div className="field">
            <label>Status operacao</label>
            {renderSelect(
              "status_operacao",
              values.status_operacao,
              statusOptions,
              (value) => updateValue("status_operacao", value),
            )}
          </div>
          <div className="field">
            <label>Unidade</label>
            <input className="form-control" value={values.unidade || ""} disabled />
          </div>
          <div className="field">
            <label>Contraparte</label>
            {renderSelect(
              "contraparte",
              values.contraparte,
              counterpartyOptions.map((option) => ({ value: option.id, label: option.obs || `#${option.id}` })),
              (value) => updateValue("contraparte", value),
            )}
          </div>
          <div className="field">
            <label>Data contratacao</label>
            {renderDateInput("data_contratacao", values.data_contratacao, (value) => updateValue("data_contratacao", value))}
          </div>
          {values.status_operacao === "Em aberto" ? (
            <div className="field">
              <label>Data liquidacao</label>
              {renderDateInput("data_liquidacao", values.data_liquidacao, (value) => updateValue("data_liquidacao", value))}
            </div>
          ) : null}
          <div className="field">
            <label>Moeda ou cmdtye</label>
            <input className="form-control" value={values.moeda_ou_cmdtye || ""} disabled />
          </div>
          <div className="field">
            <label>Moeda/unidade</label>
            <input className="form-control" value={values.moeda_unidade || ""} disabled />
          </div>
          <div className="field">
            <label>Volume financeiro moeda</label>
            <input className="form-control" value={values.volume_financeiro_moeda || ""} disabled />
          </div>
          <div className="field field-full">
            <label>Anexos</label>
            <input
              className="form-control"
              type="file"
              multiple
              onChange={(event) => updateValue("attachments", Array.from(event.target.files || []))}
            />
            {existingAttachments.length ? (
              <div className="attachments-list">
                {existingAttachments.map((attachment) => (
                  <div className="attachment-row" key={attachment.id}>
                    <a className="attachment-link" href={attachment.file} target="_blank" rel="noreferrer">
                      {attachment.original_name}
                    </a>
                    <button className="btn btn-secondary attachment-delete" type="button" onClick={() => onDeleteAttachment?.(attachment)}>
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="derivative-items-header">
          <strong>Derivativos:</strong>
        </div>

        <div className="derivative-items-list">
          {values.status_operacao === "Encerrado" ? (
            <>
              <div className="derivative-section-title">Liquidacao</div>
              <div className="form-grid derivative-item-grid">
                <div className="field">
                  <label>Data liquidacao</label>
                  {renderDateInput("data_liquidacao", values.data_liquidacao, (value) => updateValue("data_liquidacao", value))}
                </div>
                <div className="field">
                  <label>Dolar ptax vencimento</label>
                  {renderNumberInput("dolar_ptax_vencimento", values.dolar_ptax_vencimento, (value) => updateValue("dolar_ptax_vencimento", value))}
                </div>
              </div>
            </>
          ) : null}

          {(values.itens || []).map((item, index) => (
            <div key={item.id || `item-${index}`}>
              <div className="derivative-item-card">
                <div className="derivative-item-top">
                  <div className="derivative-item-heading">
                    <strong>Derivativo {index + 1}</strong>
                    {item.id ? <span className="derivative-item-code">Codigo unico: #{item.id}</span> : null}
                  </div>
                  {(values.itens || []).length > 1 ? (
                    <button className="btn btn-secondary" type="button" onClick={() => removeItem(index)}>
                      Excluir
                    </button>
                  ) : null}
                </div>

                <div className="derivative-section-title">Montagem</div>
                <div className="form-grid derivative-item-grid">
                  <div className="field">
                    <label>Compra ou venda</label>
                    {renderSelect(
                      `grupo_montagem_${index}`,
                      item.grupo_montagem,
                      buySellOptions,
                      (value) => updateItem(index, "grupo_montagem", value),
                    )}
                  </div>
                  <div className="field">
                    <label>Tipo derivativo</label>
                    {renderSelect(
                      `tipo_derivativo_${index}`,
                      item.tipo_derivativo,
                      derivativeTypeOptions,
                      (value) => updateItem(index, "tipo_derivativo", value),
                    )}
                  </div>
                  <div className="field">
                    <label>Numero lotes</label>
                    {renderNumberInput(`numero_lotes_${index}`, item.numero_lotes, (value) => updateItem(index, "numero_lotes", value))}
                  </div>
                  <div className="field">
                    <label>{buildStrikeLabel(values.moeda_unidade)}</label>
                    {renderNumberInput(`strike_montagem_${index}`, item.strike_montagem, (value) => updateItem(index, "strike_montagem", value))}
                  </div>
                  <div className="field">
                    <div className="field-label-inline">
                      <span>Prêmio total (R$)</span>
                      <button
                        type="button"
                        className="field-info-button"
                        onClick={() => setPremiumHelpOpen((current) => !current)}
                        aria-label="Explicação sobre prêmio total"
                      >
                        i
                      </button>
                    </div>
                    {renderNumberInput(`custo_total_montagem_brl_${index}`, item.custo_total_montagem_brl, (value) => updateItem(index, "custo_total_montagem_brl", value))}
                  </div>
                  <div className="field">
                    <label>{buildFinancialVolumeLabel(values.volume_financeiro_moeda)}</label>
                    {renderNumberInput(
                      `volume_financeiro_valor_moeda_original_${index}`,
                      item.volume_financeiro_valor_moeda_original,
                      (value) => updateItem(index, "volume_financeiro_valor_moeda_original", value),
                      !isMoedaMode,
                    )}
                  </div>
                  <div className="field">
                    <label>{buildPhysicalVolumeLabel(values.unidade)}</label>
                    {renderNumberInput(`volume_${index}`, item.volume, (value) => updateItem(index, "volume", value), !isMoedaMode)}
                  </div>
                </div>

                {values.status_operacao === "Encerrado" ? (
                  <>
                    <div className="derivative-section-title">Liquidacao</div>
                    <div className="form-grid derivative-item-grid">
                      <div className="field">
                        <label>Strike liquidacao</label>
                        {renderNumberInput(`strike_liquidacao_${index}`, item.strike_liquidacao, (value) => updateItem(index, "strike_liquidacao", value))}
                      </div>
                      <div className="field">
                        <label>Ajustes totais R$</label>
                        {renderNumberInput(`ajustes_totais_brl_${index}`, item.ajustes_totais_brl, (value) => updateItem(index, "ajustes_totais_brl", value))}
                      </div>
                      <div className="field">
                        <label>Ajustes totais U$</label>
                        {renderNumberInput(`ajustes_totais_usd_${index}`, item.ajustes_totais_usd, (value) => updateItem(index, "ajustes_totais_usd", value))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {index === 0 && canAddDerivativeItem ? (
                <div className="derivative-add-inline">
                  <button className="btn btn-secondary" type="button" onClick={addItem}>
                    Adicionar derivativo
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit">
            Salvar
          </button>
        </div>
      </form>

      <InfoPopup
        open={premiumHelpOpen}
        title="Prêmio total (R$)"
        message="Informe valor negativo para custo (débito), positivo para receita (crédito)"
        onClose={() => setPremiumHelpOpen(false)}
      />
    </div>
  );
}
