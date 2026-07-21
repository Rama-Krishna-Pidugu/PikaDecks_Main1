import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://pikadecks.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/support", changefreq: "monthly", priority: "0.5" },
          { path: "/contact", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/best-ai-study-app", changefreq: "weekly", priority: "0.9" },
          { path: "/anki-alternative", changefreq: "weekly", priority: "0.9" },
          { path: "/quizlet-alternative", changefreq: "weekly", priority: "0.9" },
          { path: "/youtube-to-flashcards", changefreq: "weekly", priority: "0.8" },
          { path: "/pdf-to-flashcards", changefreq: "weekly", priority: "0.8" },
          { path: "/ai-study-tool-for-college-students", changefreq: "weekly", priority: "0.8" },
          { path: "/spaced-repetition-app", changefreq: "weekly", priority: "0.8" },
          { path: "/medical-student-study-app", changefreq: "weekly", priority: "0.8" },
          { path: "/flashcard-generator", changefreq: "weekly", priority: "0.8" },
          { path: "/decks", changefreq: "weekly", priority: "0.9" },
          { path: "/decks/biology-101", changefreq: "weekly", priority: "0.7" },
          { path: "/decks/aws-solutions-architect", changefreq: "weekly", priority: "0.7" },
          { path: "/decks/gre-vocabulary", changefreq: "weekly", priority: "0.7" },
          { path: "/decks/neet-physics-formulas", changefreq: "weekly", priority: "0.7" },
          { path: "/decks/medical-terminology", changefreq: "weekly", priority: "0.7" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
