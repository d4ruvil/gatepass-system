#!/usr/bin/env bash
# One-time setup: installs deps, creates .env files from the examples, runs contract tests.
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Node 20+ required, found $(node -v)"; exit 1; }

for d in contracts backend frontend; do
  echo "== $d"
  (cd "$d" && npm install)
  [ -f "$d/.env" ] || { cp "$d/.env.example" "$d/.env" && echo "created $d/.env - fill it in"; }
done

(cd contracts && npx hardhat test)

cat <<'MSG'

Setup done. Edit the three .env files, then run each in its own terminal:
  cd contracts && npx hardhat node                                  # optional local chain
  cd contracts && npx hardhat run scripts/deploy.js --network localhost
  cd backend   && npm run dev
  cd frontend  && npm run dev                                       # http://localhost:5173
MSG
