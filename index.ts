// Supabase Edge Function: application-mail
// action "received": email the parent after submitting (called by the parent's browser).
// action "approve" : admin approves, registration number + interview date are created, email sent.
// action "resend"  : admin resends the approval email.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SCHOOL = 'Annoor International Islamic Academy';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });
const readKey = (newName: string, legacyName: string) => {
  try {
    const j = JSON.parse(Deno.env.get(newName) ?? '{}');
    if (j.default) return j.default;
  } catch (_e) { /* use legacy key */ }
  return Deno.env.get(legacyName) ?? '';
};
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');

// ---- dates (Nigeria time) ----
const lagosToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
const addDays = (ymd: string, n: number) => {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const prettyDate = (ymd: string) =>
  new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
// Earliest Monday to Friday date, at least "lead days" from today, with room left that day.
async function pickDate(admin: any, s: any) {
  let d = addDays(lagosToday(), s.interview_lead_days);
  for (let i = 0; i < 180; i++, d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const { count } = await admin.from('applications')
      .select('id', { count: 'exact', head: true }).eq('interview_date', d);
    if ((count ?? 0) < s.interview_per_day) return d;
  }
  throw new Error('No free interview date found');
}

// ---- email ----
async function sendMail(to: string, name: string, subject: string, html: string) {
  const key = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!key || !from) { console.error('Email not configured: set BREVO_API_KEY and MAIL_FROM'); return false; }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: SCHOOL, email: from }, to: [{ email: to, name }], subject, htmlContent: html }),
  });
  if (!r.ok) { console.error('Brevo error ' + r.status + ' ' + await r.text()); return false; }
  return true;
}
const layout = (title: string, body: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #dfe4dc;border-radius:10px;overflow:hidden"><div style="background:#0f5b3a;color:#fff;padding:16px 20px"><b>${SCHOOL}</b></div><div style="padding:20px;color:#17241c;line-height:1.5"><h2 style="color:#0f5b3a;margin-top:0">${title}</h2>${body}</div><div style="background:#f7f6ef;padding:12px 20px;font-size:12px;color:#4a5a50">Sent by the school’s online admission portal, powered by SABORYN TECHNOLOGIES LIMITED.</div></div>`;
const box = (x: string) => `<p style="background:#f7f6ef;padding:12px;border-radius:8px">${x}</p>`;
const receivedHtml = (a: any) => layout('Application received',
  `<p>Assalamu alaikum ${esc(a.parent_name)},</p><p>Thank you. We have received the admission application for <b>${esc(a.student_name)}</b> (${esc(a.class_applied)}).</p>${box('Application number: <b>' + esc(a.application_number) + '</b>')}<p>Your application is now being processed. The school will get back to you soon by email. Please keep your application number safe.</p>`);
const approvedHtml = (a: any, s: any) => {
  const items = String(s.interview_bring || '').split('\n').map((x) => x.trim()).filter(Boolean)
    .map((x) => `<li>${esc(x)}</li>`).join('');
  return layout('Application approved',
    `<p>Assalamu alaikum ${esc(a.parent_name)},</p><p>Congratulations! The application for <b>${esc(a.student_name)}</b> (${esc(a.class_applied)}) has been <b>approved</b>.</p>${box('Registration number: <b>' + esc(a.registration_number) + '</b><br>Application number: ' + esc(a.application_number))}<p><b>Please keep these numbers safe.</b> You will need them for registration.</p><h3 style="color:#0f5b3a">Physical interview</h3><p>Date: <b>${esc(prettyDate(a.interview_date))}</b><br>Time: <b>${esc(a.interview_time)}</b><br>Venue: <b>${esc(s.interview_venue || SCHOOL)}</b><br>Please come with the student.</p>${items ? '<h3 style="color:#0f5b3a">Please bring</h3><ul>' + items + '</ul>' : ''}<p>If this date is not suitable, please contact the school office.</p>`);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'));
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const who = token ? await admin.auth.getUser(token) : null;
    const user = who && who.data ? who.data.user : null;
    if (!user) return json({ error: 'Please log in again.' });

    const input = await req.json();
    const action = input ? input.action : '';
    const { data: a0 } = await admin.from('applications').select('*').eq('id', input ? input.application_id : '').maybeSingle();
    if (!a0) return json({ error: 'Application not found.' });
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    const isAdmin = !!(prof && prof.is_admin);
    const { data: s } = await admin.from('settings').select('*').eq('id', 1).single();
    const owner = await admin.auth.admin.getUserById(a0.user_id);
    const to = owner.data && owner.data.user ? owner.data.user.email : '';
    if (!to) return json({ error: 'The parent has no email address.' });

    if (action === 'received') {
      if (a0.user_id !== user.id && !isAdmin) return json({ error: 'Not allowed.' });
      if (a0.received_email_at) return json({ ok: true, emailed: true });
      const ok = await sendMail(to, a0.parent_name, 'Application received: ' + a0.application_number, receivedHtml(a0));
      if (ok) await admin.from('applications').update({ received_email_at: new Date().toISOString() }).eq('id', a0.id);
      return json({ ok: true, emailed: ok });
    }

    if (!isAdmin) return json({ error: 'Admin only.' });
    let a = a0;
    if (action === 'approve') {
      if (a0.status === 'Approved') return json({ error: 'Already approved.' });
      const reg = await admin.rpc('next_registration_no');
      if (reg.error) throw new Error(reg.error.message);
      const date = await pickDate(admin, s);
      const up = await admin.from('applications').update({
        status: 'Approved', registration_number: reg.data, interview_date: date,
        interview_time: s.interview_time, approved_at: new Date().toISOString(),
      }).eq('id', a0.id).select().single();
      if (up.error) throw new Error(up.error.message);
      a = up.data;
    } else if (action !== 'resend' || a0.status !== 'Approved') {
      return json({ error: 'Nothing to send.' });
    }
    const ok = await sendMail(to, a.parent_name, 'Application approved: ' + a.registration_number, approvedHtml(a, s));
    if (ok) await admin.from('applications').update({ approved_email_at: new Date().toISOString() }).eq('id', a.id);
    return json({ ok: true, emailed: ok, interview_date: a.interview_date, registration_number: a.registration_number });
  } catch (e) {
    console.error('application-mail error: ' + (e instanceof Error ? e.message : String(e)));
    return json({ error: 'Something went wrong. Please try again.' });
  }
});
