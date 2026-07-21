import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createProductSchema, createFAQSchema } from "@/lib/seo";
import { Sparkles, Star, ShieldCheck } from "lucide-react";

const pageTitle = "The Modern Quizlet Alternative in 2026 | PikaDecks";
const pageDescription = "Looking for a Quizlet alternative? PikaDecks offers completely free spaced repetition, interactive study modes, and AI flashcard generation without annoying paywalls or ads.";

const mockCards = [
  {
    front: "Why are students leaving Quizlet for PikaDecks?",
    back: "Quizlet has paywalled basic learning modes and lacks true spaced repetition. PikaDecks offers a premium, ad-free study experience with spaced repetition.",
    hint: "Keep core features free forever."
  },
  {
    front: "Can I import flashcards from Quizlet?",
    back: "Yes, you can copy and paste your Quizlet card lists directly into PikaDecks to import them in seconds.",
    hint: "Use our simple text importer."
  },
  {
    front: "Does PikaDecks support active recall testing?",
    back: "Yes, PikaDecks generates active recall quizzes based on your study history to test your knowledge.",
    hint: "Get prepared for exam day."
  }
];

const faqs = [
  {
    question: "Is PikaDecks really free to use?",
    answer: "Yes, our core spaced repetition algorithm, smart review system, and standard AI flashcard importer are 100% free. Unlike Quizlet, we do not paywall 'Learn' mode."
  },
  {
    question: "How is PikaDecks better for long-term retention?",
    answer: "Quizlet is built for cramming; it shows you cards repeatedly in a short session. PikaDecks is built on spaced repetition (SM-2), which calculates optimal review schedules over days and weeks for long-term storage in your memory."
  },
  {
    question: "Are there ads on PikaDecks?",
    answer: "No. We believe a clean, distraction-free environment is critical for learning. We do not clutter your workspace with annoying banner ads or popup promotions."
  }
];

export const Route = createFileRoute("/quizlet-alternative")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/quizlet-alternative",
    schemas: [
      createProductSchema({
        name: "PikaDecks Quizlet Alternative",
        description: pageDescription,
        url: "https://pikadecks.app/quizlet-alternative"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: QuizletAlternativePage
});

function QuizletAlternativePage() {
  return (
    <SEOTemplate
      badge="QUIZLET ALTERNATIVE"
      h1="The Modern Quizlet Alternative with Free Spaced Repetition"
      subtitle="Tired of Quizlet paywalling core learning features, showing endless ads, and ignoring spaced repetition? Switch to PikaDecks and study in a clean, AI-powered workspace."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="font-display text-3xl font-bold md:text-4xl text-foreground">
            Why PikaDecks is Different
          </h2>
          <p className="text-muted-foreground text-sm">
            We built PikaDecks to solve the issues that make studying on legacy platforms frustrating.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <Star className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">No Paywalled Modes</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Study using active recall, multiple-choice, and full self-assessment without hitting premium paywalls or subscription prompts mid-session.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Smart AI Generates in Bulk</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Why type card by card? Upload your lecture notes, slides, or syllabus files and let our integrated AI draft a complete structured study deck in seconds.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">100% Ad-Free Study</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Zero interruptions. Focus completely on your terms and study guides in a minimal workspace optimized for concentration and speed.
            </p>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
