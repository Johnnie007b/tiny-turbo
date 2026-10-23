# Tiny Turbo

Old-school, top-down toy-car racing for the browser, made by John. Race tiny cars across a kitchen table, a workbench, a sandbox and a bubble bath. Play solo against bots, or **online with friends: phones and PCs in the same room**.

Everything is original: procedural pixel art drawn on `<canvas>` and WebAudio chiptune music and sound effects. There are no image or audio files.

## Quick start

```bash
npm install
npm start            # http://localhost:3000
```

The server prints the local URL and your LAN URLs, for example `http://192.168.1.20:3000`. Phones on the same Wi-Fi can open the LAN URL directly. `PORT=8080 HOST=0.0.0.0 npm start` changes the port or interface. Node 18 or newer is needed. The only runtime dependency is `ws`.

## Playing

1. **RACE VS BOTS** is a solo race against bots (no one else needed, works offline). Pick the **BOT LEVEL** (EASY / MEDIUM / HARD) under the buttons. The same level sets the bots that fill empty slots in online rooms, and the host can change it in the room lobby. **PLAY WITH FRIENDS** creates a room with a 4-letter code and a share link (`?r=CODE`).
2. Friends open the link (or type the code) on a phone or PC, pick a name and colour, and hit **READY**. The host picks the track, mode and laps, then presses **START**.
3. Rooms hold 4 to 8 cars. Empty slots are filled with bots (the host can turn this off). Anyone joining mid-race spectates until the next one. After the results screen you can **rematch** or go back to the lobby.

### Game modes
- **Race**: laps around the track, with a countdown, lap timer, minimap and results table.
- **Duel** (head-to-head elimination): the leader drags the camera along. If you fall too far behind (off the leash) you are out for the round. Last car in scores a point. First to 3 points wins (5 with two cars).

### Tracks
| Track | Edge | Blurb |
|---|---|---|
| Breakfast Bedlam | falls off the table! | Race across the kitchen table. Mind the edge! |
| Workbench Rally | walls | Tight chicanes between bolts, cans and vises. |
| Sandbox Safari | rough sand | Loose sand, puddles and rocks in the backyard. |
| Bubble Bath Bash | walls | Slippery porcelain, rubber ducks and soap! |

### Hazards and combat
- **Ram and shove.** Cars collide hard. The car driving into another shoves it extra, so you can bump rivals off line, into walls and into hazards.
- **Oil** makes the car slide and spin. **Water** slows it right down. **Boost pads** speed you up and **ramps** launch you into the air. Driving off a table edge or into a pit means falling, a respawn penalty (about 1 second) and a brief invulnerable flash. You also lose any held item.
- **Item boxes** (the glowing "?" boxes across the road, race mode, host can toggle ITEMS ON/OFF) give one item at a time. Players further back tend to get missiles and turbos.
  - **MISSILE**: a homing rocket that locks onto the closest car ahead of you. A hit spins the target out and slows it down.
  - **OIL SLICK**: dropped behind you. Rivals who drive over it lose grip. It dries up after about 15 seconds and you are safe from your own fresh slick.
  - **TURBO**: a burst of extra speed.
- Duel mode defaults to ITEMS OFF (pure ramming) and can be switched on in the lobby.

## Controls

### PC (keyboard)
| Action | Keys |
|---|---|
| Steer | Left / Right arrows or A / D |
| Gas | Up arrow or W |
| Brake / reverse | Down arrow or S |
| Drift (handbrake) | Space or Shift |
| Use item | E, F, X or Enter |
| Pause / menu | Esc or P |

### Gamepad
Left stick or d-pad steers. A or RT is gas, B or LT is brake, X or R1 is drift, Y or L1 uses the item, and Start pauses.

### Phone / tablet (touch)
Landscape works best. A portrait hint appears, and you can dismiss it.
- Left side: **steer** with the left/right buttons, or choose slide-to-steer in Settings.
- Right side: **GAS**, **BRAKE**, **DRIFT** and **ITEM**. The ITEM button shows what you are holding and lights up when it is ready.
- Multi-touch works, so you can steer and gas together. A button toggles fullscreen (where the browser allows it). Pinch zoom and scrolling are disabled.

## How it works
- `server/index.js`: static file server plus WebSocket endpoint `/ws` (rooms, limits and rate-limits included).
- `public/js/sim.js`: deterministic car physics at a fixed 60 Hz, shared by the server and the client.
- `public/js/room.js`: the room and match logic (lobby, countdown, race, duel, items, bots). The server runs it for online games, and the browser runs the same code locally for solo play.
- The server is **authoritative**. Clients send inputs, the server sends compact snapshots at 30 Hz. The local car is predicted and reconciled, and other cars are interpolated.
- `items.js`, `ai.js`, `tracks.js`: items and weapons, bot drivers, and track definitions.
- `render.js`, `gfx.js`, `hud.js`, `audio.js`, `input.js`, `main.js`: renderer, procedural sprites, HUD, chiptune audio, input and UI.

## Tests
```bash
npm test             # runs all three suites
npm run test:sim     # physics, hazards, ramming, items/weapons, bots and bot difficulty (fast)
npm run test:net     # real WebSocket server + 4 simulated clients with latency/jitter, a full race, rematch, rejoin, duel (about 4 min)
npm run test:mobile  # headless Chrome via Playwright: phone landscape + portrait + desktop in one room, touch/keyboard, screenshots in test/shots/
```
The mobile suite needs Chrome or Chromium (`npx playwright install chromium` if there is no system Chrome).

## Putting it online
The game is one Node process that serves the page and the WebSocket on the same port, so any host that supports WebSockets and `npm start` works.

**Fastest, with no account:** run the game on your own computer and use a Cloudflare quick tunnel to get a public link:
```bash
npm start                                    # in one terminal
cloudflared tunnel --url http://localhost:3000   # in another; prints https://something.trycloudflare.com
```
Share that `https://…trycloudflare.com` link. Phones and PCs anywhere can join, and the room share link uses the same host automatically. Install `cloudflared` from https://github.com/cloudflare/cloudflared/releases.

**Permanent hosting:** deploy the repo to any Node host with WebSocket support (Render, Fly.io, Railway, a VPS and so on). The start command is `npm start`. It listens on `$PORT` and `0.0.0.0`.

## Credits
Made by John. Original art and audio, generated in code. Not affiliated with any commercial racing game.
