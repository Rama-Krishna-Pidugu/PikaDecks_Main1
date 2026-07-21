import { createFileRoute } from "@tanstack/react-router";
import { SEOTemplate } from "@/components/landing/SEOTemplate";
import { createSEOHead, createSoftwareApplicationSchema, createFAQSchema } from "@/lib/seo";
import { HeartPulse, ShieldAlert, BookOpen } from "lucide-react";

const pageTitle = "AI Study App for Medical Students | PikaDecks";
const pageDescription = "Memorize medical terminology, pharmacology, anatomy, and clinical cases faster. PikaDecks is the ultimate AI-powered study app for medical school and USMLE prep.";

const mockCards = [
  {
    front: "Pharmacology: What is the mechanism of action of Metformin?",
    back: "Decreases hepatic glucose production, decreases intestinal absorption of glucose, and improves insulin sensitivity by increasing peripheral glucose uptake.",
    hint: "First-line medication for type 2 diabetes."
  },
  {
    front: "Anatomy: Which nerve innervates the deltoid muscle?",
    back: "The axillary nerve (C5-C6 roots), arising from the posterior cord of the brachial plexus.",
    hint: "Clinical sign: damage results in loss of shoulder abduction."
  },
  {
    front: "Pathology: Define the triad of Virchow.",
    back: "1. Endothelial injury, 2. Stasis or turbulence of blood flow, 3. Blood hypercoagulability. Leads to thrombosis.",
    hint: "Crucial for understanding deep vein thrombosis (DVT)."
  }
];

const faqs = [
  {
    question: "Does PikaDecks support image occlusion for anatomy?",
    answer: "Yes, you can upload medical diagrams or anatomical charts and hide labels using black overlays to quiz yourself on structures."
  },
  {
    question: "Can I use PikaDecks during hospital clinical rotations?",
    answer: "Absolutely. Our iOS and Android apps support fully offline study, letting you review pharmacology facts or clinical signs on your phone between patient rounds."
  },
  {
    question: "How does it compare to pre-made Anki medical decks like AnKing?",
    answer: "PikaDecks lets you import existing medical .apkg files easily. However, instead of only memorizing others' cards, you can upload your specific lecture slides or clinical notes and generate personalized decks in seconds."
  }
];

export const Route = createFileRoute("/medical-student-study-app")({
  head: () => createSEOHead({
    title: pageTitle,
    description: pageDescription,
    urlPath: "/medical-student-study-app",
    schemas: [
      createSoftwareApplicationSchema({
        name: "PikaDecks Medical Study App",
        description: pageDescription,
        url: "https://pikadecks.app/medical-student-study-app"
      }),
      createFAQSchema(faqs)
    ]
  }),
  component: MedicalStudyAppPage
});

function MedicalStudyAppPage() {
  return (
    <SEOTemplate
      badge="MEDICAL SCHOOL EDITION"
      h1="Memorize Medical Terms & Clinical Cases Faster"
      subtitle="From anatomy diagrams to complex drug mechanisms. Upload medical PDFs and slides, create image occlusion cards, and master your USMLE or board exams with AI spaced repetition."
      cards={mockCards}
      faq={faqs}
    >
      <div className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="font-display text-3xl font-bold md:text-4xl text-foreground">
            Built for the Rigors of Med School
          </h2>
          <p className="text-muted-foreground text-sm">
            Retain massive amounts of clinical information efficiently with medical-specific study tools.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <HeartPulse className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Pharmacology Lists</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Organize lists of drugs by class, mechanism of action, side effects, and clinical indications. Learn pharmacology systematically.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/20 text-brand-red">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Image Occlusion</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Block out bone names, arterial trees, or muscle attachments on diagrams. Test your visual memory for high-yield anatomy exams.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 shadow-soft hover:translate-y-[-2px] transition-transform">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow/20 text-brand-ink dark:text-brand-yellow">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Clinical Case Scenarios</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Practice diagnosing clinical symptoms. AI generates cards summarizing patient age, chief complaints, physical findings, and diagnostic steps.
            </p>
          </div>
        </div>
      </div>
    </SEOTemplate>
  );
}
