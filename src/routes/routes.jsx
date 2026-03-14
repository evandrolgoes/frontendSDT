import { DashboardPage } from "../pages/DashboardPage";
import { ResourcePage } from "../pages/ResourcePage";
import { resourceDefinitions } from "../modules/resourceDefinitions.jsx";

export const navigationItems = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/clientes", label: "Clientes" },
  { path: "/grupos", label: "Grupos" },
  { path: "/subgrupos", label: "Subgrupos" },
  { path: "/safras", label: "Safras" },
  { path: "/vendas-fisicas", label: "Vendas Fisicas" },
  { path: "/derivativos", label: "Derivativos" },
  { path: "/legs", label: "Legs" },
  { path: "/estrategias", label: "Estrategias" },
  { path: "/gatilhos", label: "Gatilhos" },
  { path: "/mercado", label: "Mercado" },
  { path: "/mtm", label: "MTM" },
  { path: "/auditoria", label: "Auditoria" },
];

export const appRoutes = [
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/clientes", element: <ResourcePage definition={resourceDefinitions.clients} /> },
  { path: "/grupos", element: <ResourcePage definition={resourceDefinitions.groups} /> },
  { path: "/subgrupos", element: <ResourcePage definition={resourceDefinitions.subgroups} /> },
  { path: "/safras", element: <ResourcePage definition={resourceDefinitions.seasons} /> },
  { path: "/vendas-fisicas", element: <ResourcePage definition={resourceDefinitions.physicalSales} /> },
  { path: "/derivativos", element: <ResourcePage definition={resourceDefinitions.derivativeOperations} /> },
  { path: "/legs", element: <ResourcePage definition={resourceDefinitions.derivativeLegs} /> },
  { path: "/estrategias", element: <ResourcePage definition={resourceDefinitions.strategies} /> },
  { path: "/gatilhos", element: <ResourcePage definition={resourceDefinitions.triggers} /> },
  { path: "/mercado", element: <ResourcePage definition={resourceDefinitions.market} /> },
  { path: "/mtm", element: <ResourcePage definition={resourceDefinitions.mtm} /> },
  { path: "/auditoria", element: <ResourcePage definition={resourceDefinitions.auditing} /> },
];
