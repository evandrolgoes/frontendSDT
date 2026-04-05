import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, createChart, createSeriesMarkers } from "lightweight-charts";

const createSeriesByType = (chart, definition) => {
  const { type = "line", options = {} } = definition || {};

  if (type === "line") {
    return chart.addSeries(LineSeries, options);
  }

  if (type === "candlestick") {
    return chart.addSeries(CandlestickSeries, options);
  }

  return chart.addSeries(LineSeries, options);
};

export function TradingviewChart({
  series = [],
  height = 420,
  theme,
  chartOptions = {},
  visibleRange,
  className = "",
  onClick,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef([]);
  const markerRefs = useRef([]);
  const seriesKeysRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const hasRenderableData = (series || []).some(
      (definition) => Array.isArray(definition?.data) && definition.data.length > 0,
    );

    const defaultTheme = {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#0f172a",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.18)" },
        horzLines: { color: "rgba(148, 163, 184, 0.18)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.35)",
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.35)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(15, 23, 42, 0.24)" },
        horzLine: { color: "rgba(15, 23, 42, 0.24)" },
      },
    };

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 640,
      height,
      ...defaultTheme,
      ...(theme || {}),
      ...(chartOptions || {}),
    });

    chartRef.current = chart;
    markerRefs.current = [];
    seriesKeysRef.current = [];
    seriesRefs.current = (series || []).map((definition) => {
      const nextSeries = createSeriesByType(chart, definition);
      nextSeries.setData(Array.isArray(definition?.data) ? definition.data : []);
      seriesKeysRef.current.push(definition?.key || "");

      if (Array.isArray(definition?.markers)) {
        markerRefs.current.push(
          createSeriesMarkers(nextSeries, definition.markers, {
            autoScale: true,
            zOrder: "top",
          }),
        );
      }

      return nextSeries;
    });

    if (hasRenderableData && visibleRange?.from && visibleRange?.to) {
      chart.timeScale().setVisibleRange(visibleRange);
    } else if (hasRenderableData) {
      chart.timeScale().fitContent();
    }

    const handleClick = (param) => {
      const hoveredSeries = param?.hoveredSeries;
      const hoveredIndex = hoveredSeries ? seriesRefs.current.findIndex((item) => item === hoveredSeries) : -1;
      const seriesKey = hoveredIndex >= 0 ? seriesKeysRef.current[hoveredIndex] || "" : "";
      onClick?.({
        ...param,
        seriesKey,
      });
    };

    if (typeof onClick === "function") {
      chart.subscribeClick(handleClick);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.floor(entry?.contentRect?.width || containerRef.current?.clientWidth || 0);
      if (width > 0) {
        chart.applyOptions({ width });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (typeof onClick === "function") {
        chart.unsubscribeClick(handleClick);
      }
      resizeObserver.disconnect();
      markerRefs.current = [];
      seriesKeysRef.current = [];
      seriesRefs.current = [];
      chart.remove();
      chartRef.current = null;
    };
  }, [chartOptions, height, onClick, series, theme, visibleRange]);

  return <div ref={containerRef} className={className} />;
}
