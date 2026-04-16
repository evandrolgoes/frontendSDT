import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { resourceService } from "../services/resourceService";

// Module-level flag: ensures prefetch runs at most once per browser session.
let prefetchStarted = false;
const SUMMARY_READY_EVENT = "sdt:summary-ready";

// JS bundles to pre-download (runs in parallel — browser fetches silently).
const BUNDLE_LOADERS = [
  () => import("../pages/DerivativeOperationsPage"),
  () => import("../pages/AgendaPage"),
  () => import("../pages/AgendaClientsPage"),
  () => import("../pages/BasisPage"),
  () => import("../pages/MercadoPage"),
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

function scheduleIdleTask(callback, timeout = 2500) {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(timeoutId);
}

/**
 * Silently pre-loads JS bundles and API data for all app pages
 * after the opening dashboard has finished the expensive summary work.
 *
 * Phase 1: idle download of lazy page chunks
 * Phase 2: sequential API pre-fetch → populates resourceService cache
 */
export function useBackgroundPrefetch() {
  const location = useLocation();

  useEffect(() => {
    if (prefetchStarted) return;

    let cleanupIdleTask = () => {};
    let dataTimer = 0;
    let fallbackTimer = 0;
    let prefetchScheduled = false;
    const isSummaryRoute = ["/", "/dashboard", "/resumo"].includes(location.pathname);

    const startPrefetch = () => {
      if (prefetchStarted || prefetchScheduled) return;
      prefetchScheduled = true;
      cleanupIdleTask = scheduleIdleTask(() => {
        if (prefetchStarted) return;
        prefetchStarted = true;
        prefetchBundles();
        dataTimer = window.setTimeout(prefetchData, 2500);
      });
    };

    if (typeof window === "undefined") {
      return undefined;
    }

    if (isSummaryRoute) {
      window.addEventListener(SUMMARY_READY_EVENT, startPrefetch, { once: true });
      fallbackTimer = window.setTimeout(startPrefetch, 9000);
    } else {
      fallbackTimer = window.setTimeout(startPrefetch, 2500);
    }

    return () => {
      window.removeEventListener(SUMMARY_READY_EVENT, startPrefetch);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(dataTimer);
      cleanupIdleTask();
    };
  }, [location.pathname]);
}
