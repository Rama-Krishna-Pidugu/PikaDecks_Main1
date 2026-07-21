import React, { useState } from "react";
import { useProcessingManager } from "@/context/processing-context";
import { Loader2, ChevronUp, ChevronDown, Video, FileText } from "lucide-react";

export const GlobalProcessingUI: React.FC = () => {
  const { activeJobs, cancelJob } = useProcessingManager();
  const [isOpen, setIsOpen] = useState(false);

  // Only show the UI if there are active (running/pending/queued) jobs
  const runningJobs = activeJobs.filter(job => 
    job.status === "pending" || job.status === "processing" || job.status === "queued"
  );

  if (runningJobs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 font-sans">
      {/* Small floating persistent pill badge */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-white px-4 py-3 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer font-bold text-xs tracking-wide uppercase border border-white/10"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Processing {runningJobs.length} {runningJobs.length === 1 ? "Job" : "Jobs"}</span>
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      {/* Detail panel drawer */}
      {isOpen && (
        <div className="w-80 sm:w-96 bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-3xl overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h4 className="text-sm font-extrabold text-foreground">Background Tasks</h4>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-extrabold">
                {runningJobs.length} active
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-lg transition-all cursor-pointer"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* List of running jobs */}
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border/30 px-5 py-2">
            {runningJobs.map(job => (
              <div key={job.id} className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted border border-border/50">
                      {job.type === "youtube" ? (
                        <Video className="h-4 w-4 text-rose-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-cyan-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-foreground truncate" title={job.title}>
                        {job.title}
                      </p>
                      <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mt-0.5">
                        {job.type} • {job.stage?.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => cancelJob(job.id, job.type)}
                    className="text-[10px] font-extrabold text-rose-600 hover:text-rose-500 bg-rose-50 hover:bg-rose-100/80 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer border border-rose-100"
                  >
                    Cancel
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                    <span>Progress</span>
                    <span>{job.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden border border-border/20">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-indigo-600 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
