# Ecosystem Checker

## Optional API credentials

Deep Check works without API credentials, but public X timeline pages can rate-limit larger batches. To use the official X user-timeline endpoint for last-post dates, add an API bearer token to `checker-app/.env`:

```dotenv
X_BEARER_TOKEN=your_token_here
```

You can also add `GITHUB_TOKEN` to raise the GitHub public API limit used by the repository activity check.

## Deploying to Vercel

The app includes Node.js functions for `GET /api/extract` and `POST /api/deep-check` plus a serverless Chromium binary. When importing this repository into Vercel:

1. Set the project's **Root Directory** to `checker-app`.
2. Keep the framework preset set to **Vite** and deploy. `vercel.json` configures the function files and execution limits.
3. Add `X_BEARER_TOKEN` and `GITHUB_TOKEN` under **Project Settings → Environment Variables** if you use them locally, then redeploy. Local `.env` values are not uploaded automatically.

Deep checks stream progress from a Vercel function. Large batches still need to finish within the function duration allowed by the Vercel plan; split unusually large datasets into smaller runs if necessary.

## Local run history

Completed Quick and Deep Checks are saved in browser `localStorage`. The startup screen can restore any of the newest 10 runs; if browser quota is insufficient, the oldest snapshots are trimmed first. The previous single `last-run` record is migrated automatically on the next completed check.

## React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
