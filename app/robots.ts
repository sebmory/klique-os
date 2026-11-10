import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.klique.ch";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/athletes", "/athletes/", "/pass"],
      disallow: [
        "/api/",
        "/admin/",
        "/athlete/",
        "/crm/",
        "/media-desk/",
        "/partner/",
        "/creative/",
        "/today",
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
