import { moduleOptions as availableModuleOptions } from "../routes/routes.jsx";
import { resourceService } from "../services/resourceService";
import { parseBrazilianDate, formatBrazilianDate } from "../utils/date";
import { normalizeLookupValue, formatBrazilianNumber } from "../utils/formatters";

const yesNoOptions = [
  { value: "true", label: "Sim" },
  { value: "false", label: "Nao" },
];

const accessStatusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "active", label: "Ativo" },
];

const scopeAccessLevelOptions = [
  { value: "read", label: "Leitura" },
  { value: "write", label: "Edicao" },
];

const userRoleOptions = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "viewer", label: "Viewer" },
];

const buySellOptions = [
  { value: "Compra", label: "Compra" },
  { value: "Venda", label: "Venda" },
];

const objetivoVendaDolarizadaOptions = [
  { value: "Venda de componentes", label: "Venda de componentes" },
  { value: "Casamento com divida dolarizada", label: "Casamento com divida dolarizada" },
];

const pfPafOptions = [
  { value: "PF", label: "PF" },
  { value: "PAF", label: "PAF" },
];

const cifFobOptions = [
  { value: "CIF", label: "CIF" },
  { value: "FOB", label: "FOB" },
];

const physicalPaymentClassificationOptions = [
  { value: "Arrendamento", label: "Arrendamento" },
  { value: "Barter", label: "Barter" },
  { value: "Divida de Terras", label: "Divida de Terras" },
  { value: "Outros", label: "Outros" },
];

const moedaCmdtyeOptions = [
  { value: "Moeda", label: "Moeda" },
  { value: "Cmdtye", label: "Cmdtye" },
];

const triggerTypeOptions = [
  { value: "Fisico", label: "Fisico" },
  { value: "Derivativo", label: "Derivativo" },
];

const triggerDirectionOptions = [
  { value: "Acima", label: "Acima" },
  { value: "Abaixo", label: "Abaixo" },
];

const triggerStatusOptions = [
  { value: "Nao atingido", label: "Nao atingido" },
  { value: "Atingido", label: "Atingido" },
  { value: "Monitorando", label: "Monitorando" },
  { value: "Inativo", label: "Inativo" },
];

const accountsPayableStatusOptions = [
  { value: "A pagar", label: "A pagar" },
  { value: "Pago", label: "Pago" },
];

const accountsPayableEmpresaOptions = [
  { value: "Evandro PF", label: "Evandro PF" },
  { value: "Flavia pF", label: "Flavia pF" },
  { value: "Impere", label: "Impere" },
  { value: "SDT", label: "SDT" },
];

const accountsPayableContaOrigemOptions = [
  { value: "itau Person - Evandro", label: "itau Person - Evandro" },
  { value: "Itau - SDT", label: "Itau - SDT" },
];

const contractStatusOptions = [
  { value: "Pendente assinatura", label: "Pendente assinatura" },
  { value: "Pendente formalizacao", label: "Pendente formalizacao" },
  { value: "Assinado", label: "Assinado" },
];

const receiptEntryNfOptions = [
  { value: "Desnecessario", label: "Desnecessario" },
  { value: "Feito e enviado", label: "Feito e enviado" },
  { value: "Pendente", label: "Pendente" },
];

const receiptEntryStatusOptions = [
  { value: "Recebido", label: "Recebido" },
  { value: "Previsto", label: "Previsto" },
];

const fetchAndSetCotacaoBolsa = async ({ values, setValues }) => {
  const bolsaRef = values.bolsa_ref;
  const dataNeg = values.data_negociacao;
  if (!bolsaRef || !dataNeg) return;
  const isoDate = parseBrazilianDate(dataNeg);
  if (!isoDate) return;
  try {
    const price = await resourceService.fetchHistoricalExchangePrice(bolsaRef, isoDate);
    if (price != null) {
      setValues((current) => ({
        ...current,
        cotacao_bolsa_ref: formatBrazilianNumber(Number(price)),
      }));
    }
  } catch (_err) {
    // silently ignore fetch errors
  }
};

const formatExchangeOptionLabel = (exchangeName) =>
  String(exchangeName || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const getQuoteSectionName = (item) =>
  String(item?.section_name || item?.secao || item?.seção || "")
    .replace(/\s+/g, " ")
    .trim();

const commonRelationFields = {
  grupo: { type: "relation", resource: "groups", labelKey: "grupo" },
  subgrupo: { type: "relation", resource: "subgroups", labelKey: "subgrupo" },
  cultura: { type: "relation", resource: "crops", labelKey: "ativo" },
  safra: { type: "relation", resource: "seasons", labelKey: "safra" },
  contraparte: { type: "relation", resource: "counterparties", labelKey: "contraparte" },
};

const catalogSelectFields = {
  moeda: { type: "select", resource: "currencies", labelKey: "nome", valueKey: "nome" },
  unidade: { type: "select", resource: "units", labelKey: "nome", valueKey: "nome" },
  moedaUnidade: { type: "select", resource: "price-units", labelKey: "nome", valueKey: "nome" },
  bolsa: { type: "select", resource: "exchanges", labelKey: "nome", valueKey: "nome" },
};

const STANDARD_FIELD_SEQUENCE = ["grupo", "grupos", "subgrupo", "subgrupos", "cultura", "fazer_frente_com", "safra"];

const adminInvitationBaseFields = [
  { name: "target_tenant_slug", label: "Tipo de convite", type: "select", resource: "tenants", labelKey: "name", valueKey: "slug", section: "Convite" },
  { name: "expires_at", label: "Expira em", type: "date", optional: true, section: "Convite" },
  { name: "master_user", label: "Carteira", type: "relation", resource: "users", resources: ["users", "tenants"], labelKey: "full_name", optional: true, section: "Usuario" },
  { name: "full_name", label: "Nome completo", section: "Usuario" },
  { name: "email", label: "Email", type: "email", section: "Usuario" },
  { name: "access_status", label: "Status", type: "select", options: accessStatusOptions, section: "Usuario" },
  { name: "max_admin_invitations", label: "Numero de convites", type: "number", optional: true, section: "Usuario" },
];

const orderDefinitionEntries = (entries = [], keyName) => {
  const weightFor = (entry) => {
    const key = entry?.[keyName];
    const index = STANDARD_FIELD_SEQUENCE.indexOf(key);
    return index === -1 ? STANDARD_FIELD_SEQUENCE.length : index;
  };

  return [...entries].sort((left, right) => {
    const leftWeight = weightFor(left);
    const rightWeight = weightFor(right);
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }
    return 0;
  });
};

const baseResourceDefinitions = {
  tenants: {
    resource: "tenants",
    title: "Tenants",
    description: "Configuracao do tenant com modulos habilitados.",
    searchPlaceholder: "Buscar tenant...",
    columns: [
      { key: "name", label: "Nome" },
      { key: "slug", label: "Slug" },
      { key: "requires_master_user", label: "Necessita de carteira" },
      { key: "can_send_invitations", label: "Direito a convites" },
      { key: "can_register_groups", label: "Cadastro de grupos" },
      { key: "can_register_subgroups", label: "Cadastro de subgrupos" },
      { key: "enabled_modules", label: "Modulos habilitados", type: "select-multi" },
    ],
    fields: [
      { name: "name", label: "Nome" },
      { name: "slug", label: "Slug" },
      { name: "requires_master_user", label: "Necessita de carteira?", type: "select", options: yesNoOptions, optional: true },
      { name: "can_send_invitations", label: "Terá direito a convites?", type: "select", options: yesNoOptions, optional: true },
      { name: "can_register_groups", label: "Fará cadastro de grupos?", type: "select", options: yesNoOptions, optional: true },
      { name: "can_register_subgroups", label: "Fará cadastro de subgrupos?", type: "select", options: yesNoOptions, optional: true },
      {
        name: "enabled_modules",
        label: "Modulos habilitados",
        type: "select-multi",
        dualList: true,
        getOptions: () => availableModuleOptions,
        optional: true,
        searchPlaceholder: "Buscar modulo",
      },
    ],
  },
  groups: {
    resource: "groups",
    title: "Grupo",
    description: "Cadastro base dos grupos que substituem o antigo datatype de cliente.",
    searchPlaceholder: "Buscar grupo...",
    columns: [
      { key: "grupo", label: "Grupo" },
    ],
    fields: [
      { name: "grupo", label: "Grupo" },
    ],
  },
  subgroups: {
    resource: "subgroups",
    title: "Subgrupo",
    description: "Cadastro base dos subgrupos do sistema.",
    searchPlaceholder: "Buscar subgrupo...",
    columns: [
      { key: "grupo_name", label: "Grupo pai" },
      { key: "subgrupo", label: "Subgrupo" },
      { key: "descricao", label: "Descricao" },
    ],
    fields: [
      { name: "grupo", label: "Grupo pai", type: "relation", resource: "groups", labelKey: "grupo" },
      { name: "subgrupo", label: "Subgrupo" },
      { name: "descricao", label: "Descricao", type: "textarea", optional: true },
    ],
  },
  crops: {
    resource: "crops",
    title: "Ativo",
    description: "Ativos base do sistema.",
    searchPlaceholder: "Buscar ativo...",
    columns: [
      { key: "ativo", label: "Ativo" },
      { key: "bolsa_ref", label: "Bolsa de ref", type: "select-multi" },
      { key: "unidade_fisico", label: "Unidade fisico", type: "multirelation", resource: "units", labelKey: "nome" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { name: "ativo", label: "Ativo" },
      {
        name: "bolsa_ref",
        label: "Bolsa de ref",
        type: "select-multi",
        resource: "exchanges",
        labelKey: "nome",
        valueKey: "nome",
      },
      { name: "imagem", label: "Imagem", type: "file", accept: "image/*" },
      { name: "unidade_fisico", label: "Unidade fisico", type: "multirelation", resource: "units", labelKey: "nome", optional: true },
    ],
  },
  currencies: {
    resource: "currencies",
    title: "Moeda",
    description: "Cadastro base de moedas usadas nos formularios.",
    searchPlaceholder: "Buscar moeda...",
    columns: [{ key: "nome", label: "Moeda" }],
    fields: [{ name: "nome", label: "Moeda" }],
  },
  units: {
    resource: "units",
    title: "Unidade",
    description: "Cadastro base de unidades usadas nos formularios.",
    searchPlaceholder: "Buscar unidade...",
    columns: [{ key: "nome", label: "Unidade" }],
    fields: [{ name: "nome", label: "Unidade" }],
  },
  priceUnits: {
    resource: "price-units",
    title: "Moeda/Unidade",
    description: "Cadastro base de combinacoes de moeda por unidade.",
    searchPlaceholder: "Buscar moeda/unidade...",
    columns: [{ key: "nome", label: "Moeda/Unidade" }],
    fields: [
      { name: "nome", label: "Moeda/Unidade", type: "price-unit-builder", resources: ["currencies", "units"] },
    ],
  },
  exchanges: {
    resource: "exchanges",
    title: "Bolsa",
    description: "Cadastro base de bolsas usadas nos formularios.",
    searchPlaceholder: "Buscar bolsa...",
    columns: [
      { key: "nome", label: "Bolsa" },
      { key: "ativo", label: "Ativo" },
      { key: "moeda_bolsa", label: "Moeda da bolsa" },
      { key: "volume_padrao_contrato", label: "Volume padrao do contrato", type: "number" },
      { key: "unidade_bolsa", label: "Unidade da bolsa" },
      { key: "moeda_cmdtye", label: "Moeda/Cmdtye" },
      { key: "moeda_unidade_padrao", label: "Moeda/Unidade padrao" },
      { key: "fator_conversao_unidade_padrao_cultura", label: "Fator conversao unid. padrao", type: "number" },
    ],
    fields: [
      { name: "nome", label: "Bolsa" },
      { name: "ativo", label: "Ativo", type: "select", resource: "crops", labelKey: "ativo", valueKey: "ativo" },
      { name: "moeda_bolsa", label: "Moeda da bolsa", ...catalogSelectFields.moeda },
      { name: "volume_padrao_contrato", label: "Volume padrao do contrato", type: "number" },
      { name: "unidade_bolsa", label: "Unidade da bolsa", ...catalogSelectFields.unidade },
      { name: "moeda_cmdtye", label: "Moeda/Cmdtye", type: "select", options: moedaCmdtyeOptions },
      { name: "moeda_unidade_padrao", label: "Moeda/Unidade padrao", ...catalogSelectFields.moedaUnidade },
      { name: "fator_conversao_unidade_padrao_cultura", label: "Fator de conversao para unidade padrao da cultura", type: "number" },
      { name: "tv_symbol_fmt",  label: "TradingView — símbolo",        placeholder: "Ex: BMFBOVESPA:DOL{month}{year4}" },
      { name: "tv_ticker_fmt",  label: "TradingView — ticker",         placeholder: "Ex: DOL{month}{year}" },
      { name: "tv_months",      label: "TradingView — meses (vírgula)",placeholder: "Ex: 1,2,3,4,5,6,7,8,9,10,11,12" },
      { name: "tv_n_contracts", label: "TradingView — nº vencimentos", type: "number" },
    ],
  },
  derivativeOperationNames: {
    resource: "derivative-operation-names",
    title: "Nome Operacoes Derivativos",
    description: "Cadastro base dos nomes de operacoes de derivativos.",
    searchPlaceholder: "Buscar nome da operacao...",
    columns: [{ key: "nome", label: "Nome da operacao" }],
    fields: [{ name: "nome", label: "Nome da operacao" }],
  },
  seasons: {
    resource: "seasons",
    title: "Safra",
    description: "Safras base do sistema, no mesmo estilo simples da cultura.",
    searchPlaceholder: "Buscar safra...",
    columns: [
      { key: "safra", label: "Safra" },
      { key: "id", label: "ID" },
    ],
    fields: [{ name: "safra", label: "Safra" }],
  },
  entryClients: {
    resource: "receipt-clients",
    title: "Clientes",
    description: "Cadastro base de clientes usado nas entradas.",
    searchPlaceholder: "Buscar cliente...",
    columns: [
      { key: "nome", label: "Cliente" },
      { key: "id", label: "ID" },
    ],
    fields: [{ name: "nome", label: "Cliente" }],
  },
  receiptEntries: {
    resource: "receipt-entries",
    title: "Entradas",
    description: "Lancamentos de entradas com cliente, produto, valor, datas, NF, status e observacoes.",
    searchPlaceholder: "Buscar cliente, NF, produto ou status...",
    columns: [
      { key: "cliente", label: "Cliente", type: "relation", resource: "receipt-clients", labelKey: "nome" },
      { key: "produto", label: "Descricao entrada" },
      { key: "valor", label: "Valor Total (R$)", type: "number" },
      { key: "data_vencimento", label: "Data Vencimento", type: "date" },
      { key: "data_recebimento", label: "Data recebimento", type: "date" },
      { key: "nf", label: "NF?" },
      { key: "status", label: "Status" },
      { key: "observacoes", label: "Observacoes" },
    ],
    fields: [
      { name: "cliente", label: "Cliente", type: "relation", resource: "receipt-clients", labelKey: "nome" },
      { name: "produto", label: "Descricao entrada", optional: true },
      { name: "valor", label: "Valor Total (R$)", type: "number", optional: true },
      { name: "data_vencimento", label: "Data Vencimento", type: "date", optional: true },
      { name: "data_recebimento", label: "Data recebimento", type: "date", optional: true },
      { name: "nf", label: "NF?", type: "select", options: receiptEntryNfOptions },
      { name: "status", label: "Status", type: "select", options: receiptEntryStatusOptions },
      { name: "observacoes", label: "Observacoes", type: "textarea", optional: true },
    ],
  },
  otherEntries: {
    resource: "other-entries",
    title: "Outras entradas Caixa",
    description: "Lancamentos operacionais de outras entradas caixa que tambem alimentam o fluxo de caixa.",
    searchPlaceholder: "Buscar descricao, grupo, subgrupo, moeda ou status...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "descricao", label: "Descricao" },
      { key: "data_entrada", label: "Data entrada", type: "date" },
      { key: "valor", label: "Valor", type: "number" },
      { key: "moeda", label: "Moeda" },
      { key: "status", label: "Status" },
      { key: "obs", label: "Obs" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: {
          grupo: "grupo",
        },
      },
      { name: "descricao", label: "Descricao" },
      { name: "data_entrada", label: "Data entrada", type: "date", optional: true },
      { name: "valor", label: "Valor", type: "number", optional: true },
      { name: "moeda", label: "Moeda", ...catalogSelectFields.moeda, optional: true },
      { name: "status", label: "Status", type: "select", options: receiptEntryStatusOptions },
      { name: "obs", label: "Obs", type: "textarea", optional: true },
    ],
  },
  otherCashOutflows: {
    resource: "other-cash-outflows",
    title: "Outras saídas Caixa",
    description: "Lancamentos operacionais de outras saídas caixa para controle de pagamentos.",
    searchPlaceholder: "Buscar descricao, grupo, subgrupo, moeda ou status...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "descricao", label: "Descricao" },
      { key: "valor", label: "Valor", type: "number" },
      { key: "moeda", label: "Moeda" },
      { key: "data_pagamento", label: "Data pagamento", type: "date" },
      { key: "status", label: "Status" },
      { key: "obs", label: "Obs" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: {
          grupo: "grupo",
        },
      },
      { name: "descricao", label: "Descricao" },
      { name: "valor", label: "Valor", type: "number", optional: true },
      { name: "moeda", label: "Moeda", ...catalogSelectFields.moeda, optional: true },
      { name: "data_pagamento", label: "Data pagamento", type: "date", optional: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Pendente", label: "Pendente" },
          { value: "Pago", label: "Pago" },
        ],
      },
      { name: "obs", label: "Obs", type: "textarea", optional: true },
    ],
  },
  contracts: {
    resource: "contracts",
    title: "Contratos",
    description: "Cadastro de contratos com cliente, produto, status, frequencia de pagamentos e vigencia.",
    searchPlaceholder: "Buscar cliente, produto, status ou descricao...",
    columns: [
      { key: "cliente", label: "Cliente", type: "relation", resource: "receipt-clients", labelKey: "nome" },
      { key: "frequencia_pagamentos", label: "Frequencia pagamentos" },
      { key: "status_contrato", label: "Status contrato" },
      { key: "produto", label: "Produto" },
      { key: "valor", label: "Valor", type: "number" },
      { key: "data_inicio_contrato", label: "Data inicio contrato", type: "date" },
      { key: "data_fim_contrato", label: "Data fim contrato", type: "date" },
      { key: "valor_total_contrato", label: "Valor total contrato", type: "number" },
      { key: "descricao", label: "Descricao" },
    ],
    fields: [
      { name: "cliente", label: "Cliente", type: "relation", resource: "receipt-clients", labelKey: "nome" },
      { name: "frequencia_pagamentos", label: "Frequencia pagamentos" },
      { name: "status_contrato", label: "Status contrato", type: "select", options: contractStatusOptions },
      { name: "produto", label: "Produto" },
      { name: "valor", label: "Valor", type: "number" },
      { name: "data_inicio_contrato", label: "Data inicio contrato", type: "date" },
      { name: "data_fim_contrato", label: "Data fim contrato", type: "date" },
      { name: "valor_total_contrato", label: "Valor total contrato", type: "number" },
      { name: "descricao", label: "Descricao", type: "textarea", optional: true },
    ],
  },
  counterparties: {
    resource: "counterparties",
    title: "Contrapartes",
    description: "Contrapartes ligadas ao grupo.",
    searchPlaceholder: "Buscar contraparte...",
    columns: [
      { key: "contraparte", label: "Contraparte" },
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "obs", label: "Observacoes" },
    ],
    fields: [
      { name: "contraparte", label: "Contraparte" },
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  physicalQuotes: {
    resource: "physical-quotes",
    title: "Cotacoes Fisico",
    description: "Cotacoes fisicas com moeda/unidade, data de pagamento e report.",
    searchPlaceholder: "Buscar cotacao, cultura ou localidade...",
    columns: [
      { key: "cultura_texto", label: "Ativo" },
      { key: "cotacao", label: "Cotacao", type: "number" },
      { key: "moeda_unidade", label: "Moeda/Unidade" },
      { key: "data_report", label: "Data report", type: "date" },
      { key: "localidade", label: "Localidade" },
    ],
    fields: [
      { name: "cotacao", label: "Cotacao", type: "number" },
      { name: "cultura_texto", label: "Ativo", type: "select", resource: "crops", labelKey: "ativo", valueKey: "ativo" },
      { name: "data_pgto", label: "Data pgto", type: "date" },
      { name: "data_report", label: "Data report", type: "date" },
      {
        name: "localidade",
        label: "Localidade",
        type: "select",
        resource: "crop-boards",
        listField: "localidade",
        dedupeByValue: true,
      },
      { name: "moeda_unidade", label: "Moeda/Unidade", ...catalogSelectFields.moedaUnidade },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  tradingviewWatchlistQuotes: {
    resource: "tradingview-watchlist-quotes",
    title: "Cotacoes",
    description: "",
    searchPlaceholder: "Buscar simbolo, secao ou descricao...",
    readonly: true,
    allowCreate: false,
    allowDelete: false,
    allowDuplicate: false,
    disableReadonlyDetails: true,
    showClearButton: false,
    autoRefreshIntervalMs: 60000,
    columns: [
      { key: "section_name", label: "Secao" },
      { key: "ticker", label: "Ticker" },
      { key: "description", label: "Descricao" },
      { key: "price", label: "Preco", type: "number" },
      { key: "change_percent", label: "Variacao %", type: "number" },
      { key: "change_value", label: "Variacao", type: "number" },
      { key: "currency", label: "Moeda" },
      { key: "instrument_type", label: "Tipo" },
      { key: "id", label: "ID" },
      { key: "symbol", label: "Simbolo" },
    ],
    fields: [],
  },
  budgetCosts: {
    resource: "budget-costs",
    title: "Custo Orcamento",
    description: "Custos orcados por grupo, subgrupo, cultura e safra.",
    searchPlaceholder: "Buscar grupo despesa...",
    columns: [
      { key: "grupo_despesa", label: "Grupo despesa" },
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "valor", label: "Valor", type: "number" },
      { key: "moeda", label: "Moeda" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      { name: "cultura", label: "Ativo", ...commonRelationFields.cultura, optional: true },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      { name: "considerar_na_politica_de_hedge", label: "Considerar na politica de hedge", type: "select", options: yesNoOptions },
      { name: "grupo_despesa", label: "Grupo despesa" },
      { name: "moeda", label: "Moeda", ...catalogSelectFields.moeda },
      { name: "valor", label: "Valor", type: "number" },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  actualCosts: {
    resource: "actual-costs",
    title: "Custo Realizado",
    description: "Custos realizados por grupo, subgrupo, cultura e safra.",
    searchPlaceholder: "Buscar grupo despesa...",
    columns: [
      { key: "grupo_despesa", label: "Grupo despesa" },
      { key: "data_travamento", label: "Data do travamento", type: "date" },
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "valor", label: "Valor", type: "number" },
      { key: "moeda", label: "Moeda" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      { name: "cultura", label: "Ativo", ...commonRelationFields.cultura, optional: true },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      {
        name: "grupo_despesa",
        label: "Grupo despesa",
        type: "select",
        resource: "budget-costs",
        labelKey: "grupo_despesa",
        valueKey: "grupo_despesa",
        filterByCurrent: {
          grupo: "grupo",
          subgrupo: "subgrupo",
          cultura: "cultura",
          safra: "safra",
        },
        dedupeByValue: true,
      },
      { name: "data_travamento", label: "Data do travamento", type: "date", optional: true },
      { name: "moeda", label: "Moeda", ...catalogSelectFields.moeda },
      { name: "valor", label: "Valor", type: "number" },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  derivativeOperations: {
    resource: "derivative-operations",
    title: "Derivativos",
    description: "Operacoes maes de derivativos com filhos vinculados ao mesmo codigo mae.",
    customForm: "derivative-operation",
    attachmentField: { name: "attachments", label: "Anexos", type: "file-multi" },
    searchPlaceholder: "Buscar derivativo...",
    columns: [
      { key: "cod_operacao_mae", label: "Cod operacao mae" },
      { key: "nome_da_operacao", label: "Nome da operacao" },
      { key: "status_operacao", label: "Status" },
      { key: "bolsa_ref", label: "Bolsa" },
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "data_contratacao", label: "Data contratacao", type: "date" },
      { key: "quantidade_derivativos", label: "Qtd derivativos", type: "number" },
      { key: "ativo", label: "Ativo", type: "relation", resource: "crops", labelKey: "ativo" },
      { key: "safra", label: "Safra", type: "relation", resource: "seasons", labelKey: "safra" },
      { key: "contrato_derivativo", label: "Contrato bolsa" },
      { key: "contraparte", label: "Contraparte", type: "relation", resource: "counterparties", labelKey: "contraparte" },
      { key: "data_liquidacao", label: "Data liquidacao", type: "date" },
      { key: "tipo_derivativo", label: "Tipo derivativo" },
      { key: "posicao", label: "Compra/Venda" },
      { key: "volume", label: "Volume", type: "number" },
      { key: "numero_lotes", label: "Numero lotes", type: "number" },
      { key: "strike_montagem", label: "Strike montagem", type: "number" },
      { key: "strike_liquidacao", label: "Strike liquidacao", type: "number" },
      { key: "moeda_unidade", label: "Moeda/Unidade" },
      { key: "unidade", label: "Unidade" },
      { key: "volume_financeiro_moeda", label: "Moeda volume fin." },
      { key: "volume_financeiro_valor_moeda_original", label: "Volume fin. (moeda orig.)", type: "number" },
      { key: "custo_total_montagem_brl", label: "Premio total (R$)", type: "number" },
      { key: "ajustes_totais_brl", label: "Ajustes totais R$", type: "number" },
      { key: "ajustes_totais_usd", label: "Ajustes totais U$", type: "number" },
      { key: "dolar_ptax_vencimento", label: "Dolar ptax vencimento", type: "number" },
    ],
    fields: [],
  },
  strategies: {
    resource: "strategies",
    title: "Estrategias",
    description: "Estrategias com lista de grupos, subgrupos, status e validade.",
    searchPlaceholder: "Buscar estrategia...",
    columns: [
      { key: "descricao_estrategia", label: "Descricao" },
      { key: "grupos", label: "Grupos", type: "multirelation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupos", label: "Subgrupos", type: "multirelation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "status", label: "Status" },
      { key: "data_validade", label: "Validade", type: "date" },
    ],
    fields: [
      { name: "data_validade", label: "Data validade", type: "date" },
      { name: "descricao_estrategia", label: "Descricao da estrategia", type: "textarea" },
      { name: "grupos", label: "Grupos", type: "multirelation", resource: "groups", labelKey: "grupo", optional: true },
      {
        name: "subgrupos",
        label: "Subgrupos",
        type: "multirelation",
        resource: "subgroups",
        labelKey: "subgrupo",
        optional: true,
        filterByCurrent: { grupo: "grupos" },
      },
      { name: "obs", label: "Observacoes", type: "textarea" },
      { name: "status", label: "Status" },
    ],
  },
  strategyTriggers: {
    resource: "strategy-triggers",
    title: "Gatilhos",
    description: "Gatilhos de mercado com ou sem estrategia, incluindo monitoramento de derivativos por cotacao.",
    searchPlaceholder: "Buscar gatilho...",
    columns: [
      { key: "estrategia", label: "Estrategia", type: "relation", resource: "strategies", labelKey: "descricao_estrategia" },
      { key: "grupos", label: "Grupo", type: "multirelation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupos", label: "Subgrupo", type: "multirelation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "cultura", label: "Ativo", type: "relation", ...commonRelationFields.cultura },
      { key: "tipo", label: "Tipo" },
      { key: "bolsa", label: "Bolsa" },
      { key: "contrato_derivativo", label: "Contrato derivativo" },
      { key: "acima_abaixo", label: "Acima/Abaixo" },
      { key: "strike", label: "Strike", type: "number" },
      { key: "volume_objetivo", label: "Volume objetivo", type: "number" },
      { key: "unidade", label: "Unidade" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "grupos", label: "Grupo", type: "multirelation", resource: "groups", labelKey: "grupo", optional: true, section: "Escopo" },
      {
        name: "subgrupos",
        label: "Subgrupo",
        type: "multirelation",
        resource: "subgroups",
        labelKey: "subgrupo",
        optional: true,
        section: "Escopo",
        filterByCurrent: { grupo: "grupos" },
      },
      { name: "cultura", label: "Ativo", ...commonRelationFields.cultura, optional: true, section: "Mercado" },
      { name: "tipo", label: "Tipo (Fisico ou Derivativo)", type: "select", options: triggerTypeOptions, section: "Mercado" },
      {
        name: "bolsa",
        label: "Bolsa",
        type: "select",
        resource: "exchanges",
        labelKey: "nome",
        valueKey: "nome",
        optional: true,
        section: "Mercado",
      },
      {
        name: "contrato_derivativo",
        label: "Contrato derivativo",
        type: "select",
        resource: "tradingview-watchlist-quotes",
        resources: ["tradingview-watchlist-quotes"],
        optional: true,
        section: "Mercado",
        visibleWhen: { field: "tipo", equals: "Derivativo" },
        getOptions: ({ lookupOptions, values }) => {
          const selectedExchange = normalizeLookupValue(values?.bolsa);
          const unique = new Map();
          (lookupOptions["tradingview-watchlist-quotes"] || []).forEach((item) => {
            const ticker = String(item?.ticker || item?.symbol || "").trim();
            if (!ticker) {
              return;
            }
            const section = normalizeLookupValue(item?.section_name);
            const description = String(item?.description || "").trim();
            if (selectedExchange && !section.includes(selectedExchange) && !normalizeLookupValue(description).includes(selectedExchange)) {
              return;
            }
            if (!unique.has(ticker)) {
              unique.set(ticker, {
                value: ticker,
                label: description ? `${ticker} - ${description}` : ticker,
              });
            }
          });
          return Array.from(unique.values());
        },
        helpText: "Para derivativos, o dashboard compara a cotacao atual da API com o strike deste contrato.",
      },
      { name: "acima_abaixo", label: "Acima/Abaixo", type: "select", options: triggerDirectionOptions, section: "Alerta" },
      { name: "strike", label: "Strike", type: "number", section: "Alerta" },
      { name: "volume_objetivo", label: "Volume objetivo", type: "number", section: "Alerta" },
      { name: "unidade", label: "Unidade", ...catalogSelectFields.unidade, section: "Alerta" },
      { name: "status", label: "Status", type: "select", options: triggerStatusOptions, section: "Controle" },
      {
        name: "estrategia",
        label: "Estrategia associada",
        type: "relation",
        resource: "strategies",
        labelKey: "descricao_estrategia",
        optional: true,
        section: "Controle",
        helpText: "Cada gatilho pode estar associado a no maximo uma estrategia.",
      },
      { name: "obs", label: "Observacoes/Descricao", type: "textarea", optional: true, section: "Controle" },
    ],
  },
  hedgePolicies: {
    resource: "hedge-policies",
    title: "Politica de Hedge",
    description: "Politicas de hedge por cultura, grupos, subgrupos e safra.",
    searchPlaceholder: "Buscar politica...",
    columns: [
      { key: "grupos", label: "Grupo", type: "multirelation", resource: "groups", labelKey: "grupo" },
      { key: "subgrupos", label: "Subgrupo", type: "multirelation", resource: "subgroups", labelKey: "subgrupo" },
      { key: "cultura", label: "Ativo", type: "relation", ...commonRelationFields.cultura },
      { key: "safra", label: "Safra", type: "relation", ...commonRelationFields.safra },
      { key: "mes_ano", label: "Mes/Ano", type: "date" },
      { key: "margem_alvo_minimo", label: "Margem alvo minimo", type: "number" },
    ],
    fields: [
      { name: "cultura", label: "Ativo", ...commonRelationFields.cultura, optional: true },
      { name: "grupos", label: "Grupo", type: "multirelation", resource: "groups", labelKey: "grupo", optional: true },
      {
        name: "subgrupos",
        label: "Subgrupo",
        type: "multirelation",
        resource: "subgroups",
        labelKey: "subgrupo",
        optional: true,
        filterByCurrent: { grupo: "grupos" },
      },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      { name: "insumos_travados_maximo", label: "Insumos travados maximo", type: "number" },
      { name: "insumos_travados_minimo", label: "Insumos travados minimo", type: "number" },
      { name: "margem_alvo_minimo", label: "Margem alvo minimo", type: "number" },
      { name: "mes_ano", label: "Mes/Ano", type: "date" },
      { name: "vendas_x_custo_maximo", label: "Vendas x custo maximo", type: "number" },
      { name: "vendas_x_custo_minimo", label: "Vendas x custo minimo", type: "number" },
      { name: "vendas_x_prod_total_maximo", label: "Vendas x prod total maximo", type: "number" },
      { name: "vendas_x_prod_total_minimo", label: "Vendas x prod total minimo", type: "number" },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  cropBoards: {
    resource: "crop-boards",
    title: "Quadro Safra",
    description: "Quadro de safra com area, produtividade, producao e monitoramento.",
    searchPlaceholder: "Buscar quadro safra...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "cultura", label: "Ativo", type: "relation", ...commonRelationFields.cultura },
      { key: "safra", label: "Safra", type: "relation", ...commonRelationFields.safra },
      { key: "data_plantio", label: "Data plantio", type: "date" },
      { key: "data_colheita", label: "Data colheita", type: "date" },
      { key: "localidade", label: "Locais de producao" },
      { key: "area", label: "Area", type: "number" },
      { key: "producao_total", label: "Producao total", type: "number" },
      { key: "monitorar_vc", label: "Monitorar VC?", type: "boolean" },
    ],
    fields: [
      { name: "cultura", label: "Ativo", ...commonRelationFields.cultura, optional: true },
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      { name: "data_plantio", label: "Data plantio", type: "date", optional: true },
      { name: "data_colheita", label: "Data colheita", type: "date", optional: true },
      { name: "localidade", label: "Locais de producao", type: "localidade-list" },
      { name: "area", label: "Area", type: "number" },
      { name: "bolsa_ref", label: "Bolsa ref", ...catalogSelectFields.bolsa },
      { name: "monitorar_vc", label: "Monitorar VC?", type: "select", options: yesNoOptions },
      { name: "produtividade", label: "Produtividade", type: "number" },
      { name: "producao_total", label: "Producao total", type: "number", readOnly: true },
      { name: "criar_politica_hedge", label: "Criar politica de hedge?", type: "select", options: yesNoOptions },
      { name: "unidade_producao", label: "Unidade producao", ...catalogSelectFields.unidade },
      { name: "obs", label: "Observacoes", type: "textarea" },
    ],
  },
  physicalSales: {
    resource: "physical-sales",
    title: "Vendas Fisico",
    description: "Operacoes de vendas fisicas com basis, bolsa, dolar e faturamento.",
    searchPlaceholder: "Buscar venda fisica...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "cultura_produto", label: "Cultura produto" },
      { key: "localidade", label: "Localidade" },
      { key: "safra", label: "Safra", type: "relation", ...commonRelationFields.safra },
      { key: "bolsa_ref", label: "Bolsa ref" },
      { key: "compra_venda", label: "Compra/Venda" },
      { key: "preco", label: "Preco", type: "number" },
      { key: "moeda_unidade", label: "Volume fisico moeda" },
      { key: "volume_fisico", label: "Volume fisico volume", type: "number" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      {
        name: "cultura_produto",
        label: "Cultura produto",
        type: "select",
        resources: ["crop-boards", "crops"],
        getOptions: ({ lookupOptions }) => {
          const cropBoards = Array.isArray(lookupOptions["crop-boards"]) ? lookupOptions["crop-boards"] : [];
          const crops = Array.isArray(lookupOptions.crops) ? lookupOptions.crops : [];
          const cropMap = new Map(
            crops.map((item) => [
              String(item.id),
              item.ativo || item.cultura || item.nome || item.label || item.descricao || String(item.id),
            ]),
          );
          const values = cropBoards
            .map((item) => {
              if (item?.cultura && typeof item.cultura === "object") {
                return item.cultura.ativo || item.cultura.cultura || item.cultura.nome || item.cultura.label || item.cultura.descricao || "";
              }
              if (item?.cultura != null) {
                return cropMap.get(String(item.cultura)) || "";
              }
              return "";
            })
            .filter(Boolean);

          return [...new Set(values)].map((value) => ({
            value,
            label: value,
          }));
        },
      },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      {
        name: "localidade",
        label: "Localidade",
        type: "select",
        resource: "crop-boards",
        listField: "localidade",
        dedupeByValue: true,
        optional: true,
      },
      { name: "compra_venda", label: "Compra/Venda", type: "select", options: buySellOptions },
      {
        name: "contraparte",
        label: "Contraparte",
        ...commonRelationFields.contraparte,
        optional: true,
        filterByCurrent: {
          grupo: "grupo",
        },
      },
      { name: "preco", label: "Preco", type: "number" },
      { name: "moeda_unidade", label: "Volume fisico moeda", ...catalogSelectFields.moedaUnidade, optional: true },
      { name: "volume_fisico", label: "Volume fisico volume", type: "number" },
      { name: "unidade_contrato", label: "Unidade contrato", ...catalogSelectFields.unidade },
      { name: "pf_paf", label: "PF/PAF", type: "select", options: pfPafOptions },
      {
        name: "data_negociacao",
        label: "Data negociacao",
        type: "date",
        onFieldChange: ({ value, values, setValues }) =>
          fetchAndSetCotacaoBolsa({ values: { ...values, data_negociacao: value }, setValues }),
      },
      { name: "data_entrega", label: "Data entrega", type: "date" },
      { name: "data_pagamento", label: "Data pagamento", type: "date" },
      { name: "basis_valor", label: "Basis valor", type: "number" },
      { name: "basis_moeda", label: "Basis moeda", type: "text", readOnly: true },
      {
        name: "bolsa_ref",
        label: "Bolsa ref",
        type: "select",
        resources: ["exchanges", "crops"],
        getOptions: ({ lookupOptions, values }) => {
          const exchanges = Array.isArray(lookupOptions.exchanges) ? lookupOptions.exchanges : [];
          const crops = Array.isArray(lookupOptions.crops) ? lookupOptions.crops : [];
          const selectedCrop = crops.find((item) => String(item.id) === String(values.cultura_produto));
          const cropName = normalizeLookupValue(selectedCrop?.ativo || selectedCrop?.cultura || values.cultura_produto);
          const filteredExchanges = cropName
            ? exchanges.filter((item) => normalizeLookupValue(item.ativo || item.cultura) === cropName)
            : exchanges;

          return filteredExchanges.map((item) => ({
            value: item.nome,
            label: formatExchangeOptionLabel(item.nome),
          }));
        },
        optional: true,
        onFieldChange: ({ value, values, setValues }) =>
          fetchAndSetCotacaoBolsa({ values: { ...values, bolsa_ref: value }, setValues }),
      },
      { name: "cif_fob", label: "CIF/FOB", type: "select", options: cifFobOptions },
      { name: "cotacao_bolsa_ref", label: "Cotacao bolsa ref", type: "number" },
      { name: "dolar_de_venda", label: "Dolar de venda futuro", type: "number" },
      { name: "faturamento_total_contrato", label: "Faturamento total do contrato", type: "number", readOnly: true },
      { name: "moeda_contrato", label: "Moeda contrato", ...catalogSelectFields.moeda },
      {
        name: "objetivo_venda_dolarizada",
        label: "Objetivo venda dolarizada",
        type: "select",
        options: objetivoVendaDolarizadaOptions,
        visibleWhen: {
          field: "moeda_contrato",
          notEquals: "R$",
        },
      },
      { name: "obs", label: "Obs", type: "textarea", optional: true },
      { name: "attachments", label: "Anexos", type: "file-multi" },
    ],
  },
  physicalPayments: {
    resource: "physical-payments",
    title: "Pgtos Fisico",
    description: "Pagamentos fisicos com grupo, subgrupo, cultura, safra, volume e contraparte.",
    searchPlaceholder: "Buscar pgto fisico...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "fazer_frente_com", label: "Fazer frente com", type: "relation", ...commonRelationFields.cultura },
      { key: "safra", label: "Safra", type: "relation", ...commonRelationFields.safra },
      { key: "classificacao", label: "Classificacao" },
      { key: "volume", label: "Volume", type: "number" },
      { key: "unidade", label: "Unidade" },
      { key: "data_pagamento", label: "Data pagamento", type: "date" },
      { key: "contraparte", label: "Contraparte", type: "relation", ...commonRelationFields.contraparte },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      { name: "fazer_frente_com", label: "Fazer frente com", ...commonRelationFields.cultura, optional: true },
      { name: "safra", label: "Safra", ...commonRelationFields.safra, optional: true },
      { name: "classificacao", label: "Classificacao", type: "select", options: physicalPaymentClassificationOptions },
      { name: "volume", label: "Volume", type: "number" },
      { name: "unidade", label: "Unidade", ...catalogSelectFields.unidade },
      { name: "data_pagamento", label: "Data pagamento", type: "date" },
      { name: "descricao", label: "Descricao", type: "textarea" },
      { name: "obs", label: "Obs", type: "textarea", optional: true },
      {
        name: "contraparte",
        label: "Contraparte",
        ...commonRelationFields.contraparte,
        optional: true,
        filterByCurrent: {
          grupo: "grupo",
        },
      },
    ],
  },
  cashPayments: {
    resource: "cash-payments",
    title: "Empréstimos",
    description: "Empréstimos com grupo, subgrupo, descricao, contraparte em texto, valor, moeda, vencimento, pagamento e status.",
    searchPlaceholder: "Buscar empréstimo...",
    columns: [
      { key: "grupo", label: "Grupo", type: "relation", ...commonRelationFields.grupo },
      { key: "subgrupo", label: "Subgrupo", type: "relation", ...commonRelationFields.subgrupo },
      { key: "descricao", label: "Descricao" },
      { key: "contraparte_texto", label: "Contraparte" },
      { key: "valor", label: "Valor", type: "number" },
      { key: "moeda", label: "Moeda" },
      { key: "data_vencimento", label: "Data vencimento", type: "date" },
      { key: "data_pagamento", label: "Data pagamento", type: "date" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "grupo", label: "Grupo", ...commonRelationFields.grupo, optional: true },
      {
        name: "subgrupo",
        label: "Subgrupo",
        ...commonRelationFields.subgrupo,
        optional: true,
        filterByCurrent: { grupo: "grupo" },
      },
      { name: "descricao", label: "Descricao", type: "textarea" },
      { name: "contraparte_texto", label: "Contraparte", type: "text", optional: true },
      { name: "valor", label: "Valor", type: "number" },
      { name: "moeda", label: "Moeda", ...catalogSelectFields.moeda },
      { name: "data_vencimento", label: "Data vencimento", type: "date", optional: true },
      { name: "data_pagamento", label: "Data pagamento", type: "date", optional: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Pendente", label: "Pendente" },
          { value: "Pago", label: "Pago" },
        ],
      },
      { name: "obs", label: "Obs", type: "textarea", optional: true },
    ],
  },
  accountsPayable: {
    resource: "accounts-payable",
    title: "Contas a Pagar",
    description: "Controle de contas a pagar do sistema.",
    searchPlaceholder: "Buscar conta a pagar...",
    columns: [
      { key: "descricao", label: "Descricao" },
      { key: "empresa", label: "Empresa origem" },
      { key: "conta_origem", label: "Conta origem" },
      { key: "status", label: "Status" },
      { key: "data_vencimento", label: "Data Vencimento", type: "date" },
      { key: "data_pagamento", label: "Data Pagamento", type: "date" },
      { key: "valor_total", label: "Valor Total (R$)", type: "number" },
    ],
    fields: [
      { name: "descricao", label: "Descricao" },
      { name: "valor_total", label: "Valor Total (R$)", type: "number" },
      { name: "empresa", label: "Empresa origem", type: "select", options: accountsPayableEmpresaOptions },
      { name: "conta_origem", label: "Conta origem", type: "select", options: accountsPayableContaOrigemOptions, optional: true },
      { name: "data_vencimento", label: "Data Vencimento", type: "date", optional: true },
      { name: "data_pagamento", label: "Data Pagamento", type: "date", optional: true },
      { name: "status", label: "Status", type: "select", options: accountsPayableStatusOptions },
      { name: "obs", label: "Observacoes", type: "textarea", optional: true },
      { name: "attachments", label: "Anexos", type: "file-multi", optional: true },
    ],
  },
  logs: {
    resource: "audit-logs",
    title: "Log",
    description: "Registro de criacoes, alteracoes e exclusoes dos formularios.",
    readonly: true,
    allowDelete: true,
    allowCreate: false,
    allowDuplicate: false,
    searchPlaceholder: "Buscar formulario, usuario ou descricao...",
    requireFiltersBeforeLoad: true,
    columns: [
      { key: "formulario", label: "Formulario" },
      { key: "object_id", label: "ID alterado" },
      { key: "usuario", label: "Alterado por" },
      { key: "action", label: "Acao" },
      { key: "description", label: "Descricao" },
      { key: "created_at_display", label: "Data e hora" },
    ],
    fields: [],
    detailFields: [
      { name: "formulario", label: "Formulario" },
      { name: "object_id", label: "ID alterado" },
      { name: "usuario", label: "Alterado por" },
      { name: "action", label: "Acao" },
      { name: "created_at_display", label: "Data e hora" },
      { name: "id", label: "ID do log" },
      { name: "description", label: "Descricao", type: "textarea" },
    ],
  },
  users: {
    resource: "users",
    title: "Usuarios",
    description: "Gestao de usuarios do sistema, incluindo grupos e subgrupos atribuidos.",
    searchPlaceholder: "Buscar usuario, nome ou email...",
    columns: [
      { key: "username", label: "Usuario" },
      { key: "full_name", label: "Nome completo" },
      { key: "email", label: "Email" },
      { key: "tenant_name", label: "Perfil / tenant" },
      { key: "carteira_name", label: "Carteira" },
      { key: "role", label: "Perfil" },
      { key: "access_status", label: "Status" },
      { key: "is_active", label: "Ativo" },
    ],
    fields: [
      { name: "tenant", label: "Tenant", type: "relation", resource: "tenants", labelKey: "name", optional: true, section: "Usuario" },
      { name: "access_status", label: "Status", type: "select", options: accessStatusOptions, section: "Usuario" },
      {
        name: "master_user",
        label: "Carteira",
        type: "relation",
        resource: "users",
        resources: ["users", "tenants"],
        labelKey: "full_name",
        optional: true,
        section: "Usuario",
        visibleWhen: {
          predicate: (values, lookupOptions) => {
            const tenantId = values.tenant;
            const tenants = lookupOptions?.tenants || [];
            const selectedTenant = tenants.find((item) => String(item.id) === String(tenantId));
            return Boolean(selectedTenant?.requires_master_user || selectedTenant?.slug === "usuario");
          },
        },
      },
      { name: "role", label: "Perfil", type: "select", options: userRoleOptions, section: "Usuario" },
      { name: "username", label: "Usuario", section: "Usuario" },
      { name: "full_name", label: "Nome completo", section: "Usuario" },
      { name: "email", label: "Email", type: "email", section: "Usuario" },
      { name: "phone", label: "Telefone", section: "Usuario" },
      { name: "cpf", label: "CPF", section: "Usuario" },
      { name: "cep", label: "CEP", section: "Usuario" },
      { name: "estado", label: "Estado", section: "Usuario" },
      { name: "cidade", label: "Cidade", section: "Usuario" },
      { name: "endereco_completo", label: "Endereco completo", type: "textarea", optional: true, section: "Usuario" },
      { name: "password", label: "Senha", type: "password", optional: true, helpText: "Preencha para definir ou alterar a senha do usuario.", section: "Usuario" },
      { name: "scope_access_level", label: "Nivel de acesso", type: "select", options: scopeAccessLevelOptions, section: "Acesso" },
      {
        name: "accessible_groups",
        label: "Grupos",
        type: "multirelation",
        resource: "groups",
        labelKey: "grupo",
        displayField: "accessible_groups_display",
        dualList: true,
        searchPlaceholder: "Buscar grupo",
        optional: true,
        section: "Acesso",
      },
      {
        name: "accessible_subgroups",
        label: "Subgrupos",
        type: "multirelation",
        resource: "subgroups",
        labelKey: "subgrupo",
        displayField: "accessible_subgroups_display",
        dualList: true,
        searchPlaceholder: "Buscar subgrupo",
        optional: true,
        section: "Acesso",
      },
      { name: "max_admin_invitations", label: "Numero de convites", type: "number", optional: true, section: "Usuario" },
      { name: "max_owned_groups", label: "Maximo de grupos", type: "number", optional: true, section: "Usuario" },
      { name: "max_owned_subgroups", label: "Maximo de subgrupos", type: "number", optional: true, section: "Usuario" },
      { name: "active_admin_invitations_count", label: "Convites admin ativos", type: "number", readOnly: true, section: "Acompanhamento" },
      { name: "owned_groups_count", label: "Grupos cadastrados", type: "number", readOnly: true, section: "Acompanhamento" },
      { name: "owned_subgroups_count", label: "Subgrupos cadastrados", type: "number", readOnly: true, section: "Acompanhamento" },
      { name: "dashboard_filter", label: "Dashboard filter", type: "json", optional: true, section: "Sistema" },
      { name: "created_at", label: "Criado em", readOnly: true, section: "Sistema" },
    ],
  },
  adminInvitations: {
    resource: "admin-invitations",
    title: "Convites (Admin)",
    description: "Envie convites administrativos para novos usuarios.",
    searchPlaceholder: "Buscar convite por email ou tenant...",
    submitLabel: "Enviar convite",
    allowEdit: false,
    allowDuplicate: false,
    columns: [
      { key: "target_tenant_name", label: "Tenant" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status" },
      { key: "accepted_user_name", label: "Usuario criado" },
      { key: "invite_url", label: "Link do convite" },
    ],
    fields: adminInvitationBaseFields,
    editFields: adminInvitationBaseFields,
  },
  leads: {
    resource: "leads",
    title: "Leads",
    description: "Leads capturados pelas landing pages.",
    searchPlaceholder: "Buscar lead por nome, email ou empresa...",
    allowCreate: false,
    allowEdit: false,
    allowDuplicate: false,
    allowDelete: false,
    columns: [
      { key: "nome", label: "Nome" },
      { key: "email", label: "Email" },
      { key: "whatsapp", label: "WhatsApp", type: "phone" },
      { key: "perfil", label: "Perfil" },
      { key: "empresa_atual", label: "Empresa" },
      { key: "trabalho_ocupacao_atual", label: "Ocupação" },
      { key: "objetivo", label: "Objetivo" },
      { key: "landing_page", label: "Landing Page" },
      { key: "data", label: "Data", type: "datetime" },
      { key: "mensagem", label: "Mensagem" },
    ],
    fields: [
      { name: "nome", label: "Nome", readOnly: true },
      { name: "email", label: "Email", type: "email", readOnly: true },
      { name: "whatsapp", label: "WhatsApp", readOnly: true },
      { name: "perfil", label: "Perfil", readOnly: true },
      { name: "empresa_atual", label: "Empresa", readOnly: true },
      { name: "trabalho_ocupacao_atual", label: "Ocupação", readOnly: true },
      { name: "objetivo", label: "Objetivo", readOnly: true },
      { name: "landing_page", label: "Landing Page", readOnly: true },
      { name: "mensagem", label: "Mensagem", type: "textarea", readOnly: true },
      { name: "data", label: "Data", readOnly: true },
    ],
  },
};

export const resourceDefinitions = Object.fromEntries(
  Object.entries(baseResourceDefinitions).map(([key, definition]) => [
    key,
    {
      ...definition,
      columns: definition.columns ? orderDefinitionEntries(definition.columns, "key") : definition.columns,
      fields: definition.fields ? orderDefinitionEntries(definition.fields, "name") : definition.fields,
    },
  ]),
);
