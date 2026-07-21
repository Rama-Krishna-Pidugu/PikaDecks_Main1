import { motion } from "framer-motion";

const stats = [
  { value: "50k+", label: "Flashcards created" },
  { value: "10k+", label: "Daily learners" },
  { value: "95%", label: "Better retention" },
];

const testimonials = [
  { name: "Maya Chen", role: "CS Student · MIT", avatar: "🧑‍💻", quote: "Turned a 200-page textbook into 80 perfect cards in 2 minutes. My GPA thanks you." },
  { name: "Diego Alvarez", role: "Med School · UCSF", avatar: "👨‍⚕️", quote: "The spaced repetition is unreal. I'm retaining 3x more anatomy than last semester." },
  { name: "Aisha Patel", role: "Language Learner", avatar: "🌍", quote: "Drops YouTube videos in, gets back flashcards. Korean fluency on speedrun." },
];

export function SocialProof() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-3 gap-4 md:gap-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-3xl border-2 border-foreground/10 bg-card p-6 text-center shadow-soft md:p-8"
            >
              <p className="font-display text-4xl font-bold text-brand-red md:text-6xl">{s.value}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground md:text-sm">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-3xl border-2 border-foreground bg-card p-6 shadow-pop"
            >
              <p className="text-foreground">"{t.quote}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow text-xl">
                  {t.avatar}
                </div>
                <div>
                  <p className="font-display text-sm font-bold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
