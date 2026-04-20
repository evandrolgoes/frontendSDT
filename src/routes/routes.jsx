import { lazy } from "react";
import { hasModuleAccess, hasUserTypeAccess } from "../constants/accessModules";
import { matchPath, Navigate, useLocation, useParams } from "react-router-dom";

const loadDashboardPageModule = () => import("../pages/DashboardPage");
const loadDerivativeOperationsPageModule = () => import("../pages/DerivativeOperationsPage");
const loadJsonImportPageModule = () => import("../pages/JsonImportPage");
const loadCopyBasePageModule = () => import("../pages/CopyBasePage");
const loadMassImportPageModule = () => import("../pages/MassImportPage");
const loadMassUpdatePageModule = () => import("../pages/MassUpdatePage");
const loadMercadoPageModule = () => import("../pages/MercadoPage");
const loadMercadoTestesPageModule = () => import("../pages/MercadoTestesPage");
const loadCotacoesV2PageModule = () => import("../pages/CotacoesV2Page");
const loadCotacoesV3TradingviewPageModule = () => import("../pages/CotacoesV3TradingviewPage");
const loadBasisPageModule = () => import("../pages/BasisPage");
const loadFundPositionsPageModule = () => import("../pages/FundPositionsPage");
const loadBlogStudioPageModule = () => import("../pages/BlogStudioPage");
const loadMarketSummaryPageModule = () => import("../pages/MarketSummaryPage");
const loadMissingFieldsPageModule = () => import("../pages/MissingFieldsPage");
const loadConfigPageModule = () => import("../pages/ConfigPage");
const loadAgendaConfigPageModule = () => import("../pages/AgendaConfigPage");
const loadAgendaPageModule = () => import("../pages/AgendaPage");
const loadAgendaClientsPageModule = () => import("../pages/AgendaClientsPage");
const loadAsaasExtratePageModule = () => import("../pages/AsaasExtratePage");
const loadGamingPageModule = () => import("../pages/GamingPage");
const loadDreBalacoPageModule = () => import("../pages/DreBalacoPage");
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
const HedgePolicyEditorPage = lazyNamedExport(loadDashboardPageModule, "HedgePolicyEditorPage");
const DerivativeOperationsPage = lazyNamedExport(loadDerivativeOperationsPageModule, "DerivativeOperationsPage");
const JsonImportPage = lazyNamedExport(loadJsonImportPageModule, "JsonImportPage");
const CopyBasePage = lazyNamedExport(loadCopyBasePageModule, "CopyBasePage");
const MassImportPage = lazyNamedExport(loadMassImportPageModule, "MassImportPage");
const MassUpdatePage = lazyNamedExport(loadMassUpdatePageModule, "MassUpdatePage");
const MercadoPage = lazyNamedExport(loadMercadoPageModule, "MercadoPage");
const MercadoTestesPage = lazyNamedExport(loadMercadoTestesPageModule, "MercadoTestesPage");
const CotacoesV2Page = lazyNamedExport(loadCotacoesV2PageModule, "CotacoesV2Page");
const CotacoesV3TradingviewPage = lazyNamedExport(loadCotacoesV3TradingviewPageModule, "CotacoesV3TradingviewPage");
const BasisPage = lazyNamedExport(loadBasisPageModule, "BasisPage");
const FundPositionsPage = lazyNamedExport(loadFundPositionsPageModule, "FundPositionsPage");
const BlogStudioPage = lazyNamedExport(loadBlogStudioPageModule, "BlogStudioPage");
const MarketSummaryPage = lazyNamedExport(loadMarketSummaryPageModule, "MarketSummaryPage");
const MissingFieldsPage = lazyNamedExport(loadMissingFieldsPageModule, "MissingFieldsPage");
const ConfigPage = lazyNamedExport(loadConfigPageModule, "ConfigPage");
const AgendaConfigPage = lazyNamedExport(loadAgendaConfigPageModule, "AgendaConfigPage");
const AgendaGooglePage = lazyNamedExport(loadAgendaPageModule, "AgendaPage");
const AgendaClientsPage = lazyNamedExport(loadAgendaClientsPageModule, "AgendaClientsPage");
const AsaasExtratePage = lazyNamedExport(loadAsaasExtratePageModule, "AsaasExtratePage");
const GamingPage = lazyNamedExport(loadGamingPageModule, "GamingPage");
const DreBalacoPage = lazyNamedExport(loadDreBalacoPageModule, "DreBalacoPage");

function LegacyBlogNewsRedirect() {
  const { postId } = useParams();
  const location = useLocation();
  const destination = postId ? `/mercado/blog/${postId}` : "/mercado/blog";
  return <Navigate to={`${destination}${location.search || ""}`} replace />;
}

const dashboardRoute = (path, kind, module, extra = {}) => {
  const { pageProps, ...routeExtra } = extra;
  return {
    path,
    element: <DashboardPage kind={kind} {...(pageProps || {})} />,
    module,
    ...routeExtra,
  };
};

const resourceRoute = (path, definitionKey, resource, extra = {}) => {
  const ResourceComponent = lazyResourcePage(definitionKey);
  return {
    path,
    resource,
    editPattern: `${path}?open=:id`,
    element: <ResourceComponent />,
    ...extra,
  };
};

const baseNavigationSections = [
  {
    label: "Dashboard",
    items: [
      { path: "/resumo", label: "Resumo", module: "dashboard_summary" },
      { path: "/dashboard/politica-hedge", label: "Politica de Hedge", module: "dashboard_hedge_policy" },
      { path: "/dashboard/mtm", label: "MTM Derivativos", module: "dashboard_mtm" },
      { path: "/dashboard/estrategias-gatilhos", label: "Estratégias e Gatilhos", module: "dashboard_strategies_triggers" },
      { path: "/dashboard/fluxo-caixa-diario", label: "Fluxo de Caixa - Diario", module: "dashboard_cashflow" },
      { path: "/dashboard/fluxo-caixa", label: "Fluxo de Caixa - Hedge", module: "dashboard_cashflow" },
      { path: "/dashboard/composicao-precos", label: "Composicao de Precos", module: "dashboard_price_composition" },
      { path: "/dashboard/venda-componentes", label: "Venda de Componentes", module: "dashboard_component_sales" },
      { path: "/dashboard/exposicao-hedge-cambial", label: "Exposição e Hedge cambial", module: "dashboard_currency_exposure" },
      { path: "/dashboard/simulacoes", label: "Simulacoes", module: "dashboard_simulations" },
      { path: "/dashboard/ranking-clientes", label: "Ranking Clientes", module: "dashboard_summary" },
      { path: "/dashboard/dre-balanco", label: "DRE e Balanço", module: "dashboard_dre_balanco" },
    ],
  },
  {
    label: "Operacoes",
    items: [
      { path: "/vendas-fisico", label: "Vendas Fisico", module: "ops_physical_sales" },
      { path: "/derivativos", label: "Derivativos", module: "ops_derivatives" },
      { path: "/pgtos-caixa", label: "Empréstimos", module: "ops_cash_payments" },
      { path: "/pgtos-fisico", label: "Pgtos Fisico", module: "ops_physical_payments" },
      { path: "/outras-saidas-caixa", label: "Outras saídas Caixa", module: "ops_other_cash_outflows" },
      { path: "/outras-entradas", label: "Outras entradas Caixa", module: "ops_other_entries" },
      { path: "/estrategias", label: "Estrategias", module: "ops_strategies" },
      { path: "/gatilhos", label: "Gatilhos", module: "ops_triggers" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { path: "/quadro-safra", label: "Quadro Safra", module: "ops_crop_boards" },
      { path: "/politica-hedge", label: "Politica de Hedge", module: "ops_hedge_policies" },
      { path: "/custo-orcamento", label: "Custo Orcamento", module: "ops_budget_costs" },
      { path: "/custo-realizado", label: "Custo Realizado", module: "ops_actual_costs" },
      { path: "/grupos", label: "Grupo", module: "cad_groups", allowedUserTypes: ["tenant_can_manage_groups"] },
      { path: "/subgrupos", label: "Subgrupo", module: "cad_subgroups", allowedUserTypes: ["tenant_can_manage_subgroups"] },
      { path: "/contrapartes", label: "Contrapartes", module: "cad_counterparties" },
      { path: "/cotacoes-fisico", label: "Cotacoes Fisico", module: "ops_physical_quotes" },
    ],
  },
  {
    label: "Usuarios",
    items: [
      { path: "/usuarios", label: "Usuarios", module: "sys_users", allowedUserTypes: ["tenant_admin"] },
      { path: "/convites-admin", label: "Convites (Admin)", module: "sys_admin_invites", allowedUserTypes: ["invitation_tenants"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { path: "/clientes", label: "Clientes", module: "sys_receipt_clients" },
      { path: "/entradas", label: "Entradas", module: "sys_receipt_entries" },
      { path: "/contas-a-pagar", label: "Contas a Pagar", module: "sys_accounts_payable" },
      { path: "/contratos", label: "Contratos", module: "sys_contracts" },
      { path: "/agenda", label: "Agenda Clientes", module: "agenda" },
      { path: "/agenda-google", label: "Agenda Google", module: "agenda" },
      { path: "/agenda-config", label: "Config Agenda Google", module: "agenda_config" },
      { path: "/extrato-recebimentos", label: "Extrato Recebimentos", module: "admin_asaas_extrato" },
      { path: "/gaming", label: "Gaming", module: "admin_gaming" },
      { path: "/config", label: "Config", module: "tool_missing_fields", superuserOnly: true },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { path: "/logs", label: "Log", module: "sys_logs" },
      { path: "/pendencias-cadastrais", label: "Pendencias Cadastrais", module: "tool_missing_fields" },
      { path: "/criar-resumo-de-mercado", label: "Resumo Semanal de Mercado - 2", module: "tool_market_summary", superuserOnly: true },
      { path: "/importacao-em-massa", label: "Importacao em Massa", module: "sys_mass_update", superuserOnly: true },
      { path: "/alteracao-em-massa", label: "Alteracao em Massa", module: "sys_mass_update", superuserOnly: true },
      { path: "/importador-json", label: "Importador JSON", module: "sys_json_import", superuserOnly: true },
      { path: "/copy-base", label: "Copy Base", module: "sys_copy_base", superuserOnly: true },
    ],
  },
  {
    label: "Mercado",
    items: [
      { path: "/mercado/blog", label: "Blog", module: "market_blog_news" },
      { path: "/mercado/cotacoes", label: "Cotacoes", module: "market_quotes" },
      { path: "/mercado/cotacoes-2", label: "Cotacoes 2", module: "market_quotes" },
      { path: "/mercado/cotacoes-3", label: "Cotacoes 3 TV", module: "market_quotes" },
      { path: "/mercado/exportacoes", label: "Exportacoes", module: "market_exports" },
      { path: "/mercado/basis", label: "Basis", module: "market_basis" },
      { path: "/mercado/posicao-fundos", label: "Posicao de Fundos", module: "market_fund_positions" },
      { path: "/mercado/taxa-de-juros", label: "Taxa de Juros", module: "market_interest_rates" },
      { path: "/mercado/testes", label: "Testes", module: "market_others" },
      { path: "/mercado/outros", label: "Outros", module: "market_others" },
    ],
  },
];

const navigationItems = baseNavigationSections.flatMap((section) => section.items);

const humanizeModuleCode = (moduleCode) =>
  String(moduleCode || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(": ")
    .replace(": ", " - ");

export const publicAppRoutes = [
  { path: "/blog", element: <BlogStudioPage basePath="/blog" />, title: "Blog" },
  { path: "/blog/:postId", element: <BlogStudioPage basePath="/blog" />, title: "Blog" },
];

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
    .filter((section) => section.items.length > 0)
    .sort((left, right) => {
      const leftIsAdmin = left.label === "Admin";
      const rightIsAdmin = right.label === "Admin";

      if (leftIsAdmin === rightIsAdmin) {
        return 0;
      }

      return leftIsAdmin ? 1 : -1;
    });
}

export const appRoutes = [
  {
    path: "/dashboard",
    element: <Navigate to="/resumo" replace />,
    module: "dashboard_summary",
    title: "Resumo",
  },
  {
    path: "/dashboard/kpis-risco-comercial",
    element: <Navigate to="/resumo" replace />,
    module: "dashboard_summary",
    title: "Resumo",
  },
  dashboardRoute("/resumo", "commercialRisk", "dashboard_summary"),
  dashboardRoute("/dashboard/ranking-clientes", "clientRanking", "dashboard_summary"),
  dashboardRoute("/dashboard/fluxo-caixa", "cashflow", "dashboard_cashflow"),
  dashboardRoute("/dashboard/fluxo-caixa-diario", "cashflowDaily", "dashboard_cashflow"),
  dashboardRoute("/dashboard/estrategias-gatilhos", "strategiesTriggers", "dashboard_strategies_triggers"),
  dashboardRoute("/dashboard/politica-hedge", "hedgePolicy", "dashboard_hedge_policy"),
  dashboardRoute("/dashboard/composicao-precos", "priceComposition", "dashboard_price_composition", {
    pageProps: { chartEngine: "echarts" },
  }),
  dashboardRoute("/dashboard/venda-componentes", "componentSales", "dashboard_component_sales"),
  dashboardRoute("/dashboard/exposicao-hedge-cambial", "currencyExposure", "dashboard_currency_exposure"),
  dashboardRoute("/dashboard/simulacoes", "simulations", "dashboard_simulations"),
  dashboardRoute("/dashboard/mtm", "mtm", "dashboard_mtm"),
  { path: "/dashboard/dre-balanco", element: <DreBalacoPage />, module: "dashboard_dre_balanco", title: "DRE e Balanço" },
  {
    path: "/mercado",
    element: <Navigate to="/mercado/blog" replace />,
    title: "Mercado",
  },
  { ...resourceRoute("/mercado/cotacoes", "tradingviewWatchlistQuotes", "tradingview-watchlist-quotes"), module: "market_quotes" },
  { path: "/mercado/cotacoes-2", element: <CotacoesV2Page />, module: "market_quotes", title: "Cotacoes 2" },
  { path: "/mercado/cotacoes-3", element: <CotacoesV3TradingviewPage />, module: "market_quotes", title: "Cotacoes 3 TradingView" },
  { path: "/mercado/blog", element: <BlogStudioPage />, module: "market_blog_news", title: "Blog", resource: "market-news-posts", editPattern: "/mercado/blog/:id" },
  { path: "/mercado/blog/:postId", element: <BlogStudioPage />, module: "market_blog_news", title: "Blog", resource: "market-news-posts", editPattern: "/mercado/blog/:id" },
  { path: "/mercado/blog-news", element: <LegacyBlogNewsRedirect />, module: "market_blog_news" },
  { path: "/mercado/blog-news/:postId", element: <LegacyBlogNewsRedirect />, module: "market_blog_news" },
  { path: "/mercado/exportacoes", element: <MercadoPage kind="exports" />, module: "market_exports" },
  { path: "/mercado/basis", element: <BasisPage />, module: "market_basis" },
  { path: "/mercado/posicao-fundos", element: <FundPositionsPage />, module: "market_fund_positions" },
  { path: "/mercado/taxa-de-juros", element: <MercadoPage kind="interestRates" />, module: "market_interest_rates" },
  { path: "/mercado/testes", element: <MercadoTestesPage />, module: "market_others" },
  { path: "/mercado/outros", element: <MercadoPage kind="others" />, module: "market_others" },
  { ...resourceRoute("/grupos", "groups", "groups"), module: "cad_groups" },
  { ...resourceRoute("/subgrupos", "subgroups", "subgroups"), module: "cad_subgroups" },
  { ...resourceRoute("/clientes", "entryClients", "receipt-clients"), module: "sys_receipt_clients" },
  { ...resourceRoute("/entradas", "receiptEntries", "receipt-entries"), module: "sys_receipt_entries" },
  { path: "/entradas-recebimentos", element: <Navigate to="/entradas" replace />, module: "sys_receipt_entries" },
  { ...resourceRoute("/contrapartes", "counterparties", "counterparties"), module: "cad_counterparties" },
  { ...resourceRoute("/cotacoes-fisico", "physicalQuotes", "physical-quotes"), module: "ops_physical_quotes" },
  resourceRoute("/tradingview-experimental", "tradingviewWatchlistQuotes", "tradingview-watchlist-quotes"),
  { ...resourceRoute("/custo-orcamento", "budgetCosts", "budget-costs"), module: "ops_budget_costs" },
  { ...resourceRoute("/custo-realizado", "actualCosts", "actual-costs"), module: "ops_actual_costs" },
  { ...resourceRoute("/pgtos-fisico", "physicalPayments", "physical-payments"), module: "ops_physical_payments" },
  { ...resourceRoute("/pgtos-caixa", "cashPayments", "cash-payments"), module: "ops_cash_payments" },
  { ...resourceRoute("/outras-saidas-caixa", "otherCashOutflows", "other-cash-outflows"), module: "ops_other_cash_outflows" },
  { ...resourceRoute("/outras-entradas", "otherEntries", "other-entries"), module: "ops_other_entries" },
  {
    path: "/derivativos",
    element: <DerivativeOperationsPage />,
    module: "ops_derivatives",
    resource: "derivative-operations",
    editPattern: "/derivativos?open=:id",
  },
  { ...resourceRoute("/estrategias", "strategies", "strategies"), module: "ops_strategies" },
  { ...resourceRoute("/gatilhos", "strategyTriggers", "strategy-triggers"), module: "ops_triggers" },
  { path: "/politica-hedge", element: <HedgePolicyEditorPage />, module: "ops_hedge_policies" },
  { ...resourceRoute("/quadro-safra", "cropBoards", "crop-boards"), module: "ops_crop_boards" },
  { ...resourceRoute("/vendas-fisico", "physicalSales", "physical-sales"), module: "ops_physical_sales" },
  {
    ...resourceRoute("/usuarios", "users", "users"),
    module: "sys_users",
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
  {
    ...resourceRoute("/contratos", "contracts", "contracts"),
    module: "sys_contracts",
  },
  { ...resourceRoute("/logs", "logs", "audit-logs"), module: "sys_logs" },
  { path: "/config", element: <ConfigPage />, module: "tool_missing_fields", superuserOnly: true },
  { path: "/pendencias-cadastrais", element: <MissingFieldsPage />, module: "tool_missing_fields" },
  { path: "/criar-resumo-de-mercado", element: <MarketSummaryPage />, module: "tool_market_summary", superuserOnly: true },
  { path: "/importacao-em-massa", element: <MassImportPage />, module: "sys_mass_update", superuserOnly: true },
  { path: "/alteracao-em-massa", element: <MassUpdatePage />, module: "sys_mass_update", superuserOnly: true },
  { path: "/agenda", element: <Navigate to="/agenda-clientes" replace />, module: "agenda" },
  { path: "/agenda-clientes", element: <AgendaClientsPage />, module: "agenda" },
  { path: "/agenda-google", element: <AgendaGooglePage />, module: "agenda" },
  { path: "/agenda-config", element: <AgendaConfigPage />, module: "agenda_config" },
  { path: "/extrato-recebimentos", element: <AsaasExtratePage />, module: "admin_asaas_extrato" },
  { path: "/gaming", element: <GamingPage />, module: "admin_gaming", title: "Gaming" },
  { path: "/importador-json", element: <JsonImportPage />, module: "sys_json_import", superuserOnly: true },
  { path: "/copy-base", element: <CopyBasePage />, module: "sys_copy_base", superuserOnly: true },
];

const hiddenModuleOptions = [
  { module: "sys_tenants", label: "Tenants" },
  { module: "sys_crops", label: "Ativo" },
  { module: "sys_currencies", label: "Moeda" },
  { module: "sys_units", label: "Unidade" },
  { module: "sys_price_units", label: "Moeda/Unidade" },
  { module: "sys_derivative_operation_names", label: "Nome Operacoes Derivativos" },
  { module: "sys_seasons", label: "Safra" },
];

export const moduleOptions = Array.from(
  [...navigationItems, ...appRoutes, ...hiddenModuleOptions]
    .filter((item) => String(item?.module || "").trim())
    .reduce((map, item) => {
      const code = String(item.module).trim();
      if (!map.has(code)) {
        map.set(code, {
          value: code,
          label: item.label || item.title || humanizeModuleCode(code),
        });
      }
      return map;
    }, new Map())
    .values(),
).sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));

export function getAccessibleRoutePath(user) {
  const firstSection = getNavigationSections(user)[0];
  return firstSection?.items?.[0]?.path || "/resumo";
}

export function getRouteDefinition(pathname) {
  return [...publicAppRoutes, ...appRoutes].find((route) => Boolean(matchPath({ path: route.path, end: true }, pathname))) || null;
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

export function buildResourceEditPath(resource, id) {
  if (!resource || id === undefined || id === null || id === "") {
    return null;
  }
  const route = appRoutes.find((item) => item.resource === resource && item.editPattern);
  if (!route?.editPattern) {
    return null;
  }
  return route.editPattern.replace(":id", String(id));
}

export function getSystemDocumentTitle(pathname) {
  const routeTitle = getRouteTitle(pathname);
  return routeTitle ? `Hedge Position - ${routeTitle}` : "Hedge Position";
}
