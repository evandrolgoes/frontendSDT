import axios from "axios";

import { tokenStorage } from "./storage";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const PUBLIC_AUTH_PATHS = [
  "/auth/invitations/",
  "/auth/forgot-password/",
  "/auth/reset-password-confirm/",
  "/auth/request-access/",
  "/auth/login/",
];

const ALWAYS_PUBLIC_GET_PATHS = [
  "/tradingview-watchlist-quotes/",
];

const PUBLIC_FLAG_GET_PATHS = [
  "/market-news-posts/",
];

const isPublicAuthPath = (config) => {
  const requestUrl = String(config?.url || "");
  return PUBLIC_AUTH_PATHS.some((path) => requestUrl.includes(path));
};

const hasPublicFlag = (config) => {
  const paramValue = config?.params?.public;
  if (paramValue !== undefined && paramValue !== null && paramValue !== "") {
    return ["1", "true", "yes"].includes(String(paramValue).trim().toLowerCase());
  }
  const requestUrl = String(config?.url || "");
  try {
    const baseOrigin = baseURL.replace(/\/api\/?$/, "") || "http://localhost:8000";
    const parsedUrl = new URL(requestUrl, baseOrigin);
    return ["1", "true", "yes"].includes(String(parsedUrl.searchParams.get("public") || "").trim().toLowerCase());
  } catch {
    return /(?:\?|&)public=(?:1|true|yes)(?:&|$)/i.test(requestUrl);
  }
};

const isPublicGetRequest = (config) => {
  const requestUrl = String(config?.url || "");
  const requestMethod = String(config?.method || "get").toLowerCase();
  if (requestMethod !== "get") {
    return false;
  }
  if (ALWAYS_PUBLIC_GET_PATHS.some((path) => requestUrl.includes(path))) {
    return true;
  }
  return hasPublicFlag(config) && PUBLIC_FLAG_GET_PATHS.some((path) => requestUrl.includes(path));
};

const isPublicRequest = (config) => isPublicAuthPath(config) || isPublicGetRequest(config);

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (isPublicRequest(config)) {
    if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  }
  const access = tokenStorage.getAccess();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let isRefreshing = false;
let queue = [];

const flushQueue = (error, token = null) => {
  queue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  queue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (isPublicRequest(originalRequest)) {
      return Promise.reject(error);
    }
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refresh = tokenStorage.getRefresh();
      if (!refresh) {
        tokenStorage.clear();
        window.location.href = "/login";
        return Promise.reject(error);
      }
      const { data } = await axios.post(`${baseURL}/auth/refresh/`, { refresh });
      tokenStorage.setTokens({ access: data.access, refresh: data.refresh || refresh });
      flushQueue(null, data.access);
      originalRequest.headers.Authorization = `Bearer ${data.access}`;
      return api(originalRequest);
    } catch (refreshError) {
      flushQueue(refreshError);
      const refreshStatus = refreshError.response?.status;
      if (refreshStatus === 401 || refreshStatus === 403) {
        tokenStorage.clear();
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
