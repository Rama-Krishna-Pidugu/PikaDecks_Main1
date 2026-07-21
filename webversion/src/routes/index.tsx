import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AppPreview } from "@/components/landing/AppPreview";
import { Community } from "@/components/landing/Community";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import * as Sentry from "@sentry/react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pikadecks — AI Flashcards That Help You Remember Anything" },
      { name: "description", content: "Turn PDFs, YouTube videos, notes, and websites into smart AI flashcards in seconds. Spaced repetition, an AI study assistant, and a community of 10k+ learners. Free forever." },
      { property: "og:title", content: "Pikadecks — AI Flashcards That Help You Remember Anything" },
      { property: "og:description", content: "Your AI-powered second brain for learning. Turn any content into smart flashcards with spaced repetition." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://pikadecks.app/" },
      { property: "og:image", content: "https://pikadecks.app/og-image.png" },
      { property: "og:image:alt", content: "Pikadecks mascot with floating AI flashcards" },
      { name: "twitter:title", content: "Pikadecks — AI Flashcards That Help You Remember Anything" },
      { name: "twitter:description", content: "Turn PDFs, YouTube, and notes into smart AI flashcards. The modern Anki alternative." },
      { name: "twitter:image", content: "https://pikadecks.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://pikadecks.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "PikaDecks",
          applicationCategory: "EducationalApplication",
          operatingSystem: "iOS, Android, Web",
          description: "AI-powered flashcard app that turns PDFs, YouTube videos, notes, and websites into spaced-repetition study decks.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "1200" },
          image: "https://pikadecks.app/og-image.png",
          url: "https://pikadecks.app/",
          downloadUrl: "https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks",
          featureList: "AI Flashcard Generation, AI Quiz Generation, Spaced Repetition, Progress Tracking, Offline Study Support, PDF/YouTube conversion",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "PikaDecks",
          url: "https://pikadecks.app",
          logo: "https://pikadecks.app/appIcon.png",
          sameAs: [
            "https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks"
          ]
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "PikaDecks",
          url: "https://pikadecks.app"
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            { "@type": "Question", name: "What is Pikadecks?", acceptedAnswer: { "@type": "Answer", text: "Pikadecks is an AI-powered flashcard app that turns PDFs, YouTube videos, notes, and websites into smart study decks with spaced repetition." } },
            { "@type": "Question", name: "Is Pikadecks free?", acceptedAnswer: { "@type": "Answer", text: "Yes. Pikadecks has a free forever plan with AI flashcard generation, spaced repetition, and sync across devices. Pro unlocks unlimited AI and advanced features." } },
            { "@type": "Question", name: "How is Pikadecks different from Anki?", acceptedAnswer: { "@type": "Answer", text: "Pikadecks uses AI to generate flashcards automatically from any content, has a modern mobile-first interface, includes an AI study assistant, and connects to MCP-compatible tools — while keeping the proven spaced repetition that makes Anki effective." } },
            { "@type": "Question", name: "Can I import PDFs and YouTube videos?", acceptedAnswer: { "@type": "Answer", text: "Yes. Upload PDFs, paste YouTube links, drop in notes, or share web articles and Pikadecks will generate flashcards instantly." } },
          ],
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <AppPreview />
      <Community />
      <Pricing />
      <FinalCTA />
      <Footer />
    </main>
  );
}
