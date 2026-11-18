"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AuthResult = { error: string | null };
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  authEvent: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (fullName: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [authEvent, setAuthEvent] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;
    const loadingTimeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 3500);
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      setAuthEvent(event);
      setUser(session?.user ?? null);
      setLoading(false);
      window.clearTimeout(loadingTimeout);
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user ?? null);
        setLoading(false);
        window.clearTimeout(loadingTimeout);
      }
    }).catch(() => {
      if (active) {
        setUser(null);
        setLoading(false);
        window.clearTimeout(loadingTimeout);
      }
    });
    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { error: "خدمة تسجيل الدخول غير مهيأة بعد." };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (fullName: string, email: string, password: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { error: "خدمة تسجيل الدخول غير مهيأة بعد." };
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/account`,
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async (): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { error: "خدمة تسجيل الدخول غير مهيأة بعد." };
    const { error } = await client.auth.signOut();
    return { error: error?.message ?? null };
  };

  const sendPasswordReset = async (email: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { error: "خدمة تسجيل الدخول غير مهيأة بعد." };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { error: "خدمة تسجيل الدخول غير مهيأة بعد." };
    const { error } = await client.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  return <AuthContext.Provider value={{ user, loading, configured, authEvent, signIn, signUp, signOut, sendPasswordReset, updatePassword }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
