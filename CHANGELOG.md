# Changelog

All notable changes to the PikaDecks project will be documented in this file.

## [1.0.0] - 2026-07-20
### Added
- Dynamic PDF ingestion pipeline with AWS S3 upload and metadata initialization.
- Page-by-page OCR and text extraction parsing using `pypdf`.
- Semantic chunking rules for parsing documents into logical context windows.
- Generative AI flashcard creator powered by Groq LLM integration.
- Spaced Repetition Scheduling (SRS) algorithm (`srs.py`) based on SuperMemo-2 principles.
- Full-stack web frontend built using TanStack Start, React 19, and Vite.
- Cross-platform Mobile App built with React Native & Expo.
- Standalone Model Context Protocol (MCP) server using Python FastMCP, deployed via Serverless framework on AWS Lambda.
