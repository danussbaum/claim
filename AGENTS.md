# Project
Browser game "claim": canvas-based, vanilla JavaScript, no build step, no dependencies.
Run it by opening index.html in a browser.

# Structure
- index.html: markup only, loads the scripts in a fixed order
- css/claim.css: all styles
- js/: classic scripts (no modules) sharing one global scope, in load order:
  - core.js: constants, grid, canvas setup, shared state
  - gadgets.js: gadgets and cooldowns
  - level.js: level layout (pillars, pits, bonus zone), vision cone, smooth rotation
  - audio-sfx.js, audio-theme.js, audio-music.js: sound effects and music only
  - game.js: moving pillars and main game logic (largest file)
  - tutorial.js: tutorial
  - splash.js: splash screen
    - game.js: moving pillars, enemies, game over, shop, overlays
  - render.js: draw(), all canvas rendering (one large function)
  - ui.js: main loop, action buttons, start/pause/retry, mode select, quit
  
# Code rules
- No ES modules, no import/export. All scripts share the global scope.
- Code that runs at load time may only use things defined in earlier files.
  Calls inside functions or event handlers are fine.
- A new file needs a <script> tag in index.html at the right position.
- No new dependencies or build tools.

# Reading files
- Read only the files needed for the task.
- Skip audio-*.js unless the task is about sound or music.
- Read claim.css only for styling tasks.
- game.js is large: use grep to find the relevant function, then read only that range.

# Working style
- Think briefly and purposefully. Decide, then act.
- Only reconsider a decision if a tool result contradicts it.
- There are no automated tests. After a change, tell the user what to check in the browser.
- Never start servers, watchers, or other background processes.
- Do not try to run, open, or verify the game yourself (webfetch cannot execute JavaScript).
- After a change, stop and tell the user what to check in the browser.

# Communication
- Reply to the user in German (Swiss spelling: use "ss", never "ß").
- Keep code and commit messages in English.
- Match the language of existing comments in a file.