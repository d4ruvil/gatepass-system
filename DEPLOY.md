# Deploy the backend (makes the app standalone)

Goal: run the Express backend in the cloud so the Android app works anywhere on
mobile data — no laptop, no same-Wi-Fi, no IP typing. DB (MongoDB Atlas) and
blockchain (Polygon Amoy) are already cloud; only this server needs hosting.

## One-time setup on Render (free)

1. Push this repo to GitHub (private is fine) — see bottom if not pushed yet.
2. Go to <https://render.com> → sign up / log in (GitHub login is easiest).
3. **New** → **Blueprint** → pick this repo. Render reads `render.yaml` and
   creates the `gatepass-backend` web service automatically.
4. It will ask for the five secret env vars. Copy them from `backend/.env`:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `RPC_URL`  (`https://polygon-amoy-bor-rpc.publicnode.com`)
   - `CONTRACT_ADDRESS`  (`0xc44c4856eFE149241B4a36B0a5BB9935CA396518`)
   - `RELAYER_PRIVATE_KEY`
   (Don't set `PORT` — Render provides it; the server already reads it.)
5. Click **Apply / Create**. Wait for the build to go live. You get a URL like
   `https://gatepass-backend.onrender.com`.

## Point the app at it (once per device)

Open the app → Login screen → **Server address** → enter:

```
https://gatepass-backend.onrender.com/api
```

Save. Done — the app now works on any network. Rebuilding the APK is NOT needed
when your laptop/network changes anymore.

## MongoDB Atlas network access

In Atlas → **Network Access**, make sure `0.0.0.0/0` is allowed (or Render's IPs),
otherwise the hosted server can't reach your database.

## Free-tier note

Render's free web service sleeps after ~15 min idle; the first request after that
takes ~30s to wake. Fine for a demo. For always-on, upgrade the plan or use a
paid tier. While asleep the blockchain event sync pauses and resumes on wake.

## If the repo isn't on GitHub yet

```bash
# create a private repo on github.com first, then:
git remote add origin https://github.com/<you>/gatepass-system.git
git push -u origin main
```

Render auto-redeploys on every push to `main`.
