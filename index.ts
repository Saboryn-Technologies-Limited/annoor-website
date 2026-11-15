// Supabase Edge Function: paystack-webhook
// Paystack calls this by itself after a payment, so a parent who closes the browser
// right after paying is still marked PAID. Turn "Verify JWT" OFF for this function.
import { createClient } from 'npm:@supabase/supabase-js@2';

const readKey = (newName: string, legacyName: string) => {
  try {
    const j = JSON.parse(Deno.env.get(newName) ?? '{}');
    if (j.default) return j.default;
  } catch (_e) { /* fall back to the legacy key below */ }
  return Deno.env.get(legacyName) ?? '';
};

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const raw = await req.text();

  // Only accept messages really signed by Paystack with our secret key.
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  if (sig !== req.headers.get('x-paystack-signature')) {
    return new Response('invalid signature', { status: 401 });
  }

  try {
    const ev = JSON.parse(raw);
    if (ev.event === 'charge.success') {
      const d = ev.data;
      const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'));
      const { data: pay } = await admin.from('payments').select('*').eq('reference', d.reference).maybeSingle();
      if (pay && pay.status !== 'PAID' && d.status === 'success'
          && d.amount === pay.amount_kobo && d.currency === 'NGN') {
        await admin.from('payments').update({ status: 'PAID' }).eq('id', pay.id);
      }
    }
  } catch (e) {
    console.error(e);
  }
  return new Response('ok'); // always answer 200 so Paystack does not keep retrying
});
