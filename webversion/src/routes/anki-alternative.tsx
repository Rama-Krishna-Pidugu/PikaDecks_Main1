import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createProductSchema, createFAQSchema } from "@/lib/seo";
import { Check, X } from "lucide-react";

const pageTitle = "The Spaced Repetition Anki Alternative | PikaDecks";
const pageDescription = "Searching for an Anki alternative? PikaDecks offers modern spaced repetition, native AI flashcard creation from PDFs and YouTube videos, and gorgeous mobile apps.";

const mockCards = [
  {
    front: "Why switch from Anki to PikaDecks?",
    back: "PikaDecks offers the same scientifically-proven spaced repetition but features a modern interface, native AI flashcard generation, and zero-config cloud sync.",
    hint: "No plugins or server setup required."
  },
  {
    front: "Can I import my existing Anki decks?",
    back: "Yes, you can import standard .apkg Anki files directly into PikaDecks to preserve your cards and continue studying.",
    hint: "Transition in less than 30 seconds."
  },
  {
    front: "How does PikaDecks help me study faster than Anki?",
    back: "Instead of writing cards manually, upload your study slides or lecture files and let PikaDecks generate active recall decks instantly.",
    hint: "Focus on studying, not card creation."
  }
];

const faqs = [
  {
    question: "Does PikaDecks use the same algorithm as Anki?",
    answer: "Yes, PikaDecks is built on a modern implementation of the SuperMemo-2 (SM-2) algorithm, the gold standard for spaced repetition, ensuring optimal memory retention."
  },
  {
    question: "Is cloud sync free in PikaDecks?",
    answer: "Yes. Unlike Anki Web configurations which can sometimes be complex, PikaDecks automatically and securely syncs your decks and progress across iOS, Android, and Web for free."
  },
  {
    question: "Do I need technical skills to customize cards?",
    answer: "No. While Anki requires HTML/CSS knowledge to style cards, PikaDecks provides a beautiful, clean editor that formats your notes, code snippets, and math equations automatically."
  }
];

export const Route = createFileRoute("/anki-alternative")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/anki-alternative",
    schemas: [
      createProductSchema({
        name: "PikaDecks Anki Alternative",
        description: pageDescription,
        url: "https://pikadecks.app/anki-alternative"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: AnkiAlternativePage
});

function AnkiAlternativePage() {
  return (
    <SEOTemplate
      badge="ANKI ALTERNATIVE"
      h1="The Spaced Repetition Anki Alternative That Just Works"
      subtitle="Love the spaced repetition algorithm of Anki, but hate the dated 2005 desktop interface, complex plugin requirements, and zero-config sync issues? Meet PikaDecks."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="font-display text-3xl font-bold md:text-4xl text-foreground">
            Side-by-Side Comparison
          </h2>
          <p className="text-muted-foreground text-sm">
            See how PikaDecks compares to Anki across key learning and user experience metrics.
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border-2 border-brand-ink bg-card shadow-soft">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-brand-ink bg-brand-yellow/10">
                <th className="p-4 font-display font-bold text-foreground">Feature</th>
                <th className="p-4 font-display font-bold text-brand-red">PikaDecks</th>
                <th className="p-4 font-display font-bold text-muted-foreground">Anki</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10 text-sm">
              <tr>
                <td className="p-4 font-bold">Native AI Flashcard Generator</td>
                <td className="p-4 text-brand-red font-semibold flex items-center gap-1.5">
                  <Check className="h-5 w-5 stroke-[3]" /> Yes (PDF, Video, Notes)
                </td>
                <td className="p-4 text-muted-foreground flex items-center gap-1.5">
                  <X className="h-5 w-5" /> No (Requires complex plugins)
                </td>
              </tr>
              <tr>
                <td className="p-4 font-bold">User Interface & Design</td>
                <td className="p-4 text-foreground font-semibold">Modern, high-fidelity UI</td>
                <td className="p-4 text-muted-foreground">Retro, legacy table lists</td>
              </tr>
              <tr>
                <td className="p-4 font-bold">Cloud Sync Configuration</td>
                <td className="p-4 text-brand-red font-semibold flex items-center gap-1.5">
                  <Check className="h-5 w-5 stroke-[3]" /> Instant & Automatic
                </td>
                <td className="p-4 text-muted-foreground flex items-center gap-1.5">
                  <X className="h-5 w-5" /> Manual web login & settings
                </td>
              </tr>
              <tr>
                <td className="p-4 font-bold">Math (LaTeX) & Code Formatting</td>
                <td className="p-4 text-brand-red font-semibold flex items-center gap-1.5">
                  <Check className="h-5 w-5 stroke-[3]" /> Rich editor built-in
                </td>
                <td className="p-4 text-muted-foreground flex items-center gap-1.5">
                  <X className="h-5 w-5" /> Custom HTML templates only
                </td>
              </tr>
              <tr>
                <td className="p-4 font-bold">AI Study Assistant</td>
                <td className="p-4 text-brand-red font-semibold flex items-center gap-1.5">
                  <Check className="h-5 w-5 stroke-[3]" /> Yes (MCP integrations)
                </td>
                <td className="p-4 text-muted-foreground flex items-center gap-1.5">
                  <X className="h-5 w-5" /> No
                </td>
              </tr>
              <tr>
                <td className="p-4 font-bold">Import Formats</td>
                <td className="p-4 text-foreground font-semibold">Anki decks (.apkg), PDF, PPT, CSV</td>
                <td className="p-4 text-muted-foreground">CSV, Text files only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SEOTemplate>
  );
}
