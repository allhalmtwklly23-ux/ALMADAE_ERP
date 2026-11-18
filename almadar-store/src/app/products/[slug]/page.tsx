import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/site-shell";
import { ProductPurchase } from "@/components/product-purchase";
import { products, formatPrice } from "@/data/products";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((item) => item.id === slug);
  return { title: product ? `${product.name} | المدار` : "المنتج غير موجود | المدار" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((item) => item.id === slug);
  if (!product) notFound();
  return <><section className="section product-detail"><div className="detail-image" style={{ backgroundImage: `url("${product.image}")` }} /><div className="detail-copy"><span className="eyebrow"><Link href="/shop">الثياب</Link><span aria-hidden="true">/</span>{product.category}</span><h1>{product.name}</h1><p>{product.description}</p><strong>{formatPrice(product.price)}</strong><ProductPurchase product={product} /></div></section><section className="section section-tight"><div className="section-heading"><div><span className="eyebrow">اكتشف المزيد</span><h2>قد يعجبك أيضًا</h2></div></div><div className="product-grid">{products.filter((item) => item.id !== product.id).slice(0, 3).map((item) => <ProductCard key={item.id} product={item} />)}</div></section></>;
}
