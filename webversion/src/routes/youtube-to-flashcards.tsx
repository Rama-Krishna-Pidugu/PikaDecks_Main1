import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createHowToSchema, createFAQSchema } from "@/lib/seo";
import { Youtube, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

const pageTitle = "Convert YouTube to Flashcards with AI | PikaDecks";
const pageDescription = "Convert any educational YouTube video into high-quality study flashcards instantly. Just paste the URL and our AI extracts key terms, formulas, and active recall questions.";

const mockCards = [
  {
    front: "What is the primary role of tRNA in protein synthesis?",
    back: "tRNA (transfer RNA) serves as an adapter molecule, translating the mRNA codon sequence into the corresponding amino acid chain.",
    hint: "Referenced at 04:12 in the CrashCourse video."
  },
  {
    front: "Define 'Transcription' in genetics.",
    back: "The process by which DNA sequences are copied into an RNA polymerase enzyme to produce a complementary RNA strand.",
    hint: "Referenced at 02:45."
  },
  {
    front: "Where in the cell does translation occur?",
    back: "Translation occurs in the ribosomes located in the cytoplasm or rough endoplasmic reticulum.",
    hint: "Referenced at 08:30."
  }
];

const faqs = [
  {
    question: "How long can the YouTube video be?",
    answer: "You can convert videos up to 2 hours long. Our AI can summarize full college lectures, crash courses, tutorials, and interviews."
  },
  {
    question: "Do the generated flashcards link back to the video?",
    answer: "Yes! Every generated card includes a specific timestamp citation. Clicking the timestamp will take you right to that moment in the original YouTube video."
  },
  {
    question: "Does it work in languages other than English?",
    answer: "Yes, our transcriber and translation layers support over 30 languages, including Spanish, French, German, Korean, Japanese, and Hindi."
  }
];

const steps = [
  { text: "Paste the URL of any educational YouTube video into the PikaDecks generator." },
  { text: "Our AI transcribes the audio track and extracts key concepts, definitions, and questions." },
  { text: "Review, edit, and sync the generated flashcard deck to study with spaced repetition." }
];

export const Route = createFileRoute("/youtube-to-flashcards")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/youtube-to-flashcards",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks YouTube to Flashcards Converter",
        description: pageDescription,
        url: "https://pikadecks.app/youtube-to-flashcards"
      }),
      createHowToSchema({
        name: "How to Convert YouTube to Flashcards",
        description: "Step by step guide to turn any educational YouTube video into active recall study decks.",
        steps
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: YouTubeToFlashcardsPage
});

function YouTubeToFlashcardsPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<typeof mockCards | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResults(null);
    setTimeout(() => {
      setLoading(false);
      setResults(mockCards);
    }, 1800);
  };

  return (
    <SEOTemplate
      badge="YOUTUBE VIDEO CONVERTER"
      h1="Convert YouTube Videos into Flashcards"
      subtitle="Paste any lecture, crash course, or science video URL. Our AI will analyze the transcript, structure key arguments, and output an active recall study deck in seconds."
      cards={mockCards}
      faq={faqs}
    >
      <div className="mx-auto max-w-2xl space-y-12">
        {/* Interactive Converter Box */}
        <div className="rounded-3xl border-2 border-brand-ink bg-card p-6 md:p-10 shadow-pop relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
                <Youtube className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold">Try the AI Video Parser</h3>
                <p className="text-xs text-muted-foreground">Paste a YouTube URL below to simulate card generation</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-grow rounded-xl border-2 border-foreground/15 bg-background px-4 py-2.5 text-sm font-medium focus:border-brand-yellow focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="btn-pop inline-flex items-center justify-center gap-2 rounded-xl bg-brand-yellow px-5 py-2.5 text-sm font-bold text-brand-ink whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Convert Video
                  </>
                )}
              </button>
            </form>

            {results && (
              <div className="animate-fadeIn mt-6 space-y-4 rounded-2xl border-2 border-brand-ink/20 bg-brand-yellow/5 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-ink dark:text-brand-yellow">
                  <Sparkles className="h-4 w-4 text-brand-red" />
                  <span>AI Generated 3 Study Cards from video transcript:</span>
                </div>
                <div className="space-y-3">
                  {results.map((card, idx) => (
                    <div key={idx} className="rounded-xl border border-foreground/10 bg-card p-3 text-xs">
                      <p className="font-bold text-foreground">Q: {card.front}</p>
                      <p className="mt-1 text-muted-foreground">A: {card.back}</p>
                      <p className="mt-1 text-[10px] text-brand-red/80 font-semibold">{card.hint}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center pt-2">
                  <a href="#cta" className="btn-pop rounded-xl bg-brand-yellow px-4 py-2 text-xs font-bold text-brand-ink">
                    Save to My Account
                  </a>
                </div>
              </div>
            )}

            {!results && !loading && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Example video concepts: biology cellular respiration, chemistry kinetics, coding tutorials.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
