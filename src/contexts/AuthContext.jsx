import { createContext, useContext, useEffect, useState } from "react";

import { api } from "../services/api";
import { tokenStorage } from "../services/storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    const access = tokenStorage.getAccess();
    if (!access) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me/");
      setUser(data);
    } catch {
      tokenStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    async login(credentials) {
      const { data } = await api.post("/auth/login/", credentials);
      tokenStorage.setTokens({ access: data.access, refresh: data.refresh });
      setUser(data.user);
    },
    logout() {
      tokenStorage.clear();
      setUser(null);
    },
    refreshProfile: fetchProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
