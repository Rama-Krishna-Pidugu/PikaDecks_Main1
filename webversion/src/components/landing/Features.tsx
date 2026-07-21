import { motion } from "framer-motion";
import { Sparkles, Youtube, FileText, Repeat, Bot, Plug, RefreshCw, WifiOff } from "lucide-react";

const features = [
  { icon: Sparkles, title: "AI Flashcard Generation", desc: "Drop in any topic, get exam-ready cards in seconds.", accent: true },
  { icon: Youtube, title: "YouTube to Notes", desc: "Paste a link — get summarized notes and cards." },
  { icon: FileText, title: "PDF to Quiz", desc: "Upload any PDF and instantly generate a quiz." },
  { icon: Repeat, title: "Spaced Repetition", desc: "Science-backed scheduling so you never forget." },
  { icon: Bot, title: "AI Study Assistant", desc: "Chat with your notes. Ask anything, anytime." },
  { icon: Plug, title: "MCP Tool Integration", desc: "Hook into Claude, Cursor, Notion — your stack, your way." },
  { icon: RefreshCw, title: "Multi-device Sync", desc: "iPhone, iPad, Mac, Android, Web — always in sync." },
  { icon: WifiOff, title: "Offline Learning", desc: "Study on the subway, on a plane, anywhere." },
];

export function Features() {
  return (
    <section id="features" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-red">Features</p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Everything you need to <span className="underline decoration-brand-yellow decoration-8 underline-offset-4">actually</span> remember.
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: (i % 4) * 0.08 }}
              className={`group relative overflow-hidden rounded-3xl border-2 p-6 transition-transform hover:-translate-y-1 ${
                f.accent
                  ? "border-foreground bg-brand-yellow shadow-pop"
                  : "border-foreground/10 bg-card shadow-soft"
              }`}
            >
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${f.accent ? "bg-foreground text-brand-yellow" : "bg-brand-yellow text-foreground"}`}>
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
