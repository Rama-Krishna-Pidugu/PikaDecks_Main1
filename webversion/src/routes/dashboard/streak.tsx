import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Shield, Award, Lock, Check, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/tanstack-react-start";
import {
  useStudyStreak,
  useReviewProgress,
  useUseStreakFreeze,
  useStudyStats,
} from "@/lib/queries";
import onFireImg from "@/assets/Pika/onfire.PNG";

export const Route = createFileRoute("/dashboard/streak")({
  component: StreakPage,
});

function StreakPage() {
  const router = useRouter();
  
  // Data queries
  const streakQuery = useStudyStreak();
  const progressQuery = useReviewProgress();
  const statsQuery = useStudyStats();
  
  // Mutation
  const freezeMutation = useUseStreakFreeze();
  
  const loading = streakQuery.isLoading || progressQuery.isLoading || statsQuery.isLoading;
  const error = streakQuery.error?.message || progressQuery.error?.message || statsQuery.error?.message || null;
  
  const streak = streakQuery.data;
  const progress = progressQuery.data;
  const stats = statsQuery.data;

  const handleUseFreeze = async () => {
    if (!streak) return;
    if (streak.streak_freeze_active) {
      toast.info("Your streak is already restored/protected for today!");
      return;
    }
    if (streak.streak_freeze_count <= 0) {
      toast.error("You do not have any streak restores remaining.");
      return;
    }
    
    toast("Use Streak Restore?", {
      description: "This will protect your streak for today even if you do not study.",
      action: {
        label: "Restore",
        onClick: async () => {
          try {
            await freezeMutation.mutateAsync();
            toast.success("Streak restored!");
          } catch (err: any) {
            toast.error(err?.message || "Failed to restore streak.");
          }
        }
      },
      cancel: {
        label: "Cancel",
        onClick: () => {}
      }
    });
  };

  const renderDotGrid = () => {
    if (!progress) return null;
    
    const completed = progress.reviews_completed_today;
    const remaining = progress.remaining_reviews;
    const total = completed + remaining;
    
    if (total === 0) {
      return (
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-emerald-600">🎉 All caught up for today!</p>
        </div>
      );
    }
    
    // 1 dot per 5 reviews
    const reviewsPerDot = 5;
    const completedDots = Math.floor(completed / reviewsPerDot);
    const remainingDots = Math.ceil(remaining / reviewsPerDot);
    const totalDots = Math.min(40, Math.max(1, completedDots + remainingDots));
    
    const dots = [];
    for (let i = 0; i < totalDots; i++) {
      if (i < completedDots) {
        dots.push("completed");
      } else {
        dots.push("pending");
      }
    }
    
    return (
      <div className="border border-border bg-card rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap gap-2.5 justify-start">
          {dots.map((state, idx) => (
            <div
              key={idx}
              className={`h-5 w-5 rounded-full border-2 transition-colors ${
                state === "completed"
                  ? "bg-emerald-500 border-emerald-500"
                  : "bg-background border-border/80"
              }`}
            />
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs font-bold text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border border-border bg-background" />
              <span>Remaining</span>
            </div>
          </div>
          <span className="text-foreground">
            {completed} / {total} reviews ({progress.completion_percentage}%)
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto font-sans px-2 sm:px-4 pb-20 space-y-6">
      {/* Header / Back */}
      <header className="flex items-center gap-4">
        <button
          onClick={() => void router.history.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-muted transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Study Streak</h1>
          <p className="text-xs font-semibold text-muted-foreground">Track your study consistency and habit building</p>
        </div>
      </header>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading stats...</p>
        </div>
      ) : error ? (
        <div className="border border-border rounded-[2.5rem] bg-rose-50/50 p-8 text-center max-w-lg mx-auto">
          <span className="text-3xl block mb-2">⚠️</span>
          <h3 className="font-display text-lg font-extrabold text-foreground">Failed to load gamification stats</h3>
          <p className="text-xs font-semibold text-muted-foreground mt-2 mb-4">{error}</p>
          <button
            onClick={() => {
              void streakQuery.refetch();
              void progressQuery.refetch();
              void statsQuery.refetch();
            }}
            className="border border-border bg-card text-xs font-extrabold px-6 py-2.5 rounded-xl cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Flame Card */}
          <div className="border border-border bg-card rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-sm">
            <img src={onFireImg} alt="Pika on fire" className="h-32 w-32 object-contain mb-4" />
            <h2 className="font-display text-5xl font-black text-foreground tracking-tight">
              {streak?.current_streak || 0}
            </h2>
            <p className="text-base font-extrabold text-orange-500 tracking-wide uppercase mt-2">
              Day Study Streak
            </p>
            <p className="text-xs font-semibold text-muted-foreground max-w-sm mt-4 leading-relaxed">
              Review at least 10 cards daily to keep your streak burning bright and unlock achievements!
            </p>
          </div>

          {/* Stats Badges Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-border bg-card rounded-2xl p-4 text-center">
              <p className="text-lg font-black text-foreground">{streak?.longest_streak || 0}</p>
              <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mt-1">Longest Streak</p>
            </div>
            <div className="border border-border bg-card rounded-2xl p-4 text-center">
              <p className="text-lg font-black text-foreground">{streak?.total_study_days || 0}</p>
              <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mt-1">Study Days</p>
            </div>
            <div className="border border-border bg-card rounded-2xl p-4 text-center">
              <p className="text-lg font-black text-foreground">{stats?.hours_studied || 0}h</p>
              <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mt-1">Hours Studied</p>
            </div>
          </div>

          {/* Streak Freeze Banner */}
          <div className="border border-indigo-500/15 bg-indigo-500/[0.02] rounded-[2rem] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start sm:items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/10">
                <Shield className={`h-5 w-5 ${streak?.streak_freeze_active ? "text-emerald-500" : "text-primary"}`} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">
                  {streak?.streak_freeze_active ? "Streak Protected Today" : "Streak Restore"}
                </h3>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                  {streak?.streak_freeze_active
                    ? "Your streak is protected from being broken today!"
                    : `You have ${streak?.streak_freeze_count || 0} streak restores remaining this month.`}
                </p>
              </div>
            </div>

            <button
              onClick={handleUseFreeze}
              disabled={streak?.streak_freeze_active || freezeMutation.isPending}
              className={`btn-pop px-5 py-3 rounded-xl text-xs font-extrabold tracking-wide uppercase transition-all cursor-pointer ${
                streak?.streak_freeze_active
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 cursor-default"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {freezeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : streak?.streak_freeze_active ? (
                "Protected"
              ) : (
                "Use Restore"
              )}
            </button>
          </div>

          {/* Today's Review Progress Grid */}
          <section className="space-y-3">
            <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">
              Today's Review Progress
            </h3>
            {renderDotGrid()}
          </section>

          {/* Streak Milestones */}
          {streak?.milestones && streak.milestones.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">
                Streak Milestones
              </h3>
              <div className="space-y-3">
                {streak.milestones.map((m) => (
                  <div
                    key={m.days}
                    className={`flex items-center gap-4 border p-4 rounded-2xl shadow-sm transition-all ${
                      m.reached
                        ? "border-orange-500/25 bg-orange-500/[0.01]"
                        : "border-border bg-card"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        m.reached
                          ? "bg-orange-500/10 border-orange-500/10 text-orange-500"
                          : "bg-muted/50 border-border text-muted-foreground"
                      }`}
                    >
                      {m.reached ? <Award className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm font-extrabold ${m.reached ? "text-orange-600" : "text-foreground"}`}>
                        {m.name}
                      </h4>
                      <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">{m.days} day streak challenge</p>
                    </div>
                    {m.reached ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Locked</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
