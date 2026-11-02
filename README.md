# Raspberry Pi Local Order Server

This server runs on your Raspberry Pi.
It receives order / equipment Start data from the FastCub Store mobile app
when the phone has Wi-Fi but no internet.

Phone and Pi must be on the SAME Wi-Fi router.
Internet is NOT required.


========================================
WHAT YOU NEED
========================================

1. Raspberry Pi
2. VS Code installed on the Pi (optional but easy)
3. Node.js 18 or newer on the Pi
4. Phone and Pi on the same Wi-Fi
5. (Optional) LED + resistor + breadboard to flash on order received


========================================
LED WIRING (FLASH WHEN ORDER ARRIVES)
========================================

Default pin: GPIO 17 (BCM) = physical pin 11 on the Pi header.

Parts:
- 1x LED
- 1x resistor (220 ohm to 330 ohm recommended)
- breadboard + jumper wires

How to wire:

  Pi physical pin 11 (GPIO 17)
       |
       +---- resistor (220-330 ohm) ---- LED long leg (anode / +)
                                         LED short leg (cathode / -)
                                              |
                                         Pi GND (physical pin 6 or 9)

Simple text diagram:

  [Pi pin 11 / GPIO17] ---> [Resistor] ---> [LED +] [LED -] ---> [Pi GND]

LED tip:
- Long leg  = + (anode)   -> toward the resistor / GPIO
- Short leg = - (cathode) -> toward GND

.env settings (already in pi-server/.env):

  LED_GPIO_PIN=17
  LED_ON_MS=5000

After wiring, restart the server:

  npm start
  # or: pm2 restart pi-server

You should see:
  [led] Ready on GPIO 17 (physical pin 11 if pin=17)

If you see "[led] Not available", check pinctrl exists:

  which pinctrl
  pinctrl set 17 op dh
  pinctrl set 17 op dl

(First command turns LED ON, second turns it OFF — good wiring test.)

When the phone sends Start (offline), the LED stays ON for 5 seconds
and the console will show: [led] ON for 5s

If you use a different GPIO pin, change LED_GPIO_PIN in .env
(use BCM number, not the physical pin number).


========================================
STEP 1 - OPEN THE PROJECT ON THE PI
========================================

1. Copy the pi-server folder onto the Pi
   (USB, scp, Git, shared folder, etc.)

2. Open VS Code on the Pi

3. Click: File -> Open Folder

4. Select the pi-server folder

5. Open the terminal in VS Code
   Shortcut: Ctrl + `
   Or menu: Terminal -> New Terminal


========================================
STEP 2 - CHECK / INSTALL NODE.JS
========================================

In the VS Code terminal, run:

  node -v

If you see a version like v20.x.x, you are fine.

If the command fails, install Node.js 20:

  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs

Then check again:

  node -v


========================================
STEP 3 - INSTALL PROJECT DEPENDENCIES
========================================

In the VS Code terminal, go to the pi-server folder, then run:

  cd /path/to/pi-server
  npm install

Wait until install finishes.


========================================
STEP 4 - FIND THE PI IP ADDRESS
========================================

Run this on the Pi:

  hostname -I

You will see something like:

  192.168.1.50  ...

Copy the FIRST number (example: 192.168.1.50)


========================================
STEP 5 - SET THE IP IN THE MOBILE APP
========================================

On your computer, open FastCub-Store .env and set:

  PI_BASE_URL=http://192.168.1.50:3000
  PI_REQUEST_TIMEOUT_MS=3000

Replace 192.168.1.50 with YOUR Pi IP from Step 4.

IMPORTANT:
After changing .env, restart Metro / rebuild the app
so the new IP is loaded.


========================================
STEP 6 - RUN THE SERVER MANUALLY (FOR TESTING)
========================================

In the VS Code terminal, inside pi-server, run:

  npm start

You should see:

  Raspberry Pi server listening on http://0.0.0.0:3000

Keep this terminal OPEN while testing.

When the phone taps Start (offline mode), this terminal will print
all values received from the mobile app, like:

  ========== ORDER RECEIVED FROM MOBILE APP ==========
  Time:            2026-09-22T18:00:00.000Z
  orderId:         ...
  equipmentId:     ...
  equipmentName:   ...
  serviceId:       ...
  shopId:          ...
  status:          ...
  token:           ...
  startedBy:       ...
  startedAt:       ...
  source:          ...
  Full payload JSON:
  { ... }
  ====================================================

To stop the server:

  Press Ctrl + C


Optional auto-reload while coding:

  npm run dev


========================================
STEP 7 - QUICK HEALTH CHECK
========================================

Open another terminal and run:

  curl http://localhost:3000/api/health

Expected response:

  {
    "success": true,
    "message": "Raspberry Pi server is running"
  }


========================================
STEP 8 - AUTO START WHEN PI TURNS ON (PM2)
========================================

Use this so the server starts automatically after reboot.

1. Stop the manual server if it is running (Ctrl + C)

2. Install PM2 globally:

  sudo npm install -g pm2

3. Go to your pi-server folder:

  cd /path/to/pi-server

4. Start the server with PM2:

  pm2 start src/server.js --name pi-server

5. Save the process list:

  pm2 save

6. Enable start on boot:

  pm2 startup

7. IMPORTANT:
   pm2 startup will print a long command that starts with something like:

     sudo env PATH=...

   COPY that full command and RUN it.

8. Save again:

  pm2 save


After this, when you turn the Pi OFF and ON again,
the server should start by itself.


========================================
VIEW LOGS WITH PM2 (SEE VALUES FROM PHONE)
========================================

To watch values received from the mobile app:

  pm2 logs pi-server

You will see the same field-by-field console output.

Other useful PM2 commands:

  pm2 status
  pm2 restart pi-server
  pm2 stop pi-server
  pm2 delete pi-server


========================================
HOW TO TEST WITH THE PHONE
========================================

1. Phone and Pi on the same Wi-Fi
2. Pi server running (npm start OR pm2)
3. FastCub-Store .env has the correct PI_BASE_URL
4. On the phone: Wi-Fi ON, internet OFF (or airplane mode with Wi-Fi on)
5. Open an order -> Assign Equipment -> select equipment -> tap Start
6. Look at Pi terminal / pm2 logs to see the received values


========================================
API ENDPOINTS
========================================

1) Health check

  GET /api/health

  Example:
  curl http://localhost:3000/api/health


2) Receive Start data from the mobile app

  POST /api/orders/start

  Required fields:
  - orderId
  - equipmentId

  Example:
  curl -X POST http://localhost:3000/api/orders/start \
    -H "Content-Type: application/json" \
    -d '{"orderId":"test-order-1","equipmentId":"eq-123","status":"in-process","source":"store-app"}'

  Success response:
  {
    "success": true,
    "message": "Order data received",
    "data": {
      "orderId": "test-order-1",
      "receivedAt": "2026-09-22T18:00:00.000Z"
    }
  }


3) List all stored orders

  GET /api/orders

  Example:
  curl http://localhost:3000/api/orders

Orders are saved in:
  data/orders.json

New records are APPENDED.
Old records are NOT overwritten.
Each record also gets a receivedAt time.


========================================
CONFIG (.env)
========================================

File: .env

  HOST=0.0.0.0
  PORT=3000

HOST must stay 0.0.0.0
(so phones on Wi-Fi can connect)

Do NOT use localhost only.


========================================
IF THE PHONE CANNOT REACH THE PI
========================================

1. Confirm same Wi-Fi on phone and Pi
2. Confirm PI_BASE_URL matches hostname -I
3. Confirm server is running:
     pm2 status
     or
     npm start
4. Allow port 3000 on the Pi (if firewall is on):

  sudo ufw allow 3000/tcp


========================================
QUICK CHECKLIST
========================================

[ ] Node.js installed on Pi
[ ] npm install done inside pi-server
[ ] hostname -I copied into FastCub-Store .env as PI_BASE_URL
[ ] Metro restarted after .env change
[ ] Server running with npm start OR pm2
[ ] Phone and Pi on same Wi-Fi
[ ] Phone has no internet (offline Start path)
[ ] Logs show values when Start is pressed
     (VS Code terminal or: pm2 logs pi-server)


========================================
HOW IT CONNECTS TO FASTCUB-STORE
========================================

When the store app has NO internet but Wi-Fi is still on,
tapping Start on Available Equipment calls:

  POST {PI_BASE_URL}/api/orders/start

It sends the same order/equipment values used by the normal Start flow,
plus equipmentName and startedAt.

The app only continues the offline Start flow after the Pi returns:

  success: true
