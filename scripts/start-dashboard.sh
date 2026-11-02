#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${FASTCUB_NODE:-$(command -v node || echo node)}"
CMD="cd '$DIR' && '$NODE_BIN' src/dashboard.js; echo; read -r -p 'Dashboard closed. Press Enter to close this window. '"

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  exec bash -c "$CMD"
fi

sleep "${FASTCUB_DASHBOARD_DELAY:-4}"

for term in lxterminal x-terminal-emulator xfce4-terminal gnome-terminal xterm; do
  command -v "$term" >/dev/null 2>&1 || continue
  case "$term" in
    lxterminal) exec lxterminal --title="FastCub Dashboard" --geometry=150x42 -e bash -c "$CMD" ;;
    gnome-terminal) exec gnome-terminal --title="FastCub Dashboard" -- bash -c "$CMD" ;;
    *) exec "$term" -T "FastCub Dashboard" -e bash -c "$CMD" ;;
  esac
done

echo "No terminal app found. Run the dashboard with: npm run dashboard" >&2
exit 1
