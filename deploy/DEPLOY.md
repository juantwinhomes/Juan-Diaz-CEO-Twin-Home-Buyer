# Putting the dashboard online

Written for someone who has never deployed anything. About 30 minutes, and **neither
service asks for a credit card**, so there is no way to be billed by surprise.

Two free accounts do the job:

| Piece | Service | What it does |
| --- | --- | --- |
| Database | **Supabase** | Stores your data |
| The app | **Netlify** | Serves the web pages |

---

## Before you start: the honest trade-off

**Netlify does not make you wait.** The app's pages come off their CDN instantly, and the
part that talks to the database wakes in about a second. There is no 30–60 second startup
to sit through, which is why this is the recommended setup.

**Supabase pauses the database after about a week with no activity.** You restore it with
one click in their dashboard, but somebody has to go and do it. If you use the dashboard
every weekday this will rarely happen; a long holiday shutdown will trigger it.

Free tiers can also change their terms. Your data is standard PostgreSQL and the app is
plain Node, so nothing here locks you in — but keep the backups running.

---

## Step 1 — Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up. No card required.
2. Click **New project**.
   - Name: `kpi-dashboard`
   - **Database password**: click Generate, then **save it somewhere safe** — you cannot
     see it again and you need it in a moment
   - Region: pick the one nearest your team
3. Wait a couple of minutes while it sets up.
4. Go to **Project Settings → Database → Connection string** and choose the **URI** tab.
   Copy it. It looks like:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
   ```

5. **Replace `[YOUR-PASSWORD]`** with the password from step 2, brackets and all. Keep
   this finished string safe — it is the `DATABASE_URL` below.

> Use the **Session pooler** or **Transaction pooler** string if offered. Either works.

You do not need to create any tables. The app builds them on first run.

## Step 2 — Deploy the app (Netlify)

1. Go to [netlify.com](https://netlify.com) and sign up with GitHub. No card required.
2. Click **Add new site → Import an existing project**, choose GitHub, and pick this
   repository.
3. Netlify reads `netlify.toml`, so the build settings fill themselves in. Leave them.
4. Before deploying, open **Add environment variables** (or set them afterwards under
   **Site configuration → Environment variables**):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the finished connection string from step 1 |
   | `APP_PASSWORD` | a password your team will share to sign in — you choose it |
   | `SESSION_SECRET` | any long random text, 30+ characters |

5. Click **Deploy**. The first build takes a couple of minutes.

Netlify gives you an address like `https://something-random-123.netlify.app`. Rename it
under **Site configuration → Change site name** to something like `kpi-twinhome`.

Open it, enter your `APP_PASSWORD`, and you are in.

> **Use the transaction pooler connection string.** Supabase offers several; the pooled
> one (usually port `6543`) is designed for exactly this kind of hosting. The direct
> connection can run out of slots.

## Step 3 — Set it up

The dashboard starts **empty** — no demo data on a real deployment.

1. **Team** → add yourself and your teammate
2. **Projects** → add your live projects
3. **Today** → each person enters their commitments

That is it. Share the address and the password with your team.

## Step 4 — Your own domain (optional)

In Netlify: **Domain management → Add a domain**, enter `kpi.yourcompany.com`. Netlify
shows a DNS record to create with whoever manages your domain. HTTPS is automatic.

---

## Checking it worked

`deploy/verify.sql` prints a checklist of everything the app needs. Paste it into the
Supabase SQL Editor and run it — tables, indexes, seeded settings, whether any data has
been loaded, and whether row level security is on. Every row should say OK.

Run it whenever something looks wrong; it answers "is the database set up correctly?"
without guesswork.

## Row level security

Supabase exposes your tables over a public web API protected by a key that is designed to
be public. Without row level security, anyone holding that key can read and write every
table.

Enable RLS on all tables and add **no policies**. The dashboard connects as the role that
owns the tables, which bypasses RLS, so the API is locked out and the app is unaffected.
`deploy/verify.sql` reports whether this is done.

## Backups

Supabase's free tier keeps little backup history, so keep your own copies. From your own
computer, with `DATABASE_URL` set to the same connection string:

```bash
npm run export
```

That writes everything to one JSON file under `backups/`. Put it in Drive. Doing this
monthly means the worst case is losing a few weeks, not everything.

## If something goes wrong

**A page loads but no data appears** — the function cannot reach the database. Check
`DATABASE_URL` under Site configuration → Environment variables, and look at
**Logs → Functions** in Netlify for the actual error.

**Login page appears but the password is refused** — `APP_PASSWORD` differs from what you
are typing. Check it under Site configuration → Environment variables. Remember that
changing a variable needs a redeploy to take effect (**Deploys → Trigger deploy**).

**Errors mentioning the database** — `DATABASE_URL` is wrong. The usual cause is not
replacing `[YOUR-PASSWORD]` with the real password.

**Everything was fine, now it will not load** — Supabase has probably paused the project
after a quiet week. Open the Supabase dashboard and click Restore.

---

## Alternative: Render

`render.yaml` is set up for Render too, if you prefer it. Same Supabase database, same
environment variables, but its free instances sleep after ~15 minutes and take 30–60
seconds to wake.

## Alternative: a free always-on server

If the morning wait becomes a problem and you still cannot pay, a permanently-free cloud
VM never sleeps and runs the app and the database together on one machine.
`deploy/setup.sh` installs the whole thing in one command. Be aware those providers
require a card for identity verification, and creating the wrong size of machine is
billed normally — which is why this is not the recommended route.
