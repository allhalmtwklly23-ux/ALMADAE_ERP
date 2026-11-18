import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  const configured = process.env.VERCEL_ENV === "production" && Boolean(process.env.NEXT_PUBLIC_SITE_URL);
  return {
    rules: configured
      ? [{ userAgent: "*", allow: "/", disallow: ["/account", "/cart", "/favorites"] }]
      : [{ userAgent: "*", disallow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
