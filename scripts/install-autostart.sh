#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE=fastcub-pi
USER_NAME="$(whoami)"
HOME_DIR="$HOME"

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user, not with sudo (it asks for sudo itself where needed)." >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js is not installed. Install Node 20:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs" >&2
  exit 1
fi
if [ "$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')" -lt 18 ]; then
  echo "Node.js 18 or newer is needed (found $("$NODE_BIN" -v))." >&2
  exit 1
fi

cd "$DIR"
echo "==> Installing dependencies"
npm install --omit=dev --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example (edit it for relay pins, API key...)"
fi
mkdir -p data

if command -v pm2 >/dev/null 2>&1 && pm2 describe pi-server >/dev/null 2>&1; then
  echo "==> Removing the old pm2 process 'pi-server' (systemd runs the server now)"
  pm2 delete pi-server || true
  pm2 save --force || true
fi

if getent group gpio >/dev/null 2>&1 && ! id -nG "$USER_NAME" | grep -qw gpio; then
  echo "==> Adding $USER_NAME to the gpio group"
  sudo usermod -aG gpio "$USER_NAME"
fi

if [ -d /etc/NetworkManager/conf.d ]; then
  echo "==> Turning off Wi-Fi power saving"
  printf '[connection]\nwifi.powersave = 2\n' | sudo tee /etc/NetworkManager/conf.d/fastcub-wifi-powersave.conf >/dev/null
  sudo systemctl reload NetworkManager 2>/dev/null || true
fi

echo "==> Installing the systemd service '$SERVICE'"
sed -e "s|__USER__|$USER_NAME|g" -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$NODE_BIN|g" deploy/fastcub-pi.service \
  | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"

echo "==> Opening the dashboard on the desktop at login"
chmod +x scripts/start-dashboard.sh
mkdir -p "$HOME_DIR/.config/autostart"
sed -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$NODE_BIN|g" deploy/fastcub-dashboard.desktop \
  > "$HOME_DIR/.config/autostart/fastcub-dashboard.desktop"

if [[ " $* " == *" --console "* ]]; then
  PROFILE="$HOME_DIR/.profile"
  MARK="# >>> fastcub-dashboard (console) >>>"
  if ! grep -qF "$MARK" "$PROFILE" 2>/dev/null; then
    {
      echo ""
      echo "$MARK"
      echo "if [ \"\$(tty)\" = \"/dev/tty1\" ] && [ -z \"\$DISPLAY\" ] && [ -z \"\$WAYLAND_DISPLAY\" ]; then"
      echo "  \"$NODE_BIN\" \"$DIR/src/dashboard.js\""
      echo "fi"
      echo "# <<< fastcub-dashboard (console) <<<"
    } >> "$PROFILE"
  fi
  echo "    Console dashboard added. To log in on the console automatically:"
  echo "      sudo raspi-config nonint do_boot_behaviour B2"
fi

sleep 2
echo
systemctl --no-pager --lines=8 status "$SERVICE" || true
echo
IP="$(hostname -I | awk '{print $1}')"
echo "Done. The server runs now and on every boot."
echo "  App address : ${IP:-<no network>}:$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d ' ' || echo 3000)"
echo "  Live logs   : journalctl -u $SERVICE -f"
echo "  Dashboard   : opens at desktop login, or run: npm run dashboard"
echo "  Restart     : sudo systemctl restart $SERVICE"
