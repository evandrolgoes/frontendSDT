import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const DashboardDebugContext = createContext(null);

export function DashboardDebugProvider({ children, isSuperuser = false }) {
  const [enabled, setEnabled] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);

  useEffect(() => {
    if (isSuperuser) {
      return;
    }
    setEnabled(false);
    setActiveEntry(null);
  }, [isSuperuser]);

  const showDebugEntry = useCallback(
    (entry) => {
      if (!isSuperuser || !entry) {
        return;
      }
      setActiveEntry(entry);
    },
    [isSuperuser],
  );

  const clearDebugEntry = useCallback(() => {
    setActiveEntry(null);
  }, []);

  const value = useMemo(
    () => ({
      isSuperuser,
      enabled: isSuperuser && enabled,
      setEnabled,
      activeEntry,
      showDebugEntry,
      clearDebugEntry,
    }),
    [activeEntry, clearDebugEntry, enabled, isSuperuser, showDebugEntry],
  );

  return <DashboardDebugContext.Provider value={value}>{children}</DashboardDebugContext.Provider>;
}

export function useDashboardDebug() {
  const context = useContext(DashboardDebugContext);
  if (!context) {
    throw new Error("useDashboardDebug must be used inside DashboardDebugProvider");
  }
  return context;
}
