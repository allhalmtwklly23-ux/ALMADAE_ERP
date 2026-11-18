import type { PermissionRule, RoleKey, RolePermission } from "./types";

export const defaultPermissions: Record<RoleKey, PermissionRule[]> = {
  super_admin: [
    { action: "read:all", allowed: true, scope: "global" },
    { action: "write:all", allowed: true, scope: "global" },
    { action: "approve:finance", allowed: true, scope: "finance" },
    { action: "manage:security", allowed: true, scope: "security" },
  ],
  finance_manager: [
    { action: "read:accounting", allowed: true, scope: "finance" },
    { action: "write:journal", allowed: true, scope: "finance" },
    { action: "approve:payments", allowed: true, scope: "finance" },
    { action: "read:reports", allowed: true, scope: "reports" },
  ],
  sales_manager: [
    { action: "read:sales", allowed: true, scope: "sales" },
    { action: "write:orders", allowed: true, scope: "sales" },
    { action: "read:crm", allowed: true, scope: "crm" },
    { action: "read:reports", allowed: true, scope: "reports" },
  ],
  inventory_manager: [
    { action: "read:inventory", allowed: true, scope: "inventory" },
    { action: "write:stock", allowed: true, scope: "inventory" },
    { action: "read:warehouse", allowed: true, scope: "warehouse" },
    { action: "read:reports", allowed: true, scope: "reports" },
  ],
  hr_manager: [
    { action: "read:employees", allowed: true, scope: "hr" },
    { action: "write:payroll", allowed: true, scope: "hr" },
    { action: "read:attendance", allowed: true, scope: "hr" },
    { action: "read:reports", allowed: true, scope: "reports" },
  ],
  employee: [],
  auditor: [
    { action: "read:audit", allowed: true, scope: "audit" },
    { action: "read:all", allowed: true, scope: "global" },
    { action: "write:notes", allowed: true, scope: "audit" },
    { action: "read:reports", allowed: true, scope: "reports" },
  ],
};

export const roleLabels: Record<RoleKey, string> = {
  super_admin: "مدير النظام",
  finance_manager: "مدير المحاسبة",
  sales_manager: "مدير المبيعات",
  inventory_manager: "مدير المخزون",
  hr_manager: "مدير الموارد البشرية",
  employee: "موظف",
  auditor: "المراجع الداخلي",
};

export const rolePermissions: RolePermission[] = (Object.entries(defaultPermissions) as Array<[RoleKey, PermissionRule[]]>).map(([role, permissions]) => ({
  role,
  name: roleLabels[role],
  permissions,
}));

export function hasPermission(role: RoleKey, action: string): boolean {
  const rules = defaultPermissions[role] ?? [];
  return rules.some((rule) => rule.action === action && rule.allowed);
}
