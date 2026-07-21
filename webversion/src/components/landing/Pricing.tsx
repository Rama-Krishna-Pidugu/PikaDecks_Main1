import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Get started, build a habit.",
    features: ["20 AI cards / day", "Spaced repetition", "Mobile + web", "Community access"],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$8",
    period: "/month",
    desc: "For serious learners.",
    features: ["Unlimited AI cards", "YouTube & PDF imports", "AI study assistant", "Offline mode", "Priority support"],
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Teams",
    price: "$16",
    period: "/seat/mo",
    desc: "For classrooms & study groups.",
    features: ["Everything in Pro", "Shared decks", "Team analytics", "Admin controls", "SSO & SCIM"],
    cta: "Contact sales",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-red">Pricing</p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Simple, student-friendly.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative flex flex-col rounded-3xl border-2 p-8 ${
                p.highlight
                  ? "border-foreground bg-brand-yellow shadow-pop lg:-translate-y-4 lg:scale-105"
                  : "border-foreground/10 bg-card shadow-soft"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-foreground bg-brand-red px-3 py-1 text-xs font-bold text-white">
                  <Sparkles className="mr-1 inline h-3 w-3" /> MOST POPULAR
                </div>
              )}
              <h3 className="font-display text-2xl font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${p.highlight ? "bg-foreground text-brand-yellow" : "bg-brand-yellow text-foreground"}`}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/login"
                className={`btn-pop mt-8 block rounded-2xl py-3 text-center font-display font-bold ${
                  p.highlight ? "bg-foreground text-brand-yellow" : "bg-brand-yellow text-foreground"
                }`}
              >
                {p.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
