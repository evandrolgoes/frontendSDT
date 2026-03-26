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

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const sortByLabel = (items = [], labelGetter) =>
  [...items].sort((left, right) =>
    String(labelGetter(left) || "").localeCompare(String(labelGetter(right) || ""), "pt-BR", { sensitivity: "base" }),
  );

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
  const [options, setOptions] = useState({
    groups: [],
    subgroups: [],
    crops: [],
    seasons: [],
    cropBoardCrops: [],
    cropBoardSeasons: [],
    localities: [],
    exchanges: [],
  });
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
      resourceService.listAll("exchanges"),
    ]).then(([groups, subgroups, crops, seasons, cropBoards, physicalQuotes, exchanges]) => {
      if (!isMounted) return;
      const cropBoardCultureIds = [...new Set((cropBoards || []).flatMap((item) => extractIds(item, ["cultura"])))];
      const cropBoardSeasonIds = [...new Set((cropBoards || []).flatMap((item) => extractIds(item, ["safra"])))];
      const selectedCultureIds = new Set(normalizeValues(filter?.cultura));
      const selectedSeasonIds = new Set(normalizeValues(filter?.safra));
      const cropMapById = new Map((crops || []).map((item) => [String(item.id), item]));
      const normalizedSelectedCropNames = new Set(
        [...selectedCultureIds]
          .map((id) => cropMapById.get(id))
          .map((item) => normalizeText(item?.ativo || item?.cultura))
          .filter(Boolean),
      );
      const matchesSelectedCulture = (item) => {
        if (!selectedCultureIds.size) return true;
        const itemCultureIds = extractIds(item, ["cultura", "culturas"]);
        if (itemCultureIds.some((id) => selectedCultureIds.has(String(id)))) {
          return true;
        }
        const itemCultureName = normalizeText(item?.cultura_texto || item?.cultura || item?.ativo);
        return Boolean(itemCultureName) && normalizedSelectedCropNames.has(itemCultureName);
      };
      const matchesSelectedSeason = (item) => {
        if (!selectedSeasonIds.size) return true;
        return extractIds(item, ["safra", "safras"]).some((id) => selectedSeasonIds.has(String(id)));
      };
      const buildLocalityOption = (item) => {
        const raw = typeof item === "string" ? item.trim() : [item?.uf, item?.cidade].filter(Boolean).join("/");
        const normalized = normalizeLocality(item);
        return raw && normalized ? { id: normalized, label: raw } : null;
      };
      const localities = [
        ...(cropBoards || [])
          .filter((item) => matchesSelectedCulture(item) && matchesSelectedSeason(item))
          .flatMap((item) => (Array.isArray(item.localidade) ? item.localidade : [])),
        ...(physicalQuotes || [])
          .filter((item) => matchesSelectedCulture(item) && matchesSelectedSeason(item))
          .map((item) => item.localidade)
          .filter(Boolean),
      ]
        .map(buildLocalityOption)
        .filter(Boolean)
        .reduce((acc, item) => {
          if (!acc.some((current) => current.id === item.id)) {
            acc.push(item);
          }
          return acc;
        }, []);

      setOptions({
        groups: sortByLabel(groups || [], (item) => item?.grupo),
        subgroups: sortByLabel(subgroups || [], (item) => item?.subgrupo),
        crops: sortByLabel(crops || [], (item) => item?.ativo || item?.cultura),
        seasons: sortByLabel(seasons || [], (item) => item?.safra),
        cropBoardCrops: sortByLabel(
          (crops || []).filter((item) => cropBoardCultureIds.includes(String(item.id))),
          (item) => item?.ativo || item?.cultura,
        ),
        cropBoardSeasons: sortByLabel(
          (seasons || []).filter((item) => cropBoardSeasonIds.includes(String(item.id))),
          (item) => item?.safra,
        ),
        localities: sortByLabel(localities, (item) => item?.label),
        exchanges: sortByLabel(exchanges || [], (item) => item?.nome),
      });
    });
    return () => {
      isMounted = false;
    };
  }, [filter?.cultura, filter?.safra, isAuthenticated]);

  useEffect(() => {
    setFilter((current) => {
      const allowedGroupIds = new Set((options.groups || []).map((item) => String(item.id)));
      const allowedSubgroupIds = new Set((options.subgroups || []).map((item) => String(item.id)));
      const allowedCultureIds = new Set((options.cropBoardCrops || options.crops || []).map((item) => String(item.id)));
      const allowedSeasonIds = new Set((options.cropBoardSeasons || options.seasons || []).map((item) => String(item.id)));
      const allowedLocalityIds = new Set((options.localities || []).map((item) => String(item.id)));

      const nextFilter = {
        ...current,
        grupo: normalizeValues(current?.grupo).filter((item) => allowedGroupIds.has(String(item))),
        subgrupo: normalizeValues(current?.subgrupo).filter((item) => allowedSubgroupIds.has(String(item))),
        cultura: normalizeValues(current?.cultura).filter((item) => allowedCultureIds.has(String(item))),
        safra: normalizeValues(current?.safra).filter((item) => allowedSeasonIds.has(String(item))),
        localidade: normalizeValues(current?.localidade).filter((item) => allowedLocalityIds.has(String(item))),
      };

      const hasChanged =
        JSON.stringify(normalizeValues(current?.grupo)) !== JSON.stringify(nextFilter.grupo) ||
        JSON.stringify(normalizeValues(current?.subgrupo)) !== JSON.stringify(nextFilter.subgrupo) ||
        JSON.stringify(normalizeValues(current?.cultura)) !== JSON.stringify(nextFilter.cultura) ||
        JSON.stringify(normalizeValues(current?.safra)) !== JSON.stringify(nextFilter.safra) ||
        JSON.stringify(normalizeValues(current?.localidade)) !== JSON.stringify(nextFilter.localidade);

      return hasChanged ? nextFilter : current;
    });
  }, [options]);

  const value = useMemo(
    () => ({
      filter,
      options,
      panelOpen,
      setPanelOpen,
      updateFilter(field, value) {
        setFilter((current) => ({ ...current, [field]: normalizeValues(value) }));
      },
      toggleFilterValue(field, value) {
        const normalizedValue = String(value ?? "");
        setFilter((current) => {
          const currentValues = normalizeValues(current?.[field]);
          const nextValues = currentValues.includes(normalizedValue)
            ? currentValues.filter((item) => item !== normalizedValue)
            : [...currentValues, normalizedValue];
          return { ...current, [field]: nextValues };
        });
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
