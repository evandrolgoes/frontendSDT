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
  { value: "insights_commercialization", label: "Insights: Comercializacao" },
  { value: "market_fund_positions", label: "Mercado: Posição de Fundos" },
  { value: "market_quotes", label: "Mercado: Cotações" },
  { value: "market_blog_news", label: "Mercado: Blog/News" },
  { value: "market_exports", label: "Mercado: Exportações" },
  { value: "market_basis", label: "Mercado: Basis" },
  { value: "market_interest_rates", label: "Mercado: Taxa de Juros" },
  { value: "market_others", label: "Mercado: Outros" },
  { value: "cad_groups", label: "Cadastro: Grupos" },
  { value: "cad_subgroups", label: "Cadastro: Subgrupos" },
  { value: "cad_counterparties", label: "Cadastro: Contrapartes" },
  { value: "cad_anotacoes", label: "Cadastro: Anotacoes" },
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
  { value: "sys_crops", label: "Sistema: Ativos" },
  { value: "sys_currencies", label: "Sistema: Moedas" },
  { value: "sys_units", label: "Sistema: Unidades" },
  { value: "sys_price_units", label: "Sistema: Moeda/Unidade" },
  { value: "sys_exchanges", label: "Sistema: Bolsas" },
  { value: "sys_derivative_operation_names", label: "Sistema: Nome Operações Derivativos" },
  { value: "sys_seasons", label: "Sistema: Safras" },
  { value: "sys_receipt_entries", label: "Sistema: Entradas recebimentos" },
  { value: "sys_users", label: "Sistema: Usuários" },
  { value: "sys_admin_invites", label: "Sistema: Convites Admin" },
  { value: "sys_accounts_payable", label: "Sistema: Contas a Pagar" },
  { value: "sys_logs", label: "Sistema: Logs" },
  { value: "sys_json_import", label: "Sistema: Importador JSON" },
  { value: "sys_copy_base", label: "Sistema: Copy Base" },
  { value: "sys_mass_update", label: "Sistema: Alteracao em Massa" },
  { value: "tool_market_summary", label: "Ferramentas: Criar Resumo de Mercado" },
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
  if (allowedUserTypes.includes("admin_tenant")) {
    return user?.tenant_slug === "admin" && ["owner", "manager"].includes(user?.role);
  }
  if (allowedUserTypes.includes("invitation_tenants")) {
    return Boolean(user?.tenant_can_send_invitations) && ["owner", "manager"].includes(user?.role);
  }
  if (allowedUserTypes.includes("tenant_can_manage_groups")) {
    return Boolean(user?.tenant_can_register_groups) && ["owner", "manager"].includes(user?.role);
  }
  if (allowedUserTypes.includes("tenant_can_manage_subgroups")) {
    return Boolean(user?.tenant_can_register_subgroups) && ["owner", "manager"].includes(user?.role);
  }
  if (allowedUserTypes.includes("tenant_admin")) {
    return ["owner", "manager"].includes(user?.role);
  }
  return false;
}
