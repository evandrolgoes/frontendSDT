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
      value.forEach((item) => formData.append(key, item));
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

export const resourceService = {
  list: (resource, params = {}) =>
    remember(buildCacheKey("list", resource, params), () =>
      api.get(`/${resource}/`, { params }).then((response) => response.data),
    ),
  listAll: async (resource, params = {}) => {
    return remember(buildCacheKey("listAll", resource, params), async () => {
      let nextPage = 1;
      let aggregated = [];

      while (nextPage) {
        const response = await api.get(`/${resource}/`, { params: { page: nextPage, page_size: 100, ...params } });
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
    api.patch(`/${resource}/${id}/`, payload).then((response) => {
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
  listAttachments: (resource, id) =>
    remember(buildCacheKey("attachments", `${resource}/${id}`, {}), () =>
      api.get(`/${resource}/${id}/attachments/`).then((response) => response.data),
    ),
  listDerivativeContracts: (bolsa) =>
    remember(buildCacheKey("lookup", "derivative-contracts", { bolsa }), () =>
      api.get("derivative-contracts/", { params: { bolsa } }).then((response) => response.data),
    ),
  listIbgeStates: () =>
    remember(buildCacheKey("lookup", "localidades/estados", {}), () =>
      api.get("localidades/estados/").then((response) => response.data),
    ),
  listIbgeCities: (uf) =>
    remember(buildCacheKey("lookup", "localidades/municipios", { uf }), () =>
      api.get("localidades/municipios/", { params: { uf } }).then((response) => response.data),
    ),
  fetchJsonCached: (cacheKey, url, options = {}) =>
    remember(`external:${cacheKey}`, () => fetch(url, options).then((response) => response.json())),
  invalidateCache,
};
