import { lazy } from "react";
import { hasModuleAccess, hasUserTypeAccess } from "../constants/accessModules";
import { matchPath, Navigate } from "react-router-dom";
import { resourceService } from "../services/resourceService";

const loadDashboardPageModule = () => import("../pages/DashboardPage");
const loadDerivativeOperationsPageModule = () => import("../pages/DerivativeOperationsPage");
const loadAnotacoesPageModule = () => import("../pages/AnotacoesPage");
const loadJsonImportPageModule = () => import("../pages/JsonImportPage");
const loadCopyBasePageModule = () => import("../pages/CopyBasePage");
const loadMassImportPageModule = () => import("../pages/MassImportPage");
const loadMassUpdatePageModule = () => import("../pages/MassUpdatePage");
const loadMercadoPageModule = () => import("../pages/MercadoPage");
const loadMarketNewsPageModule = () => import("../pages/MarketNewsPage");
const loadInsightsPageModule = () => import("../pages/InsightsPage");
const loadResourcePageModule = () => import("../pages/ResourcePage");
const loadResourceDefinitionsModule = () => import("../modules/resourceDefinitions.jsx");

const lazyNamedExport = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

const lazyResourcePage = (definitionKey) =>
  lazy(() =>
    Promise.all([loadResourcePageModule(), loadResourceDefinitionsModule()]).then(([pageModule, definitionsModule]) => ({
      default: function LazyResourcePage(props) {
        return <pageModule.ResourcePage {...props} definition={definitionsModule.resourceDefinitions[definitionKey]} />;
      },
    })),
  );

const DashboardPage = lazyNamedExport(loadDashboardPageModule, "DashboardPage");
const DerivativeOperationsPage = lazyNamedExport(loadDerivativeOperationsPageModule, "DerivativeOperationsPage");
const AnotacoesPage = lazyNamedExport(loadAnotacoesPageModule, "AnotacoesPage");
const JsonImportPage = lazyNamedExport(loadJsonImportPageModule, "JsonImportPage");
const CopyBasePage = lazyNamedExport(loadCopyBasePageModule, "CopyBasePage");
const MassImportPage = lazyNamedExport(loadMassImportPageModule, "MassImportPage");
const MassUpdatePage = lazyNamedExport(loadMassUpdatePageModule, "MassUpdatePage");
const MercadoPage = lazyNamedExport(loadMercadoPageModule, "MercadoPage");
const MarketNewsPage = lazyNamedExport(loadMarketNewsPageModule, "MarketNewsPage");
const InsightsPage = lazyNamedExport(loadInsightsPageModule, "InsightsPage");
const warmResources = (...resources) => Promise.all(resources.map((resource) => resourceService.listAll(resource).catch(() => [])));
const warmTradingviewQuotes = () => resourceService.listTradingviewQuotes().catch(() => []);
const warmMarketNewsCategories = () => resourceService.listMarketNewsCategories().catch(() => []);
const SHEETY_QUOTES_URL = "https://api.sheety.co/90083751cf0794f44c9730c96a94cedf/apiCotacoesSpotGetBubble/planilha1";

const warmDashboardKind = (kind) => {
  switch (kind) {
    case "cashflow":
      return warmResources("physical-sales", "cash-payments", "derivative-operations", "counterparties");
    case "componentSales":
      return warmResources("physical-sales", "derivative-operations", "counterparties");
    case "commercialRisk":
      return resourceService.getCommercialRiskSummary().catch(() => null);
    case "strategiesTriggers":
      return warmResources("strategies", "strategy-triggers");
    case "simulations":
      return Promise.all([
        warmResources("physical-quotes", "physical-sales", "hedge-policies", "budget-costs", "derivative-operations"),
        warmTradingviewQuotes(),
      ]);
    case "hedgePolicy":
      return Promise.all([
        warmResources("hedge-policies", "physical-sales", "physical-payments", "derivative-operations", "budget-costs", "crop-boards"),
        resourceService.fetchJsonCached("sheety-cotacoes-spot", SHEETY_QUOTES_URL).catch(() => ({ planilha1: [] })),
      ]);
    case "currencyExposure":
      return warmResources("crop-boards", "physical-payments", "cash-payments", "physical-sales", "derivative-operations", "physical-quotes");
    case "priceComposition":
      return warmResources("physical-sales", "derivative-operations", "crop-boards", "physical-quotes");
    default:
      return Promise.resolve();
  }
};

const dashboardRoute = (path, kind, module, extra = {}) => {
  const { pageProps, ...routeExtra } = extra;
  return {
    path,
    element: <DashboardPage kind={kind} {...(pageProps || {})} />,
    module,
    preload: loadDashboardPageModule,
    warmup: () => warmDashboardKind(kind),
    ...routeExtra,
  };
};

const resourceRoute = (path, definitionKey, resource, extra = {}) => {
  const ResourceComponent = lazyResourcePage(definitionKey);
  return {
    path,
    element: <ResourceComponent />,
    preload: () => Promise.all([loadResourcePageModule(), loadResourceDefinitionsModule()]),
    warmup: resource ? () => resourceService.listAll(resource).catch(() => []) : undefined,
    ...extra,
  };
};

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
    label: "Insights",
    items: [
      { path: "/insights/comercializacao", label: "Comercializacao", module: "insights_commercialization" },
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
      { path: "/anotacoes", label: "Anotacoes", module: "cad_anotacoes" },
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
      { path: "/entradas-recebimentos", label: "Entradas recebimentos", module: "sys_receipt_entries", superuserOnly: true },
      { path: "/usuarios", label: "Usuarios", module: "sys_users", allowedUserTypes: ["tenant_admin"] },
      { path: "/convites-e-acessos", label: "Convites e acessos", module: "sys_invites", allowedUserTypes: ["tenant_admin"] },
      { path: "/convites-admin", label: "Convites (Admin)", module: "sys_admin_invites", allowedUserTypes: ["invitation_tenants"] },
      { path: "/contas-a-pagar", label: "Contas a Pagar", module: "sys_accounts_payable" },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { path: "/logs", label: "Log", module: "sys_logs" },
      { path: "/importacao-em-massa", label: "Importacao em Massa", module: "sys_mass_update", superuserOnly: true },
      { path: "/alteracao-em-massa", label: "Alteracao em Massa", module: "sys_mass_update", superuserOnly: true },
      { path: "/importador-json", label: "Importador JSON", module: "sys_json_import", superuserOnly: true },
      { path: "/copy-base", label: "Copy Base", module: "sys_copy_base", superuserOnly: true },
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
  {
    path: "/dashboard",
    element: <Navigate to="/dashboard/kpis-risco-comercial" replace />,
    module: "dashboard_summary",
    title: "Resumo",
    preload: loadDashboardPageModule,
    warmup: () => warmDashboardKind("commercialRisk"),
  },
  dashboardRoute("/dashboard/fluxo-caixa", "cashflow", "dashboard_cashflow"),
  dashboardRoute("/dashboard/kpis-risco-comercial", "commercialRisk", "dashboard_summary"),
  dashboardRoute("/dashboard/estrategias-gatilhos", "strategiesTriggers", "dashboard_strategies_triggers"),
  dashboardRoute("/dashboard/politica-hedge", "hedgePolicy", "dashboard_hedge_policy"),
  dashboardRoute("/dashboard/composicao-precos", "priceComposition", "dashboard_price_composition", {
    pageProps: { chartEngine: "echarts" },
  }),
  dashboardRoute("/dashboard/venda-componentes", "componentSales", "dashboard_component_sales"),
  dashboardRoute("/dashboard/exposicao-hedge-cambial", "currencyExposure", "dashboard_currency_exposure"),
  dashboardRoute("/dashboard/simulacoes", "simulations", "dashboard_simulations"),
  dashboardRoute("/dashboard/mtm", "mtm", "dashboard_mtm"),
  {
    path: "/mercado",
    element: <MercadoPage kind="fundPositions" />,
    module: "market_fund_positions",
    title: "Posicao de Fundos",
    preload: loadMercadoPageModule,
  },
  { path: "/mercado/posicao-de-fundos", element: <MercadoPage kind="fundPositions" />, module: "market_fund_positions", preload: loadMercadoPageModule },
  { ...resourceRoute("/mercado/cotacoes", "tradingviewWatchlistQuotes", "tradingview-watchlist-quotes"), module: "market_quotes" },
  { path: "/mercado/blog-news", element: <MarketNewsPage />, module: "market_blog_news", preload: loadMarketNewsPageModule, warmup: warmMarketNewsCategories },
  { path: "/mercado/blog-news/:postId", element: <MarketNewsPage />, module: "market_blog_news", title: "Blog/News", preload: loadMarketNewsPageModule, warmup: warmMarketNewsCategories },
  { path: "/insights/comercializacao", element: <InsightsPage />, module: "insights_commercialization", preload: loadInsightsPageModule },
  { path: "/mercado/exportacoes", element: <MercadoPage kind="exports" />, module: "market_exports", preload: loadMercadoPageModule },
  { path: "/mercado/basis", element: <MercadoPage kind="basis" />, module: "market_basis", preload: loadMercadoPageModule },
  { path: "/mercado/taxa-de-juros", element: <MercadoPage kind="interestRates" />, module: "market_interest_rates", preload: loadMercadoPageModule },
  { path: "/mercado/outros", element: <MercadoPage kind="others" />, module: "market_others", preload: loadMercadoPageModule },
  { ...resourceRoute("/tenants", "tenants", "tenants"), module: "sys_tenants", superuserOnly: true },
  { ...resourceRoute("/grupos", "groups", "groups"), module: "cad_groups" },
  { ...resourceRoute("/subgrupos", "subgroups", "subgroups"), module: "cad_subgroups" },
  { ...resourceRoute("/culturas", "crops", "crops"), module: "sys_crops", superuserOnly: true },
  { ...resourceRoute("/moedas", "currencies", "currencies"), module: "sys_currencies", superuserOnly: true },
  { ...resourceRoute("/unidades", "units", "units"), module: "sys_units", superuserOnly: true },
  { ...resourceRoute("/moeda-unidade", "priceUnits", "price-units"), module: "sys_price_units", superuserOnly: true },
  { ...resourceRoute("/bolsas", "exchanges", "exchanges"), module: "sys_exchanges", superuserOnly: true },
  { ...resourceRoute("/nomes-operacoes-derivativos", "derivativeOperationNames", "derivative-operation-names"), module: "sys_derivative_operation_names", superuserOnly: true },
  { ...resourceRoute("/safras", "seasons", "seasons"), module: "sys_seasons", superuserOnly: true },
  { ...resourceRoute("/entradas-recebimentos", "receiptEntries", "receipt-entries"), module: "sys_receipt_entries", superuserOnly: true },
  { ...resourceRoute("/contrapartes", "counterparties", "counterparties"), module: "cad_counterparties" },
  { path: "/anotacoes", element: <AnotacoesPage />, module: "cad_anotacoes", preload: loadAnotacoesPageModule },
  { path: "/anotacoes/:postId", element: <AnotacoesPage />, module: "cad_anotacoes", title: "Anotacoes", preload: loadAnotacoesPageModule },
  { ...resourceRoute("/cotacoes-fisico", "physicalQuotes", "physical-quotes"), module: "ops_physical_quotes" },
  resourceRoute("/tradingview-experimental", "tradingviewWatchlistQuotes", "tradingview-watchlist-quotes"),
  { ...resourceRoute("/custo-orcamento", "budgetCosts", "budget-costs"), module: "ops_budget_costs" },
  { ...resourceRoute("/custo-realizado", "actualCosts", "actual-costs"), module: "ops_actual_costs" },
  { ...resourceRoute("/pgtos-fisico", "physicalPayments", "physical-payments"), module: "ops_physical_payments" },
  { ...resourceRoute("/pgtos-caixa", "cashPayments", "cash-payments"), module: "ops_cash_payments" },
  {
    path: "/derivativos",
    element: <DerivativeOperationsPage />,
    module: "ops_derivatives",
    preload: loadDerivativeOperationsPageModule,
    warmup: () => Promise.all([warmResources("derivative-operations", "groups", "subgroups"), warmTradingviewQuotes()]),
  },
  { ...resourceRoute("/estrategias", "strategies", "strategies"), module: "ops_strategies" },
  { ...resourceRoute("/gatilhos", "strategyTriggers", "strategy-triggers"), module: "ops_triggers" },
  { ...resourceRoute("/politica-hedge", "hedgePolicies", "hedge-policies"), module: "ops_hedge_policies" },
  { ...resourceRoute("/quadro-safra", "cropBoards", "crop-boards"), module: "ops_crop_boards" },
  { ...resourceRoute("/vendas-fisico", "physicalSales", "physical-sales"), module: "ops_physical_sales" },
  {
    ...resourceRoute("/usuarios", "users", "users"),
    module: "sys_users",
    allowedUserTypes: ["tenant_admin"],
  },
  {
    ...resourceRoute("/convites-e-acessos", "inviteAccess", "invite-access"),
    module: "sys_invites",
    allowedUserTypes: ["tenant_admin"],
  },
  {
    ...resourceRoute("/convites-admin", "adminInvitations", "admin-invitations"),
    module: "sys_admin_invites",
    allowedUserTypes: ["invitation_tenants"],
  },
  {
    ...resourceRoute("/contas-a-pagar", "accountsPayable", "accounts-payable"),
    module: "sys_accounts_payable",
  },
  { ...resourceRoute("/logs", "logs", "logs"), module: "sys_logs" },
  { path: "/importacao-em-massa", element: <MassImportPage />, module: "sys_mass_update", superuserOnly: true, preload: loadMassImportPageModule },
  { path: "/alteracao-em-massa", element: <MassUpdatePage />, module: "sys_mass_update", superuserOnly: true, preload: loadMassUpdatePageModule },
  { path: "/importador-json", element: <JsonImportPage />, module: "sys_json_import", superuserOnly: true, preload: loadJsonImportPageModule },
  { path: "/copy-base", element: <CopyBasePage />, module: "sys_copy_base", superuserOnly: true, preload: loadCopyBasePageModule },
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
