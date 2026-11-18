"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/data/products";

export default function CartPage() {
  const { items, removeItem, changeQuantity } = useCart();
  const subtotal = items.reduce((total, item) => total + item.product.price * item.quantity, 0);
  return <><section className="page-intro"><div className="page-intro-inner"><span className="eyebrow">مشترياتك</span><h1>سلة المدار</h1><p>راجع اختياراتك قبل متابعة الطلب.</p></div></section><section className="section">{items.length === 0 ? <div className="empty-state"><h2>سلتك بانتظار اختيارك</h2><p>اكتشف مجموعة المدار وأضف ما يناسبك.</p><Link className="button" href="/shop">تسوق الثياب <span aria-hidden="true">←</span></Link></div> : <div className="cart-layout"><div>{items.map(({ key, product, color, size, quantity }) => <article className="cart-row" key={key}><div className="cart-thumb" style={{ backgroundImage: `url("${product.image}")` }} /><div className="cart-item-details"><h2>{product.name}</h2><p>اللون: {color.name} · مقاس الثوب: {size}</p><div className="quantity-controls"><button type="button" onClick={() => changeQuantity(key, -1)} aria-label="تقليل الكمية">−</button><span>{quantity}</span><button type="button" onClick={() => changeQuantity(key, 1)} aria-label="زيادة الكمية">+</button><button className="remove-button" type="button" onClick={() => removeItem(key)}>حذف</button></div></div><span className="product-price">{formatPrice(product.price * quantity)}</span></article>)}</div><aside className="cart-summary"><h2>ملخص الطلب</h2><div className="summary-line"><span>المجموع الفرعي</span><span>{formatPrice(subtotal)}</span></div><div className="summary-line"><span>الشحن</span><span>يحدد لاحقًا</span></div><div className="summary-line summary-total"><span>الإجمالي</span><span>{formatPrice(subtotal)}</span></div><button className="button" type="button" disabled>إتمام الطلب قريبًا</button><p className="checkout-note">الدفع والشحن غير مفعّلين بعد. ستُتاح متابعة الطلب بعد ربط بوابة الدفع وشركة الشحن المعتمدتين.</p></aside></div>}</section></>;
}
