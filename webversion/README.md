# 🌐 PikaDecks Web Application

The frontend web interface for PikaDecks is built on **TanStack Start**, a modern full-stack meta-framework for React 19 and Vite.

## 🚀 Setup Instructions

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```
2. **Environment Variables**:
   Create a `.env` file with:
   - `VITE_API_URL=http://localhost:8000`
   - `VITE_CLERK_PUBLISHABLE_KEY=clerk_anon_key`
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
4. **Compile and Build**:
   ```bash
   npm run build
   ```

## 🛠️ Features Included
- **Dynamic PDF Upload**: Interface for uploading and chunking PDF documents.
- **Study Mode**: Interface for reviewing flashcards with custom evaluation grades (1-5).
- **Progress Metrics**: Visually stunning charts tracking daily study intervals and streak counts using Recharts.
- **Agent Proxies**: Cloudflare routing configuration for handling local/remote MCP connections.
