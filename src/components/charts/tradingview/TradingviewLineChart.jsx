import { TradingviewChart } from "./TradingviewChart";

export function TradingviewLineChart({
  lines = [],
  height,
  theme,
  chartOptions,
  visibleRange,
  className,
  onClick,
}) {
  const series = (lines || []).map((line) => ({
    key: line.key,
    type: "line",
    data: line.data || [],
    markers: line.markers || [],
    options: {
      title: line.title,
      color: line.color,
      lineWidth: line.lineWidth ?? 2,
      lineStyle: line.lineStyle ?? 0,
      crosshairMarkerVisible: line.crosshairMarkerVisible ?? true,
      lastValueVisible: line.lastValueVisible ?? true,
      priceLineVisible: line.priceLineVisible ?? true,
      ...(line.options || {}),
    },
  }));

  return (
    <TradingviewChart
      series={series}
      height={height}
      theme={theme}
      chartOptions={chartOptions}
      visibleRange={visibleRange}
      className={className}
      onClick={onClick}
    />
  );
}
