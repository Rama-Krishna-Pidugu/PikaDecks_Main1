import { Link } from "@tanstack/react-router";

type Col = { title: string; links: { label: string; to?: string; href?: string }[] };

const cols: Col[] = [
  {
    title: "Alternatives",
    links: [
      { label: "Anki Alternative", to: "/anki-alternative" },
      { label: "Quizlet Alternative", to: "/quizlet-alternative" },
      { label: "Spaced Repetition App", to: "/spaced-repetition-app" },
      { label: "Best AI Study App", to: "/best-ai-study-app" }
    ]
  },
  {
    title: "Use Cases",
    links: [
      { label: "PDF to Flashcards", to: "/pdf-to-flashcards" },
      { label: "YouTube to Flashcards", to: "/youtube-to-flashcards" },
      { label: "AI Flashcard Generator", to: "/flashcard-generator" },
      { label: "College Study Assistant", to: "/ai-study-tool-for-college-students" }
    ]
  },
  {
    title: "Public Decks",
    links: [
      { label: "Browse Decks", to: "/decks" },
      { label: "Biology 101", to: "/decks/biology-101" },
      { label: "AWS Exam Prep", to: "/decks/aws-solutions-architect" },
      { label: "Medical Terminology", to: "/decks/medical-terminology" },
      { label: "NEET Physics Formulas", to: "/decks/neet-physics-formulas" }
    ]
  },
  {
    title: "Legal & More",
    links: [
      { label: "Support", to: "/support" },
      { label: "Contact", to: "/contact" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Delete Account", to: "/delete-account" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Medical Study App", to: "/medical-student-study-app" }
    ]
  }
];

export function Footer() {
  return (
    <footer className="border-t-2 border-foreground/10 px-4 py-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-5">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2">
            <img src="/appIcon.png" alt="Pikadecks" width={36} height={36} loading="lazy" className="h-9 w-9 rounded-lg" />
            <span className="font-display text-lg font-bold">Pikadecks</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Remember anything with AI. Made with ☕ for learners everywhere.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="font-display text-sm font-bold">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.to ? (
                    <Link to={l.to} className="text-sm text-muted-foreground hover:text-foreground">{l.label}</Link>
                  ) : (
                    <a href={l.href} className="text-sm text-muted-foreground hover:text-foreground">{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-2 border-t-2 border-foreground/10 pt-6 text-xs text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} Pikadecks. All rights reserved.</p>
        <p>Built for Gen Z learners 💛</p>
      </div>
    </footer>
  );
}
