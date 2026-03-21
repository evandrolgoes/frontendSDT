import { DashboardPage } from "../pages/DashboardPage";
import { DerivativeOperationsPage } from "../pages/DerivativeOperationsPage";
import { JsonImportPage } from "../pages/JsonImportPage";
import { PriceCompositionNovoPage } from "../pages/PriceCompositionNovoPage";
import { ResourcePage } from "../pages/ResourcePage";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";

const baseNavigationSections = [
  {
    label: "Dashboard",
    items: [
      { path: "/dashboard/kpis-risco-comercial", label: "Resumo" },
      { path: "/dashboard/fluxo-caixa", label: "Fluxo de Caixa" },
      { path: "/dashboard/estrategias-gatilhos", label: "Estratégias e Gatilhos" },
      { path: "/dashboard/politica-hedge", label: "Politica de Hedge" },
      { path: "/dashboard/composicao-precos", label: "Composicao de Precos" },
      { path: "/dashboard/venda-componentes", label: "Venda de Componentes" },
      { path: "/dashboard/exposicao-hedge-cambial", label: "Exposição e Hedge cambial" },
      { path: "/dashboard/simulacoes", label: "Simulacoes" },
      { path: "/dashboard/mtm", label: "MTM" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { path: "/grupos", label: "Grupo" },
      { path: "/subgrupos", label: "Subgrupo" },
      { path: "/contrapartes", label: "Contrapartes" },
    ],
  },
  {
    label: "Operacoes",
    items: [
      { path: "/cotacoes-fisico", label: "Cotacoes Fisico" },
      { path: "/custo-orcamento", label: "Custo Orcamento" },
      { path: "/custo-realizado", label: "Custo Realizado" },
      { path: "/pgtos-fisico", label: "Pgtos Fisico" },
      { path: "/pgtos-caixa", label: "Pgtos Caixa" },
      { path: "/derivativos", label: "Derivativos" },
      { path: "/estrategias", label: "Estrategias" },
      { path: "/gatilhos", label: "Gatilhos" },
      { path: "/politica-hedge", label: "Politica de Hedge" },
      { path: "/quadro-safra", label: "Quadro Safra" },
      { path: "/vendas-fisico", label: "Vendas Fisico" },
    ],
  },
  {
    label: "Sistema",
    superuserOnly: true,
    items: [
      { path: "/culturas", label: "Cultura" },
      { path: "/moedas", label: "Moeda" },
      { path: "/unidades", label: "Unidade" },
      { path: "/moeda-unidade", label: "Moeda/Unidade" },
      { path: "/bolsas", label: "Bolsa" },
      { path: "/nomes-operacoes-derivativos", label: "Nome Operacoes Derivativos" },
      { path: "/safras", label: "Safra" },
      { path: "/usuarios", label: "Usuarios" },
      { path: "/logs", label: "Log" },
      { path: "/importador-json", label: "Importador JSON" },
    ],
  },
];

export function getNavigationSections(user) {
  return baseNavigationSections.filter((section) => !section.superuserOnly || user?.is_superuser);
}

export const appRoutes = [
  { path: "/dashboard", element: <DashboardPage kind="cashflow" /> },
  { path: "/dashboard/fluxo-caixa", element: <DashboardPage kind="cashflow" /> },
  { path: "/dashboard/kpis-risco-comercial", element: <DashboardPage kind="commercialRisk" /> },
  { path: "/dashboard/estrategias-gatilhos", element: <DashboardPage kind="strategiesTriggers" /> },
  { path: "/dashboard/politica-hedge", element: <DashboardPage kind="hedgePolicy" /> },
  { path: "/dashboard/composicao-precos", element: <PriceCompositionNovoPage /> },
  { path: "/dashboard/venda-componentes", element: <DashboardPage kind="componentSales" /> },
  { path: "/dashboard/exposicao-hedge-cambial", element: <DashboardPage kind="currencyExposure" /> },
  { path: "/dashboard/simulacoes", element: <DashboardPage kind="simulations" /> },
  { path: "/dashboard/mtm", element: <DashboardPage kind="mtm" /> },
  { path: "/grupos", element: <ResourcePage key="groups" definition={resourceDefinitions.groups} /> },
  { path: "/subgrupos", element: <ResourcePage key="subgroups" definition={resourceDefinitions.subgroups} /> },
  { path: "/culturas", element: <ResourcePage key="crops" definition={resourceDefinitions.crops} /> },
  { path: "/moedas", element: <ResourcePage key="currencies" definition={resourceDefinitions.currencies} /> },
  { path: "/unidades", element: <ResourcePage key="units" definition={resourceDefinitions.units} /> },
  { path: "/moeda-unidade", element: <ResourcePage key="price-units" definition={resourceDefinitions.priceUnits} /> },
  { path: "/bolsas", element: <ResourcePage key="exchanges" definition={resourceDefinitions.exchanges} /> },
  { path: "/nomes-operacoes-derivativos", element: <ResourcePage key="derivative-operation-names" definition={resourceDefinitions.derivativeOperationNames} /> },
  { path: "/safras", element: <ResourcePage key="seasons" definition={resourceDefinitions.seasons} /> },
  { path: "/contrapartes", element: <ResourcePage key="counterparties" definition={resourceDefinitions.counterparties} /> },
  { path: "/cotacoes-fisico", element: <ResourcePage key="physical-quotes" definition={resourceDefinitions.physicalQuotes} /> },
  { path: "/custo-orcamento", element: <ResourcePage key="budget-costs" definition={resourceDefinitions.budgetCosts} /> },
  { path: "/custo-realizado", element: <ResourcePage key="actual-costs" definition={resourceDefinitions.actualCosts} /> },
  { path: "/pgtos-fisico", element: <ResourcePage key="physical-payments" definition={resourceDefinitions.physicalPayments} /> },
  { path: "/pgtos-caixa", element: <ResourcePage key="cash-payments" definition={resourceDefinitions.cashPayments} /> },
  { path: "/derivativos", element: <DerivativeOperationsPage /> },
  { path: "/estrategias", element: <ResourcePage key="strategies" definition={resourceDefinitions.strategies} /> },
  { path: "/gatilhos", element: <ResourcePage key="strategy-triggers" definition={resourceDefinitions.strategyTriggers} /> },
  { path: "/politica-hedge", element: <ResourcePage key="hedge-policies" definition={resourceDefinitions.hedgePolicies} /> },
  { path: "/quadro-safra", element: <ResourcePage key="crop-boards" definition={resourceDefinitions.cropBoards} /> },
  { path: "/vendas-fisico", element: <ResourcePage key="physical-sales" definition={resourceDefinitions.physicalSales} /> },
  { path: "/usuarios", element: <ResourcePage key="users" definition={resourceDefinitions.users} /> },
  { path: "/logs", element: <ResourcePage key="logs" definition={resourceDefinitions.logs} /> },
  { path: "/importador-json", element: <JsonImportPage /> },
];
