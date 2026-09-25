  const COLS = 14, ROWS = 20;
  let CELL = 24;

  const boardCanvas = document.getElementById('board');
  const ctx = boardCanvas.getContext('2d');

  const EMPTY = 0, TERRITORY = 1, TRAIL = 2, BLOCK = 3, PIT = 4;
  // Bonuszone: Zellen bleiben normal eroberbar, geben aber extra Punkte.
  let bonusCells = [];        // [{r, c}]
  let bonusClaimed = false;
  const BONUS_MULT = 3;

  const MODES = {
    normal: { label: 'Normal', desc: 'The classic run - guards hunt you down.', puInterval: 7000, puMax: 2, enemiesMove: true },
    chaos:  { label: 'Chaos',  desc: 'Mystery orbs everywhere. Pure slapstick.', puInterval: 2200, puMax: 5, enemiesMove: true },
    zen:    { label: 'Zen',    desc: 'Guards stand still - practise aiming in peace.', puInterval: 7000, puMax: 2, enemiesMove: false }
  };
  const CAMERAS = {
    standard: { label: 'Standard', desc: 'Fixed board.' },
    follow:   { label: 'Follow',   desc: 'You stay centred, the world moves.' },
    push:     { label: 'Push',     desc: 'You stay centred and shove the board around - controls are mirrored.' }
  };
  const INVERTED_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const IS_TOUCH = (typeof window !== 'undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
     (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

