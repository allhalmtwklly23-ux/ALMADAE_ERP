"use client";

import { useMemo, useState } from "react";
import { products } from "@/data/products";
import { ProductCard } from "@/components/site-shell";

const filters = ["الكل", "أبيض", "ألوان", "رسمي"];

export function ShopCatalog() {
  const [activeFilter, setActiveFilter] = useState("الكل");
  const [sortOrder, setSortOrder] = useState("featured");
  const [query, setQuery] = useState("");
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");
    const filtered = products.filter((product) => {
      const matchesCategory = activeFilter === "الكل" || product.category === activeFilter;
      const matchesQuery = !normalizedQuery || product.name.toLocaleLowerCase("ar").includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
    if (sortOrder === "price-low") filtered.sort((a, b) => a.price - b.price);
    if (sortOrder === "price-high") filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [activeFilter, query, sortOrder]);
  return <><div className="catalog-toolbar"><div className="catalog-controls"><label className="search-field"><span className="search-symbol" aria-hidden="true">⌕</span><span className="sr-only">ابحث في الثياب</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن ثوب" /></label><div className="filter-list" aria-label="تصفية حسب النوع">{filters.map((filter) => <button className="filter-button" key={filter} type="button" aria-pressed={activeFilter === filter} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div></div><label><span className="sr-only">ترتيب المنتجات</span><select className="sort-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="featured">ترتيب حسب: المميزة</option><option value="price-low">السعر: الأقل أولًا</option><option value="price-high">السعر: الأعلى أولًا</option></select></label></div>{visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state catalog-empty"><h2>ما لقينا ثوب بهذا الاسم</h2><p>جرّب كلمة بحث مختلفة أو أزل بعض الفلاتر.</p><button className="text-link" type="button" onClick={() => { setQuery(""); setActiveFilter("الكل"); }}>عرض كل الثياب</button></div>}</>;
}
