# Claim

**Claim** is a territory-expansion action-puzzle for the browser. No build process, no dependencies: open `index.html` in any browser and play — also on mobile with touch controls.

## Game loop

- The board is a **14 x 20 grid**. The green border is your territory, and you start inside it.
- Move cell by cell. Each empty cell you visit becomes part of your **line** (trail).
- **Close a loop** by returning to your own territory: all enclosed empty cells inside the loop become your territory via flood-fill. Guards standing inside are **not** captured with it.
- Each claimed cell pays **+5 points**, plus a combo bonus (from the 2nd loop in a row: ×1.1, up to ×1.9) and a bonus from the "Payday" perk.
- You can shoot your own trail cells — that costs 100 points ("Blasted free") and resets the combo.

**Lives:** 3 per run. Touching your own line, being caught by a guard, or a regular guard "cutting" your path costs a life and restarts the current level. When all three are gone, the run ends at the game-over screen with stats.

## The Guards

Guards patrol with vision cones whose width and range depend on the type (range 5–7 cells; "Low profile" shortens it, minimum 3) and only chase what they can see — pillars block both their movement and line of sight. Deep inside your own territory (all four neighbouring cells are yours too) you are hidden: guards cannot see you there, the cones leave those cells out and your head turns semi-transparent. On the edge of your territory you stay visible. They remember your last known position for 1.2 s. Level 1 starts with one guard, one more every two levels (max 4). A killed guard (+50 points) is replaced by a new one. Types are color-coded:

| Type | Color | Behavior |
|---|---|---|
| Wanderer | red (#e3574a) | Roams randomly, range 6 |
| Hunter | bright red (#ff4d3d) | Chases you the moment it sees you, narrow cone, range 7 |
| Guardian | purple (#9b4fd6) | Lurks in the open, range 5 |
| Nervous | orange (#e8935c) | Erratic, sometimes stands still briefly, wide cone, range 5 |
| Cutter | teal (#2fb8c9), level 3+ | Hunts your line, not you |

**Important:** A regular guard landing on your line = "A guard cut your line." and costs a life. The **Cutter** is the exception: it "cuts" your line — all trail cells from the start of the line up to the cut point become empty again. No life lost, but your path (and thus the loop logic) is gone, and the combo resets.

## Obstacles and level progression

Each level gets harder:

- **Level 2+: Pillars** (grey, 3 in level 2, +2 per level, max 14). Block you and the guards — as well as their line of sight.
- **Level 3+: Golden bonus zone** — a small contiguous block of cells. If you capture it fully in one loop, it pays a **3x** point bonus.
- **Level 4+: Moving pillars** (1, +1 every 3 levels, max 4). Shift every ~1.1 s and "eat" your line when they pass over it — no life lost, but the path is cut off there (like with the Cutter).
- **Level 5+: Pits** (black, 2 at first, +2 every 2 levels, max 8). Block **only you**; guards can move through them and hunt from there.

The threats also scale per level: guards get faster and more numerous.

## Modes, camera and gadget

You choose before starting:

**Modes** — control power-up density and (in Zen) guard movement:

| Mode | Description | Power-ups on field |
|---|---|---|
| Normal | The classic run – guards actively hunt you. | up to 2, refilled every 7 s |
| Chaos | "Mystery orbs everywhere. Pure slapstick." | up to 5, refilled every 2.2 s |
| Zen | "Guards stand still - practise aiming in peace." Guards are stationary. | up to 2, refilled every 7 s; guards do not move |

**Camera:**

- **Standard** – Fixed board, the whole field is visible.
- **Follow** – You stay centred; the world moves with you.
- **Push** – Like Follow but controls are inverted: you shove the board around (Up steers Down, etc.).

**Gadget** (one choice per run, saved in your browser):

- **Grapple Hook** (🪝) – Yank yourself 2 cells forward through open ground. 6 s cooldown.
- **Smoke Bomb** (💨) – Disappear from every guard's sight for 2.5 s. 10 s cooldown.
- **Mine** (💣) – Drop a mine on a free cell next to you (sideways first, then ahead, then behind), where guards walk. Armed after 0.5 s; when a guard steps on it, it and all guards next to it die and claimed cells within about 2 cells become free again (the border stays). Max 3 mines, 8 s cooldown. In 2 player it also sends the rival home if they step on it (it can also go on the rival's land), and frees both players' land in the crater.

## 2 Player versus

The **⚔️ 2 Player** button in the menu opens the versus lobby. Two players claim ground on the same 14 x 20 board, with one guard in the middle.

**Connecting:**

- **Host a match** shows a QR code. The rival scans it with the phone camera and joins in the browser: no account, no app. The devices connect directly peer-to-peer (WebRTC); public MQTT brokers are only used to find each other. The host runs the simulation, the guest sends inputs.
- **Network requirement:** the direct connection only works when both devices are on the **same Wi-Fi**, or when one player opens a **mobile hotspot** and the other connects to it. With both players on mobile data it does not work (there is no relay server).
- **Play vs CPU** starts a match against a computer rival on the same device. The CPU makes short loops out of its land, heads home when threatened and shoots at whatever is in line.

**Rules:**

- Each player starts with a border strip: player 1 the top and left edge, player 2 the bottom and right edge.
- Closing a loop claims every enclosed area that holds neither the guard nor the rival – **including the rival's land** ("stolen" cells). The largest open area always stays open, so the board never flips at once.
- A match lasts **2 minutes**. Whoever reaches **50 %** first wins at once; otherwise the larger share wins when time is up (equal share = draw).
- **Series:** first to **3 wins with a 2-win lead** (like tennis), shown as MATCHES instead of lives.
- **No lives:** crossing your own line, getting your line cut or being caught by the guard sends you back to your start corner, your line is lost and you stand still for 1.5 s. Being shot by the rival costs 0.8 s. A short invulnerability follows. Whoever loses all land gets their free start edges back.
- **Attacking:** run over the rival's line to cut it (they are sent home), shoot them (axe, 8 cells) or shoot their line – the piece from their land up to the hit falls away. Meeting head-on outside your own land sends you home.
- Deep inside your own land you are hidden from the guard, like in single player. It hunts whichever player it sees and is closer; shot down, it returns after 3 s.
- Power-ups: Speed, Shield, Freeze and Rapid Fire, plus Slow as the bad one (30 %). Each player has 3 boosts per match and their chosen gadget (the CPU uses the Grapple Hook, mines are visible to both players).

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD / D-pad buttons | Pick a direction (automatic movement per tick) |
| Mouse drag / swipe on the board | Steer with finger or mouse in the drag direction |
| Space / tap without moving | Shoot (up to 8 cells away) |
| Shift / Gadget button (touch) | Use active gadget |
| P | Pause – once 75 % claimed, a "Level complete" cash-out button appears there |
| Escape | Open the quit dialog; during tutorial: skip and mark it as done |

Shots recharge automatically: 900 ms by default, 25 % faster per "Quick draw" level (min 300 ms). "Rapid Fire" removes the cooldown entirely.

## Power-ups and power-downs

Power-up orbs appear on the field (a mystery symbol briefly "spins" before the effect is revealed — but the outcome is already decided at spawn: **65 % bonus / 35 % bad**).

**Bonuses** (active for their duration; each worth +15 points when activated):

| Icon | Name | Effect | Duration |
|---|---|---|---|
| ⚡ | Speed Boost | Step time 45 % shorter | 4 s |
| ◆ | Shield | Guards can no longer catch you | 4 s |
| ❄ | Freeze | All guards freeze briefly | 3 s |
| 🔗 | Trail Guard | Guards may not step onto your line | 5 s |
| 🔫 | Rapid Fire | No shot cooldown | 5 s |
| 🦔 | Spikes | Stepping onto a guard kills it | 5 s |
| 🪨 | Decoy | +2 throws (max 3). The gadget button/Shift throws a stone up to 4 cells ahead; guards within 5 cells that are not hunting you walk there and wait | 3 s per throw |

The "Slow burn" perk extends all bonuses by 50 %.

**Bad effects:**

| Icon | Name | Effect | Duration |
|---|---|---|---|
| 🌀 | Confuse | Controls are inverted (cancels out when combined with the Push camera) | 4 s |
| 🌫️ | Fog | Only a small radius around you stays visible | 5 s |
| 🚨 | Alarm | All guards hunt you (plus screen shake + vibration) | 3.5 s |
| 🐌 | Slow | Step time 60 % longer | 4 s |
| 👥 | Swarm | An extra guard ("Reinforcements") appears while the effect lasts | 6 s |
| 🍺 | Drunk | The screen wobbles and blurs (visual) | 5.5 s |
| 🍄 | Psylo | World hue-rotates through the rainbow with boosted saturation; a double-vision ghost layer drifts over the board. Visual only (stacks with Drunk) | 8 s |

**Chaos mode only** (extra bad effects in the pool):

| Icon | Name | Effect | Duration |
|---|---|---|---|
| 🦆 | Duck | You turn into a duck. Guards cannot spot you, but every step quacks and lures guards within 4 cells to you | 5 s |
| 🎈 | Helium head | Your head inflates; guards see you from 3 cells further | 6 s |
| 🪩 | Disco | Guards dance: they move only every other beat, and their cones sweep around like disco lights | 4 s |
| 🍌 | Banana | You slide 3 cells without control. The peel stays behind; a guard stepping on it slips and is stunned for 1.5 s | instant |

**Guard voices** (option "Guard voices" before the start): *Gibberish* (synthesized babble), *Speech* or *Off*. With Speech, guards, countdown and announcer (multikills, trick shots) use pre-recorded voice lines generated with Kokoro TTS: every guard gets its own voice and pitch through a radio filter, distant guards sound quieter and muffled, the announcer sounds like a megaphone and every countdown gets a random style (arena, radio, epic, robot, dry). Missing files fall back to the browser's speech synthesis.

**Guard personality:** guards comment on what happens in speech bubbles, can trip into pits while chasing you (stunned 1 s), occasionally take a coffee break (blind for 3 s; sneaking past within 2 cells pays +25) and block each other in narrow corridors.

## Perks and level-end shop

From level 2 on, a short shop with **three random perk cards** appears at every level end (75 % claimed cells) – pick one for free (money is just a visual of your cash-out progress). Perks last for the whole run and stack up to the given maximum:

| Perk | Symbol | Effect | Max |
|---|---|---|---|
| Spare life | ❤️ | One extra life, instantly | 99 |
| Quick draw | 🔫 | Shot reload 25 % faster (per level) | 3 |
| Light feet | 👟 | Move 10 % faster (per level) | 3 |
| Payday | 💰 | Claimed cells pay 25 % more (per level) | 4 |
| Kevlar vest | 🛡️ | Start every level with a 3 s shield (+3 s per level) | 2 |
| Spare cells | ⚡ | Two extra boosts per level (base: 3) | 3 |
| Slow burn | ⏳ | Power-ups last 50 % longer (per level) | 2 |
| Low profile | 👁️ | Guards spot you one cell later | 3 |

## Scoring and milestones

- **+5 per claimed cell**, ×(1 + 0.25 per Payday level), plus the combo bonus (×1.1 from the 2nd consecutive loop, max ×1.9). The combo resets when you lose your line.
- **Ghost bonus:** closing a loop without any guard seeing you since the line started pays +50 % of the cell points ("👻 Ghost").
- **Golden bonus zone:** fully claimed in one loop pays ×3 for its cells.
- **Killing a guard:** +50 points.
- **Milestones:** Popups with fanfare when 25 % ("🎉 25 %!") and 50 % ("🔥 Halfway!") of the board is claimed.
- **Level end from 75 %:** You get 200 points, raised by a risk bonus of +5 % for every full 5 % claimed above 75 % (max +100 % at 100 %, i.e. 400 points). The game shows it as "Risk bonus: +X %". Three consecutive levels with X ≥ 15 % unlock the "Gambler" achievement.
- **Shooting your own line:** −100 points (never below 0), combo reset.
- **Power-up activation:** +15 points (bonus only) – bad effects pay nothing.

## Achievements

| ID | Name | Condition |
|---|---|---|
| first_level | First Taste of Blood | First completed level |
| speed_demon | Speed Rush | All boosts spent in one level |
| untouchable | Untouchable | A level finished without losing a life |
| gambler | Gambler | 3 consecutive levels with risk bonus ≥ +15 % |

## Tutorial and persistence

- **Tutorial:** 12 steps (from closing your first loop to the gold zone). Once 75 % is claimed, the cash-out step unlocks. Escape skips the tutorial; completion is saved in your browser (`localStorage: claim_tutorial_done`).
- **High scores** per mode are stored locally (`localStorage: claim_highscore_<mode>`).
- **Gadget choice** is also stored locally (`localStorage: claim_gadget`, default: Grapple Hook).
- **Mode and camera** choices are remembered (`claim_mode`, `claim_camera`).
- **Achievements** and stats stay in your browser (`claim_achievements`).

## Tech notes

- No build, no framework, no dependencies: `index.html` (markup), `css/claim.css` (styles) and classic scripts in `js/` sharing one global scope.
- Scripts load in a fixed order: `core.js` → `gadgets.js` → `level.js` → `audio-*.js` → `audio/voice/manifest.js` → `voice.js` → `gameplay.js` → `game.js` → `render-figures.js` → `render-world.js` → `render-actors.js` → `render-overlay.js` → `render.js` → `ui.js` → `tutorial.js` → `input.js` → `qr.js` → `net.js` → `versus-sim.js` → `versus-cpu.js` → `versus-render.js` → `versus.js` → `splash.js` → `pwa.js`. See `AGENTS.md`.
- Rendering: HTML5 Canvas with a requestAnimationFrame loop; music and sound effects are synthesized via the WebAudio API. Only the voice lines are audio files (`audio/voice/`, MP3).
- All state persists in `localStorage` – no server.
- **Voice lines** are generated locally with `tools/kokoro_voices.py` (Kokoro TTS, see the script header for setup). It reads all lines from the JS files, renders them with several voices into `tools/voice_src/`, then packs them into one MP3 per category and voice under `audio/voice/` and writes `audio/voice/manifest.js`. For itch.io, zip everything except `tools/`. Existing files are skipped; `--manifest-only` only rebuilds the manifest.
- **Local server:** opened directly as a file, voices play without filters and there is no offline mode. For the full experience serve the folder, e.g. `py -m http.server 8000` → `http://localhost:8000`.
- **Offline and home screen:** over https (or localhost) a service worker (`sw.js`) caches the game and downloads 5 guard voices plus countdown and announcer in the background (not on metered connections). The game can be added to the home screen and then runs full screen, also offline.

## itch.io (butler)

One-time setup (Windows):
1. Download butler: https://itchio.itch.io/butler (or `https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default`),
   unzip into `tools\butler\` (butler.exe plus its DLLs; not committed). Alternatively put it in PATH.
2. `tools\butler\butler.exe login` (opens the browser once).
3. `tools\butler\butler.exe -V` should print the version.

Publish: double-click `tools\publish-itch.cmd` (or run `tools\publish-itch.ps1`).
On the first run it asks for the target (`user/game`, from the itch.io URL) and saves it in `tools/itch-target.txt`.
Options: `-Channel html5`, `-DryRun`.
The first push creates the `html5` upload; on itch.io, edit the game once and tick
"This file will be played in the browser" for that upload.
