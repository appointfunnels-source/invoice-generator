# Invoice Generator — Vercel version (backend AI)

Same invoice tool as the Muse copy, but the OpenAI key lives **only in the
backend**. The browser never sees a key and never calls OpenAI directly.

## How it works

- `index.html` — the invoice editor. The Generate button POSTs the pasted
  proposal text to `/api/generate-invoice` (same site, relative URL) and
  fills the invoice from the JSON it gets back: client name, company,
  package, line items, rates, Product Name, Contract Timeline 60 Days,
  Due Date = invoice date + 60 days, and personalised Description/Notes
  for Quick Start (1 client guaranteed) / Business Catalyst (2 clients
  guaranteed). If the backend is not configured or the call fails, it
  falls back to the built-in local parser.
- `api/generate-invoice.js` — Vercel Serverless Function (Node, no
  dependencies). Reads `OPENAI_API_KEY` and `OPENAI_MODEL`
  (default `gpt-4o-mini`) from the server environment only, calls
  `https://api.openai.com/v1/chat/completions` with JSON output, and
  returns the extracted invoice fields. The key is never sent to the
  browser, never logged, and never appears in error responses.
- `vercel.json` — no build command, no framework. Static file + function.

## Deploy to Vercel

1. Upload this whole folder to Vercel — either drag the folder into
   vercel.com/new, or push it to Git and import the repo. Leave
   Framework Preset as **Other**, Build Command empty.
2. In the Vercel dashboard open the project, then
   **Settings > Environment Variables** and add:
   - Key: `OPENAI_API_KEY` — Value: your OpenAI key (`sk-...`)
   - Key: `OPENAI_MODEL` — Value: `gpt-4o-mini` (optional)
   - Tick **Production, Preview and Development** for both.
3. Click **Save**, then **Deployments > Redeploy** so the server
   function picks up the variables.
4. Open the deployed site, paste a proposal (e.g. `Ahmed — Business
   Catalyst package`), click **Generate invoice**. It should fill from
   the AI backend. If you see "AI backend not configured", the
   `OPENAI_API_KEY` variable is missing — check step 2 and redeploy.

## Local test (optional)

```bash
OPENAI_API_KEY=sk-... npx vercel dev
```

Then open http://localhost:3000 and click Generate. Without the key
the endpoint returns 501 and the page uses the local parser instead.
