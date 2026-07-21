import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createFAQSchema } from "@/lib/seo";
import { Sparkles, FileText, Download } from "lucide-react";

const pageTitle = "AI Flashcard Generator from PDF & YouTube | PikaDecks";
const pageDescription = "Generate study flashcards automatically using advanced AI. Convert PDF textbooks, lecture documents, notes, or YouTube videos into active recall study decks in seconds.";

const mockCards = [
  {
    front: "How does the AI Flashcard Generator create cards?",
    back: "It uses advanced LLMs to scan your uploaded text or video transcripts, identify crucial study points, and draft clear question-and-answer pairs.",
    hint: "Uses active recall science."
  },
  {
    front: "Can I customize the generation style?",
    back: "Yes, you can prompt the AI to focus on vocabulary, key dates, mathematical proofs, or coding syntax, or choose a density setting.",
    hint: "Toggle concise vs comprehensive decks."
  },
  {
    front: "What export formats are supported?",
    back: "Export your generated decks as Anki (.apkg) files, CSV, or Markdown notes for ultimate flexibility.",
    hint: "Compatible with other tools."
  }
];

const faqs = [
  {
    question: "Does the AI support languages other than English?",
    answer: "Yes, our flashcard generator fully supports multiple languages, including Spanish, Portuguese, French, German, Italian, Russian, Chinese, Japanese, and Korean."
  },
  {
    question: "Can I review and edit the generated cards?",
    answer: "Yes, we show you a complete preview grid of the generated cards. You can toggle checkmarks to exclude cards, edit text directly, add hints, or attach images before adding them to your library."
  },
  {
    question: "How fast is the generation process?",
    answer: "Most documents and videos are converted into complete active recall study decks in under 30 seconds."
  }
];

export const Route = createFileRoute("/flashcard-generator")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/flashcard-generator",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks AI Flashcard Generator",
        description: pageDescription,
        url: "https://pikadecks.app/flashcard-generator"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: FlashcardGeneratorPage
});

function FlashcardGeneratorPage() {
  return (
    <SEOTemplate
      badge="POWERED BY ADVANCED AI"
      h1="Generate Study Flashcards Using Advanced AI"
      subtitle="Stop typing flashcards manually. Upload textbook chapters, lecture notes, or paste YouTube links, and let PikaDecks generate precise active recall study decks in seconds."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="font-display text-3xl font-bold md:text-4xl text-foreground">
            Fast, Smart, and Precise Flashcard Generation
          </h2>
          <p className="text-muted-foreground text-sm">
            Spend less time formatting and more time memorizing with our automated flashcard generator.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Multi-Source Inputs</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Upload PDF textbooks, lecture slides, word documents, paste YouTube links, or drop raw markdown notes directly.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">AI Concept Extraction</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Our advanced algorithm identifies vocabulary, math equations, coding patterns, and semantic connections, and turns them into cards.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <Download className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Universal Exporting</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Use cards directly in our spaced repetition engine, or export to Anki (.apkg), CSV spreadsheet, or Markdown study documents.
            </p>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
