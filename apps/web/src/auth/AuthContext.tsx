// Authentication context: session state, login/logout and role helpers.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { request, tokenStore } from '../api/client';
import { Role, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await request<User>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      tokenStore.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    const result = await request<{ user: User; accessToken: string; refreshToken: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: { email, password, ...(rememberMe === undefined ? {} : { rememberMe }) },
        auth: false,
      }
    );
    tokenStore.set(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }, []);

  // Creates a real account (password is bcrypt-hashed by the API) and signs in.
  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await request<{ user: User; accessToken: string; refreshToken: string }>(
      '/api/auth/register',
      { method: 'POST', body: { name, email, password }, auth: false }
    );
    tokenStore.set(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = tokenStore.refresh;
      await request('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // Ignore network errors on logout; the local session is cleared anyway.
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, hasRole, refreshUser }),
    [user, loading, login, register, logout, hasRole, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
