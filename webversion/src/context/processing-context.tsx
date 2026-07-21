import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/tanstack-react-start";
import { apiFetch } from "@/lib/api";

export type ActiveJob = {
  id: string;
  type: "pdf" | "youtube";
  title: string;
  status: string;
  stage: string;
  progress: number;
  deck_id?: string | null;
  created_at: string;
};

type ProcessingContextType = {
  activeJobs: ActiveJob[];
  cancelJob: (jobId: string, type: "pdf" | "youtube") => Promise<void>;
  isLoading: boolean;
  refreshJobs: () => Promise<void>;
};

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const ProcessingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchActiveJobs = async () => {
    try {
      const data = await apiFetch<{ success: boolean; jobs?: ActiveJob[] }>("/uploads/active", {
        getToken: getTokenRef.current,
      });
      if (data.success && data.jobs) {
        setActiveJobs(data.jobs);
      }
    } catch (error) {
      console.error("Failed to fetch active processing jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelJob = async (jobId: string, type: "pdf" | "youtube") => {
    try {
      const path = type === "pdf"
        ? `/uploads/${jobId}/abort`
        : `/youtube/generation/${jobId}/abort`;
        
      await apiFetch(path, {
        method: "POST",
        getToken: getTokenRef.current,
      });
      
      // Update local state immediately to responsive cancelled
      setActiveJobs(prev =>
        prev.map(job =>
          job.id === jobId
            ? { ...job, status: "cancelled", stage: "CANCELLED", progress: 100 }
            : job
        )
      );
      
      // Re-fetch shortly to sync
      setTimeout(fetchActiveJobs, 1000);
    } catch (error) {
      console.error(`Failed to cancel ${type} job:`, error);
      alert("Could not cancel the job. It might have finished already.");
    }
  };

  // 1. Initial fetch on mount
  useEffect(() => {
    fetchActiveJobs();
  }, []);

  // 2. Dynamically start/stop polling based on active jobs state
  useEffect(() => {
    const hasActiveJobs = activeJobs.some(
      job =>
        job.status === "processing" ||
        job.status === "queued" ||
        job.status === "uploading"
    );

    if (hasActiveJobs) {
      if (!pollIntervalRef.current) {
        // Poll every 5 seconds if there are active jobs running
        pollIntervalRef.current = setInterval(fetchActiveJobs, 5000);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      // Cleanup on unmount
    };
  }, [activeJobs]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return (
    <ProcessingContext.Provider
      value={{
        activeJobs,
        cancelJob,
        isLoading,
        refreshJobs: fetchActiveJobs,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
};

export const useProcessingManager = () => {
  const context = useContext(ProcessingContext);
  if (!context) {
    throw new Error("useProcessingManager must be used within a ProcessingProvider");
  }
  return context;
};
