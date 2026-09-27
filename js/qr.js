// Minimal QR code generator: byte mode, error correction level L, versions 1-6.
// Enough for short URLs (up to 134 bytes). No dependencies.
const QR = (() => {
  // [ecCodewordsPerBlock, numBlocks, dataCodewordsPerBlock] for level L
  const EC_TABLE = [null, [7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108], [18, 2, 68]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

  const EXP = new Array(512), LOG = new Array(256);
  let v = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = v; LOG[v] = i; v <<= 1; if (v & 256) v ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }

  function rsRemainder(data, n) {
    const gen = rsGenerator(n);
    const res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const c = res[i];
      if (c) for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], c);
    }
    return res.slice(data.length);
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    while (ver <= 6 && EC_TABLE[ver][1] * EC_TABLE[ver][2] < bytes.length + 2) ver++;
    if (ver > 6) throw new Error('QR: text too long');
    const [ecLen, blocks, dataLen] = EC_TABLE[ver];
    const capacity = blocks * dataLen;

    // Bit stream: mode 0100, 8-bit length, data, terminator, padding
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); push(bytes.length, 8);
    bytes.forEach(b => push(b, 8));
    push(0, Math.min(4, capacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; data.length < capacity; p++) data.push(p % 2 ? 0x11 : 0xEC);

    // Split into blocks, add error correction, interleave
    const dataBlocks = [], ecBlocks = [];
    for (let b = 0; b < blocks; b++) {
      const blk = data.slice(b * dataLen, (b + 1) * dataLen);
      dataBlocks.push(blk); ecBlocks.push(rsRemainder(blk, ecLen));
    }
    const codewords = [];
    for (let i = 0; i < dataLen; i++) dataBlocks.forEach(blk => codewords.push(blk[i]));
    for (let i = 0; i < ecLen; i++) ecBlocks.forEach(blk => codewords.push(blk[i]));

    const size = ver * 4 + 17;
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setFn = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

    // Finder patterns with separators
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, d !== 2 && d !== 4);
      }
    });
    // Timing patterns
    for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // Alignment patterns
    const al = ALIGN[ver];
    al.forEach(ay => al.forEach(ax => {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    // Format info: level L (01), mask 0
    const fmtData = (1 << 3) | 0;
    let rem = fmtData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    const fmt = ((fmtData << 10) | rem) ^ 0x5412;
    const fb = i => ((fmt >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setFn(8, i, fb(i));
    setFn(8, 7, fb(6)); setFn(8, 8, fb(7)); setFn(7, 8, fb(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, fb(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, fb(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, fb(i));
    setFn(8, size - 8, true);

    // Data placement (zigzag), then mask 0
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        let dark = false;
        if (i < codewords.length * 8) { dark = ((codewords[i >> 3] >> (7 - (i & 7))) & 1) === 1; i++; }
        if ((x + y) % 2 === 0) dark = !dark;
        mod[y][x] = dark;
      }
    }
    return mod;
  }

  // Draws the code onto a canvas with a 4-module quiet zone.
  function draw(canvas, text, pixelSize) {
    const mod = encode(text);
    const n = mod.length, total = n + 8;
    const scale = Math.max(1, Math.floor((pixelSize || 256) / total));
    canvas.width = canvas.height = total * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (mod[y][x]) ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
  }

  return { encode, draw };
})();
