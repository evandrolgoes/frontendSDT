import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthContext";
import { api } from "../services/api";
import { resourceService } from "../services/resourceService";

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

const isSameArray = (left = [], right = []) =>
  left.length === right.length && left.every((item, index) => String(item) === String(right[index]));

const normalizeDashboardFilter = (value) => ({
  grupo: normalizeValues(value?.grupo),
  subgrupo: normalizeValues(value?.subgrupo),
  cultura: normalizeValues(value?.cultura),
  safra: normalizeValues(value?.safra),
  localidade: normalizeValues(value?.localidade),
});

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

const formatLocalityLabel = (value) => {
  if (value == null) return "";
  if (typeof value === "object") {
    const uf = String(value.uf || value.sigla || "").trim();
    const city = String(value.cidade || value.nome || "").trim();
    return [uf, city].filter(Boolean).join("/") || city || uf;
  }
  return String(value).trim();
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
  const { isAuthenticated, loading: authLoading, user, updateCurrentUser } = useAuth();
  const [filter, setFilter] = useState(() => normalizeDashboardFilter(user?.dashboard_filter));
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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setFilter(EMPTY_FILTER);
      return;
    }
    setFilter(normalizeDashboardFilter(user?.dashboard_filter));
  }, [authLoading, isAuthenticated, user?.dashboard_filter]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let isMounted = true;
    Promise.all([
      resourceService.listAll("groups"),
      resourceService.listAll("subgroups"),
      resourceService.listAll("crops"),
      resourceService.listAll("seasons"),
      resourceService.listAll("crop-boards"),
      resourceService.listAll("exchanges"),
    ]).then(([groups, subgroups, crops, seasons, cropBoards, exchanges]) => {
      if (!isMounted) return;
      const cropBoardCultureIds = [...new Set((cropBoards || []).flatMap((item) => extractIds(item, ["cultura"])))];
      const cropBoardSeasonIds = [...new Set((cropBoards || []).flatMap((item) => extractIds(item, ["safra"])))];
      const selectedGroupIds = new Set(normalizeValues(filter?.grupo));
      const selectedSubgroupIds = new Set(normalizeValues(filter?.subgrupo));
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
      const matchesSelectedGroup = (item) => {
        if (!selectedGroupIds.size) return true;
        return extractIds(item, ["grupo", "grupos"]).some((id) => selectedGroupIds.has(String(id)));
      };
      const matchesSelectedSubgroup = (item) => {
        if (!selectedSubgroupIds.size) return true;
        return extractIds(item, ["subgrupo", "subgrupos"]).some((id) => selectedSubgroupIds.has(String(id)));
      };
      const buildLocalityOption = (value) => {
        const label = formatLocalityLabel(value);
        const normalized = normalizeLocality(value);
        return label && normalized ? { id: normalized, label } : null;
      };
      const localities = (cropBoards || [])
        .filter(
          (item) =>
            matchesSelectedGroup(item) &&
            matchesSelectedSubgroup(item) &&
            matchesSelectedCulture(item) &&
            matchesSelectedSeason(item),
        )
        .flatMap((item) => (Array.isArray(item.localidade) ? item.localidade : []))
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
  }, [filter?.grupo, filter?.subgrupo, filter?.cultura, filter?.safra, isAuthenticated]);

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
        !isSameArray(normalizeValues(current?.grupo), nextFilter.grupo) ||
        !isSameArray(normalizeValues(current?.subgrupo), nextFilter.subgrupo) ||
        !isSameArray(normalizeValues(current?.cultura), nextFilter.cultura) ||
        !isSameArray(normalizeValues(current?.safra), nextFilter.safra) ||
        !isSameArray(normalizeValues(current?.localidade), nextFilter.localidade);

      return hasChanged ? nextFilter : current;
    });
  }, [options]);

  const hasActiveFilter = useMemo(
    () => Object.values(normalizeDashboardFilter(filter)).some((items) => items.length > 0),
    [filter],
  );

  const value = useMemo(
    () => ({
      filter,
      hasActiveFilter,
      options,
      panelOpen,
      isSaving,
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
      async saveFilter(nextFilter) {
        const normalized = normalizeDashboardFilter(nextFilter);
        setIsSaving(true);
        try {
          const { data } = await api.put("/auth/dashboard-filter/", normalized);
          const savedFilter = normalizeDashboardFilter(data);
          setFilter(savedFilter);
          updateCurrentUser?.({ dashboard_filter: savedFilter });
          return savedFilter;
        } finally {
          setIsSaving(false);
        }
      },
      matchesDashboardFilter: rowMatchesDashboardFilter,
    }),
    [filter, hasActiveFilter, isSaving, options, panelOpen, updateCurrentUser],
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
