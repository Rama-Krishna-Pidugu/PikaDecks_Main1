# 🤖 AI-Accelerated Development Process

This document describes how AI capabilities were integrated into the development workflow of PikaDecks during the OpenAI Codex Build Week Hackathon.

---

## 🛠️ Collaborative AI Tiers

The development of PikaDecks used a collaborative team model where human developers guided the architecture, validated all code, and integrated three primary tiers of engineering:

### 1. ChatGPT (Ideation & Architecture)
* **Role**: Product Planner & Technical Architect.
* **Tasks Executed**:
  - Structured the database relation tables (User, Deck, Card, StudySession).
  - Drafted the core Spaced Repetition logic rules.
  - Formulated system prompts for clean, structured JSON output from LLMs during PDF card generation.
  - Advised on cross-platform navigation layouts.

### 2. Codex / GPT-5.6 (Implementation & Features)
* **Role**: Software Engineer.
* **Tasks Executed**:
  - Read existing backend, web, mobile, and MCP files before making scoped implementation changes.
  - Wrote and refined Python code for processing and chunking PDFs with `pypdf`.
  - Implemented backend routing using FastAPI, async handlers, and shared response models.
  - Engineered frontend React hooks (`useDecks.ts` and `useStats.ts`) to handle loading states, local caching, and dashboard updates.
  - Helped connect Expo screens, web routes, and backend endpoints so the same study data could flow across app surfaces.
  - Authored focused `pytest` checks and type-safe implementation details for scheduling and API behavior.
  - Debugged build, deployment, and integration errors by reading logs, identifying the failing boundary, and applying targeted fixes.

### Codex Feedback Loop
Codex was most useful when paired with direct developer feedback. The workflow was:

1. **Prompt with intent**: The developer described the goal, user problem, and any constraints.
2. **Inspect before editing**: Codex searched the codebase, read the relevant files, and identified the local patterns already used by PikaDecks.
3. **Make a small implementation pass**: Codex changed only the needed files and kept the behavior aligned with the existing architecture.
4. **Verify the result**: Codex ran available checks such as builds, tests, type checks, or targeted local server checks.
5. **Collect feedback**: The developer reviewed the behavior, UI copy, error handling, or API response and gave concrete feedback.
6. **Iterate clearly**: Codex revised the implementation, explained what changed, and repeated verification when needed.

This feedback loop helped turn broad ideas into working product behavior. For example, when a generated deck flow needed clearer loading states, the developer described the confusing part of the experience; Codex traced the route and hook state, updated the UI logic, and then checked that the build still passed.

### 3. Antigravity Agents (Repository Engineering)
* **Role**: Repository Operator & Automation Engineer.
* **Tasks Executed**:
  - Ran multi-file audits to check for environment configuration alignment.
  - Managed background tasks such as compiling, dependency installations, and local servers management.
  - Analyzed and mapped project files recursively.

---

## 📈 "Why Codex" — Technical Proof Points

Codex was critical in solving multiple complex engineering blocks under hackathon time limits:

1. **Context Preservation**: Codex parsed the entire TypeScript routing system within the TanStack Start project, dynamically suggesting layout wrapper edits without breaking existing route states.
2. **Deterministic Code Conversion**: Codex translated pseudo-code for the SuperMemo-2 scheduling algorithm into optimized, type-safe Python methods:
   ```python
   # Sample implementation generated and optimized by Codex
   def calculate_next_review(easiness_factor: float, repetitions: int, grade: int):
       if grade >= 3:
           if repetitions == 0:
               interval = 1
           elif repetitions == 1:
               interval = 6
           else:
               interval = round(repetitions * easiness_factor)
           new_ef = easiness_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
           return interval, repetitions + 1, max(1.3, new_ef)
       else:
           return 1, 0, easiness_factor
   ```
3. **Multi-Service Alignment**: Codex kept model definitions between the FastAPI Python schemas and the TypeScript interfaces aligned, reducing communication bugs between teams.
4. **User-Facing Clarity**: Codex helped rewrite support text, locked-feature messages, billing states, and AI-generation feedback so users receive clear next steps instead of raw implementation details.
5. **Error-Driven Debugging**: Codex used failing terminal output, type errors, and runtime messages as feedback, then mapped each failure back to the responsible file or service boundary.

---

## ⚖️ Verification & Human Control
While AI generated code blocks and automated layouts, the project maintains strict developer verification controls:
- **Developer Review**: All generated files were linted and manually checked before committing.
- **Manual Sandboxes**: Local servers were launched and inspected manually to verify route responses and payment integration flows.
- **Type Safety Checks**: Strict TypeScript compilations and Python type validations were executed on every major system boundary.
- **Feedback-Based Acceptance**: Code was accepted only after the developer checked that the feature matched the expected app behavior, user experience, and product wording.
