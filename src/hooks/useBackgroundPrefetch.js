import { useEffect } from "react";

import { resourceService } from "../services/resourceService";

// Module-level flag: ensures prefetch runs at most once per browser session.
let prefetchStarted = false;

// JS bundles to pre-download (runs in parallel — browser fetches silently).
const BUNDLE_LOADERS = [
  () => import("../pages/DerivativeOperationsPage"),
  () => import("../pages/AgendaPage"),
  () => import("../pages/AgendaClientsPage"),
  () => import("../pages/BasisPage"),
  () => import("../pages/MercadoPage"),
  () => import("../pages/AnotacoesPage"),
  () => import("../pages/FundPositionsPage"),
  () => import("../pages/MarketSummaryPage"),
  () => import("../pages/ConfigPage"),
  () => import("../pages/MissingFieldsPage"),
  () => import("../pages/AgendaConfigPage"),
  () => import("../pages/JsonImportPage"),
  () => import("../pages/MassImportPage"),
  () => import("../pages/MassUpdatePage"),
  () => import("../pages/CopyBasePage"),
  () => import("../pages/MercadoTestesPage"),
  () => import("../pages/BlogStudioPage"),
  () => import("../pages/ResourcePage"),
  () => import("../modules/resourceDefinitions.jsx"),
];

// API data to pre-fetch (runs sequentially to avoid hammering the backend).
// Results land in resourceService session cache — subsequent navigation is instant.
const DATA_PREFETCHES = [
  () => resourceService.listAll("derivative-operations"),
  () => resourceService.listAll("physical-sales"),
  () => resourceService.listAll("counterparties"),
  () => resourceService.listAll("crops"),
  () => resourceService.listAll("cash-payments"),
  () => resourceService.listAll("physical-payments"),
  () => resourceService.listAll("strategies"),
  () => resourceService.listAll("strategy-triggers"),
  () => resourceService.listAll("hedge-policies"),
  () => resourceService.listAll("crop-boards"),
];

function prefetchBundles() {
  BUNDLE_LOADERS.forEach((loader) => {
    loader().catch(() => {});
  });
}

async function prefetchData() {
  for (const fetch of DATA_PREFETCHES) {
    try {
      await fetch();
    } catch {
      // silently ignore — the page will fetch normally on navigation
    }
    // 400ms gap between requests to keep backend pressure low
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/**
 * Silently pre-loads JS bundles and API data for all app pages
 * after the dashboard finishes its initial render.
 *
 * Phase 1 (t+1s): parallel download of all lazy page chunks
 * Phase 2 (t+3s): sequential API pre-fetch → populates resourceService cache
 */
export function useBackgroundPrefetch() {
  useEffect(() => {
    if (prefetchStarted) return;
    prefetchStarted = true;

    const bundleTimer = setTimeout(prefetchBundles, 1000);
    const dataTimer = setTimeout(prefetchData, 3000);

    return () => {
      clearTimeout(bundleTimer);
      clearTimeout(dataTimer);
    };
  }, []);
}
