import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/downloads/pikadecks.apk")({
  server: {
    handlers: {
      GET: async () => {
        const downloadUrl =
          import.meta.env.VITE_APK_DOWNLOAD_URL ||
          "https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks";

        return new Response(null, {
          status: 302,
          headers: {
            Location: downloadUrl,
          },
        });
      },
    },
  },
  component: () => null, // Provide a no-op component just in case client-side transition happens
});
