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

const PUBLIC_GET_PATHS = [
  "/market-news-posts/",
];

const isPublicAuthPath = (config) => {
  const requestUrl = String(config?.url || "");
  return PUBLIC_AUTH_PATHS.some((path) => requestUrl.includes(path));
};

const isPublicGetRequest = (config) => {
  const requestUrl = String(config?.url || "");
  const requestMethod = String(config?.method || "get").toLowerCase();
  return requestMethod === "get" && PUBLIC_GET_PATHS.some((path) => requestUrl.includes(path));
};

const isPublicRequest = (config) => isPublicAuthPath(config) || isPublicGetRequest(config);

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (isPublicAuthPath(config)) {
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
      tokenStorage.clear();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
