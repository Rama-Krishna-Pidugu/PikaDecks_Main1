import { motion } from "framer-motion";
import { Users, Trophy, Flame, Gift } from "lucide-react";

const items = [
  { icon: Users, title: "Study groups", desc: "Join rooms with friends and classmates. Study together, win together." },
  { icon: Trophy, title: "Leaderboards", desc: "Weekly competitions. Climb your school, country, or global ranks." },
  { icon: Flame, title: "Daily streaks", desc: "Five minutes a day. Don't break the chain." },
  { icon: Gift, title: "Referral rewards", desc: "Invite friends, unlock Pro perks and exclusive mascot skins." },
];

export function Community() {
  return (
    <section id="community" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl rounded-[2.5rem] border-2 border-foreground bg-foreground p-8 text-background shadow-pop md:p-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-yellow">Community</p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Learning is better <span className="text-brand-yellow">together.</span>
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-3xl border-2 border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-yellow text-foreground">
                <it.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold">{it.title}</h3>
              <p className="mt-2 text-sm text-white/70">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
