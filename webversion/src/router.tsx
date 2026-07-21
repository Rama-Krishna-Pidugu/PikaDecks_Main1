import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { trackQueryOperation, trackMutationOperation } from "@/lib/sentry";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onSuccess: (data, query) => {
        trackQueryOperation(query.queryKey.join("/"), "execution", { status: "success" });
      },
      onError: (error, query) => {
        trackQueryOperation(query.queryKey.join("/"), "execution", { status: "failed", error: error.message });
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (data, variables, context, mutation) => {
        trackMutationOperation(mutation.options.mutationKey?.join("/") || "unnamed_mutation", "success");
      },
      onError: (error, variables, context, mutation) => {
        trackMutationOperation(mutation.options.mutationKey?.join("/") || "unnamed_mutation", "failed", { error: error.message });
      },
      onMutate: (variables, mutation) => {
        trackMutationOperation(mutation.options.mutationKey?.join("/") || "unnamed_mutation", "started");
      }
    }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,        // 30 sec default
        gcTime: 10 * 60 * 1000,      // 10 min garbage collection
        retry: 1,                     // retry once on failure
        refetchOnWindowFocus: false,  // don't spam on tab switch
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
  });

  return router;
};
