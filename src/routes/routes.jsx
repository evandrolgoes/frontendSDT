import { DashboardPage } from "../pages/DashboardPage";
import { DerivativeOperationsPage } from "../pages/DerivativeOperationsPage";
import { JsonImportPage } from "../pages/JsonImportPage";
import { MassUpdatePage } from "../pages/MassUpdatePage";
import { MercadoPage } from "../pages/MercadoPage";
import { MarketNewsPage } from "../pages/MarketNewsPage";
import { PriceCompositionNovoPage } from "../pages/PriceCompositionNovoPage";
import { ResourcePage } from "../pages/ResourcePage";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";
import { hasModuleAccess, hasUserTypeAccess } from "../constants/accessModules";
import { matchPath } from "react-router-dom";

const baseNavigationSections = [
  {
    label: "Dashboard",
    items: [
      { path: "/dashboard/kpis-risco-comercial", label: "Resumo", module: "dashboard_summary" },
      { path: "/dashboard/fluxo-caixa", label: "Fluxo de Caixa", module: "dashboard_cashflow" },
      { path: "/dashboard/estrategias-gatilhos", label: "Estratégias e Gatilhos", module: "dashboard_strategies_triggers" },
      { path: "/dashboard/politica-hedge", label: "Politica de Hedge", module: "dashboard_hedge_policy" },
      { path: "/dashboard/composicao-precos", label: "Composicao de Precos", module: "dashboard_price_composition" },
      { path: "/dashboard/venda-componentes", label: "Venda de Componentes", module: "dashboard_component_sales" },
      { path: "/dashboard/exposicao-hedge-cambial", label: "Exposição e Hedge cambial", module: "dashboard_currency_exposure" },
      { path: "/dashboard/simulacoes", label: "Simulacoes", module: "dashboard_simulations" },
      { path: "/dashboard/mtm", label: "MTM", module: "dashboard_mtm" },
    ],
  },
  {
    label: "Operacoes",
    items: [
      { path: "/vendas-fisico", label: "Vendas Fisico", module: "ops_physical_sales" },
      { path: "/derivativos", label: "Derivativos", module: "ops_derivatives" },
      { path: "/pgtos-fisico", label: "Pgtos Fisico", module: "ops_physical_payments" },
      { path: "/pgtos-caixa", label: "Pgtos Caixa", module: "ops_cash_payments" },
      { path: "/estrategias", label: "Estrategias", module: "ops_strategies" },
      { path: "/gatilhos", label: "Gatilhos", module: "ops_triggers" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { path: "/grupos", label: "Grupo", module: "cad_groups", allowedUserTypes: ["tenant_can_manage_groups"] },
      { path: "/subgrupos", label: "Subgrupo", module: "cad_subgroups", allowedUserTypes: ["tenant_can_manage_subgroups"] },
      { path: "/contrapartes", label: "Contrapartes", module: "cad_counterparties" },
      { path: "/politica-hedge", label: "Politica de Hedge", module: "ops_hedge_policies" },
      { path: "/quadro-safra", label: "Quadro Safra", module: "ops_crop_boards" },
      { path: "/cotacoes-fisico", label: "Cotacoes Fisico", module: "ops_physical_quotes" },
      { path: "/custo-orcamento", label: "Custo Orcamento", module: "ops_budget_costs" },
      { path: "/custo-realizado", label: "Custo Realizado", module: "ops_actual_costs" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { path: "/tenants", label: "Tenants", module: "sys_tenants", superuserOnly: true },
      { path: "/culturas", label: "Ativo", module: "sys_crops", superuserOnly: true },
      { path: "/moedas", label: "Moeda", module: "sys_currencies", superuserOnly: true },
      { path: "/unidades", label: "Unidade", module: "sys_units", superuserOnly: true },
      { path: "/moeda-unidade", label: "Moeda/Unidade", module: "sys_price_units", superuserOnly: true },
      { path: "/bolsas", label: "Bolsa", module: "sys_exchanges", superuserOnly: true },
      { path: "/nomes-operacoes-derivativos", label: "Nome Operacoes Derivativos", module: "sys_derivative_operation_names", superuserOnly: true },
      { path: "/safras", label: "Safra", module: "sys_seasons", superuserOnly: true },
      { path: "/usuarios", label: "Usuarios", module: "sys_users", allowedUserTypes: ["tenant_admin"] },
      { path: "/convites-e-acessos", label: "Convites e acessos", module: "sys_invites", allowedUserTypes: ["tenant_admin"] },
      { path: "/convites-admin", label: "Convites (Admin)", module: "sys_admin_invites", allowedUserTypes: ["invitation_tenants"] },
      { path: "/logs", label: "Log", module: "sys_logs" },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { path: "/alteracao-em-massa", label: "Alteracao em Massa", module: "sys_mass_update", superuserOnly: true },
      { path: "/importador-json", label: "Importador JSON", module: "sys_json_import", superuserOnly: true },
    ],
  },
  {
    label: "Mercado",
    items: [
      { path: "/mercado/blog-news", label: "Blog/News", module: "market_blog_news" },
      { path: "/mercado/cotacoes", label: "Cotacoes", module: "market_quotes" },
      { path: "/mercado/posicao-de-fundos", label: "Posicao de Fundos", module: "market_fund_positions" },
      { path: "/mercado/exportacoes", label: "Exportacoes", module: "market_exports" },
      { path: "/mercado/basis", label: "Basis", module: "market_basis" },
      { path: "/mercado/taxa-de-juros", label: "Taxa de Juros", module: "market_interest_rates" },
      { path: "/mercado/outros", label: "Outros", module: "market_others" },
    ],
  },
];

const navigationItems = baseNavigationSections.flatMap((section) => section.items);

export function getNavigationSections(user) {
  return baseNavigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.superuserOnly || user?.is_superuser) &&
          hasModuleAccess(user, item.module) &&
          hasUserTypeAccess(user, item.allowedUserTypes),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export const appRoutes = [
  { path: "/dashboard", element: <DashboardPage kind="commercialRisk" />, module: "dashboard_summary", title: "Resumo" },
  { path: "/dashboard/fluxo-caixa", element: <DashboardPage kind="cashflow" />, module: "dashboard_cashflow" },
  { path: "/dashboard/kpis-risco-comercial", element: <DashboardPage kind="commercialRisk" />, module: "dashboard_summary" },
  { path: "/dashboard/estrategias-gatilhos", element: <DashboardPage kind="strategiesTriggers" />, module: "dashboard_strategies_triggers" },
  { path: "/dashboard/politica-hedge", element: <DashboardPage kind="hedgePolicy" />, module: "dashboard_hedge_policy" },
  { path: "/dashboard/composicao-precos", element: <PriceCompositionNovoPage />, module: "dashboard_price_composition" },
  { path: "/dashboard/venda-componentes", element: <DashboardPage kind="componentSales" />, module: "dashboard_component_sales" },
  { path: "/dashboard/exposicao-hedge-cambial", element: <DashboardPage kind="currencyExposure" />, module: "dashboard_currency_exposure" },
  { path: "/dashboard/simulacoes", element: <DashboardPage kind="simulations" />, module: "dashboard_simulations" },
  { path: "/dashboard/mtm", element: <DashboardPage kind="mtm" />, module: "dashboard_mtm" },
  { path: "/mercado", element: <MercadoPage kind="fundPositions" />, module: "market_fund_positions", title: "Posicao de Fundos" },
  { path: "/mercado/posicao-de-fundos", element: <MercadoPage kind="fundPositions" />, module: "market_fund_positions" },
  { path: "/mercado/cotacoes", element: <ResourcePage key="market-quotes" definition={resourceDefinitions.tradingviewWatchlistQuotes} />, module: "market_quotes" },
  { path: "/mercado/blog-news", element: <MarketNewsPage />, module: "market_blog_news" },
  { path: "/mercado/blog-news/:postId", element: <MarketNewsPage />, module: "market_blog_news", title: "Blog/News" },
  { path: "/mercado/exportacoes", element: <MercadoPage kind="exports" />, module: "market_exports" },
  { path: "/mercado/basis", element: <MercadoPage kind="basis" />, module: "market_basis" },
  { path: "/mercado/taxa-de-juros", element: <MercadoPage kind="interestRates" />, module: "market_interest_rates" },
  { path: "/mercado/outros", element: <MercadoPage kind="others" />, module: "market_others" },
  { path: "/tenants", element: <ResourcePage key="tenants" definition={resourceDefinitions.tenants} />, module: "sys_tenants", superuserOnly: true },
  { path: "/grupos", element: <ResourcePage key="groups" definition={resourceDefinitions.groups} />, module: "cad_groups" },
  { path: "/subgrupos", element: <ResourcePage key="subgroups" definition={resourceDefinitions.subgroups} />, module: "cad_subgroups" },
  { path: "/culturas", element: <ResourcePage key="crops" definition={resourceDefinitions.crops} />, module: "sys_crops", superuserOnly: true },
  { path: "/moedas", element: <ResourcePage key="currencies" definition={resourceDefinitions.currencies} />, module: "sys_currencies", superuserOnly: true },
  { path: "/unidades", element: <ResourcePage key="units" definition={resourceDefinitions.units} />, module: "sys_units", superuserOnly: true },
  { path: "/moeda-unidade", element: <ResourcePage key="price-units" definition={resourceDefinitions.priceUnits} />, module: "sys_price_units", superuserOnly: true },
  { path: "/bolsas", element: <ResourcePage key="exchanges" definition={resourceDefinitions.exchanges} />, module: "sys_exchanges", superuserOnly: true },
  { path: "/nomes-operacoes-derivativos", element: <ResourcePage key="derivative-operation-names" definition={resourceDefinitions.derivativeOperationNames} />, module: "sys_derivative_operation_names", superuserOnly: true },
  { path: "/safras", element: <ResourcePage key="seasons" definition={resourceDefinitions.seasons} />, module: "sys_seasons", superuserOnly: true },
  { path: "/contrapartes", element: <ResourcePage key="counterparties" definition={resourceDefinitions.counterparties} />, module: "cad_counterparties" },
  { path: "/cotacoes-fisico", element: <ResourcePage key="physical-quotes" definition={resourceDefinitions.physicalQuotes} />, module: "ops_physical_quotes" },
  { path: "/tradingview-experimental", element: <ResourcePage key="tradingview-watchlist-quotes" definition={resourceDefinitions.tradingviewWatchlistQuotes} /> },
  { path: "/custo-orcamento", element: <ResourcePage key="budget-costs" definition={resourceDefinitions.budgetCosts} />, module: "ops_budget_costs" },
  { path: "/custo-realizado", element: <ResourcePage key="actual-costs" definition={resourceDefinitions.actualCosts} />, module: "ops_actual_costs" },
  { path: "/pgtos-fisico", element: <ResourcePage key="physical-payments" definition={resourceDefinitions.physicalPayments} />, module: "ops_physical_payments" },
  { path: "/pgtos-caixa", element: <ResourcePage key="cash-payments" definition={resourceDefinitions.cashPayments} />, module: "ops_cash_payments" },
  { path: "/derivativos", element: <DerivativeOperationsPage />, module: "ops_derivatives" },
  { path: "/estrategias", element: <ResourcePage key="strategies" definition={resourceDefinitions.strategies} />, module: "ops_strategies" },
  { path: "/gatilhos", element: <ResourcePage key="strategy-triggers" definition={resourceDefinitions.strategyTriggers} />, module: "ops_triggers" },
  { path: "/politica-hedge", element: <ResourcePage key="hedge-policies" definition={resourceDefinitions.hedgePolicies} />, module: "ops_hedge_policies" },
  { path: "/quadro-safra", element: <ResourcePage key="crop-boards" definition={resourceDefinitions.cropBoards} />, module: "ops_crop_boards" },
  { path: "/vendas-fisico", element: <ResourcePage key="physical-sales" definition={resourceDefinitions.physicalSales} />, module: "ops_physical_sales" },
  {
    path: "/usuarios",
    element: <ResourcePage key="users" definition={resourceDefinitions.users} />,
    module: "sys_users",
    allowedUserTypes: ["tenant_admin"],
  },
  {
    path: "/convites-e-acessos",
    element: <ResourcePage key="invite-access" definition={resourceDefinitions.inviteAccess} />,
    module: "sys_invites",
    allowedUserTypes: ["tenant_admin"],
  },
  {
    path: "/convites-admin",
    element: <ResourcePage key="admin-invitations" definition={resourceDefinitions.adminInvitations} />,
    module: "sys_admin_invites",
    allowedUserTypes: ["invitation_tenants"],
  },
  { path: "/logs", element: <ResourcePage key="logs" definition={resourceDefinitions.logs} />, module: "sys_logs" },
  { path: "/alteracao-em-massa", element: <MassUpdatePage />, module: "sys_mass_update", superuserOnly: true },
  { path: "/importador-json", element: <JsonImportPage />, module: "sys_json_import", superuserOnly: true },
];

export function getAccessibleRoutePath(user) {
  const firstSection = getNavigationSections(user)[0];
  return firstSection?.items?.[0]?.path || "/dashboard/kpis-risco-comercial";
}

export function getRouteDefinition(pathname) {
  return appRoutes.find((route) => Boolean(matchPath({ path: route.path, end: true }, pathname))) || null;
}

export function getRouteTitle(pathname) {
  const route = getRouteDefinition(pathname);
  if (!route) {
    return null;
  }

  if (route.title) {
    return route.title;
  }

  return navigationItems.find((item) => item.path === route.path)?.label || null;
}

export function getSystemDocumentTitle(pathname) {
  const routeTitle = getRouteTitle(pathname);
  return routeTitle ? `Hedge Position - ${routeTitle}` : "Hedge Position";
}
