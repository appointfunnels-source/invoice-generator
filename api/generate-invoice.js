'use strict';

/**
 * POST /api/generate-invoice
 *
 * Backend-only AI invoice generation for Vercel.
 *
 * The OpenAI key lives ONLY here, on the server, read from the
 * OPENAI_API_KEY environment variable. It is never sent to the browser,
 * never logged, and never appears in any error response.
 * The frontend (index.html) only POSTs the user's description text to
 * this endpoint and uses the JSON it gets back. If no key is configured
 * it returns 501 and the frontend falls back to its built-in local parser.
 *
 * No dependencies: uses the built-in fetch (Node 18+ on Vercel).
 */

module.exports = async function handler(req, res) {
  // Only POST.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return res.status(501).json({ error: 'OPENAI_API_KEY not configured' });
  }

  // Vercel usually parses JSON bodies already; handle a raw string too.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'Missing "text" in request body' });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: 'Text too long (max 8000 characters)' });
  }

  const system =
    'You fill an invoice from messy proposal text. Return ONLY a JSON object with keys: ' +
    'billTo (string, name and company exactly as given — a bare name or company with no contact details is fine), ' +
    'company (string, company name if given, else ""), ' +
    'category (string, business category/niche if given, else ""), ' +
    'poNumber (product/package name), package (one of "Quick Start", "Business Catalyst", "Elite", "Personalised" or ""), ' +
    'currency (USD, PKR, EUR or GBP), taxRate, discount, shipping, amountPaid, scheduledPayment ' +
    '(numbers as strings, empty string when absent), ' +
    'items (array of {description, quantity, rate} — quantity and rate as strings), ' +
    'description (string, personalised invoice description), ' +
    'notes (string, personalised invoice notes), ' +
    'contractTimelineDays (number, default 60), dueDays (number, default 60). ' +
    'Rules: the contract timeline is 60 days for every product unless the text explicitly states a different contract timeline — ' +
    'never treat a guarantee period (e.g. "10 jobs guaranteed in 60 days") as anything else. ' +
    'Due date is always invoice date + contract timeline days. ' +
    'If the text names a consulting package, set poNumber and package to that package name, currency to PKR, and use the FIXED price and items below — do not invent a different price: ' +
    'Quick Start = poNumber "Quick-Start Plan", 40,000 PKR total, 1 client guaranteed, 60 days. Items: complete consultation (offer to sales-call closing, every live class included) at 40000, then n8n and GoHighLevel systems, Apollo / landline remover / Telnyx / Apify cold SMS stack, AppointFunnels white-label access, Instantly / Zapmail / Apollo / MillionVerifier cold email stack, one power dialer, a done-for-you website, Stripe payment access — all at 0. Quick Start has NO Claude Code and NO testimonials or results access. ' +
    'Business Catalyst = poNumber "Business-Catalyst Plan", 59,999 PKR total, 2 clients guaranteed, 60 days, installments available. Items: complete consultation (offer to sales-call closing, every live class included) at 59999, then 20+ proven closing results and deal breakdowns, n8n / GoHighLevel / Claude Code full agentic systems build, Apollo / landline remover / Telnyx / Apify cold SMS stack, AppointFunnels white-label access, Instantly / Zapmail / Apollo / MillionVerifier cold email stack, one power dialer, a done-for-you website, Stripe payment access — all at 0. ' +
    'Elite = premium consulting package. ' +
    'Write description and notes in your own words, personalised to the named person/company and package, about the consulting work (offer making, niche, client acquisition, closing). ' +
    'If the text mentions Agenticmyze, keep that brand name in descriptions. ' +
    'Do not invent prices, emails or addresses that are not in the text, except for the fixed package prices above. ' +
    'If no price is in the text and no package is named, leave rate as an empty string so the user can fill it.';

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach OpenAI' });
  }

  if (!upstream.ok) {
    // Never forward the upstream body or the key. Only the status.
    return res.status(502).json({ error: 'OpenAI request failed' });
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return res.status(502).json({ error: 'Invalid response from OpenAI' });
  }

  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return res.status(502).json({ error: 'OpenAI returned invalid JSON' });
  }

  // Sanitize: only known fields, only safe types, no key material ever.
  const str = (v) => (v == null ? '' : String(v));
  const out = {
    billTo: str(parsed.billTo),
    company: str(parsed.company),
    category: str(parsed.category),
    poNumber: str(parsed.poNumber),
    package: str(parsed.package),
    currency: ['USD', 'PKR', 'EUR', 'GBP'].includes(str(parsed.currency))
      ? str(parsed.currency)
      : '',
    taxRate: str(parsed.taxRate),
    discount: str(parsed.discount),
    shipping: str(parsed.shipping),
    amountPaid: str(parsed.amountPaid),
    scheduledPayment: str(parsed.scheduledPayment),
    description: str(parsed.description),
    notes: str(parsed.notes),
    contractTimelineDays: Number.isFinite(Number(parsed.contractTimelineDays))
      ? Number(parsed.contractTimelineDays)
      : 60,
    dueDays: Number.isFinite(Number(parsed.dueDays))
      ? Number(parsed.dueDays)
      : 60,
    items: [],
  };
  if (Array.isArray(parsed.items)) {
    out.items = parsed.items
      .map((it) => ({
        description: str(it && it.description),
        quantity: str((it && it.quantity) || '1'),
        rate: str(it && it.rate).replace(/,/g, ''),
      }))
      .filter((it) => it.description || it.rate);
  }

  return res.status(200).json(out);
};

module.exports.config = { maxDuration: 30 };
