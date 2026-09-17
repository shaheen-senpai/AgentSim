#!/usr/bin/env bash
# Local dev control for AgentSim and every bridge that talks to it.
#
#   scripts/dev.sh down    stop AgentSim, any agent endpoint, and the TLS-MITM proxy
#   scripts/dev.sh up      down, then start AgentSim on :3000 (logs to /tmp/agentsim-dev.log)
#   scripts/dev.sh ps      show what is still listening
#
# `down` is deliberately two passes: by command line, so a process that moved port is still caught,
# then by port, so one that was renamed is too. Ports are matched on LISTEN only — plain `lsof -i`
# also returns whoever is *connected* to :3000, which is your browser.
set -uo pipefail

# AgentSim · agent driven endpoints · Acme sample · agent chat · mitmproxy · stale vite · stub AgentSim
PORTS=(3000 4100 4101 4000 8787 8090 8091 5173 3999)
PATTERNS=("next dev" "next-server" "agent/serve.ts" "chat/server.ts" "mitmdump" "agentsim_proxy" "fake-agentsim")

down() {
  for pat in "${PATTERNS[@]}"; do pkill -f "$pat" 2>/dev/null; done
  for p in "${PORTS[@]}"; do
    pids=$(lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  done
  sleep 1
  echo "down · nothing left on ${PORTS[*]}"
}

up() {
  down
  cd "$(dirname "$0")/.." || exit 1
  nohup npm run dev > /tmp/agentsim-dev.log 2>&1 &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null http://localhost:3000/api/worlds && { echo "up · http://localhost:3000"; return 0; }
    sleep 0.5
  done
  echo "AgentSim did not answer within 20s — see /tmp/agentsim-dev.log"
  return 1
}

case "${1:-up}" in
  down) down ;;
  up) up ;;
  ps) lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E "node|python|mitm" || echo "nothing listening" ;;
  *) echo "usage: $0 {up|down|ps}" >&2; exit 2 ;;
esac
