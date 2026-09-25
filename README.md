# Claim

**Claim** is a territory-expansion action-puzzle in a single HTML file. No build process, no dependencies: open `claim.html` in any browser and play — also on mobile with touch controls.

## Game loop

- The board is a **14 x 20 grid**. The green border is your territory, and you start inside it.
- Move cell by cell. Each empty cell you visit becomes part of your **line** (trail).
- **Close a loop** by returning to your own territory: all enclosed empty cells inside the loop become your territory via flood-fill. Guards standing inside are **not** captured with it.
- Each claimed cell pays **+5 points**, plus a combo bonus (combo up to 10: multiplier max ×2.0) and a bonus from the "Payday" perk.
- You can shoot your own trail cells — that costs 100 points ("Blasted free") and resets the combo.

**Lives:** 3 per run. Touching your own line, being caught by a guard, or a regular guard "cutting" your path costs a life and restarts the current level. When all three are gone, the run ends at the game-over screen with stats.

## The Guards

Guards patrol in 90° vision cones (range 3–6 cells depending on type) and only chase what they can see — pillars block both their movement and line of sight. They briefly remember your last known position. Types are color-coded:

| Type | Color | Behavior |
|---|---|---|
| Wanderer | red (#e3574a) | Roams randomly, mostly harmless |
| Hunter | bright red (#ff4d3d) | Chases you the moment it sees you |
| Guardian | purple (#9b4fd6) | Lurks in the open |
| Nervous | orange (#e8935c) | Erratic, sometimes stands still briefly |
| Cutter | teal (#2fb8c9), level 3+ | Hunts your line, not you |

**Important:** A regular guard landing on your line = "A guard cut your line." and costs a life. The **Cutter** is the exception: it "cuts" your line — all trail cells from the start of the line up to the cut point become empty again. No life lost, but your path (and thus the loop logic) is gone, and the combo resets.

## Obstacles and level progression

Each level gets harder:

- **Level 2+: Pillars** (grey, ~3 per level, max 14). Block you and the guards — as well as their line of sight.
- **Level 3+: Golden bonus zone** — a small contiguous block of cells. If you capture it fully in one loop, it pays a **3x** point bonus (bonus cells pay ×3).
- **Level 4+: Moving pillars** (up to 4). Shift every ~1.1 s and "eat" your line when they pass over it — no life lost, but the path is cut off there (like with the Cutter).
- **Level 5+: Pits** (black, up to 8). Block **only you**; guards can move through them and hunt from there.

The threats also scale per level: guards get faster, and from level 4 additional guards spawn once 25 % of the board is claimed (max 15 at once).

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

- **Grapple Hook** (⚓) – Yank yourself 2 cells forward through open ground. 6 s cooldown.
- **Smoke Bomb** (💨) – Disappear from every guard's sight for 2.5 s. 10 s cooldown.

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD / D-pad buttons | Pick a direction (automatic movement per tick) |
| Mouse drag / swipe on the board | Steer with finger or mouse in the drag direction |
| Space / tap without moving | Shoot (up to 8 cells away, max 10 shots per volley) |
| Shift / Gadget button (touch) | Use active gadget |
| P | Pause – once 75 % claimed, a "Level complete" cash-out button appears there |
| Escape | Open the quit dialog; during tutorial: skip and mark it as done |

Your shot charge recharges automatically (default: every 250 ms; with "Rapidfire" only every 75 ms).

## Power-ups and power-downs

Power-up orbs appear on the field (a mystery symbol briefly "spins" before the effect is revealed — but the outcome is already decided at spawn: **65 % bonus / 35 % bad**).

**Bonuses** (active for their duration; each worth +15 points when activated):

| Icon | Name | Effect | Duration |
|---|---|---|---|
| ⚡ | Speed | Move 45 % faster | 4 s |
| 🛡️ | Shield | Guards can no longer catch you | 4 s |
| ❄ | Freeze | All guards freeze briefly | 3 s |
| 🔒 | Trailguard | Guards may not step onto your line | 5 s |
| 💥 | Rapidfire | Shot reload drops to 75 ms | 5 s |
| 🌵 | Spikes | Stepping onto a guard (shield not needed) kills it | 5 s |

The "Slow burn" perk extends all bonuses by 50 %.

**Bad effects:**

| Icon | Name | Effect | Duration |
|---|---|---|---|
| 😵 | Confuse | Controls are inverted (cancels out when combined with the Push camera) | 4 s |
| 🌫️ | Fog | Only a small radius around you stays visible | 5 s |
| 🚨 | Alarm | All guards hunt you (plus screen shake + vibration) | 3.5 s |
| 🐢 | Slow | Move 60 % slower | 4 s |
| 👥 | Swarm | An extra guard ("Reinforcements") appears while the effect lasts | 6 s |
| 😵‍🤪 | Drunk | The screen wobbles and blurs (visual) | 5.5 s |

## Perks and level-end shop

From level 2 on, a short shop with **three random perk cards** appears at every level end (75 % claimed cells) – pick one for free (money is just a visual of your cash-out progress). Perks last for the whole run:

| Perk | Symbol | Effect | Max |
|---|---|---|---|
| Spare life | ❤️ | One extra life, instantly | 99 |
| Quick draw | 🔫 | Shot reload 25 % faster (per level) | 3 |
| Light feet | 👟 | Move 10 % faster (per level) | 3 |
| Payday | 💰 | Claimed cells pay 25 % more (per level) | 4 |
| Kevlar vest | 🛡️ | Start every level with a 3 s shield | 2 |
| Spare cells | ⚡ | Two extra boosts per level | 3 |
| Slow burn | ⏳ | Power-ups last 50 % longer (per level) | 2 |
| Low profile | 👁️ | Guards spot you one cell later | 3 |

## Scoring and milestones

- **+5 per claimed cell** + combo multiplier (1.0 at combo 0 to max 2.0 at combo 10) + Payday factor.
- **Milestones:** Popups with fanfare when 25 % ("🎉 25 %!") and 50 % ("🔥 Halfway!") of the board is claimed.
- **Level end from 75 %:** A risk bonus is paid: 200 base points plus 2 extra points per additional 5 % claimed above 75 % (max **+50** at 100 %, i.e. 250 total). The game shows it as "Risk bonus: +X %". You unlock the "Gambler" achievement with a bonus of X ≥ 15 % – it requires 3 consecutive levels with X ≥ 15 %.
- **Shooting your own line:** −100 points, combo reset.
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
- **High scores** per mode are stored locally (`localStorage: claim_highscores`).
- **Gadget choice** is also stored locally (`localStorage: claim_gadget`, default: Grapple Hook).
- **Achievements** and stats stay in your browser (`claim_achievements`).

## Tech notes (optional)

- Single file: `claim.html` (HTML + CSS + JS, no build, no framework).
- Rendering: HTML5 Canvas with a requestAnimationFrame loop; audio is synthetized via the WebAudio API (no sound files needed).
- All state persists in `localStorage` – no server.
