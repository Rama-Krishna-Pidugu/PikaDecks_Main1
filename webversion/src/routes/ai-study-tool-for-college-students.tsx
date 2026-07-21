import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createFAQSchema } from "@/lib/seo";
import { FolderHeart, Code, Users } from "lucide-react";

const pageTitle = "AI Study Tool for College Students | PikaDecks";
const pageDescription = "The ultimate AI study assistant and spaced repetition flashcard app built specifically for college lectures. Turn heavy syllabus files and slides into review decks instantly.";

const mockCards = [
  {
    front: "How do I group my college decks by class?",
    back: "Use folders and sub-decks (e.g. 'Semester 1' > 'Biology 101' > 'Exam 1') to keep your study materials organized.",
    hint: "Keep your coursework clean and segmented."
  },
  {
    front: "Does PikaDecks support LaTeX for math formulas?",
    back: "Yes, you can write math equations directly using standard LaTeX delimiters, which render perfectly in the app.",
    hint: "Example: $$f(x) = x^2 + 1$$"
  },
  {
    front: "How do I share study decks with my classmates?",
    back: "Simply toggle your deck status to 'Public' and share the unique web URL. Classmates can import it into their own library.",
    hint: "Perfect for group study sessions."
  }
];

const faqs = [
  {
    question: "Can I import lecture notes from Notion or Google Docs?",
    answer: "Yes. Simply download your notes as Markdown or PDF files and drop them directly into PikaDecks. Our AI will draft flashcards from your headings and bullet points."
  },
  {
    question: "How does the AI handle complex math, coding, and diagrams?",
    answer: "PikaDecks supports LaTeX rendering for math equations, markdown syntax highlighting for code blocks (Python, Java, C++, etc.), and images/diagram attachments for visual subjects."
  },
  {
    question: "Is there a student discount for PikaDecks Pro?",
    answer: "Yes, we offer an academic pricing plan for students, educators, and researchers. Contact support or check the billing dashboard with your student (.edu) email."
  }
];

export const Route = createFileRoute("/ai-study-tool-for-college-students")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/ai-study-tool-for-college-students",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks Student Study Assistant",
        description: pageDescription,
        url: "https://pikadecks.app/ai-study-tool-for-college-students"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: StudentStudyAssistantPage
});

function StudentStudyAssistantPage() {
  return (
    <SEOTemplate
      badge="COLLEGE STUDENT EDITION"
      h1="The AI Study App Built for College Coursework"
      subtitle="Heavy course loads require smarter tools. Structure your semester, sync lecture notes, generate exam prep materials, and learn faster using active recall and spaced repetition."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="font-display text-3xl font-bold md:text-4xl text-foreground">
            Engineered for Modern College Demands
          </h2>
          <p className="text-muted-foreground text-sm">
            We built features that integrate with your daily student workflow, from lecture hall to library.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <FolderHeart className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Course Organization</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Create sub-decks for weekly topics, tag cards by difficulty, and group files by semester or subject. Keep your second brain structured.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
              <Code className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Equations & Code</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Engineered for STEM majors. Render complex physics and calculus equations, chemistry formulas, and programming syntax cleanly.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Collaborative Study</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Share public deck URLs or create private shared directories. Perfect for study groups preparing for midterms or final exams.
            </p>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
