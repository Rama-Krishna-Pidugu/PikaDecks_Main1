import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { InteractiveCards, Flashcard } from "@/components/landing/InteractiveCards";
import { createSEOHead, createFAQSchema } from "@/lib/seo";
import { Library, Sparkles, BookOpen, Clock, ChevronLeft } from "lucide-react";

interface DeckData {
  title: string;
  description: string;
  category: string;
  cards: Flashcard[];
}

const decksContent: Record<string, DeckData> = {
  "biology-101": {
    title: "Biology 101: Cellular Structure & Processes",
    category: "Science",
    description: "High-yield flashcards covering eukaryotic cell structures, cell division phases, cellular respiration, and core definitions.",
    cards: [
      { front: "What is the primary function of the Mitochondria?", back: "Generates cellular energy in the form of Adenosine Triphosphate (ATP) via aerobic cellular respiration.", hint: "Known as the powerhouse of the cell." },
      { front: "Define the term 'Osmosis'.", back: "The net movement of water molecules through a semi-permeable membrane from a region of lower solute concentration to higher solute concentration.", hint: "A passive transport process." },
      { front: "What is the main difference between Mitosis and Meiosis?", back: "Mitosis produces two genetically identical diploid somatic cells; Meiosis produces four genetically diverse haploid gamete cells.", hint: "Mitosis is for growth/repair; Meiosis is for reproduction." },
      { front: "What is the purpose of Chloroplasts in plant cells?", back: "They conduct photosynthesis, converting light energy into chemical energy stored as glucose using chlorophyll pigment.", hint: "Found only in plants and algae." },
      { front: "What is Active Transport?", back: "The movement of substances across a cell membrane against their concentration gradient, requiring energy (ATP) and transport proteins.", hint: "Contrasts with passive transport." },
      { front: "Define the function of Ribosomes.", back: "Cellular structures responsible for protein synthesis by translating messenger RNA (mRNA) sequences into amino acid polypeptide chains.", hint: "Can be free-floating or attached to the rough ER." }
    ]
  },
  "aws-solutions-architect": {
    title: "AWS Solutions Architect Associate Prep",
    category: "Technology",
    description: "Master AWS cloud architecture guidelines, load balancing, relational databases, security policies, and fault-tolerant structures.",
    cards: [
      { front: "What is AWS IAM?", back: "Identity and Access Management, a service used to securely control authentication and access permissions for AWS resources.", hint: "Supports roles, groups, users, and policies." },
      { front: "What is the difference between Amazon S3 and Amazon EBS?", back: "S3 is object storage accessible via web APIs (scalable, durable); EBS is block-level storage volume mounted on an EC2 instance.", hint: "S3 is serverless file repository; EBS is virtual hard drive." },
      { front: "Explain the role of an AWS Application Load Balancer (ALB).", back: "Distributes incoming HTTP/HTTPS application traffic across multiple targets, such as EC2 instances, containers, or IP addresses in multiple Availability Zones.", hint: "Operates at Layer 7 of the OSI model." },
      { front: "What is Amazon RDS?", back: "Relational Database Service, a managed service for setting up, operating, and scaling SQL databases like PostgreSQL, MySQL, and Oracle.", hint: "Provides automated backups and Multi-AZ replication." },
      { front: "What is a VPC (Virtual Private Cloud)?", back: "A logically isolated virtual network dedicated to your AWS account, giving you complete control over subnets, IP ranges, and gateways.", hint: "Your private network inside AWS." },
      { front: "What is AWS Lambda?", back: "A serverless compute service that runs your code in response to events (e.g. API requests) and automatically manages the underlying compute infrastructure.", hint: "You pay only for the compute time you consume." }
    ]
  },
  "gre-vocabulary": {
    title: "GRE High-Frequency Vocabulary Wordlist",
    category: "Exams",
    description: "Increase your GRE verbal score by memorizing these high-frequency academic vocabulary words, definitions, and sentence context.",
    cards: [
      { front: "What does 'Anomalous' mean?", back: "Deviating from what is standard, normal, or expected; atypical or irregular.", hint: "Example sentence: 'The cold summer weather was anomalous for the region.'" },
      { front: "What does 'Ephemeral' mean?", back: "Lasting for a very short time; transient, fleeting, or brief.", hint: "Example sentence: 'The beauty of the cherry blossoms is ephemeral.'" },
      { front: "What does 'Loquacious' mean?", back: "Tending to talk a great deal; extremely talkative.", hint: "Synonym: garrulous." },
      { front: "What does 'Pragmatic' mean?", back: "Dealing with things sensibly and realistically in a way that is based on practical rather than theoretical considerations.", hint: "Focuses on 'what works'." },
      { front: "What does 'Fastidious' mean?", back: "Very attentive to and concerned about accuracy and detail; very concerned about cleanliness.", hint: "Example: 'She was fastidious about keeping her room tidy.'" },
      { front: "What does 'Capricious' mean?", back: "Given to sudden and unaccountable changes of mood or behavior; erratic or unpredictable.", hint: "Example: 'The capricious administration kept changing policies.'" }
    ]
  },
  "neet-physics-formulas": {
    title: "NEET Physics: Mechanics & Wave Motion",
    category: "Science",
    description: "Review mechanics equations, work-energy theorems, rotational kinetics formulas, and wave motion queries for medical/engineering entrance exams.",
    cards: [
      { front: "What is the formula for Centripetal Force?", back: "F = (m * v^2) / r, where m is mass, v is velocity, and r is the radius of the circular path.", hint: "Acts perpendicular to the velocity vector, pointing towards the center." },
      { front: "State the Work-Energy Theorem.", back: "The net work done by all forces acting on a particle equals the change in the kinetic energy of that particle: W = ΔKE.", hint: "Applies to both conservative and non-conservative forces." },
      { front: "What is the formula for Torque in rotational motion?", back: "τ = r * F * sin(θ), where r is the distance from the pivot, F is force, and θ is the angle between them.", hint: "Calculated as the cross product of position vector and force vector." },
      { front: "Define the term 'Escape Velocity'.", back: "The minimum speed required for a body to escape from the gravitational influence of a primary body: v = √(2GM/R).", hint: "For Earth, it is approximately 11.2 km/s." },
      { front: "What is the formula for the time period of a Simple Pendulum?", back: "T = 2π * √(L / g), where L is the pendulum length and g is acceleration due to gravity.", hint: "Independent of the mass of the bob." },
      { front: "What is Hooke's Law?", back: "F = -k * x, where F is restoring force, k is the spring constant, and x is displacement from equilibrium.", hint: "The negative sign indicates the force is restoring." }
    ]
  },
  "medical-terminology": {
    title: "Medical Terminology & Anatomical Systems",
    category: "Medicine",
    description: "Master medical terms, anatomical directions, vital sign parameters, and clinical suffixes for nursing and medical board preparation.",
    cards: [
      { front: "Define 'Dyspnea'.", back: "Difficult, labored, or uncomfortable breathing; shortness of breath.", hint: "Common symptom in asthma, pneumonia, or heart failure." },
      { front: "What does the prefix 'Brady-' and suffix '-cardia' mean?", back: "'Brady-' means slow; '-cardia' means heart. Bradycardia refers to a slow heart rate (typically below 60 bpm).", hint: "Opposite of Tachycardia (fast heart rate)." },
      { front: "Explain 'Myocardial Infarction'.", back: "Commonly known as a heart attack, it occurs when blood flow decreases or stops to a part of the heart muscle, causing tissue damage.", hint: "Often caused by complete occlusion of a coronary artery." },
      { front: "What is the difference between 'Lateral' and 'Medial' in anatomy?", back: "Medial means toward the midline of the body; Lateral means away from the midline, toward the outer sides.", hint: "Example: The nose is medial to the eyes; the ears are lateral." },
      { front: "What does 'Homeostasis' refer to?", back: "The state of steady internal, physical, and chemical conditions maintained by living systems despite external changes.", hint: "Involves feedback loops regulating temperature, pH, etc." },
      { front: "Define 'Triad of Virchow'.", back: "Three factors contributing to thrombosis: 1. Endothelial damage, 2. Stasis or turbulence of blood flow, and 3. Hypercoagulability.", hint: "Key diagnostic concept for deep vein thrombosis." }
    ]
  }
};

export const Route = createFileRoute("/decks/$deckId")({
  head: ({ params }) => {
    const deck = decksContent[params.deckId];
    if (!deck) {
      return createSEOHead({
        title: "Deck Not Found | PikaDecks",
        description: "This study flashcard deck could not be found.",
        urlPath: `/decks/${params.deckId}`,
        schemas: []
      });
    }

    // CreativeWork schema for flashcards deck indexing
    const datasetSchema = {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: deck.title,
      description: deck.description,
      creator: {
        "@type": "Organization",
        name: "Pikadecks"
      },
      url: `https://pikadecks.app/decks/${params.deckId}`,
      hasPart: deck.cards.map((card, idx) => ({
        "@type": "CreativeWork",
        name: `Flashcard ${idx + 1}`,
        description: card.front
      }))
    };

    return createSEOHead({
      title: `${deck.title} | Free Flashcards | PikaDecks`,
      description: deck.description,
      urlPath: `/decks/${params.deckId}`,
      schemas: [datasetSchema]
    });
  },
  component: DeckDetailPage
});

function DeckDetailPage() {
  const { deckId } = useParams({ from: "/decks/$deckId" });
  const deck = decksContent[deckId];

  if (!deck) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="font-display text-4xl font-bold text-brand-red">404</h1>
          <h2 className="font-display text-xl font-bold">Deck Not Found</h2>
          <p className="text-sm text-muted-foreground">We couldn't find the requested public study flashcards.</p>
          <div className="pt-4">
            <Link to="/decks" className="btn-pop rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-ink">
              Back to Catalog
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Breadcrumbs & Title */}
      <section className="relative overflow-hidden px-4 pt-24 pb-8 md:pt-32">
        <div className="mx-auto max-w-4xl space-y-4">
          <Link
            to="/decks"
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Public Directory
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground/10 bg-card/80 px-3 py-1 text-xs font-bold backdrop-blur">
              <img src="/favicon.svg" alt="" className="h-3.5 w-3.5" aria-hidden />
              <span>{deck.category}</span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {deck.cards.length} Flashcards
            </span>
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight md:text-5xl text-foreground">
            {deck.title}
          </h1>

          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {deck.description} Preview this deck using our interactive widget below, or import it to your personal PikaDecks account to track your progress with spaced repetition.
          </p>
        </div>
      </section>

      {/* Interactive Deck Showcase */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-md rounded-[2.5rem] border-2 border-foreground bg-card p-6 relative">
          <div className="absolute -top-3 -right-3 rounded-xl border-2 border-brand-ink bg-brand-red px-3 py-1 text-xs font-bold text-white rotate-6">
            Practice Mode
          </div>
          <InteractiveCards cards={deck.cards} />
        </div>
        <div className="mt-8 flex justify-center">
          <a
            href="#cta"
            className="btn-pop glow-yellow inline-flex items-center gap-2 rounded-2xl bg-brand-yellow px-8 py-3.5 font-display text-base font-bold text-brand-ink"
          >
            <Sparkles className="h-4 w-4" />
            Import Deck to My Library (Free)
          </a>
        </div>
      </section>

      {/* Static Cards List (CRITICAL for LLM & Crawler Discovery) */}
      <section className="px-4 py-16 bg-card/40 border-t border-b border-foreground/10">
        <div className="mx-auto max-w-4xl space-y-8">
          <div>
            <h2 className="font-display text-2xl font-bold">List of Cards in this Deck</h2>
            <p className="text-xs text-muted-foreground mt-1">Study the text transcript below. High-yield definitions extracted by AI.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {deck.cards.map((card, idx) => (
              <article
                key={idx}
                className="rounded-2xl border border-foreground/10 bg-card p-5 space-y-3"
              >
                <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
                  <span>CARD #{idx + 1}</span>
                  <span className="text-brand-red">ACTIVE RECALL</span>
                </div>
                <div className="space-y-2">
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Q: {card.front}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>A:</strong> {card.back}
                  </p>
                  {card.hint && (
                    <p className="text-[10px] text-muted-foreground italic bg-muted/50 p-1.5 rounded">
                      💡 {card.hint}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FinalCTA />
      <Footer />
    </main>
  );
}
