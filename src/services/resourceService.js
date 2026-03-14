import { api } from "./api";

export const resourceService = {
  list: (resource, params = {}) => api.get(`/${resource}/`, { params }).then((response) => response.data),
  create: (resource, payload) => api.post(`/${resource}/`, payload).then((response) => response.data),
  update: (resource, id, payload) => api.put(`/${resource}/${id}/`, payload).then((response) => response.data),
  remove: (resource, id) => api.delete(`/${resource}/${id}/`).then((response) => response.data),
};
