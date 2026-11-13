// Supabase Edge Function: create-payment
// Starts a Paystack payment for the logged-in parent and returns the checkout link.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // Who is calling? (uses the parent's login token)
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please log in again.' });

    // Server-side checks: fee and open/closed come from the database, never the browser.
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: s } = await admin.from('settings').select('*').eq('id', 1).single();
    const today = new Date().toISOString().slice(0, 10);
    if (!s.applications_open || (s.closing_date && today > s.closing_date)) {
      return json({ error: s.closed_message });
    }

    const reference = 'ANR-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    const { error: e1 } = await admin.from('payments')
      .insert({ user_id: user.id, reference, amount_kobo: s.fee_kobo });
    if (e1) throw e1;

    const body: Record<string, unknown> = {
      email: user.email,
      amount: s.fee_kobo,
      currency: 'NGN',
      reference,
      callback_url: Deno.env.get('SITE_URL'),
      metadata: { user_id: user.id },
    };
    // OPTIONAL: settle the school's share straight into the school's bank account.
    const sub = Deno.env.get('PAYSTACK_SUBACCOUNT');
    if (sub) {
      body.subaccount = sub;
      const cut = Deno.env.get('SABORYN_CUT_KOBO'); // optional flat amount (kobo) kept by the main account
      if (cut) body.transaction_charge = Number(cut);
    }

    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + Deno.env.get('PAYSTACK_SECRET_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const p = await r.json();
    if (!p.status) {
      console.error('Paystack init failed', p);
      await admin.from('payments').update({ status: 'FAILED' }).eq('reference', reference);
      return json({ error: 'Payment service is unavailable. Please try again.' });
    }
    return json({ authorization_url: p.data.authorization_url });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' });
  }
});
