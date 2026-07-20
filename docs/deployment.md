# 🚀 PikaDecks Deployment Guide

This document explains the cloud deployment architecture and processes for the PikaDecks platform.

---

## 🏛️ Infrastructure Overview

PikaDecks leverages a fully serverless, highly scalable cloud infrastructure:

- **Web Application**: Hosted on **Vercel / Cloudflare Pages** with serverless edge functions handling API proxy routing.
- **Core FastAPI Backend**: Packaged using Serverless Framework, deployed as an **AWS Lambda** function proxied by **AWS API Gateway**.
- **MCP Server**: Deployed as a standalone **AWS Lambda** service using `serverless.yml` to minimize resource consumption and cost.
- **Database & Auth**: Hosted on managed **Supabase (PostgreSQL)** and **Clerk**.
- **Storage**: Media assets and documents are stored in an **AWS S3** bucket.

---

## 📦 Deployment Steps

### 1. Core Backend (FastAPI to AWS Lambda)
Make sure AWS credentials are configured (`~/.aws/credentials`).

```bash
cd pikadecks-backend
npm install
serverless deploy --stage prod
```

The CLI will deploy the FastAPI endpoints using the Mangum handler and output your API Gateway endpoint URL (e.g., `https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod/`).

### 2. MCP Server (AWS Lambda)
Deploy the standalone lightweight MCP server:

```bash
cd pikadecks-mcp
npm install
serverless deploy --stage prod
```

Configure the output endpoint URL in the Web App's environment variables to proxy `/mcp` requests.

### 3. Web version (TanStack Start / Vite)
Deploy to Vercel or Cloudflare:
```bash
cd webversion
npm run build
```
- If deploying to Vercel, connect your repository and set the framework preset to Vite.
- Set up proxy redirects in your worker configuration to forward requests matching `/mcp/*` to the deployed MCP API Gateway.
