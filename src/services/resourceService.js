import { api } from "./api";

// Session-scoped cache: survives route changes and is cleared on full page refresh.
const responseCache = new Map();

const isFile = (value) => typeof File !== "undefined" && value instanceof File;

const containsBinaryValue = (payload) =>
  Object.values(payload || {}).some((value) =>
    isFile(value) || (Array.isArray(value) && value.some((item) => isFile(item))),
  );

const toFormData = (payload) => {
  const formData = new FormData();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.some((item) => isFile(item))) {
        value.forEach((item) => formData.append(key, item));
        return;
      }
      formData.append(key, JSON.stringify(value));
      return;
    }
    formData.append(key, value);
  });
  return formData;
};

const normalizeCacheValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeCacheValue(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const normalizeRequestParams = (value) => {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeRequestParams(item))
      .filter((item) => item !== undefined);
    return normalizedItems.length ? normalizedItems : undefined;
  }

  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value).reduce((acc, [key, entryValue]) => {
      const normalizedValue = normalizeRequestParams(entryValue);
      if (normalizedValue !== undefined) {
        acc[key] = normalizedValue;
      }
      return acc;
    }, {});
    return Object.keys(normalizedEntries).length ? normalizedEntries : undefined;
  }

  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return value;
};

const buildCacheKey = (kind, resource, params = {}) =>
  `${kind}:${resource}:${JSON.stringify(normalizeCacheValue(params || {}))}`;

const remember = (key, loader) => {
  if (responseCache.has(key)) {
    return responseCache.get(key);
  }
  const pending = Promise.resolve()
    .then(loader)
    .catch((error) => {
      responseCache.delete(key);
      throw error;
    });
  responseCache.set(key, pending);
  return pending;
};

const invalidateCache = (resource = null) => {
  if (!resource) {
    responseCache.clear();
    return;
  }
  [...responseCache.keys()].forEach((key) => {
    if (key.startsWith(`${resource}:`) || key.includes(`:${resource}:`)) {
      responseCache.delete(key);
    }
  });
};

export const clearResourceServiceCache = () => {
  responseCache.clear();
};

export const resourceService = {
  list: (resource, params = {}, options = {}) => {
    const normalizedParams = normalizeRequestParams(params) || {};
    const cacheKey = buildCacheKey("list", resource, normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get(`/${resource}/`, { params: normalizedParams }).then((response) => response.data),
    );
  },
  listAll: async (resource, params = {}, options = {}) => {
    const normalizedParams = normalizeRequestParams(params) || {};
    const cacheKey = buildCacheKey("listAll", resource, normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, async () => {
      let nextPage = 1;
      let aggregated = [];

      while (nextPage) {
        const response = await api.get(`/${resource}/`, { params: { page: nextPage, page_size: 100, ...normalizedParams } });
        const data = response.data;
        aggregated = aggregated.concat(data.results || data);
        nextPage = data.next ? nextPage + 1 : null;
        if (!Array.isArray(data.results) && !data.next) {
          nextPage = null;
        }
      }

      return aggregated;
    });
  },
  create: (resource, payload) => {
    const body = containsBinaryValue(payload) ? toFormData(payload) : payload;
    const config = body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
    return api.post(`/${resource}/`, body, config).then((response) => {
      invalidateCache(resource);
      return response.data;
    });
  },
  update: (resource, id, payload) => {
    const body = containsBinaryValue(payload) ? toFormData(payload) : payload;
    const config = body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
    return api.put(`/${resource}/${id}/`, body, config).then((response) => {
      invalidateCache(resource);
      return response.data;
    });
  },
  patch: (resource, id, payload) =>
    (() => {
      const body = containsBinaryValue(payload) ? toFormData(payload) : payload;
      const config = body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
      return api.patch(`/${resource}/${id}/`, body, config);
    })().then((response) => {
      invalidateCache(resource);
      return response.data;
    }),
  remove: (resource, id) =>
    api.delete(`/${resource}/${id}/`).then((response) => {
      invalidateCache(resource);
      invalidateCache("attachments");
      return response.data;
    }),
  uploadAttachments: (resource, id, files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    return api
      .post(`/${resource}/${id}/attachments/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((response) => {
        invalidateCache(resource);
        invalidateCache("attachments");
        return response.data;
      });
  },
  listAttachments: (resource, id, options = {}) => {
    const normalizedParams = normalizeRequestParams(options.params) || {};
    const cacheKey = buildCacheKey("attachments", `${resource}/${id}`, normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get(`/${resource}/${id}/attachments/`, { params: normalizedParams }).then((response) => response.data),
    );
  },
  getOne: (resource, id, options = {}) => {
    const normalizedParams = normalizeRequestParams(options.params) || {};
    const cacheKey = buildCacheKey("detail", `${resource}/${id}`, normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get(`/${resource}/${id}/`, { params: normalizedParams }).then((response) => response.data),
    );
  },
  listDerivativeContracts: (secao) =>
    remember(buildCacheKey("lookup", "derivative-contracts", { secao }), () =>
      api.get("derivative-contracts/", { params: { secao } }).then((response) => response.data),
    ),
  listIbgeStates: () =>
    remember(buildCacheKey("lookup", "localidades/estados", {}), () =>
      api.get("localidades/estados/").then((response) => response.data),
    ),
  listIbgeCities: (uf) =>
    remember(buildCacheKey("lookup", "localidades/municipios", { uf }), () =>
      api.get("localidades/municipios/", { params: { uf } }).then((response) => response.data),
    ),
  listTradingviewQuotes: (options = {}) => {
    const cacheKey = buildCacheKey("lookup", "tradingview-watchlist-quotes", {});
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api
        .get("tradingview-watchlist-quotes/", { params: { format: "json", page_size: 100 } })
        .then((response) => response.data)
        .then((data) => data.results || data),
    );
  },
  listTradingviewTickerPrices: (options = {}) => {
    const cacheKey = buildCacheKey("lookup", "tradingview-watchlist-ticker-price", {});
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, async () => {
      const items = await resourceService.listTradingviewQuotes(options);
      return (Array.isArray(items) ? items : []).map((item) => ({
        ticker: item?.ticker || "",
        price: item?.price,
      }));
    });
  },
  getFundPositionSeries: (series = "soja", options = {}) => {
    const normalizedSeries = String(series || "soja").trim().toLowerCase();
    const cacheKey = buildCacheKey("market", "fund-position-series", { series: normalizedSeries });
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("mercado/posicao-fundos/", { params: { series: normalizedSeries } }).then((response) => response.data),
    );
  },
  getYahooHistory: ({ symbol, period1, period2 }, options = {}) => {
    const normalizedParams = normalizeRequestParams({ symbol, period1, period2 }) || {};
    const cacheKey = buildCacheKey("market", "yahoo-history", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("mercado/yahoo-proxy/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getFredHistory: ({ series, start_date, end_date }, options = {}) => {
    const normalizedParams = normalizeRequestParams({ series, start_date, end_date }) || {};
    const cacheKey = buildCacheKey("market", "fred-history", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("mercado/fred-proxy/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getGovernmentBondHistory: ({ country, duration, start_date, end_date }, options = {}) => {
    const normalizedParams = normalizeRequestParams({ country, duration, start_date, end_date }) || {};
    const cacheKey = buildCacheKey("market", "government-bond-history", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("mercado/government-bond-proxy/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getBrazilMacroHistory: ({ symbol, start_date, end_date }, options = {}) => {
    const normalizedParams = normalizeRequestParams({ symbol, start_date, end_date }) || {};
    const cacheKey = buildCacheKey("market", "brazil-macro-history", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("mercado/brazil-macro-proxy/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getCommercialRiskSummary: (params = {}, options = {}) => {
    const normalizedParams = normalizeRequestParams(params) || {};
    const cacheKey = buildCacheKey("dashboard", "commercial-risk-summary", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("dashboard/commercial-risk-summary/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getCommercialInsights: (params = {}, options = {}) => {
    const normalizedParams = normalizeRequestParams(params) || {};
    const cacheKey = buildCacheKey("insights", "commercialization", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("insights/commercialization/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  getMissingFieldsReport: (params = {}, options = {}) => {
    const normalizedParams = normalizeRequestParams(params) || {};
    const cacheKey = buildCacheKey("insights", "missing-fields", normalizedParams);
    if (options.force) {
      responseCache.delete(cacheKey);
    }
    return remember(cacheKey, () =>
      api.get("insights/missing-fields/", { params: normalizedParams }).then((response) => response.data),
    );
  },
  generateMarketSummary: (payload) =>
    api.post("market-summary/generate/", payload).then((response) => response.data),
  fetchJsonCached: (cacheKey, url, options = {}) =>
    remember(`external:${cacheKey}`, () => fetch(url, options).then((response) => response.json())),
  invalidateCache,
};
