import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { UserPublic } from "../types";
import { fetchCurrentUser, loginWithGoogle } from "../api";

interface AuthContextValue {
  user: UserPublic | null;
  token: string | null;
  loading: boolean;
  login: (googleIdToken: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

const TOKEN_KEY = "cl_jwt";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    fetchCurrentUser(saved)
      .then((u) => {
        setUser(u);
        setToken(saved);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (googleIdToken: string) => {
    const resp = await loginWithGoogle(googleIdToken);
    localStorage.setItem(TOKEN_KEY, resp.access_token);
    setToken(resp.access_token);
    setUser(resp.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    const u = await fetchCurrentUser(saved);
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
