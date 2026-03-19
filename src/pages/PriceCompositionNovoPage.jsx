import { PageHeader } from "../components/PageHeader";
import { useDashboardFilter } from "../contexts/DashboardFilterContext";
import { PriceCompositionDashboard } from "./DashboardPage";

export function PriceCompositionNovoPage() {
  const { filter } = useDashboardFilter();

  return (
    <div className="resource-page dashboard-page">
      <PageHeader
        title="Composicao de Precos"
        description="Versao da composicao de precos com os graficos principais em JS charts."
      />
      <PriceCompositionDashboard dashboardFilter={filter} chartEngine="echarts" />
    </div>
  );
}
