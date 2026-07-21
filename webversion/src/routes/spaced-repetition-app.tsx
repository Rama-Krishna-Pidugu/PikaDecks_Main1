import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createFAQSchema } from "@/lib/seo";
import { LineChart, BookOpen, Clock } from "lucide-react";

const pageTitle = "Spaced Repetition App with AI | PikaDecks";
const pageDescription = "Master any subject with the ultimate AI-driven spaced repetition app. PikaDecks calculates optimal study intervals using scientific active recall and SM-2 algorithms.";

const mockCards = [
  {
    front: "What is the 'Forgetting Curve'?",
    back: "A mathematical model showing how memory retention decays over time, suggesting we forget up to 80% of what we learn within days.",
    hint: "Discovered by Hermann Ebbinghaus in 1885."
  },
  {
    front: "How does spaced repetition combat memory decay?",
    back: "By reviewing information at gradually increasing intervals, each review resets the forgetting curve, flattening the decay rate over time.",
    hint: "Consolidates facts in long-term memory."
  },
  {
    front: "What are the four rating options in PikaDecks?",
    back: "Again (reset interval), Hard (short interval), Good (medium interval), and Easy (longer interval).",
    hint: "Determines the math behind the next card date."
  }
];

const faqs = [
  {
    question: "What algorithm does PikaDecks use?",
    answer: "PikaDecks uses a modified version of the SuperMemo-2 (SM-2) algorithm. This is the same scientific scheduling formula used in Anki, calculating intervals based on card ease factor and review rating."
  },
  {
    question: "How long should my daily study sessions be?",
    answer: "Consistency is key. Studying for just 10–15 minutes every day using spaced repetition yields far better long-term retention than pulling an 8-hour cramming session before a test."
  },
  {
    question: "Does the app send daily review notifications?",
    answer: "Yes, you can configure email reminders or mobile push notifications so you never miss your daily 'due cards' and maintain your learning streak."
  }
];

export const Route = createFileRoute("/spaced-repetition-app")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/spaced-repetition-app",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks Spaced Repetition Engine",
        description: pageDescription,
        url: "https://pikadecks.app/spaced-repetition-app"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: SpacedRepetitionPage
});

function SpacedRepetitionPage() {
  return (
    <SEOTemplate
      badge="MEMORY SCIENCE SCIENCE-BACKED"
      h1="Master Spaced Repetition Without the Complexity"
      subtitle="Passively reading notes is the least efficient way to learn. PikaDecks calculates your optimal study calendar, making active recall automatic and easy to maintain."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-16">
        <div className="grid gap-12 md:grid-cols-2 items-center">
          <div className="space-y-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              The Science of Memory Retention
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              When you first learn a fact, it is stored in your short-term memory. Without review, you will forget it within days. Active recall forces your brain to search for the answer, building stronger neural pathways.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Spaced repetition schedules reviews right before you forget. Each time you retrieve the information, the rate of decay slows down, shifting the knowledge into long-term memory.
            </p>
          </div>

          <div className="rounded-3xl border-2 border-brand-ink bg-card p-6 shadow-soft space-y-4">
            <div className="flex items-center gap-3 border-b pb-4">
              <LineChart className="h-6 w-6 text-brand-red" />
              <h3 className="font-display text-xl font-bold">Why Passive Review Fails</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="font-bold text-foreground">Method</span>
                <span className="font-bold text-foreground">Retention (1 Week)</span>
              </div>
              <div className="flex justify-between border-b pb-2 text-muted-foreground">
                <span>Passively Re-reading Notes</span>
                <span className="text-brand-red font-bold">~ 15%</span>
              </div>
              <div className="flex justify-between border-b pb-2 text-muted-foreground">
                <span>Highlighting Textbooks</span>
                <span className="text-brand-red font-bold">~ 20%</span>
              </div>
              <div className="flex justify-between text-foreground">
                <span className="font-bold">Active Recall + Spaced Repetition</span>
                <span className="text-brand-red font-bold">~ 85% +</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
