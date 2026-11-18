export type EmployeeEmploymentStatus = "active" | "on_leave" | "suspended" | "terminated";
export type EmployeeRecordStatus = "active" | "inactive" | "archived";

export type EmployeeProfileInput = {
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  hiredOn: string | null;
  employmentStatus: EmployeeEmploymentStatus;
  recordStatus: EmployeeRecordStatus;
};

const EMPLOYMENT_STATUSES: EmployeeEmploymentStatus[] = ["active", "on_leave", "suspended", "terminated"];
const RECORD_STATUSES: EmployeeRecordStatus[] = ["active", "inactive", "archived"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, maximum: number, required = false) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized;
}

function isIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseEmployeeProfileInput(
  value: unknown,
  requireRecordStatus: boolean,
): { input: EmployeeProfileInput } | { error: string } {
  if (!isRecord(value)) return { error: "بيانات الموظف غير صالحة." };

  const employeeNumber = readString(value.employeeNumber, 50, true);
  const fullName = readString(value.fullName, 150, true);
  const email = readString(value.email ?? "", 254);
  const phone = readString(value.phone ?? "", 40);
  if (!employeeNumber || !fullName || email === null || phone === null) {
    return { error: "تحقق من الرقم الوظيفي والاسم وبيانات التواصل." };
  }
  if (email && !EMAIL_PATTERN.test(email)) return { error: "البريد الإلكتروني غير صالح." };

  let hiredOn: string | null = null;
  if (value.hiredOn !== undefined && value.hiredOn !== null && value.hiredOn !== "") {
    if (typeof value.hiredOn !== "string" || !isIsoDate(value.hiredOn)) {
      return { error: "تاريخ التعيين غير صالح." };
    }
    hiredOn = value.hiredOn;
  }

  const employmentStatus = value.employmentStatus === undefined
    ? "active"
    : value.employmentStatus;
  if (typeof employmentStatus !== "string" || !EMPLOYMENT_STATUSES.includes(employmentStatus as EmployeeEmploymentStatus)) {
    return { error: "الحالة الوظيفية غير صالحة." };
  }

  const recordStatus = value.recordStatus === undefined && !requireRecordStatus
    ? "active"
    : value.recordStatus;
  if (typeof recordStatus !== "string" || !RECORD_STATUSES.includes(recordStatus as EmployeeRecordStatus)) {
    return { error: "حالة الملف غير صالحة." };
  }

  return {
    input: {
      employeeNumber,
      fullName,
      email,
      phone,
      hiredOn,
      employmentStatus: employmentStatus as EmployeeEmploymentStatus,
      recordStatus: recordStatus as EmployeeRecordStatus,
    },
  };
}
