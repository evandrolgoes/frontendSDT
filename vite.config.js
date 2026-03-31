import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("chart.js") || id.includes("chartjs-plugin-datalabels") || id.includes("chartjs-plugin-zoom")) {
            return "vendor-charts";
          }

          if (id.includes("echarts") || id.includes("echarts-for-react")) {
            return "vendor-echarts";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "vendor-react";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
});
