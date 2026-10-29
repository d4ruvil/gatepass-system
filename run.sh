#!/usr/bin/env bash
# Runs the project: backend API + frontend, against the chain/contract set in the .env files.
# Ctrl+C stops everything. First time? Run ./setup.sh and fill in the .env files.
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }

for d in contracts backend frontend; do
  [ -f "$d/.env" ] || { echo "$d/.env is missing - run ./setup.sh first"; exit 1; }
  [ -d "$d/node_modules" ] || (cd "$d" && npm install)
done

# The backend loads the GatePass ABI from the compiled contract.
[ -f contracts/artifacts/contracts/GatePass.sol/GatePass.json ] || (cd contracts && npx hardhat compile)

# Same lookup as the backend: dotenv keeps an already-exported PORT.
port=${PORT:-$(sed -n 's/^PORT=//p' backend/.env)}
port=${port:-4000}
if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
  echo "Port $port is already in use (an old backend still running?). Stop it, then run this again."
  exit 1
fi

trap 'kill 0' EXIT  # stop backend + frontend when this script exits
npm --prefix backend run dev &
npm --prefix frontend run dev &

echo "Backend:  http://localhost:$port   Frontend: http://localhost:5173   (Ctrl+C to stop)"
wait -n  # if either one crashes, stop the other too
