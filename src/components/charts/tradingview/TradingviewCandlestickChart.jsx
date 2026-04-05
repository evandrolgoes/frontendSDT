import { TradingviewChart } from "./TradingviewChart";

export function TradingviewCandlestickChart({
  candles = [],
  markers = [],
  height,
  theme,
  chartOptions,
  visibleRange,
  className,
  onClick,
}) {
  return (
    <TradingviewChart
      series={[
        {
          type: "candlestick",
          data: candles,
          markers,
          options: {
            upColor: "#16a34a",
            downColor: "#dc2626",
            borderVisible: false,
            wickUpColor: "#16a34a",
            wickDownColor: "#dc2626",
          },
        },
      ]}
      height={height}
      theme={theme}
      chartOptions={chartOptions}
      visibleRange={visibleRange}
      className={className}
      onClick={onClick}
    />
  );
}
