import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { HAS_SUPABASE_CREDENTIALS, RESOLVED_SUPABASE_URL, supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);
const PREVIEW_ADMIN_USER = {
  id: 'preview-admin',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'preview-admin@local.test',
  app_metadata: { provider: 'email' },
  user_metadata: { previewMode: true },
  created_at: new Date().toISOString(),
} as User;

function isLocalAdminBypassEnabled() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return import.meta.env.DEV || host === "localhost" || host === "127.0.0.1";
}

function clearSupabaseStorage() {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith("sb-") || key.includes("supabase.auth")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage cleanup issues.
  }
}

async function signInViaRest(email: string, password: string) {
  const baseUrl = RESOLVED_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!baseUrl || !publishableKey) {
    return { error: new Error("Supabase credentials are missing.") };
  }

  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        error_description?: string;
        msg?: string;
      }
    | null;

  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    return {
      error: new Error(
        payload?.error_description || payload?.msg || `Sign in failed (${response.status}).`,
      ),
    };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });

  if (error) return { error };
  return { data, error: null };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!HAS_SUPABASE_CREDENTIALS) {
      setSession(null);
      setUser(PREVIEW_ADMIN_USER);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.id);
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkAdmin(userId: string) {
    const { data, error } = await withTimeout(
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle(),
      5000,
      'admin role lookup',
    );

    if (data) {
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    if (isLocalAdminBypassEnabled()) {
      if (error) {
        console.warn("[auth] Admin role lookup failed in local dev, enabling bypass.", error);
      }
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    setIsAdmin(false);
    setLoading(false);
  }

  const signIn = async (email: string, password: string) => {
    if (!HAS_SUPABASE_CREDENTIALS) {
      setUser(PREVIEW_ADMIN_USER);
      setSession(null);
      setIsAdmin(true);
      return { error: null };
    }
    try {
      let { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        8000,
        'password sign-in',
      );

      if (error || !data?.session || !data?.user) {
        const fallback = await signInViaRest(email, password);
        if (fallback.error) {
          return { error: fallback.error as Error };
        }
        data = fallback.data;
        error = null;
      }

      setSession(data.session ?? null);
      setUser(data.user ?? null);
      if (data.user?.id) {
        await checkAdmin(data.user.id);
      } else {
        setIsAdmin(false);
        setLoading(false);
      }

      return { error: null };
    } catch (error) {
      const fallback = await signInViaRest(email, password);
      if (fallback.error) {
        return { error: fallback.error as Error };
      }

      const data = fallback.data;
      setSession(data.session ?? null);
      setUser(data.user ?? null);
      if (data.user?.id) {
        await checkAdmin(data.user.id);
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
      return { error: null };
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!HAS_SUPABASE_CREDENTIALS) {
      return { error: null };
    }
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (!HAS_SUPABASE_CREDENTIALS) {
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      clearSupabaseStorage();
      if (typeof window !== "undefined") window.location.assign("/login");
      return;
    }
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      clearSupabaseStorage();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
