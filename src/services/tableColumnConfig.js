import { useEffect, useState } from "react";

const TABLE_COLUMN_CONFIG_KEY = "sdt_table_column_config_v1";
const TABLE_COLUMN_CONFIG_CHANGED_EVENT = "sdt_table_column_config_changed";

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

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

export const readTableColumnConfig = () => {
  if (!canUseLocalStorage()) {
    return {};
  }

  try {
    const rawConfig = window.localStorage.getItem(TABLE_COLUMN_CONFIG_KEY);
    const parsedConfig = rawConfig ? JSON.parse(rawConfig) : {};
    return parsedConfig && typeof parsedConfig === "object" ? parsedConfig : {};
  } catch {
    return {};
  }
};

const writeTableColumnConfig = (config) => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(TABLE_COLUMN_CONFIG_KEY, JSON.stringify(config || {}));
  } catch {
    // Ignore storage failures so table rendering keeps using the default columns.
  }
};

const emitTableColumnConfigChange = (resource) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(TABLE_COLUMN_CONFIG_CHANGED_EVENT, {
      detail: { resource },
    }),
  );
};

export const getTableColumnPreference = (resource) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey) {
    return normalizePreference();
  }

  return normalizePreference(readTableColumnConfig()[resourceKey]);
};

export const saveTableColumnPreference = (resource, preference) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey) {
    return normalizePreference();
  }

  const normalizedPreference = normalizePreference(preference);
  const nextConfig = {
    ...readTableColumnConfig(),
    [resourceKey]: normalizedPreference,
  };

  writeTableColumnConfig(nextConfig);
  emitTableColumnConfigChange(resourceKey);
  return normalizedPreference;
};

export const resetTableColumnPreference = (resource) => {
  const resourceKey = String(resource || "").trim();
  if (!resourceKey) {
    return;
  }

  const nextConfig = { ...readTableColumnConfig() };
  delete nextConfig[resourceKey];
  writeTableColumnConfig(nextConfig);
  emitTableColumnConfigChange(resourceKey);
};

export const applyTableColumnPreference = (columns, preference) => {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  if (!sourceColumns.length) {
    return [];
  }

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

  useEffect(() => {
    if (!resourceKey || typeof window === "undefined") {
      setPreference(normalizePreference());
      return undefined;
    }

    const syncPreference = (event) => {
      if (event?.type === "storage" && event.key !== TABLE_COLUMN_CONFIG_KEY) {
        return;
      }
      if (event?.detail?.resource && event.detail.resource !== resourceKey) {
        return;
      }
      setPreference(getTableColumnPreference(resourceKey));
    };

    syncPreference();
    window.addEventListener(TABLE_COLUMN_CONFIG_CHANGED_EVENT, syncPreference);
    window.addEventListener("storage", syncPreference);

    return () => {
      window.removeEventListener(TABLE_COLUMN_CONFIG_CHANGED_EVENT, syncPreference);
      window.removeEventListener("storage", syncPreference);
    };
  }, [resourceKey]);

  return preference;
};
