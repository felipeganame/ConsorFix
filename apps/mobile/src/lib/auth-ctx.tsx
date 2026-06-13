import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getUser, setUser, type SessionUser } from './api.js';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  setSession: (u: SessionUser) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser()
      .then((u) => setUserState(u))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setSession: async (u) => {
        await setUser(u);
        setUserState(u);
      },
      logout: async () => {
        await clearSession();
        setUserState(null);
      },
    }),
    [user, loading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
