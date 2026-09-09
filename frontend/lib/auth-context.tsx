"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearToken, getToken, setToken, subscribeToken } from "@/lib/token";

type AuthContextValue = {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Always null: the server has no localStorage, so this is what the server
// render (and the client's initial hydration pass, which must match it
// exactly) sees regardless of what's actually stored.
function getServerSnapshot(): null {
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // The token lives in an external store (localStorage), not in React
  // state, so useSyncExternalStore -- not useState+useEffect -- is the
  // correct primitive: it renders the server snapshot (null) through
  // hydration, then synchronizes to the real client value before the
  // browser paints, with no manual "have we checked yet" flag and no
  // flash of logged-out content for an already-logged-in user.
  const token = useSyncExternalStore(subscribeToken, getToken, getServerSnapshot);

  const login = useCallback((newToken: string) => {
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    // Wipe the whole query cache, not just ['me'] -- room lists, message
    // history, etc. all belong to the user who's leaving and must not be
    // visible for whoever logs in next on this browser.
    queryClient.clear();
  }, [queryClient]);

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
