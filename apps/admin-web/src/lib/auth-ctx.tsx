import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getUser, setUser, type SessionUser } from './api.js';

interface AuthState {
  user: SessionUser | null;
  setSession: (u: SessionUser) => void;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUserState] = useState<SessionUser | null>(getUser());
  const value = useMemo<AuthState>(
    () => ({
      user,
      setSession: (u) => {
        setUser(u);
        setUserState(u);
      },
      logout: () => {
        clearSession();
        setUserState(null);
      },
    }),
    [user],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
