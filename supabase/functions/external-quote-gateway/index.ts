import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const pageHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char] ?? char);
function html(content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Respond to an enquiry · Everest Local</title><style>body{font:16px system-ui,sans-serif;background:#181817;color:#f5efe4;margin:0;padding:24px}main{max-width:560px;margin:40px auto;background:#272725;border-radius:18px;padding:26px}h1{font-size:26px}label{display:block;margin:18px 0 6px}input,textarea,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:9px}textarea{min-height:120px}button{margin-top:22px;background:#ddc8a5;color:#181817;border:0;font-weight:700}.secondary{background:transparent;color:#c4b9a6;border:1px solid #5a544b}small{color:#c4b9a6}</style></head><body><main>${content}</main></body></html>`, { status, headers: pageHeaders });
}

Deno.serve(async request => {
  if (Deno.env.get('EXTERNAL_QUOTE_GATEWAY_ENABLED') !== 'true') return html('<h1>Enquiry unavailable</h1>', 404);
  const url = Deno.env.get('SUPABASE_URL'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return html('<h1>Enquiry unavailable</h1>', 503);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const form = request.method === 'POST' ? await request.formData().catch(() => new FormData()) : new FormData();
  const token = request.method === 'GET' ? new URL(request.url).searchParams.get('token') ?? '' : String(form.get('token') ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) return html('<h1>This link is invalid or expired</h1>', 404);
  if (request.method === 'POST') {
    if (String(form.get('action') ?? '') === 'optout') {
      const { data, error } = await admin.rpc('opt_out_external_gateway_contact', { p_token: token });
      return data === true && !error
        ? html('<h1>Opt-out confirmed</h1><p>Everest Local will not send future external enquiries to this contact destination. Any active gateway access for it has been suppressed.</p>')
        : html('<h1>Link expired or unavailable</h1>', 404);
    }
    const amount = Number(form.get('amount'));
    const message = String(form.get('message') ?? '');
    const availability = String(form.get('availability') ?? '');
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000 || message.trim().length < 1 || message.length > 2000 || availability.length > 500)
      return html('<h1>Invalid quote details</h1><p>Check the amount and message, then open your link to try again.</p>', 400);
    const { data, error } = await admin.rpc('submit_external_gateway_quote', { p_token: token, p_amount: amount, p_message: message, p_availability: availability, p_valid_until: null });
    return data === true && !error ? html('<h1>Quote received</h1><p>Your response is available in the customer’s Everest account.</p>') : html('<h1>Link expired or unavailable</h1>', 404);
  }
  if (request.method !== 'GET') return html('<h1>Method unavailable</h1>', 405);
  const { data, error } = await admin.rpc('read_external_gateway', { p_token: token });
  if (error || !data) return html('<h1>This link is invalid or expired</h1>', 404);
  return html(`<h1>Customer enquiry</h1><p><small>This request was sent through Everest Local. You do not need an Everest account to respond.</small></p><p>${escape(data.description)}</p><p>${escape([data.suburb,data.city,data.state].filter(Boolean).join(', '))}</p><p>Preferred date: ${escape(data.preferred_date ?? 'Flexible')}</p>${data.email ? `<p>Customer-approved email: ${escape(data.email)}</p>` : ''}${data.phone ? `<p>Customer-approved phone: ${escape(data.phone)}</p>` : ''}<form method="post"><input type="hidden" name="token" value="${escape(token)}"><label for="amount">Quote amount (AUD)</label><input id="amount" name="amount" type="number" min="0" max="1000000" step="0.01" required><label for="availability">Availability (optional)</label><input id="availability" name="availability" maxlength="500"><label for="message">Message</label><textarea id="message" name="message" maxlength="2000" required></textarea><button type="submit">Submit quote</button></form><form method="post"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="action" value="optout"><button class="secondary" type="submit">Do not send future Everest enquiries to this contact</button></form><p><small>Submitting does not create a booking or payment.</small></p>`);
});
