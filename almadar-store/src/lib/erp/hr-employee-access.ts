export const HR_EMPLOYEE_PERMISSIONS = [
  { key: "employees:view", label: "عرض الموظفين" },
  { key: "employees:create", label: "إنشاء حسابات الموظفين" },
  { key: "employees:edit", label: "تعديل حسابات الموظفين" },
  { key: "payrollRuns:view", label: "عرض مسيرات الرواتب" },
  { key: "payrollRuns:create", label: "إنشاء مسيرات الرواتب" },
  { key: "payrollRuns:edit", label: "تعديل مسيرات الرواتب" },
  { key: "reportJobs:view", label: "عرض التقارير" },
] as const;

type PermissionActor = {
  role?: string;
  permissions?: string[];
};

const HR_PERMISSION_KEYS = new Set(HR_EMPLOYEE_PERMISSIONS.map(({ key }) => key));

export function canAssignHrEmployeePermission(actor: PermissionActor, permission: string) {
  if (!HR_PERMISSION_KEYS.has(permission as (typeof HR_EMPLOYEE_PERMISSIONS)[number]["key"])) return false;
  if (actor.role === "super_admin" || actor.permissions?.includes("all")) return true;

  const [entity, action] = permission.split(":");
  const entityKey = entity.toLocaleLowerCase();
  const permissions = new Set((actor.permissions ?? []).map((value) => value.toLocaleLowerCase()));
  return permissions.has(`${entityKey}:${action}`)
    || permissions.has(`${entityKey}:*`)
    || permissions.has(`${entityKey}:all`);
}

export function canAssignHrEmployeePermissions(actor: PermissionActor, permissions: unknown): permissions is string[] {
  if (!Array.isArray(permissions) || !permissions.every((permission) => typeof permission === "string")) {
    return false;
  }
  if (new Set(permissions).size !== permissions.length) return false;
  return permissions.every((permission) => canAssignHrEmployeePermission(actor, permission));
}

export function getAssignableHrEmployeePermissions(actor: PermissionActor) {
  return HR_EMPLOYEE_PERMISSIONS.filter(({ key }) => canAssignHrEmployeePermission(actor, key));
}

export function mergeHrEmployeePermissions(actor: PermissionActor, current: string[], requested: string[]) {
  if (!canAssignHrEmployeePermissions(actor, requested)) return null;
  const assignable = new Set(getAssignableHrEmployeePermissions(actor).map(({ key }) => key));
  const unchanged = current.filter((permission) => !HR_PERMISSION_KEYS.has(permission as (typeof HR_EMPLOYEE_PERMISSIONS)[number]["key"])
    || !assignable.has(permission as (typeof HR_EMPLOYEE_PERMISSIONS)[number]["key"]));
  return [...new Set([...unchanged, ...requested])];
}
