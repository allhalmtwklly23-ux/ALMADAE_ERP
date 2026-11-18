"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/data/products";
import { useCart } from "@/components/cart-provider";

const sizeGuide = [
  ["48", "150–155 سم"], ["50", "156–161 سم"], ["52", "162–167 سم"], ["54", "168–173 سم"],
  ["56", "174–179 سم"], ["58", "180–185 سم"], ["60", "186–191 سم"], ["62", "192–197 سم"],
];

export function ProductPurchase({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [colorIndex, setColorIndex] = useState(0);
  const [size, setSize] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [added, setAdded] = useState(false);
  const [needsSize, setNeedsSize] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const color = product.colors[colorIndex];

  useEffect(() => {
    if (showGuide) dialogRef.current?.showModal();
    else if (dialogRef.current?.open) dialogRef.current.close();
  }, [showGuide]);

  const handleAdd = () => {
    if (!size) {
      setNeedsSize(true);
      return;
    }
    addItem(product, color, size);
    setNeedsSize(false);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  return <div className="purchase-panel">
    <div className="selection-block">
      <div className="selection-heading"><h2>اللون</h2><span>{color.name}</span></div>
      <div className="color-options" role="group" aria-label="اختر اللون">
        {product.colors.map((option, index) => <button className={`color-option${index === colorIndex ? " selected" : ""}`} key={option.hex} type="button" aria-label={option.name} aria-pressed={index === colorIndex} onClick={() => setColorIndex(index)}><span style={{ backgroundColor: option.hex }} /></button>)}
      </div>
    </div>
    <div className="selection-block">
      <div className="selection-heading"><h2>مقاس الثوب</h2><button className="text-link size-guide-trigger" type="button" onClick={() => setShowGuide(true)}>دليل المقاسات</button></div>
      <div className="size-options" role="group" aria-label="اختر مقاس الثوب">
        {product.sizes.map((option) => <button className={`size-option${size === option ? " selected" : ""}`} key={option} type="button" aria-pressed={size === option} onClick={() => { setSize(option); setNeedsSize(false); }}>{option}</button>)}
      </div>
      {needsSize && <p className="field-error" role="alert">اختر مقاس الثوب قبل إضافته إلى السلة.</p>}
    </div>
    <div className="product-specs"><div><span>القصة</span><strong>{product.fit}</strong></div><div><span>الخامة</span><strong>{product.fabric}</strong></div></div>
    <button className="button purchase-button" type="button" onClick={handleAdd}>{added ? "أُضيف إلى السلة" : "أضف إلى السلة"}<span aria-hidden="true">←</span></button>
    {added && <p className="added-feedback" role="status">أُضيف {product.name}، مقاس {size}، بلون {color.name} إلى سلتك.</p>}
    <dialog className="size-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); setShowGuide(false); }} onClick={(event) => { if (event.target === dialogRef.current) setShowGuide(false); }}>
      <div className="size-dialog-content"><div className="size-dialog-heading"><div><span className="eyebrow">دليل المدار</span><h2>اختر مقاسك</h2></div><button className="dialog-close" type="button" aria-label="إغلاق دليل المقاسات" onClick={() => setShowGuide(false)}>×</button></div><p>اختر المقاس الأقرب لطولك، واستعن بثوب مناسب لديك للمقارنة. قد تختلف المقاسات حسب القصة.</p><div className="size-table-wrap"><table><thead><tr><th>مقاس الثوب</th><th>الطول الإرشادي</th></tr></thead><tbody>{sizeGuide.map(([guideSize, height]) => <tr key={guideSize}><td>{guideSize}</td><td>{height}</td></tr>)}</tbody></table></div><p className="guide-caveat">جدول إرشادي للمعاينة فقط. يجب مطابقته مع قياسات المدار الفعلية قبل استقبال الطلبات.</p><button className="button" type="button" onClick={() => setShowGuide(false)}>العودة للمنتج</button></div>
    </dialog>
  </div>;
}
