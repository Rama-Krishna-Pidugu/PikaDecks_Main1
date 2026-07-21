import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createHowToSchema, createFAQSchema } from "@/lib/seo";
import { FileText, Sparkles, UploadCloud } from "lucide-react";

const pageTitle = "Convert PDF to Flashcards with AI | PikaDecks";
const pageDescription = "Convert PDF textbooks, slides, and notes into flashcards in seconds. Upload any PDF and let our AI parser extract definitions and concepts for spaced repetition.";

const mockCards = [
  {
    front: "What is the principle of 'Active Recall'?",
    back: "Active recall involves actively stimulating your memory for a piece of information during the learning process, which strengthens neural connections.",
    hint: "Found on Page 14 of the cognitive psychology textbook."
  },
  {
    front: "Contrast 'Recognition' vs 'Recall'.",
    back: "Recognition is identifying information when presented with it (e.g., multiple choice), whereas Recall is retrieving details from memory without clues.",
    hint: "Found on Page 15."
  },
  {
    front: "Explain the 'Forgetting Curve' discovered by Hermann Ebbinghaus.",
    back: "It outlines how information is lost over time when there is no attempt to retain it, showing that memory decay is exponential.",
    hint: "Found on Page 18."
  }
];

const faqs = [
  {
    question: "Is there a limit on the number of pages in a PDF?",
    answer: "Free accounts can upload PDFs up to 50 pages long. Pro accounts can upload textbooks up to 500 pages. The AI will read the text and create highly structured study cards."
  },
  {
    question: "Does it support image-only PDFs?",
    answer: "Yes, PikaDecks utilizes advanced OCR (Optical Character Recognition) to read scanned pages, screenshots of slides, and handwritten study sheets."
  },
  {
    question: "Can I choose which pages are parsed?",
    answer: "Yes. In the PikaDecks uploader, you can specify custom page ranges (e.g., pages 12-25) to avoid generating cards for covers, index lists, or references."
  }
];

const steps = [
  { text: "Drop your PDF study file, lecture syllabus, or slides into the PikaDecks uploader." },
  { text: "Select your deck size (Concise vs Comprehensive) and customize target concepts." },
  { text: "Our AI processes the pages and builds cards with accurate back-referencing pages." }
];

export const Route = createFileRoute("/pdf-to-flashcards")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/pdf-to-flashcards",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks PDF to Flashcards Converter",
        description: pageDescription,
        url: "https://pikadecks.app/pdf-to-flashcards"
      }),
      createHowToSchema({
        name: "How to Convert PDF to Flashcards",
        description: "How to extract active recall cards from slides and textbook files using AI.",
        steps
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: PDFToFlashcardsPage
});

function PDFToFlashcardsPage() {
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<typeof mockCards | null>(null);

  const handleFileSimulate = () => {
    setFileName("psychology_chapter_1.pdf");
    setLoading(true);
    setResults(null);
    setProgress(10);

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setLoading(false);
          setResults(mockCards);
          return 100;
        }
        return p + 30;
      });
    }, 400);
  };

  return (
    <SEOTemplate
      badge="PDF DOCUMENT PARSER"
      h1="Turn PDF Textbooks & Slides into Flashcards"
      subtitle="Stop highlighting. Upload textbook chapters, lecture presentations, or course reading lists. Let PikaDecks generate precise questions, definitions, and facts in seconds."
      cards={mockCards}
      faq={faqs}
    >
      <div className="mx-auto max-w-2xl space-y-12">
        {/* Interactive Upload Box */}
        <div className="rounded-3xl border-2 border-dashed border-brand-ink bg-card p-8 text-center shadow-pop relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none" />
          <div className="relative space-y-6">
            {!loading && !results && (
              <div className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Try the PDF Importer</h3>
                  <p className="text-sm text-muted-foreground mt-1">Click the button below to upload a mock textbook chapter</p>
                </div>
                <button
                  onClick={handleFileSimulate}
                  className="btn-pop inline-flex items-center gap-2 rounded-xl bg-brand-yellow px-6 py-2.5 text-sm font-display font-bold text-brand-ink cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  Select Mock PDF
                </button>
              </div>
            )}

            {loading && (
              <div className="space-y-4 py-4">
                <div className="mx-auto flex h-10 w-10 animate-bounce items-center justify-center rounded-full bg-brand-yellow text-brand-ink">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="max-w-xs mx-auto space-y-2">
                  <p className="text-xs font-bold text-foreground">Reading PDF: {fileName}</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted border border-foreground/10">
                    <div
                      className="h-full bg-brand-yellow transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Extracting core concepts...</p>
                </div>
              </div>
            )}

            {results && (
              <div className="animate-fadeIn space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-2 text-left">
                    <FileText className="h-5 w-5 text-brand-red" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{fileName}</p>
                      <p className="text-[10px] text-muted-foreground">Successfully parsed 3 active recall cards</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setResults(null); setFileName(""); }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear File
                  </button>
                </div>

                <div className="space-y-3 text-left">
                  {results.map((card, idx) => (
                    <div key={idx} className="rounded-xl border border-foreground/10 bg-card p-3 text-xs">
                      <p className="font-bold text-foreground">Q: {card.front}</p>
                      <p className="mt-1 text-muted-foreground">A: {card.back}</p>
                      <p className="mt-1 text-[10px] text-brand-red/80 font-semibold">{card.hint}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center pt-2">
                  <a href="#cta" className="btn-pop rounded-xl bg-brand-yellow px-6 py-2.5 text-xs font-bold text-brand-ink">
                    Save Flashcard Deck
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
