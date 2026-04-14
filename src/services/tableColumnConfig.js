import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const TABLE_COLUMN_CONFIG_CHANGED_EVENT = "sdt_table_column_config_changed";

// In-memory cache: populated once on first load, kept in sync via saveTableColumnPreference
let memoryCache = null;
let loadPromise = null;

const normalizeKeys = (items) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );

const normalizePreference = (preference = {}) => ({
  orderedKeys: normalizeKeys(preference.orderedKeys),
  hiddenKeys: normalizeKeys(preference.hiddenKeys),
});

const emitChange = (resource) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TABLE_COLUMN_CONFIG_CHANGED_EVENT, { detail: { resource } }),
  );
};

// Load all configs from backend once; subsequent calls reuse the promise.
const ensureLoaded = () => {
  if (memoryCache !== null) return Promise.resolve(memoryCache);
  if (loadPromise) return loadPromise;
  loadPromise = api
    .get("insights/table-column-config/")
    .then((res) => {
      memoryCache = res.data && typeof res.data === "object" ? res.data : {};
      return memoryCache;
    })
    .catch(() => {
      memoryCache = {};
      return memoryCache;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
};

// Force re-fetch (e.g., after login)
export const invalidateTableColumnConfigCache = () => {
  memoryCache = null;
  loadPromise = null;
};

export const getTableColumnPreference = (resource) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey || !memoryCache) return normalizePreference();
  return normalizePreference(memoryCache[resourceKey]);
};

export const saveTableColumnPreference = async (resource, preference, tenantId = null) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey) return normalizePreference();

  const normalized = normalizePreference(preference);

  // Optimistic update in memory only when saving for own tenant
  if (!tenantId && memoryCache) {
    memoryCache = { ...memoryCache, [resourceKey]: normalized };
  }

  emitChange(resourceKey);

  // Persist to backend
  await api.put("insights/table-column-config/", {
    resource: resourceKey,
    orderedKeys: normalized.orderedKeys,
    hiddenKeys: normalized.hiddenKeys,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  });

  return normalized;
};

export const resetTableColumnPreference = async (resource) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey) return;

  if (memoryCache) {
    const next = { ...memoryCache };
    delete next[resourceKey];
    memoryCache = next;
  }

  emitChange(resourceKey);

  await api.delete("insights/table-column-config/", { data: { resource: resourceKey } });
};

export const applyTableColumnPreference = (columns, preference) => {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  if (!sourceColumns.length) return [];

  const normalizedPreference = normalizePreference(preference);
  const columnsByKey = new Map(sourceColumns.map((column) => [String(column.key), column]));
  const orderedKeys = [
    ...normalizedPreference.orderedKeys.filter((key) => columnsByKey.has(key)),
    ...sourceColumns.map((column) => String(column.key)).filter((key) => !normalizedPreference.orderedKeys.includes(key)),
  ];
  const hiddenKeys = new Set(normalizedPreference.hiddenKeys);
  const orderedColumns = orderedKeys.map((key) => columnsByKey.get(key)).filter(Boolean);
  const visibleColumns = orderedColumns.filter((column) => !hiddenKeys.has(String(column.key)));

  return visibleColumns.length ? visibleColumns : orderedColumns;
};

export const useTableColumnPreference = (resource) => {
  const resourceKey = String(resource || "").trim();
  const [preference, setPreference] = useState(() => getTableColumnPreference(resourceKey));
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!resourceKey || typeof window === "undefined") {
      setPreference(normalizePreference());
      return undefined;
    }

    // Load from backend on first mount
    if (!loadedRef.current) {
      loadedRef.current = true;
      ensureLoaded().then(() => {
        setPreference(getTableColumnPreference(resourceKey));
      });
    }

    const syncPreference = (event) => {
      if (event?.detail?.resource && event.detail.resource !== resourceKey) return;
      setPreference(getTableColumnPreference(resourceKey));
    };

    window.addEventListener(TABLE_COLUMN_CONFIG_CHANGED_EVENT, syncPreference);
    return () => {
      window.removeEventListener(TABLE_COLUMN_CONFIG_CHANGED_EVENT, syncPreference);
    };
  }, [resourceKey]);

  return preference;
};
