# Annoor Online Admission Portal

Admission portal for Annoor International Islamic Academy, by SABORYN TECHNOLOGIES LIMITED.

**Version 3. To update the website, upload ONLY `index.html` to the GitHub repository (Add file > Upload files). The `supabase` folder is for reference: its files are pasted into Supabase, not GitHub. After uploading, the footer of the website should say "Portal v3".**

## What is in this package
- `index.html`: the whole website (Home, Apply, parent dashboard, form, staff login, admin). It runs in **demo mode** until you fill in the Supabase keys.
- `supabase/setup.sql`: database tables, security rules, private file storage.
- `supabase/functions/`: `create-payment`, `verify-payment`, `paystack-webhook`.
- `photos/`: put the school's photos here.

## What Supabase is for
The HTML file is the front desk: it shows pages and forms. Supabase is the records room and security office, which a plain website cannot be:
- **Database:** stores accounts, applications and payment records.
- **Login:** registers parents and sends the email verification.
- **File storage:** keeps passport photos and birth certificates privately.
- **Functions:** runs the payment code, so the Paystack secret key never sits in the HTML where anyone could read it.

Without Supabase the portal stays a demo that forgets everything.

## Step 1 in detail: create the Supabase project
1. Go to supabase.com and tap **Start your project**. Signing in with GitHub is quickest.
2. Create or pick an organisation (the default is fine, or name it "Saboryn Technologies"). Choose the **Free** plan for now.
3. Tap **New project** and name it, for example `annoor-portal`.
4. **Database password:** let Supabase generate it, then copy it somewhere safe. It is shown only once. Never put it in this repository.
5. **Region:** pick the one closest to Nigeria that is listed (probably in Europe or Africa).
6. Tap **Create new project** and wait about 2 minutes.
7. Open **Project settings > API** and copy the **Project URL** and the **anon / public key** (a long text starting with `eyJ`). If the dashboard shows a "publishable key" instead, it plays the same role; check that the portal accepts it before launch.
8. Paste both into the `CFG` block at the top of `index.html`. The anon key is meant to be public. **Never** paste the `service_role` key (or any secret key) into the HTML.
9. Keep the Supabase account under your own login. It holds the school's data.

## Setup (all can be done from a phone browser)
1. **Supabase:** create a free project (see "Step 1 in detail" above).
2. **Database:** SQL Editor > New query > paste `supabase/setup.sql` > Run.
3. **Auth settings:** Authentication > URL settings: set Site URL to your GitHub Pages link (step 8).
   Before launch, set up custom SMTP (Authentication > Emails > SMTP) or verification emails will fail.
4. **Keys:** Project settings > API. Copy the project URL and the anon key into the `CFG` block near the top of `index.html`.
5. **Functions:** Edge Functions > deploy via editor, three functions with these exact names, pasting each `index.ts`:
   `create-payment`, `verify-payment`, `paystack-webhook` (turn **Verify JWT OFF** for `paystack-webhook` only).
6. **Secrets** (Edge Functions > Secrets):
   - `PAYSTACK_SECRET_KEY`: Paystack secret key (use the `sk_test_...` key first)
   - `SITE_URL`: the exact link to the portal page, e.g. `https://USERNAME.github.io/REPO/`
   - Optional: `PAYSTACK_SUBACCOUNT` (school's subaccount code) and `SABORYN_CUT_KOBO` (flat amount in kobo kept by the main account)
7. **Paystack:** Settings > API Keys & Webhooks. Set the webhook URL to
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/paystack-webhook` (the test webhook box while testing).
8. **GitHub Pages:** upload this folder to a repository, then Settings > Pages > Deploy from branch > `main` / root.
9. **Admin:** register in the portal, verify your email, then run the admin line at the bottom of `setup.sql` with your email.
   Do the same for the school's own admin account.
10. **Test everything** with a Paystack test card: register, pay, form unlocks, submit, approve it as admin.

## School details
Edit the `SCH` block near the top of `index.html`: logo, address, phone, achievements, and photo paths such as `src:'photos/pitch.jpg'`.
Only upload photos of children if the school has given permission.

## Before real parents use it
- Switch to the live Paystack secret key and the live webhook URL.
- Move Supabase to a plan that does not pause and keeps backups.
- Connect custom SMTP for emails.
- Agree in writing who receives the fees and what Saboryn charges for hosting and support.

## Update 1: emails, interview dates, confirmation pop-ups
1. Supabase > SQL Editor: run `supabase/update-1.sql`.
2. Brevo (brevo.com, free plan): create an account, add and verify a sender email (best: an address on your own domain, with its DNS records added), then create an API key (SMTP & API > API Keys).
3. Supabase > Edge Functions > Secrets: add `BREVO_API_KEY` (the key) and `MAIL_FROM` (the verified sender email).
4. Deploy a new function named exactly `application-mail`, pasting `supabase/functions/application-mail/index.ts`. Turn **Verify JWT off**, then save.
5. Upload the new `index.html` to GitHub.
6. In the admin page, open **Interview settings** and set the time, venue, how soon interviews start, the daily limit and the list of items to bring (confirm these with the school).
