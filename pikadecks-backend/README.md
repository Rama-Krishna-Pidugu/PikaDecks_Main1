# ⚙️ PikaDecks Core Backend

The core backend for PikaDecks is built using FastAPI, offering high performance, async operations, and automated OpenAPI documentation.

## 🚀 Local Setup

1. **Create Python virtual environment**:
   ```bash
   python -m venv pikavenv
   ```
2. **Activate the environment**:
   - Windows: `.\pikavenv\Scripts\activate`
   - Mac/Linux: `source pikavenv/bin/activate`
3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Environment Configuration**:
   Create a `.env` file containing:
   - `SUPABASE_URL` & `SUPABASE_KEY`
   - `GROQ_API_KEY`
   - `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`
5. **Start server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## 🛠️ API Structure
- `/auth`: Handles token verification and session synchronization with Clerk/Firebase.
- `/decks`: CRUD operations for decks and user categories.
- `/cards`: Generation endpoints (Groq dynamic cards from uploaded PDF chunks) and review evaluations.
- `/srs`: Calculations for card scheduling and intervals.
- `/health`: Health checks and diagnostic monitoring.
