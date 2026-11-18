"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ErpSessionUser = {
  id: string;
  companyId: string | null;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
};

export type ErpCompanyOption = {
  id: string;
  name: string;
  active: boolean;
};

type ErpSessionContextValue = {
  user: ErpSessionUser | null;
  companies: ErpCompanyOption[];
  multiTenantEnabled: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<ErpSessionUser | null>;
};

const ErpSessionContext = createContext<ErpSessionContextValue | null>(null);

export function ErpSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ErpSessionUser | null>(null);
  const [companies, setCompanies] = useState<ErpCompanyOption[]>([]);
  const [multiTenantEnabled, setMultiTenantEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        setUser(null);
        setCompanies([]);
        setMultiTenantEnabled(false);
        return null;
      }
      if (!response.ok) throw new Error(`تعذر التحقق من الجلسة (HTTP ${response.status}).`);

      const payload = await response.json() as {
        user?: ErpSessionUser;
        companies?: ErpCompanyOption[];
        multiTenantEnabled?: boolean;
      };
      setUser(payload.user ?? null);
      setCompanies(payload.companies ?? []);
      setMultiTenantEnabled(payload.multiTenantEnabled === true);
      return payload.user ?? null;
    } catch (verificationError) {
      const message = verificationError instanceof Error
        ? verificationError.message
        : "تعذر التحقق من جلسة النظام.";
      setUser(null);
      setCompanies([]);
      setMultiTenantEnabled(false);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return (
    <ErpSessionContext.Provider value={{ user, companies, multiTenantEnabled, loading, error, refresh }}>
      {children}
    </ErpSessionContext.Provider>
  );
}

export function useErpSession() {
  const context = useContext(ErpSessionContext);
  if (!context) throw new Error("useErpSession must be used inside ErpSessionProvider");
  return context;
}

export function hasErpPermission(
  user: Pick<ErpSessionUser, "role" | "permissions"> | null,
  entity: string,
  action: string,
) {
  if (!user) return false;
  if (user.role === "super_admin" || user.permissions.includes("all")) return true;
  const entityKey = entity.toLocaleLowerCase();
  const permissionSet = new Set(user.permissions.map((permission) => permission.toLocaleLowerCase()));
  return permissionSet.has(`${entityKey}:${action}`)
    || permissionSet.has(`${entityKey}:*`)
    || permissionSet.has(`${entityKey}:all`);
}
