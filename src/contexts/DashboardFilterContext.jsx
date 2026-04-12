import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthContext";
import { api } from "../services/api";
import { resourceService } from "../services/resourceService";

const EMPTY_FILTER = { grupo: [], subgrupo: [], cultura: [], safra: [] };

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

const matchesSelection = (selectedValues, candidateIds) =>
  !selectedValues.length || selectedValues.some((item) => candidateIds.includes(String(item)));

export const filterSubgroupsByGroups = (subgroups = [], selectedGroupIds = []) => {
  const normalizedGroupIds = normalizeValues(selectedGroupIds);
  if (!normalizedGroupIds.length) {
    return subgroups;
  }

  return subgroups.filter((item) => normalizedGroupIds.includes(String(item?.grupo)));
};

export const rowMatchesDashboardFilter = (
  row,
  filter,
  {
    groupKeys = ["grupo", "grupos"],
    subgroupKeys = ["subgrupo", "subgrupos"],
    cultureKeys = ["cultura", "culturas"],
    seasonKeys = ["safra", "safras"],
  } = {},
) => {
  const normalized = {
    grupo: normalizeValues(filter?.grupo),
    subgrupo: normalizeValues(filter?.subgrupo),
    cultura: normalizeValues(filter?.cultura),
    safra: normalizeValues(filter?.safra),
  };

  return (
    matchesSelection(normalized.grupo, extractIds(row, groupKeys)) &&
    matchesSelection(normalized.subgrupo, extractIds(row, subgroupKeys)) &&
    matchesSelection(normalized.cultura, extractIds(row, cultureKeys)) &&
    matchesSelection(normalized.safra, extractIds(row, seasonKeys))
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
        exchanges: sortByLabel(exchanges || [], (item) => item?.nome),
      });
    });
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setFilter((current) => {
      const allowedGroupIds = new Set((options.groups || []).map((item) => String(item.id)));
      const allowedSubgroupIds = new Set((options.subgroups || []).map((item) => String(item.id)));
      const allowedCultureIds = new Set((options.cropBoardCrops || options.crops || []).map((item) => String(item.id)));
      const allowedSeasonIds = new Set((options.cropBoardSeasons || options.seasons || []).map((item) => String(item.id)));
      const nextFilter = {
        ...current,
        grupo: normalizeValues(current?.grupo).filter((item) => allowedGroupIds.has(String(item))),
        subgrupo: normalizeValues(current?.subgrupo).filter((item) => allowedSubgroupIds.has(String(item))),
        cultura: normalizeValues(current?.cultura).filter((item) => allowedCultureIds.has(String(item))),
        safra: normalizeValues(current?.safra).filter((item) => allowedSeasonIds.has(String(item))),
      };

      const hasChanged =
        !isSameArray(normalizeValues(current?.grupo), nextFilter.grupo) ||
        !isSameArray(normalizeValues(current?.subgrupo), nextFilter.subgrupo) ||
        !isSameArray(normalizeValues(current?.cultura), nextFilter.cultura) ||
        !isSameArray(normalizeValues(current?.safra), nextFilter.safra);

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
