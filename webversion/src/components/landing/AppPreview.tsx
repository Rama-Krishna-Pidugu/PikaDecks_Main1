import { motion } from "framer-motion";
import { Flame, Trophy, MessageCircle, ChevronRight } from "lucide-react";

export function AppPreview() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-red">In the app</p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Designed to be your daily <span className="underline decoration-brand-yellow decoration-8 underline-offset-4">obsession.</span>
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            Swipeable cards, streaks that hit harder than your morning coffee, and an AI tutor that lives in your pocket.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              { icon: Flame, label: "Daily streaks & milestones" },
              { icon: Trophy, label: "Climb the leaderboards" },
              { icon: MessageCircle, label: "Chat with your AI tutor" },
            ].map((i) => (
              <li key={i.label} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow"><i.icon className="h-4 w-4" /></div>
                <span className="font-medium">{i.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex justify-center">
          <div className="absolute inset-0 -z-10 bg-radial-yellow blur-2xl" />
          <PhoneMockup />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="absolute -left-2 top-12 hidden rotate-[-8deg] rounded-2xl border-2 border-foreground bg-card p-3 shadow-pop md:block"
          >
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-brand-red" />
              <span className="font-display font-bold">69 day streak</span>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: 0.2 }}
            className="absolute -right-4 bottom-20 hidden rotate-[6deg] rounded-2xl border-2 border-foreground bg-brand-yellow p-3 shadow-pop md:block"
          >
            <p className="font-display text-sm font-bold">+120 XP today 🎉</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PhoneMockup() {
  return (
    <div className="relative h-[560px] w-[280px] rounded-[3rem] border-[10px] border-foreground bg-foreground p-2 shadow-pop">
      <div className="h-full w-full overflow-hidden rounded-[2.2rem] bg-background">
        {/* status bar */}
        <div className="flex items-center justify-between px-6 pt-3 text-[10px] font-semibold text-muted-foreground">
          <span>9:41</span>
          <span>•••</span>
        </div>
        {/* streak header */}
        <div className="mx-4 mt-3 flex items-center justify-between rounded-2xl border-2 border-foreground/10 bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white"><Flame className="h-4 w-4" /></div>
            <span className="font-display text-sm font-bold">69 days</span>
          </div>
          <span className="rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-bold">Lvl 12</span>
        </div>

        {/* Flashcard stack */}
        <div className="relative mx-6 mt-6 h-56">
          <div className="absolute inset-x-2 inset-y-3 rotate-[-3deg] rounded-2xl border-2 border-foreground/30 bg-card" />
          <div className="absolute inset-x-1 inset-y-2 rotate-[2deg] rounded-2xl border-2 border-foreground/50 bg-card" />
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border-2 border-foreground bg-brand-yellow p-5 shadow-pop">
            <span className="text-[10px] font-bold uppercase tracking-wider">Biology · Card 4/12</span>
            <p className="font-display text-xl font-bold leading-tight">
              What is the powerhouse of the cell?
            </p>
            <div className="flex justify-end">
              <div className="rounded-full bg-foreground px-3 py-1 text-[10px] font-bold text-brand-yellow">Tap to flip</div>
            </div>
          </div>
        </div>

        {/* AI chat preview */}
        <div className="mx-4 mt-6 rounded-2xl border-2 border-foreground/10 bg-muted p-3">
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-yellow"><MessageCircle className="h-4 w-4" /></div>
            <div>
              <p className="text-[10px] font-bold">AI Tutor</p>
              <p className="text-xs text-muted-foreground">Want me to make harder cards on cell biology?</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mx-4 mt-4">
          <button className="flex w-full items-center justify-center gap-1 rounded-2xl bg-brand-red py-3 font-display text-sm font-bold text-white">
            Continue studying <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
