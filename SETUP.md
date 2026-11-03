# Pi setup

**You need:** a Raspberry Pi with Raspberry Pi OS (Bookworm), and internet on the Pi for setup.
After setup the Pi needs no internet.

**Tip:** paste in the Pi terminal with **Ctrl+Shift+V**. Or run everything from your Mac over SSH:
`ssh <pi-user>@raspberrypi.local`.

---

## 1. Install Node.js and git

```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

✅ `node -v` shows `v20...`

## 2. Get the code

```bash
cd ~
git clone -b moeed/pi-setup https://github.com/Moeed-Farooq/pi-server.git
cd pi-server
```

✅ `ls` shows `scripts`, `src` and `SETUP.md`.

## 3. Install the server

```bash
bash scripts/install-autostart.sh
sudo reboot
```

Don't put `sudo` in front of the first line.

✅ After the reboot, the **FastCub Dashboard** window opens by itself and shows `GPIO: ready`.
Its top line shows the **App address** (for example `192.168.1.2:3000`).

## 4. Connect the app

Put the phone on the **same Wi-Fi** as the Pi, then in the app go to:
**Home → chip icon → Machine Controller → Find automatically**.

✅ The Raspberry Pi card shows **Connected**.

## 5. Test it

1. Wire a test LED: **pin 11** → resistor (220–330 Ω) → LED → **pin 6**.
2. Unplug the internet cable from the router. Leave the router on.
3. Start a machine in the app.

✅ The LED stays on for the token minutes, then turns off.

Plug the internet back in. The app uploads the run to Firestore by itself.

**Setup is done.** From now on, switch the Pi on and everything starts by itself.

---

## Connect real machines

Each machine uses one GPIO pin to drive one relay.

```bash
cd ~/pi-server
cp config/machines.example.json config/machines.json
nano config/machines.json
```

Add one line per machine. Use the same `type` and `machineNum` as the app:

```json
[
  { "type": "Giant Washer", "machineNum": "1", "gpio": 17 },
  { "type": "Giant Dryer",  "machineNum": "1", "gpio": 27 }
]
```

Save (**Ctrl+O**, **Enter**, **Ctrl+X**), then run `sudo systemctl restart fastcub-pi`.

Free pins you can use: GPIO 17, 27, 22, 23, 24, 25.

## Settings

Edit with `nano ~/pi-server/.env`, then run `sudo systemctl restart fastcub-pi`.

| Setting | When to change it |
|---|---|
| `RELAY_ACTIVE_LOW=true` | The relay is ON when it should be OFF (most cheap relay boards) |
| `API_KEY=shop123` | Only phones with this key can start machines (enter it in the app as **Pi key**) |
| `MINUTE_MS=1000` | Testing: 1 token = 1 second. Set it back to `60000` after testing |

## Useful commands

| What | Command |
|---|---|
| Restart the server | `sudo systemctl restart fastcub-pi` |
| See the logs | `journalctl -u fastcub-pi -f` |
| Open the dashboard | `cd ~/pi-server && npm run dashboard` |
| Pi's IP address | `hostname -I` |
| Join another Wi-Fi | `sudo nmcli dev wifi connect "<name>" password "<password>"` |
| Update the code | `cd ~/pi-server && git pull && bash scripts/install-autostart.sh` |

Closing the dashboard never stops a machine.

## Problems

| Problem | Fix |
|---|---|
| Dashboard says `Waiting for the Pi server` | Run `journalctl -u fastcub-pi -n 50` and read the error |
| `Port 3000 is already in use` | Run `pm2 delete all`, then restart the server |
| `GPIO: dry-run` | Run `sudo apt install -y raspi-utils`, then restart the server |
| `GPIO: NOT READY` | Run step 3 again |
| App can't find the Pi | Phone and Pi must be on the same Wi-Fi, and the phone's mobile data must be off |
| App says `Pi key needed` | Enter the `API_KEY` from `.env` as the Pi key in the app |
| No desktop (Pi OS Lite) | Run `bash scripts/install-autostart.sh --console`, then `sudo raspi-config nonint do_boot_behaviour B2` |
