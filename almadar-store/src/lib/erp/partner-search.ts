const searchableFields = [
  "name", "legalName", "company", "reference", "code", "phone", "alternatePhone",
  "email", "taxNumber", "commercialRegistration", "city", "category",
] as const;

function normalize(value: string) {
  return value.toLocaleLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .trim();
}

export function searchInvoicePartners<T extends Record<string, unknown>>(partners: T[], query: string): T[] {
  const search = normalize(query);
  if (!search) return partners;
  const numericQuery = /^[\d\s()+-]+$/.test(search) ? search.replace(/[\s()+-]/g, "") : "";
  return partners.filter((partner) => searchableFields.some((field) => {
    const raw = partner[field];
    if (typeof raw !== "string" && typeof raw !== "number") return false;
    const value = normalize(String(raw));
    if (value.includes(search)) return true;
    return numericQuery !== "" && /^[\d\s()+-]+$/.test(value)
      && value.replace(/[\s()+-]/g, "").includes(numericQuery);
  }));
}
