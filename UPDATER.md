# SHRX "Update" — how it works and how to install it on the shop PC

## How it works

- **Nothing deploys on a push any more.** You push to GitHub `main`, then click
  **SHRX → Updates → Update now**. The app restarts for about a minute.
- The web app never runs shell or Docker commands. SHRX only writes a row into
  `update_requests` (action = check / update / rollback). The **updater**
  container — the only one with Docker access — picks it up, does the work and
  writes progress back. SHRX shows it live.
- An update: checks free disk (≥ 5 GB) and that the project folder has no local
  changes → saves the running app image as `<project>-app:previous` → backs up
  the database to `backups\pre-update_<date>_<commit>.sql` (keeps the last 5;
  refuses if the dump fails) → `git` fast-forward only → builds the new app
  image (shop keeps running) → recreates **only** `app`, restarts `nginx` →
  waits up to 3 min for "All migrations applied" and the login page.
- If the new version doesn't come up: it switches back to the previous image
  and commit automatically and says where the pre-update backup is. The
  database is **not** restored automatically (migrations are additive, so the
  older code runs on the newer schema).
- `db`, `backup` and the updater itself are never recreated by an update. If an
  update changes files in `updater/`, SHRX says "needs a manual restart" — run
  step 9 below.

## First-time install on the shop PC (Windows, Docker Desktop, `D:\Sutra-Collections`)

Run these in **PowerShell**, one line at a time, in order. Each step says what
you should see. Stop and send me the output if something differs.

**1. Go to the project folder**
```
cd D:\Sutra-Collections
```

**2. Stop and remove the OLD auto-updater first** (it auto-deploys every push to
`main` and must be gone before this code reaches `main`):
```
docker ps -a --format "{{.Names}}" | Select-String updater
```
For every name it prints (e.g. `sutra-collections-updater-1`, `repo-updater-1`):
```
docker rm -f <name>
```
Then check for the stray stack the old updater created (project "repo"):
```
docker compose ls
```
If a project named `repo` is listed, stop it (this does NOT delete any volume):
```
docker compose -p repo down
```

**3. Note the real project name** — the line in `docker compose ls` whose
CONFIG FILES ends in `docker-compose.prod.yml` (e.g. `sutra-collections`).
Write it down; you need it in step 6. Using a wrong name would make Docker
start a new, empty database — the updater refuses to run in that case.

**4. Make the working tree use LF line endings** (the updater runs git inside
Linux; CRLF checkouts look "modified" to it and the update would be refused):
```
git status
```
It must say "nothing to commit, working tree clean" (untracked files are fine).
Then:
```
git config core.autocrlf false
git rm -r --cached -q .
git reset --hard HEAD
git status
```
The last `git status` must again say "working tree clean".

**5. Get the new code (once, by hand — the updater can't install itself)**
```
git pull --ff-only origin main
```

**6. Find the path Docker uses for this folder**
```
docker inspect <project>-app-1 --format "{{json .Mounts}}"
```
(replace `<project>` with the name from step 3). In the output find the entry
whose `"Destination"` is `"/app/backups"` and read its `"Source"`. Expected
something like `/run/desktop/mnt/host/d/Sutra-Collections/backups`. **If it does not start
with `/`, stop and send me the output.**

Add these lines to `D:\Sutra-Collections\.env` (Notepad), using that output
without the trailing `/backups`, and the project name from step 3:
```
DAEMON_PROJECT_DIR=/run/desktop/mnt/host/d/Sutra-Collections
COMPOSE_PROJECT=sutra-collections
```

**7. Rebuild the app once by hand** (adds the update tables; ~5 minutes; the
app restarts at the end):
```
docker compose -f docker-compose.prod.yml up -d --build app nginx
```
Check: `docker compose -f docker-compose.prod.yml logs app --tail 20` shows
"All migrations applied successfully".

**8. Start the new updater**
```
docker compose -f docker-compose.prod.yml --profile deploy up -d --build updater
docker compose -f docker-compose.prod.yml logs updater --tail 20
```
The log should say `Started. Project '<project>' … Deploys ONLY on SHRX requests.`

**9. Verify from SHRX** → Updates: "Running now" shows the current commit and
there is no "Updater offline" banner. Click **Check for updates**. Optionally
click **Update now** once while nothing is new — it should finish with
"Already up to date".

## Later

- **"needs a manual restart"** after an update (updater files changed):
  ```
  cd D:\Sutra-Collections
  docker compose -f docker-compose.prod.yml --profile deploy up -d --build updater
  ```
- **"Updater offline"** in SHRX: the updater isn't running — run the same command.
- **Pre-update backups**: `D:\Sutra-Collections\backups\pre-update_*.sql` (last 5).
  Restoring one overwrites live data — ask before doing it.
- Dev machines: a plain `docker compose up` never starts the updater (it is
  behind the `deploy` profile).
