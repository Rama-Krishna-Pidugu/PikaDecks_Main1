import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    port: 3000,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: {
        entry: "server"
      },
    }),
    nitro(),
    viteReact(),
    tsConfigPaths(),
  ],
});
