import type { MetadataRoute } from "next";
import { products } from "@/data/products";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPages = ["", "/shop", "/about"];
  return [
    ...publicPages.map((path) => ({ url: `${siteUrl}${path}` })),
    ...products.map((product) => ({ url: `${siteUrl}/products/${product.id}` })),
  ];
}
