# Putting the dashboard online

This guide assumes no server experience. It takes about 30 minutes, costs nothing,
and gives you a normal website address your whole team can use from anywhere.

**What you are doing:** renting a small computer that lives in a data centre and stays
switched on permanently, then running the dashboard on it. It behaves exactly like a
computer in your office that nobody turns off — except it is already on the internet,
so people in other locations reach it like any website.

---

## Before you start

You need:

- A credit or debit card. **It is used to verify you are a real person, not to charge you.**
  Cloud providers all require this. The resources in this guide are free permanently — but
  read the warning below carefully, because it is possible to create the *wrong* thing and
  be charged for it.
- A domain name, if you want a proper address like `kpi.yourcompany.com`. Optional — you can
  start with just a numeric address and add the domain later.

---

## ⚠️ The one thing that could cost you money

Cloud providers offer two different things that are easy to confuse:

| | What it is | Cost |
| --- | --- | --- |
| **Free trial credit** | A pot of money (often $300) that expires after 90 days | Free until it runs out, then charged |
| **Always Free tier** | Specific small resources that are free forever | £0, permanently |

**You want the Always Free tier.** It is free because of *what you create*, not because of any
trial. Create the wrong size of machine, or put it in the wrong location, and it is billed
normally — the free trial credit quietly absorbs the cost until it expires, and then you get
a bill.

Two rules keep you safe:

1. Create **exactly** the machine type and region named below. Not "similar". Exactly.
2. Set a **budget alert** (step 6) so you are emailed immediately if anything is ever charged.

---

## Option A — Google Cloud (try this first)

Signup is usually smoother than Oracle's.

### 1. Create the account
Go to [cloud.google.com](https://cloud.google.com) and click **Get started for free**. Sign in
with a Google account and add your card when asked.

### 2. Create the virtual machine
In the search bar at the top, type **VM instances** and open it. You may be asked to enable
the "Compute Engine API" — click enable and wait a minute.

Click **Create instance**, then set these exactly:

| Setting | Value | Why it matters |
| --- | --- | --- |
| Name | `kpi-dashboard` | Any name is fine |
| Region | **`us-west1`**, `us-central1` or `us-east1` | **Only these are free.** Any other region is billed |
| Machine type | **`e2-micro`** | **Only this size is free.** Anything larger is billed |
| Boot disk | Ubuntu 24.04 LTS, 30 GB Standard persistent disk | Larger disks are billed |
| Firewall | Tick **Allow HTTP traffic** and **Allow HTTPS traffic** | Without these nobody can reach it |

Click **Create**. It takes about a minute.

> The `e2-micro` is a small machine. That is fine — this app is light, and your database grows
> by about 6 MB a year.

### 3. Connect to it
In the VM list, click the **SSH** button next to your machine. A black terminal window opens
in your browser. That is the computer's command line — you do not need to install anything.

### 4. Install the dashboard
Paste this in and press Enter (replace the domain with yours, or leave it off entirely):

```bash
curl -fsSL https://raw.githubusercontent.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer/claude/festive-wozniak-iednog/deploy/setup.sh | sudo bash -s -- kpi.yourcompany.com
```

It takes a few minutes and prints everything it is doing. At the end it shows your web
address and a generated team password.

**Copy that password somewhere safe.** It is what your team uses to sign in.

### 5. Point your domain at it (skip if you did not use a domain)
Copy the machine's **External IP** from the VM list. In whoever manages your DNS, add:

| Type | Name | Value |
| --- | --- | --- |
| A | `kpi` | the External IP you copied |

Wait a few minutes, then open `https://kpi.yourcompany.com`. The secure padlock appears
automatically — the setup script obtains the certificate for you.

### 6. Set a budget alert (do not skip this)
Search for **Budgets & alerts**, click **Create budget**, set the amount to **$1**, and tick
the alert thresholds. If anything ever starts costing money you find out immediately instead
of at the end of the month.

---

## Option B — Oracle Cloud (if Google does not work out)

Oracle's free machine is considerably more powerful, but free capacity is frequently
exhausted and you may have to retry over several days.

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Create a **VM instance** with an **Always Free eligible** shape (the console labels them)
   and the Ubuntu 24.04 image
3. Under the networking section, allow ports 80 and 443
4. Connect with SSH and run the same install command as step 4 above

If you see "Out of host capacity", that is Oracle being full — try a different availability
domain, or try again the next day.

---

## Afterwards

**Adding your team.** The dashboard starts empty. Open it, go to **Team**, and add each
person. Then add your projects under **Projects**. There is no demo data on a real install.

**Changing the password.**
```bash
sudo nano /etc/kpi-dashboard.env      # edit the APP_PASSWORD line, Ctrl+O then Ctrl+X to save
sudo systemctl restart kpi-dashboard
```

**Updating to a newer version.** Re-run the install command from step 4. Your data and
password are kept.

**Backups.** A copy is saved every night at 01:30 to `/var/backups/kpi-dashboard`, and 30 days
are kept. To download one to your own computer:
```bash
gcloud compute scp kpi-dashboard:/var/backups/kpi-dashboard/kpi-2026-01-15.db.gz .
```
To copy backups automatically to Google Drive, install `rclone`, run `rclone config` to connect
your Drive, then add `KPI_RCLONE_REMOTE=gdrive:kpi-backups` to `/etc/kpi-dashboard.env`.

**If something breaks.**
```bash
sudo systemctl status kpi-dashboard     # is it running?
sudo journalctl -u kpi-dashboard -n 50  # what went wrong?
sudo systemctl restart kpi-dashboard    # turn it off and on again
```

---

## What this costs

Nothing, provided you created the machine exactly as specified. The machine is free forever
under the Always Free tier, the HTTPS certificate is free, and the app has no paid services
behind it. The budget alert in step 6 is your safety net.
