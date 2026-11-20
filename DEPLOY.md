# Backend deployment (live)

The backend runs in the cloud so the mobile app works anywhere — no laptop, no
same-Wi-Fi. DB (MongoDB Atlas) and blockchain (Polygon Amoy) were already cloud;
only this server needed hosting.

**Live URL:** https://gatepass-backend-21cn.onrender.com
**API base (used by the app):** https://gatepass-backend-21cn.onrender.com/api

## How it's deployed (Docker image, no GitHub link)

Render pulls a prebuilt image from GitHub Container Registry. No Git provider is
connected to Render; the image is pushed from the local machine.

- Host: Render web service `gatepass-backend` (Free plan, Singapore region)
- Image: `ghcr.io/d4ruvil/gatepass-backend:latest` (public package)
- Env vars (set in Render dashboard → Environment, NOT in the image):
  `MONGODB_URI`, `JWT_SECRET`, `RPC_URL`, `CONTRACT_ADDRESS`, `RELAYER_PRIVATE_KEY`
  (do **not** set `PORT` — Render injects it)
- MongoDB Atlas → Network Access must allow `0.0.0.0/0` (Render free has no static IP)

## Update the backend after a code change

```bash
cd backend
docker build -t ghcr.io/d4ruvil/gatepass-backend:latest .
# one-time per session: gh auth token | docker login ghcr.io -u d4ruvil --password-stdin
docker push ghcr.io/d4ruvil/gatepass-backend:latest
```
Then in Render → the service → **Manual Deploy → Deploy latest reference**.

## Free-tier note

The free instance spins down after ~15 min idle; the first request then takes
~50s to wake. Fine for a demo. Blockchain event sync pauses while asleep and
resumes on wake.
