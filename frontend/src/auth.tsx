import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from './api/client';
import { setLang } from './i18n';
import { ensureDevice } from './offline/device';
import { checkOnline } from './offline/network';
import { clearSession, loadSession, saveSession } from './offline/session';
import { pullState, startSyncEngine, syncNow } from './offline/syncEngine';
import { endSession, startSession } from './offline/timeTracker';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

async function afterLogin(user: User) {
  try {
    await ensureDevice(user.id);
  } catch {
    /* офлайн — устройство зарегистрируем при следующем выходе в сеть */
  }
  await startSession();
  startSyncEngine();
  void syncNow();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await loadSession();
      if (s) {
        setUser(s.user);
        await afterLogin(s.user);
        // онлайн — освежаем профиль; офлайн — работаем с сохранённой сессией
        if (await checkOnline()) {
          try {
            const me = await api<User>('/api/auth/me');
            await saveSession({ ...s, user: me });
            setUser(me);
            void pullState(me.id);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              await clearSession();
              setUser(null);
            }
          }
        }
      }
      setReady(true);
    })();
    const onUnauth = async () => {
      await clearSession();
      setUser(null);
    };
    window.addEventListener('lms:unauthorized', onUnauth);
    return () => window.removeEventListener('lms:unauthorized', onUnauth);
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    const r = await api<{ access_token: string; expires_at: string; user: User }>('/api/auth/login', { body: { login, password } });
    await saveSession({ token: r.access_token, user: r.user, expiresAt: r.expires_at });
    if (r.user.lang) setLang(r.user.lang);
    setUser(r.user);
    await afterLogin(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await endSession();
    await syncNow().catch(() => false);
    await clearSession();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const isStaff = (u: User | null) => !!u && (u.role === 'admin' || u.role === 'methodist');
export const isManagerish = (u: User | null) => !!u && u.role !== 'employee';
