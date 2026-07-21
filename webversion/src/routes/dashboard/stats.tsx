import { createFileRoute } from "@tanstack/react-router";
import { Flame, Award, BookOpen, Calendar, Loader2, Sparkles } from "lucide-react";
import { useStats } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/stats")({
  component: StatsPage,
});

function StatsPage() {
  // TanStack Query — shares cache with dashboard home
  const statsQuery = useStats();

  const stats = statsQuery.data || {
    current_streak: 0,
    longest_streak: 0,
    cards_reviewed_total: 0,
    study_days: 0,
    cards_reviewed_today: 0,
    weekly: [0, 0, 0, 0, 0, 0, 0],
  };
  const loading = statsQuery.isLoading;
  const error = statsQuery.error?.message || null;

  const maxVal = Math.max(...stats.weekly, 1);
  const weeklyTotal = stats.weekly.reduce((a, b) => a + b, 0);

  const getDayLabel = (index: number) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return dayNames[date.getDay()];
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans px-2 sm:px-4 pb-20">
      {/* Title Header */}
      <section className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">
          Your Stats
        </h1>
        <p className="text-sm font-semibold text-muted-foreground mt-1">
          Track your spaced repetition milestones and stay consistent!
        </p>
      </section>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="border border-border rounded-[2.5rem] bg-rose-50/50 p-8 text-center max-w-lg mx-auto">
          <span className="text-3xl block mb-2">⚠️</span>
          <h3 className="font-display text-lg font-extrabold text-foreground">Could not load stats</h3>
          <p className="text-xs font-semibold text-muted-foreground mt-2 mb-4">{error}</p>
          <button
            onClick={() => void statsQuery.refetch()}
            className="border border-border bg-card text-xs font-extrabold px-6 py-2.5 rounded-xl cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8 animate-fade-in">
          {/* Metrics Grid: Responsive for Mobile, Tablet, and Desktop */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricTile
              icon={<Flame className="h-5 w-5 stroke-[2.5]" />}
              label="Current Streak"
              value={`${stats.current_streak} days`}
              accentColor="bg-orange-50 text-orange-500 border-orange-100"
            />
            <MetricTile
              icon={<Award className="h-5 w-5 stroke-[2.5]" />}
              label="Longest Streak"
              value={`${stats.longest_streak} days`}
              accentColor="bg-yellow-50 text-amber-500 border-yellow-100"
            />
            <MetricTile
              icon={<BookOpen className="h-5 w-5 stroke-[2.5]" />}
              label="Cards Reviewed"
              value={stats.cards_reviewed_total.toLocaleString()}
              accentColor="bg-indigo-50 text-primary border-indigo-100"
            />
            <MetricTile
              icon={<Calendar className="h-5 w-5 stroke-[2.5]" />}
              label="Study Days"
              value={`${stats.study_days} days`}
              accentColor="bg-cyan-50 text-cyan-600 border-cyan-100"
            />
          </section>

          {/* Activity Chart Section */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Weekly Activity chart */}
            <div className="lg:col-span-2 border border-border bg-card rounded-3xl p-6">
              <div className="flex justify-between items-center border-b border-border/80 pb-4 mb-6">
                <h3 className="font-display text-sm sm:text-base font-extrabold text-foreground">
                  This Week's Activity
                </h3>
                <span className="rounded-full bg-background border border-border px-3 py-1 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">
                  {weeklyTotal} Cards Studied
                </span>
              </div>

              {/* Responsive modern CSS Bar Chart */}
              <div className="flex items-end justify-between gap-1.5 sm:gap-4 h-64 pt-6 px-1">
                {stats.weekly.map((val, idx) => {
                  const heightPercent = Math.max((val / maxVal) * 100, 4);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2.5 h-full justify-end">
                      <div className="w-full bg-background/50 border border-border/60 rounded-2xl flex-1 flex flex-col justify-end overflow-hidden relative group shadow-inner">
                        {/* Tooltip value */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-extrabold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {val}
                        </div>

                        {/* Bar fill cylinder */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-primary rounded-t-xl transition-all duration-500 ease-out group-hover:bg-primary/90"
                        />
                      </div>
                      <span className="text-[10px] font-extrabold text-muted-foreground">
                        {getDayLabel(idx)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Encouragement Card */}
            <div className="border border-brand/20 rounded-3xl bg-brand-soft/60 p-6 md:p-8 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-2xl">
                  🔥
                </div>
                <h3 className="font-display text-lg font-extrabold text-foreground leading-tight">
                  Keep it going!
                </h3>
                <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                  You reviewed <strong className="font-extrabold text-primary">{stats.cards_reviewed_today}</strong> flashcards today. Log back in tomorrow to unlock another learning badge and extend your day-to-day study streak!
                </p>
              </div>

              <div className="border-t border-border/40 pt-4 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                  SPACED REPETITION ENGINE
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type MetricTileProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
};

function MetricTile({ icon, label, value, accentColor }: MetricTileProps) {
  return (
    <article className="border border-border bg-card rounded-3xl p-5 hover:scale-[1.01] transition-transform">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border border-border ${accentColor}`}>
          {icon}
        </div>
        <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="font-display text-xl md:text-2xl font-extrabold text-foreground mt-4 pl-0.5">
        {value}
      </p>
    </article>
  );
}
