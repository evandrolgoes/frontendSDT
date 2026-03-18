import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthContext";
import { resourceService } from "../services/resourceService";

const STORAGE_KEY = "sdt_dashboard_filter";
const EMPTY_FILTER = { grupo: [], subgrupo: [], cultura: [], safra: [], localidade: [] };

const DashboardFilterContext = createContext(null);

const normalizeValues = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item != null && item !== "").map((item) => String(item));
  }
  if (value == null || value === "") {
    return [];
  }
  return [String(value)];
};

const readStoredFilter = () => {
  if (typeof window === "undefined") return EMPTY_FILTER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTER;
    const parsed = JSON.parse(raw);
    return {
      grupo: normalizeValues(parsed?.grupo),
      subgrupo: normalizeValues(parsed?.subgrupo),
      cultura: normalizeValues(parsed?.cultura),
      safra: normalizeValues(parsed?.safra),
      localidade: normalizeValues(parsed?.localidade),
    };
  } catch {
    return EMPTY_FILTER;
  }
};

const writeStoredFilter = (value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const extractIds = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value)) {
      return value.filter((item) => item != null && item !== "").map((item) => String(item));
    }
    if (value && typeof value === "object" && value.id != null) {
      return [String(value.id)];
    }
    if (value != null && value !== "") {
      return [String(value)];
    }
  }
  return [];
};

const normalizeLocality = (value) => {
  if (value == null) return "";
  if (typeof value === "object") {
    const uf = String(value.uf || value.sigla || "").trim();
    const city = String(value.cidade || value.nome || "").trim();
    if (uf || city) {
      return [uf, city]
        .filter(Boolean)
        .map((part) => part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
        .sort()
        .join("|");
    }
  }

  const text = String(value).trim();
  if (!text) return "";
  const parts = text
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  return (parts.length ? parts : [text.toLowerCase()]).sort().join("|");
};

const extractLocalities = (row, keys) => {
  const values = [];
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const normalized = normalizeLocality(item);
        if (normalized) values.push(normalized);
      });
      continue;
    }
    const normalized = normalizeLocality(value);
    if (normalized) values.push(normalized);
  }
  return [...new Set(values)];
};

const matchesSelection = (selectedValues, candidateIds) =>
  !selectedValues.length || selectedValues.some((item) => candidateIds.includes(String(item)));

export const rowMatchesDashboardFilter = (
  row,
  filter,
  {
    groupKeys = ["grupo", "grupos"],
    subgroupKeys = ["subgrupo", "subgrupos"],
    cultureKeys = ["cultura", "culturas"],
    seasonKeys = ["safra", "safras"],
    localityKeys = ["localidade", "localidades"],
  } = {},
) => {
  const normalized = {
    grupo: normalizeValues(filter?.grupo),
    subgrupo: normalizeValues(filter?.subgrupo),
    cultura: normalizeValues(filter?.cultura),
    safra: normalizeValues(filter?.safra),
    localidade: normalizeValues(filter?.localidade).map(normalizeLocality).filter(Boolean),
  };

  const localityCandidates = extractLocalities(row, localityKeys);
  const localityMatches =
    !normalized.localidade.length ||
    !localityKeys.length ||
    !localityCandidates.length ||
    normalized.localidade.some((item) => localityCandidates.includes(item));

  return (
    matchesSelection(normalized.grupo, extractIds(row, groupKeys)) &&
    matchesSelection(normalized.subgrupo, extractIds(row, subgroupKeys)) &&
    matchesSelection(normalized.cultura, extractIds(row, cultureKeys)) &&
    matchesSelection(normalized.safra, extractIds(row, seasonKeys)) &&
    localityMatches
  );
};

export function DashboardFilterProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState(readStoredFilter);
  const [options, setOptions] = useState({ groups: [], subgroups: [], crops: [], seasons: [], localities: [] });
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    writeStoredFilter(filter);
  }, [filter]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let isMounted = true;
    Promise.all([
      resourceService.listAll("groups"),
      resourceService.listAll("subgroups"),
      resourceService.listAll("crops"),
      resourceService.listAll("seasons"),
      resourceService.listAll("crop-boards"),
      resourceService.listAll("physical-quotes"),
    ]).then(([groups, subgroups, crops, seasons, cropBoards, physicalQuotes]) => {
      if (!isMounted) return;
      const localities = [
        ...(cropBoards || []).flatMap((item) => (Array.isArray(item.localidade) ? item.localidade : [])),
        ...(physicalQuotes || []).map((item) => item.localidade).filter(Boolean),
      ]
        .map((item) => {
          const raw = typeof item === "string" ? item.trim() : [item?.uf, item?.cidade].filter(Boolean).join("/");
          const normalized = normalizeLocality(item);
          return raw && normalized ? { id: normalized, label: raw } : null;
        })
        .filter(Boolean)
        .reduce((acc, item) => {
          if (!acc.some((current) => current.id === item.id)) {
            acc.push(item);
          }
          return acc;
        }, [])
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

      setOptions({
        groups: groups || [],
        subgroups: subgroups || [],
        crops: crops || [],
        seasons: seasons || [],
        localities,
      });
    });
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      filter,
      options,
      panelOpen,
      setPanelOpen,
      updateFilter(field, value) {
        setFilter((current) => ({ ...current, [field]: normalizeValues(value) }));
      },
      clearFilter() {
        setFilter(EMPTY_FILTER);
      },
      matchesDashboardFilter: rowMatchesDashboardFilter,
    }),
    [filter, options, panelOpen],
  );

  return <DashboardFilterContext.Provider value={value}>{children}</DashboardFilterContext.Provider>;
}

export function useDashboardFilter() {
  const context = useContext(DashboardFilterContext);
  if (!context) {
    throw new Error("useDashboardFilter must be used inside DashboardFilterProvider");
  }
  return context;
}
