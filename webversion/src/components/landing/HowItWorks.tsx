import { motion } from "framer-motion";
import { Upload, Wand2, Brain, ArrowRight } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload anything", desc: "PDF, YouTube link, lecture notes, website — drop it in." },
  { icon: Wand2, title: "AI does the magic", desc: "Smart flashcards generated in seconds, ready to study." },
  { icon: Brain, title: "Learn forever", desc: "Daily 5-minute sessions, science-backed retention." },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-red">How it works</p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Three steps. <span className="text-brand-red">Zero</span> friction.
          </h2>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative"
            >
              <div className="rounded-3xl border-2 border-foreground bg-card p-8 shadow-pop">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-display text-6xl font-bold text-brand-yellow [-webkit-text-stroke:2px_var(--brand-ink)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellow">
                    <s.icon className="h-7 w-7" />
                  </div>
                </div>
                <h3 className="font-display text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="absolute -right-6 top-1/2 hidden h-10 w-10 -translate-y-1/2 text-brand-red md:block" strokeWidth={2.5} />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
