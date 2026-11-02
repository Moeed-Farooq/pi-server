#!/usr/bin/env bash
set -uo pipefail
SERVICE=fastcub-pi
sudo systemctl disable --now "$SERVICE" 2>/dev/null
sudo rm -f "/etc/systemd/system/$SERVICE.service"
sudo systemctl daemon-reload
rm -f "$HOME/.config/autostart/fastcub-dashboard.desktop"
if [ -f "$HOME/.profile" ]; then
  sed -i '/# >>> fastcub-dashboard (console) >>>/,/# <<< fastcub-dashboard (console) <<</d' "$HOME/.profile"
fi
sudo rm -f /etc/NetworkManager/conf.d/fastcub-wifi-powersave.conf
echo "Autostart removed. data/ was left as it is."
