import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createFAQSchema } from "@/lib/seo";
import { BookOpen, Sparkles, Brain, Award } from "lucide-react";

const pageTitle = "Best AI Study App for Students in 2026 | PikaDecks";
const pageDescription = "Looking for the best AI study app? PikaDecks turns PDFs, YouTube videos, notes, and web articles into smart flashcards using spaced repetition and advanced AI.";

const mockCards = [
  {
    front: "What makes PikaDecks the best AI study app?",
    back: "It blends proven active recall and spaced repetition (SM-2) algorithms with automated AI deck generation and a modern mobile experience.",
    hint: "No more spending hours manually writing cards."
  },
  {
    front: "What content can PikaDecks convert into flashcards?",
    back: "PDF textbooks, lecture slides, YouTube lectures, web articles, and markdown notes are all converted in seconds.",
    hint: "Supports multi-format imports."
  },
  {
    front: "Can I study on both desktop and mobile?",
    back: "Yes, PikaDecks is available on iOS, Android, and Web, with automated cloud synchronization.",
    hint: "Study on the bus, in class, or at home."
  }
];

const faqs = [
  {
    question: "How does the AI generate study flashcards?",
    answer: "Our advanced parser analyzes your uploaded files or links, identifies key definitions, conceptual formulas, and core questions, and automatically formulates optimal Q&A pairs for active recall."
  },
  {
    question: "What is spaced repetition and why does it work?",
    answer: "Spaced repetition is a learning technique where cards are reviewed at increasing intervals. It utilizes the psychological spacing effect to interrupt your forgetting curve, ensuring items are studied right when you are about to forget them."
  },
  {
    question: "Is PikaDecks free to use?",
    answer: "Yes, PikaDecks has a generous free tier that includes standard AI flashcard generation, complete spaced repetition functionality, and cross-device sync. Pro plans are available for unlimited AI power."
  }
];

export const Route = createFileRoute("/best-ai-study-app")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/best-ai-study-app",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks",
        description: pageDescription,
        url: "https://pikadecks.app/best-ai-study-app"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: BestAIStudyAppPage
});

function BestAIStudyAppPage() {
  return (
    <SEOTemplate
      badge="RANKED #1 AI STUDY APP"
      h1="The AI Study App Built for Modern Students"
      subtitle="Say goodbye to manual flashcards. Upload textbooks, lecture slides, or paste YouTube links, and let PikaDecks extract exactly what you need to know. Backed by science, powered by AI."
      cards={mockCards}
      faq={faqs}
    >
      <div className="grid gap-12 md:grid-cols-3">
        <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
            <Brain className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl font-bold">Active Recall & Spaced Repetition</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Don't just re-read notes. Quiz yourself. Our scheduler tracks your mastery level and shows cards at the exact moment they will stick in your memory.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl font-bold">Instant AI Generation</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Convert long, dry PDF textbooks and 2-hour lecture videos into bite-sized cards in seconds. Our smart AI extracts formulas, vocabulary, and concepts.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
            <Award className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl font-bold">Mobile-First Experience</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Quick 5-minute study sessions on the go. Swipe through your decks on the bus, waiting in line, or between classes. Complete sync across web and mobile.
          </p>
        </div>
      </div>

      <div className="mt-16 rounded-3xl border-2 border-brand-ink bg-brand-yellow/10 dark:bg-zinc-900/40 p-8 md:p-12">
        <div className="mx-auto max-w-3xl text-center space-y-6">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl text-foreground">
            Why Students Call PikaDecks Their "Unfair Advantage"
          </h2>
          <p className="text-muted-foreground leading-relaxed text-base">
            "I used to spend 4 hours making flashcards for anatomy midterms. With PikaDecks, I upload my lecture slides, review them instantly, and scored a 96% on my exam. The AI study assistant explains hard topics right on the card!"
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full bg-brand-yellow border-2 border-brand-ink flex items-center justify-center font-bold text-brand-ink text-sm">
              MS
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-foreground">Maria S.</p>
              <p className="text-xs text-muted-foreground">Pre-Med Student, UT Austin</p>
            </div>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
