"use client";

import Link from "next/link";
import { useFavorites } from "@/components/favorites-provider";
import { ProductCard } from "@/components/site-shell";
import { products } from "@/data/products";

export default function FavoritesPage() {
  const { ids } = useFavorites();
  const favoriteProducts = products.filter((product) => ids.includes(product.id));
  return <><section className="page-intro"><div className="page-intro-inner"><span className="eyebrow">اختياراتك المحفوظة</span><h1>المفضلة</h1><p>ثياب لفتت انتباهك، محفوظة لتعود إليها وقتما تشاء.</p></div></section><section className="section">{favoriteProducts.length ? <div className="product-grid">{favoriteProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>ما أضفت ثيابًا للمفضلة بعد</h2><p>احفظ القطع التي أعجبتك لتجدها هنا بسهولة.</p><Link className="button" href="/shop">اكتشف الثياب <span aria-hidden="true">←</span></Link></div>}</section></>;
}
