# Putting the dashboard online

Written for someone who has never deployed anything. About 30 minutes, and **neither
service asks for a credit card**, so there is no way to be billed by surprise.

Two free accounts do the job:

| Piece | Service | What it does |
| --- | --- | --- |
| Database | **Supabase** | Stores your data |
| The app | **Render** | Serves the web pages |

---

## Before you start: the honest trade-off

Both free tiers **go to sleep when nobody is using them.**

- **Render** shuts the app down after ~15 minutes of quiet. The next person to open it
  waits **30–60 seconds** while it starts up. Expect this several times a day — first
  thing in the morning, after lunch, whenever there has been a gap.
- **Supabase** pauses the database after about a week with no activity. You restore it
  with one click in their dashboard, but somebody has to go and do it.

Neither is a fault; it is what free costs. If the morning wait becomes intolerable, the
fix is a paid Render instance (~$7/month) with nothing else changing — same code, same
database, same everything.

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

## Step 2 — Deploy the app (Render)

1. Go to [render.com](https://render.com) and sign up with GitHub. No card required.
2. Click **New → Web Service** and connect this repository.
3. Render reads `render.yaml` and fills in most settings. Check:
   - Runtime: **Docker**
   - Plan: **Free**
4. Add the environment variables:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the finished connection string from step 1 |
   | `APP_PASSWORD` | a password your team will share to sign in — you choose it |
   | `SESSION_SECRET` | click Generate, or paste any long random text |

5. Click **Create Web Service**. The first build takes a few minutes.

When it finishes, Render gives you an address like `https://kpi-dashboard.onrender.com`.
Open it, enter your `APP_PASSWORD`, and you are in.

## Step 3 — Set it up

The dashboard starts **empty** — no demo data on a real deployment.

1. **Team** → add yourself and your teammate
2. **Projects** → add your live projects
3. **Today** → each person enters their commitments

That is it. Share the address and the password with your team.

## Step 4 — Your own domain (optional)

In Render: **Settings → Custom Domains → Add**, enter `kpi.yourcompany.com`. Render shows
a DNS record to create with whoever manages your domain. HTTPS is set up automatically.

---

## Backups

Supabase's free tier keeps little backup history, so keep your own copies. From your own
computer, with `DATABASE_URL` set to the same connection string:

```bash
npm run export
```

That writes everything to one JSON file under `backups/`. Put it in Drive. Doing this
monthly means the worst case is losing a few weeks, not everything.

## If something goes wrong

**"Application failed to respond"** — usually just Render waking up. Wait a minute and
reload. If it persists, check the **Logs** tab in Render.

**Login page appears but the password is refused** — `APP_PASSWORD` differs from what you
are typing. Check it under Environment in Render.

**Errors mentioning the database** — `DATABASE_URL` is wrong. The usual cause is not
replacing `[YOUR-PASSWORD]` with the real password.

**Everything was fine, now it will not load** — Supabase has probably paused the project
after a quiet week. Open the Supabase dashboard and click Restore.

---

## Alternative: a free always-on server

If the morning wait becomes a problem and you still cannot pay, a permanently-free cloud
VM never sleeps and runs the app and the database together on one machine.
`deploy/setup.sh` installs the whole thing in one command. Be aware those providers
require a card for identity verification, and creating the wrong size of machine is
billed normally — which is why this is not the recommended route.
