# Gate Pass — Android app (APK)

The mobile app is the **same React frontend** wrapped with [Capacitor](https://capacitorjs.com).
No separate codebase — every change to `src/` ships to the app on the next build.

## Build the APK

```bash
cd frontend
npm run apk
```

Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

Install on a phone: enable "Install unknown apps", copy the APK over, tap it.
Or with USB debugging + adb: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

## Backend URL

The APK ships pointing at the **live cloud backend** by default:
`https://gatepass-backend-21cn.onrender.com/api` — so it works out of the box,
anywhere, no setup. Just install and log in.

To point at a *different* backend (e.g. a local dev server), override it
**at runtime, inside the app** — no rebuild:

1. Open the app → on the Login screen expand **"Server address"**.
2. Enter the server the phone can reach, e.g. `http://10.0.0.5:4000/api`, and Save.
3. It's remembered on the device until you change it.

Requirements for the connection to work:
- Find the laptop's LAN IP where the backend runs: `hostname -I`.
- Phone and laptop on the **same Wi-Fi**.
- Backend must bind `0.0.0.0` (not just `127.0.0.1`) so the phone can connect.
- Cleartext HTTP is already allowed for LAN demos. For real deployment, host the
  backend behind HTTPS and enter that `https://` URL.

The build-time `VITE_API_URL` in `.env` is only the default shown before you set one.

## Camera / QR scanner

The guard scanner uses the phone camera. The app asks for camera permission the first
time the Scanner page opens — tap Allow.

## Known limitation: approver MetaMask flow

Approvers sign on-chain via the MetaMask browser extension, which doesn't exist inside
the app's WebView. On mobile, do the approver signing step in the MetaMask mobile app's
in-app browser, or keep approvals on desktop. Student / guard / admin flows work in the app.
