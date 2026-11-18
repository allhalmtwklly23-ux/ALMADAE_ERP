import JsBarcode from "jsbarcode";

export function invoiceBarcode(reference: string): string | null {
  if (!reference.trim() || reference.length > 40 || !/^[\x20-\x7e]+$/.test(reference)) {
    return null;
  }

  const target: { encodings?: { data: string }[] } = {};
  JsBarcode(target, reference, { format: "CODE128", displayValue: false });
  if (!target.encodings?.length) throw new Error("Failed to generate invoice barcode.");
  return target.encodings.map((encoding) => encoding.data).join("");
}
