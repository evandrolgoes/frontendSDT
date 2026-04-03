import { useCallback, useEffect, useState } from "react";

import { resourceService } from "../services/resourceService";

const RESOURCE_VIEW_CACHE_TTL_MS = 60000;
const RESOURCE_VIEW_CACHE_MAX_SIZE = 50;
const resourceViewStateCache = new Map();

export const clearResourceViewCache = () => {
  resourceViewStateCache.clear();
};

const setCacheEntry = (key, value) => {
  if (resourceViewStateCache.size >= RESOURCE_VIEW_CACHE_MAX_SIZE) {
    resourceViewStateCache.delete(resourceViewStateCache.keys().next().value);
  }
  resourceViewStateCache.set(key, value);
};

const toMessage = (value) => {
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, detail]) => `${key}: ${toMessage(detail)}`)
      .join(" | ");
  }
  return String(value);
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractApiError = (error) => {
  const data = error?.response?.data;
  if (!data) {
    return "Nao foi possivel salvar. Verifique sua conexao e tente novamente.";
  }
  if (typeof data === "string" && /<html/i.test(data)) {
    const cleanMessage = stripHtml(data);
    if (/ProgrammingError/i.test(cleanMessage)) {
      return "O backend retornou um erro interno ao salvar este registro.";
    }
    if (/IntegrityError|ValidationError/i.test(cleanMessage)) {
      return cleanMessage;
    }
    return "O backend retornou uma pagina de erro inesperada ao salvar este registro.";
  }
  return toMessage(data);
};

export function useResourceCrud(resource, initialFilters = {}, options = {}) {
  const storageKey = `sdt_filters_${resource}`;
  const autoload = options.autoload !== false;
  const readCachedView = useCallback(() => resourceViewStateCache.get(resource) || null, [resource]);
  const cacheView = useCallback(
    (snapshot) => {
      setCacheEntry(resource, {
        ...snapshot,
        updatedAt: Date.now(),
      });
    },
    [resource],
  );
  const initialCachedView = readCachedView();
  const [rows, setRows] = useState(() => initialCachedView?.rows || []);
  const [pagination, setPagination] = useState(() => initialCachedView?.pagination || { count: 0, next: null, previous: null, page: 1 });
  const [queryParams, setQueryParams] = useState(() => initialCachedView?.queryParams || {});
  const [filters, setFilters] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      return saved ? { ...initialFilters, ...JSON.parse(saved) } : initialFilters;
    } catch {
      return initialFilters;
    }
  });
  const [loading, setLoading] = useState(() => (autoload ? !initialCachedView : false));
  const [error, setError] = useState("");

  const syncPaginationCount = useCallback((nextCount) => {
    setPagination((current) => ({
      ...current,
      count: nextCount,
    }));
    const cachedView = readCachedView();
    if (cachedView) {
      cacheView({
        ...cachedView,
        pagination: {
          ...(cachedView.pagination || {}),
          count: nextCount,
        },
      });
    }
  }, [cacheView, readCachedView]);

  const upsertRows = useCallback(
    (items) => {
      const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
      if (!list.length) {
        return;
      }

      setRows((currentRows) => {
        const nextRows = [...currentRows];

        list.forEach((item) => {
          const rowId = item?.id;
          if (rowId === undefined || rowId === null) {
            return;
          }

          const currentIndex = nextRows.findIndex((row) => String(row?.id) === String(rowId));
          if (currentIndex >= 0) {
            nextRows[currentIndex] = item;
          } else {
            nextRows.unshift(item);
          }
        });

        syncPaginationCount(nextRows.length);
        cacheView({
          rows: nextRows,
          pagination: {
            ...pagination,
            count: nextRows.length,
          },
          queryParams,
        });
        return nextRows;
      });
    },
    [cacheView, pagination, queryParams, syncPaginationCount],
  );

  const removeRowsById = useCallback(
    (ids) => {
      const validIds = new Set((Array.isArray(ids) ? ids : [ids]).filter((id) => id !== undefined && id !== null).map((id) => String(id)));
      if (!validIds.size) {
        return;
      }

      setRows((currentRows) => {
        const nextRows = currentRows.filter((row) => !validIds.has(String(row?.id)));
        syncPaginationCount(nextRows.length);
        cacheView({
          rows: nextRows,
          pagination: {
            ...pagination,
            count: nextRows.length,
          },
          queryParams,
        });
        return nextRows;
      });
    },
    [cacheView, pagination, queryParams, syncPaginationCount],
  );

  const load = useCallback(async (requestOptions = {}) => {
    if (!requestOptions.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const params = requestOptions.params || queryParams;
      const response = await resourceService.listAll(resource, params, requestOptions);
      const nextPagination = {
        count: Array.isArray(response) ? response.length : 0,
        next: null,
        previous: null,
        page: 1,
      };
      setQueryParams(params);
      setRows(response);
      setPagination(nextPagination);
      cacheView({
        rows: response,
        pagination: nextPagination,
        queryParams: params,
      });
    } catch (loadError) {
      if (!requestOptions.silent) {
        setError(extractApiError(loadError));
      }
      return null;
    } finally {
      if (!requestOptions.silent) {
        setLoading(false);
      }
    }
  }, [cacheView, queryParams, resource]);

  const save = useCallback(async (payload, current) => {
    setError("");
    try {
      let savedRecord;
      if (current?.id) {
        savedRecord = await resourceService.update(resource, current.id, payload);
      } else {
        savedRecord = await resourceService.create(resource, payload);
      }
      upsertRows(savedRecord);
      return savedRecord;
    } catch (saveError) {
      setError(extractApiError(saveError));
      return false;
    }
  }, [resource, upsertRows]);

  const remove = useCallback(async (item) => {
    setError("");
    try {
      await resourceService.remove(resource, item.id);
      removeRowsById(item.id);
      return true;
    } catch (removeError) {
      setError(extractApiError(removeError));
      return false;
    }
  }, [removeRowsById, resource]);

  useEffect(() => {
    if (autoload) {
      const cachedView = readCachedView();
      if (cachedView) {
        setRows(cachedView.rows || []);
        setPagination(cachedView.pagination || { count: 0, next: null, previous: null, page: 1 });
        setQueryParams(cachedView.queryParams || {});
        setLoading(false);

        if (Date.now() - (cachedView.updatedAt || 0) > RESOURCE_VIEW_CACHE_TTL_MS) {
          load({ params: cachedView.queryParams || {}, force: true, silent: true });
        }
        return;
      }

      load();
      return;
    }
    setRows([]);
    setLoading(false);
  }, [autoload, load, readCachedView, resource]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // Ignore storage failures and keep runtime state working.
    }
  }, [filters, storageKey]);

  return { rows, setRows, upsertRows, removeRowsById, loading, pagination, filters, setFilters, load, save, remove, error, setError };
}
