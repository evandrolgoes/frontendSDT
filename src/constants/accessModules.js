export const moduleOptions = [
  { value: "dashboard_summary", label: "Dashboard: Resumo" },
  { value: "dashboard_cashflow", label: "Dashboard: Fluxo de Caixa" },
  { value: "dashboard_strategies_triggers", label: "Dashboard: Estratégias e Gatilhos" },
  { value: "dashboard_hedge_policy", label: "Dashboard: Política de Hedge" },
  { value: "dashboard_price_composition", label: "Dashboard: Composição de Preços" },
  { value: "dashboard_component_sales", label: "Dashboard: Venda de Componentes" },
  { value: "dashboard_currency_exposure", label: "Dashboard: Exposição e Hedge Cambial" },
  { value: "dashboard_simulations", label: "Dashboard: Simulações" },
  { value: "dashboard_mtm", label: "Dashboard: MTM" },
  { value: "cad_groups", label: "Cadastro: Grupos" },
  { value: "cad_subgroups", label: "Cadastro: Subgrupos" },
  { value: "cad_counterparties", label: "Cadastro: Contrapartes" },
  { value: "ops_physical_quotes", label: "Operações: Cotações Físico" },
  { value: "ops_budget_costs", label: "Operações: Custo Orçamento" },
  { value: "ops_actual_costs", label: "Operações: Custo Realizado" },
  { value: "ops_physical_payments", label: "Operações: Pgtos Físico" },
  { value: "ops_cash_payments", label: "Operações: Pgtos Caixa" },
  { value: "ops_derivatives", label: "Operações: Derivativos" },
  { value: "ops_strategies", label: "Operações: Estratégias" },
  { value: "ops_triggers", label: "Operações: Gatilhos" },
  { value: "ops_hedge_policies", label: "Operações: Política de Hedge" },
  { value: "ops_crop_boards", label: "Operações: Quadro Safra" },
  { value: "ops_physical_sales", label: "Operações: Vendas Físico" },
  { value: "sys_tenants", label: "Sistema: Tenants" },
  { value: "sys_crops", label: "Sistema: Culturas" },
  { value: "sys_currencies", label: "Sistema: Moedas" },
  { value: "sys_units", label: "Sistema: Unidades" },
  { value: "sys_price_units", label: "Sistema: Moeda/Unidade" },
  { value: "sys_exchanges", label: "Sistema: Bolsas" },
  { value: "sys_derivative_operation_names", label: "Sistema: Nome Operações Derivativos" },
  { value: "sys_seasons", label: "Sistema: Safras" },
  { value: "sys_users", label: "Sistema: Usuários" },
  { value: "sys_invites", label: "Sistema: Convites" },
  { value: "sys_logs", label: "Sistema: Logs" },
  { value: "sys_json_import", label: "Sistema: Importador JSON" },
];

export const allModuleCodes = moduleOptions.map((option) => option.value);

export function hasModuleAccess(user, moduleCode) {
  if (!moduleCode) return true;
  if (user?.is_superuser) return true;
  const effectiveModules = Array.isArray(user?.effective_modules) ? user.effective_modules : [];
  return effectiveModules.includes(moduleCode);
}

export function hasUserTypeAccess(user, allowedUserTypes) {
  if (!allowedUserTypes?.length) return true;
  if (user?.is_superuser) return true;
  return allowedUserTypes.includes(user?.user_type);
}
