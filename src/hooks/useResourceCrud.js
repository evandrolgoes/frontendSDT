import { useEffect, useState } from "react";

import { resourceService } from "../services/resourceService";

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

export function useResourceCrud(resource, initialFilters = {}) {
  const storageKey = `sdt_filters_${resource}`;
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null, page: 1 });
  const [filters, setFilters] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      return saved ? { ...initialFilters, ...JSON.parse(saved) } : initialFilters;
    } catch {
      return initialFilters;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (options = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await resourceService.listAll(resource, {}, options);
      setRows(response);
      setPagination({
        count: Array.isArray(response) ? response.length : 0,
        next: null,
        previous: null,
        page: 1,
      });
    } catch (loadError) {
      setError(extractApiError(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const save = async (payload, current) => {
    setError("");
    try {
      let savedRecord;
      if (current?.id) {
        savedRecord = await resourceService.update(resource, current.id, payload);
      } else {
        savedRecord = await resourceService.create(resource, payload);
      }
      await load();
      return savedRecord;
    } catch (saveError) {
      setError(extractApiError(saveError));
      return false;
    }
  };

  const remove = async (item) => {
    setError("");
    try {
      await resourceService.remove(resource, item.id);
      await load();
      return true;
    } catch (removeError) {
      setError(extractApiError(removeError));
      return false;
    }
  };

  useEffect(() => {
    load();
  }, [resource]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // Ignore storage failures and keep runtime state working.
    }
  }, [filters, storageKey]);

  return { rows, loading, pagination, filters, setFilters, load, save, remove, error, setError };
}
