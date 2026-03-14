import { useEffect, useState } from "react";

import { resourceService } from "../services/resourceService";

export function useResourceCrud(resource, initialFilters = {}) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null, page: 1 });
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);

  const load = async (params = {}) => {
    setLoading(true);
    try {
      const response = await resourceService.list(resource, { ...filters, ...params });
      setRows(response.results || response);
      setPagination({
        count: response.count || (Array.isArray(response) ? response.length : 0),
        next: response.next || null,
        previous: response.previous || null,
        page: params.page || filters.page || 1,
      });
    } finally {
      setLoading(false);
    }
  };

  const save = async (payload, current) => {
    if (current?.id) {
      await resourceService.update(resource, current.id, payload);
    } else {
      await resourceService.create(resource, payload);
    }
    await load({ page: pagination.page });
  };

  const remove = async (item) => {
    await resourceService.remove(resource, item.id);
    await load({ page: pagination.page });
  };

  useEffect(() => {
    load({ page: 1 });
  }, [resource, JSON.stringify(filters)]);

  return { rows, loading, pagination, filters, setFilters, load, save, remove };
}
