declare module "jsbarcode" {
  type BarcodeTarget = { encodings?: { data: string }[] };

  function JsBarcode(
    target: BarcodeTarget,
    text: string,
    options: { format: string; displayValue?: boolean },
  ): void;

  export default JsBarcode;
}
