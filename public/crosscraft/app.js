'use strict';

const MAX_WORDS = 12;
const GRID_SIZE = 23; // internal working grid (odd, so center is exact)
const DAILY_WORD_TARGET = 10;

// ── CrosswordGenerator ────────────────────────────────────────
class CrosswordGenerator {
  constructor() {
    this.grid   = null;
    this.placed = [];
    this.unplaced = [];
  }

  _initGrid() {
    this.grid     = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => ({ letter: null })));
    this.placed   = [];
    this.unplaced = [];
  }

  _letter(r, c) {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
    return this.grid[r][c].letter;
  }

  _canPlace(word, row, col, dir) {
    const len = word.length;
    if (dir === 'across') {
      if (row < 0 || row >= GRID_SIZE) return false;
      if (col < 0 || col + len > GRID_SIZE) return false;
      // No cap letters before / after word
      if (this._letter(row, col - 1) !== null) return false;
      if (this._letter(row, col + len) !== null) return false;
      let hits = 0;
      for (let i = 0; i < len; i++) {
        const existing = this._letter(row, col + i);
        if (existing !== null) {
          if (existing !== word[i]) return false;
          hits++;
        } else {
          // No adjacent parallel letters above / below
          if (this._letter(row - 1, col + i) !== null) return false;
          if (this._letter(row + 1, col + i) !== null) return false;
        }
      }
      return this.placed.length === 0 || hits > 0;
    } else {
      if (col < 0 || col >= GRID_SIZE) return false;
      if (row < 0 || row + len > GRID_SIZE) return false;
      if (this._letter(row - 1, col) !== null) return false;
      if (this._letter(row + len, col) !== null) return false;
      let hits = 0;
      for (let i = 0; i < len; i++) {
        const existing = this._letter(row + i, col);
        if (existing !== null) {
          if (existing !== word[i]) return false;
          hits++;
        } else {
          if (this._letter(row + i, col - 1) !== null) return false;
          if (this._letter(row + i, col + 1) !== null) return false;
        }
      }
      return this.placed.length === 0 || hits > 0;
    }
  }

  _countHits(word, row, col, dir) {
    let n = 0;
    for (let i = 0; i < word.length; i++) {
      const r = dir === 'across' ? row     : row + i;
      const c = dir === 'across' ? col + i : col;
      if (this._letter(r, c) === word[i]) n++;
    }
    return n;
  }

  _commit(wordObj, row, col, dir) {
    for (let i = 0; i < wordObj.word.length; i++) {
      const r = dir === 'across' ? row     : row + i;
      const c = dir === 'across' ? col + i : col;
      this.grid[r][c].letter = wordObj.word[i];
    }
    this.placed.push({ ...wordObj, row, col, dir, number: null });
  }

  _bestPlacement(wordStr) {
    let best = null, bestScore = -1;
    for (const pw of this.placed) {
      for (let pi = 0; pi < pw.word.length; pi++) {
        for (let wi = 0; wi < wordStr.length; wi++) {
          if (pw.word[pi] !== wordStr[wi]) continue;
          let nr, nc, newDir;
          if (pw.dir === 'across') {
            nr = pw.row - wi; nc = pw.col + pi; newDir = 'down';
          } else {
            nr = pw.row + pi; nc = pw.col - wi; newDir = 'across';
          }
          if (this._canPlace(wordStr, nr, nc, newDir)) {
            const score = this._countHits(wordStr, nr, nc, newDir);
            if (score > bestScore) {
              bestScore = score;
              best = { row: nr, col: nc, dir: newDir };
            }
          }
        }
      }
    }
    return best;
  }

  generate(wordClues) {
    const words = wordClues
      .slice(0, MAX_WORDS)
      .map(wc => ({ word: wc.word.toUpperCase(), clue: wc.clue }))
      .sort((a, b) => b.word.length - a.word.length);

    // One full placement attempt starting from word[firstIdx] in firstDir.
    // At each step greedily picks whichever remaining word has the most
    // letter matches with the current grid, so "bridge" words are placed
    // before the words that depend on them.
    const run = (firstIdx, firstDir) => {
      this._initGrid();
      const first = words[firstIdx];
      const startRow = firstDir === 'across'
        ? Math.floor(GRID_SIZE / 2)
        : Math.floor((GRID_SIZE - first.word.length) / 2);
      const startCol = firstDir === 'across'
        ? Math.floor((GRID_SIZE - first.word.length) / 2)
        : Math.floor(GRID_SIZE / 2);
      this._commit(first, startRow, startCol, firstDir);

      const pool = words.filter((_, i) => i !== firstIdx).map(w => ({ ...w }));
      while (pool.length > 0) {
        let bestIdx = -1, bestP = null, bestScore = -1;
        for (let i = 0; i < pool.length; i++) {
          const p = this._bestPlacement(pool[i].word);
          if (!p) continue;
          const s = this._countHits(pool[i].word, p.row, p.col, p.dir);
          if (s > bestScore) { bestScore = s; bestP = p; bestIdx = i; }
        }
        if (bestIdx === -1) break;
        this._commit(pool[bestIdx], bestP.row, bestP.col, bestP.dir);
        pool.splice(bestIdx, 1);
      }
      this.unplaced = pool;
      return this._buildResult();
    };

    // Try every word as the anchor in both orientations (2 × N trials).
    // Keep the configuration that places the most words.
    let best = null;
    for (let i = 0; i < words.length; i++) {
      for (const dir of ['across', 'down']) {
        const result = run(i, dir);
        if (!best || result.words.length > best.words.length) {
          best = result;
          if (best.unplaced.length === 0) return best; // perfect — stop early
        }
      }
    }
    return best;
  }

  _buildResult() {
    // Bounding box of all placed words
    let r1 = GRID_SIZE, r2 = 0, c1 = GRID_SIZE, c2 = 0;
    for (const w of this.placed) {
      const er = w.dir === 'down'   ? w.row + w.word.length - 1 : w.row;
      const ec = w.dir === 'across' ? w.col + w.word.length - 1 : w.col;
      r1 = Math.min(r1, w.row); r2 = Math.max(r2, er);
      c1 = Math.min(c1, w.col); c2 = Math.max(c2, ec);
    }
    // 1-cell padding on every side
    r1 = Math.max(0, r1 - 1); r2 = Math.min(GRID_SIZE - 1, r2 + 1);
    c1 = Math.max(0, c1 - 1); c2 = Math.min(GRID_SIZE - 1, c2 + 1);

    const rows = r2 - r1 + 1;
    const cols = c2 - c1 + 1;

    const grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        letter: this.grid[r + r1][c + c1].letter,
        number: null,
      })));

    const words = this.placed.map(w => ({
      ...w, row: w.row - r1, col: w.col - c1,
    }));

    // Number cells in reading order (left→right, top→bottom)
    let num = 1;
    const numMap = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].letter) continue;
        const aStart = (c === 0 || !grid[r][c - 1].letter) &&
                       (c + 1 < cols && grid[r][c + 1].letter);
        const dStart = (r === 0 || !grid[r - 1][c].letter) &&
                       (r + 1 < rows && grid[r + 1][c].letter);
        if (aStart || dStart) {
          grid[r][c].number = num;
          numMap[`${r},${c}`] = num++;
        }
      }
    }

    for (const w of words) w.number = numMap[`${w.row},${w.col}`] ?? null;

    return { grid, words, rows, cols, unplaced: this.unplaced };
  }
}

// ── App state ─────────────────────────────────────────────────
let puzzle    = null;
let userInput = {};      // "r,c" → typed letter
let showAns   = false;
let activeCell = null;   // { row, col }
let activeDir  = 'across';

// ── Tiny helpers ──────────────────────────────────────────────
const $    = id => document.getElementById(id);
const esc  = s  => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cKey = (r, c) => `${r},${c}`;
const cEl  = (r, c) => document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);

// ── Parse textarea input ──────────────────────────────────────
function parseInput(text) {
  return text.trim().split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const i = l.indexOf(' ');
      if (i < 1) return null;
      const word = l.slice(0, i).replace(/[^a-zA-Z]/g, '');
      const clue = l.slice(i + 1).trim();
      return word.length >= 2 && clue ? { word, clue } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

// ── Generate button ───────────────────────────────────────────
function generate() {
  const wcs = parseInput($('word-input').value);
  $('error-msg').textContent = '';
  if (wcs.length < 2) {
    $('error-msg').textContent = 'Enter at least 2 word clue pairs (format: WORD clue text).';
    return;
  }
  puzzle    = new CrosswordGenerator().generate(wcs);
  userInput = {};
  showAns   = false;
  $('toggle-btn').textContent = 'Show Answers';
  renderGrid();
  renderClues();
  renderWarnings();
  $('puzzle-section').hidden = false;
}

// ── Render grid ───────────────────────────────────────────────
function renderGrid() {
  const { grid, rows, cols } = puzzle;
  const wrap = $('grid-container');
  wrap.innerHTML = '';
  wrap.style.setProperty('--cols', cols);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { letter, number } = grid[r][c];
      const div = document.createElement('div');
      div.className = letter ? 'cell white' : 'cell black';
      div.dataset.row = r;
      div.dataset.col = c;

      if (letter) {
        div.setAttribute('tabindex', '0');
        if (number) {
          const ns = document.createElement('span');
          ns.className = 'cell-num';
          ns.textContent = number;
          div.appendChild(ns);
        }
        const ls = document.createElement('span');
        ls.className = 'cell-letter';
        div.appendChild(ls);
        div.addEventListener('click', () => onCellClick(r, c));
      }
      wrap.appendChild(div);
    }
  }
}

// ── Render clues ──────────────────────────────────────────────
function renderClues() {
  const list = $('clues-list');
  list.innerHTML = '';
  [...puzzle.words]
    .filter(w => w.number != null)
    .sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1))
    .forEach(w => {
      const li = document.createElement('li');
      li.dataset.wid = w.number + w.dir;
      li.innerHTML = `<b>${w.number}${w.dir === 'across' ? 'A' : 'D'}</b> ${esc(w.clue)}`;
      li.addEventListener('click', () => activateWord(w));
      list.appendChild(li);
    });
}

function renderWarnings() {
  const warn = $('warnings');
  warn.hidden = puzzle.unplaced.length === 0;
  warn.textContent = puzzle.unplaced.length
    ? `Could not place: ${puzzle.unplaced.map(w => w.word).join(', ')}`
    : '';
}

// ── Cell interaction ──────────────────────────────────────────
function onCellClick(row, col) {
  if (activeCell?.row === row && activeCell?.col === col) {
    // Same cell: toggle direction
    const other = activeDir === 'across' ? 'down' : 'across';
    if (wordAt(row, col, other)) activeDir = other;
  } else {
    activeCell = { row, col };
    if (!wordAt(row, col, activeDir)) {
      activeDir = activeDir === 'across' ? 'down' : 'across';
    }
  }
  activeCell = { row, col };
  updateHighlight();
  cEl(row, col)?.focus();
}

function wordAt(row, col, dir) {
  return puzzle.words.find(w => w.dir === dir && inWord(w, row, col)) || null;
}

function inWord(w, r, c) {
  return w.dir === 'across'
    ? w.row === r && c >= w.col && c < w.col + w.word.length
    : w.col === c && r >= w.row && r < w.row + w.word.length;
}

function activeWord() {
  return activeCell ? wordAt(activeCell.row, activeCell.col, activeDir) : null;
}

function activateWord(w) {
  activeDir  = w.dir;
  activeCell = { row: w.row, col: w.col };
  updateHighlight();
  cEl(w.row, w.col)?.focus();
}

function updateHighlight() {
  document.querySelectorAll('.cell.highlighted, .cell.active-cell')
    .forEach(el => el.classList.remove('highlighted', 'active-cell'));
  document.querySelectorAll('#clues-list li.active')
    .forEach(el => el.classList.remove('active'));

  const w = activeWord();
  if (!w) return;

  for (let i = 0; i < w.word.length; i++) {
    const r = w.dir === 'across' ? w.row     : w.row + i;
    const c = w.dir === 'across' ? w.col + i : w.col;
    cEl(r, c)?.classList.add('highlighted');
  }
  if (activeCell) {
    const ac = cEl(activeCell.row, activeCell.col);
    ac?.classList.remove('highlighted');
    ac?.classList.add('active-cell');
  }

  const li = document.querySelector(`#clues-list [data-wid="${w.number}${w.dir}"]`);
  if (li) { li.classList.add('active'); li.scrollIntoView({ block: 'nearest' }); }
}

// ── Keyboard handler ──────────────────────────────────────────
function handleKey(e) {
  if (!activeCell || !puzzle) return;
  const { row, col } = activeCell;

  switch (e.key) {
    case 'Tab':
      e.preventDefault(); shiftWord(e.shiftKey ? -1 : 1); return;
    case 'ArrowRight':
      e.preventDefault(); activeDir = 'across'; stepAdj(row, col,  0,  1); return;
    case 'ArrowLeft':
      e.preventDefault(); activeDir = 'across'; stepAdj(row, col,  0, -1); return;
    case 'ArrowDown':
      e.preventDefault(); activeDir = 'down';   stepAdj(row, col,  1,  0); return;
    case 'ArrowUp':
      e.preventDefault(); activeDir = 'down';   stepAdj(row, col, -1,  0); return;
    case 'Backspace':
      e.preventDefault();
      setLetter(row, col, '');
      moveInWord(-1);
      return;
    case 'Delete':
      e.preventDefault(); setLetter(row, col, ''); return;
  }

  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    setLetter(row, col, e.key.toUpperCase());
    moveInWord(1);
  }
}

function setLetter(row, col, letter) {
  userInput[cKey(row, col)] = letter;
  if (!showAns) {
    const s = cEl(row, col)?.querySelector('.cell-letter');
    if (s) s.textContent = letter;
  }
}

function moveInWord(delta) {
  const w = activeWord();
  if (!w) return;
  const pos  = w.dir === 'across' ? activeCell.col - w.col : activeCell.row - w.row;
  const next = pos + delta;
  if (next < 0 || next >= w.word.length) return;
  activeCell = w.dir === 'across'
    ? { row: w.row, col: w.col + next }
    : { row: w.row + next, col: w.col };
  updateHighlight();
  cEl(activeCell.row, activeCell.col)?.focus();
}

function stepAdj(row, col, dr, dc) {
  const { rows, cols, grid } = puzzle;
  let r = row + dr, c = col + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    if (grid[r][c].letter) {
      activeCell = { row: r, col: c };
      if (!wordAt(r, c, activeDir)) activeDir = activeDir === 'across' ? 'down' : 'across';
      updateHighlight();
      cEl(r, c)?.focus();
      return;
    }
    r += dr; c += dc;
  }
}

function shiftWord(delta) {
  const sorted = [...puzzle.words]
    .filter(w => w.number != null)
    .sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1));
  const w   = activeWord();
  const idx = w ? sorted.findIndex(x => x.number === w.number && x.dir === w.dir) : -1;
  activateWord(sorted[(idx + delta + sorted.length) % sorted.length]);
}

// ── Answer toggle ─────────────────────────────────────────────
function toggleAnswers() {
  if (!puzzle) return;
  showAns = !showAns;
  const { grid, rows, cols } = puzzle;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell.letter) continue;
      const s = cEl(r, c)?.querySelector('.cell-letter');
      if (s) s.textContent = showAns ? cell.letter : (userInput[cKey(r, c)] || '');
    }
  }
  $('toggle-btn').textContent = showAns ? 'Hide Answers' : 'Show Answers';
}

// ── PNG export ────────────────────────────────────────────────
function exportPNG() {
  if (!puzzle) return;
  const SZ = 44;
  const { grid, rows, cols } = puzzle;
  const cv = document.createElement('canvas');
  cv.width  = cols * SZ;
  cv.height = rows * SZ;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, cv.width, cv.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { letter, number } = grid[r][c];
      const x = c * SZ, y = r * SZ;
      if (!letter) continue;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, SZ, SZ);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, SZ - 1, SZ - 1);

      if (number) {
        ctx.fillStyle = '#111';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(number, x + 2, y + 2);
      }

      const ch = showAns ? letter : (userInput[cKey(r, c)] || '');
      if (ch) {
        ctx.fillStyle = '#111';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, x + SZ / 2, y + SZ / 2 + 2);
      }
    }
  }

  const a = document.createElement('a');
  a.download = 'crossword.png';
  a.href = cv.toDataURL();
  a.click();
}

// ── Default sample ────────────────────────────────────────────
const SAMPLE =
`ALGORITHM A procedure for solving a problem step by step
CROSSWORD A word puzzle arranged in a grid
PUZZLE A problem designed to test ingenuity
GRID A network of lines forming squares
CLUE A hint used to find the answer
LETTER A character in the alphabet
ACROSS Moving horizontally through a crossword
DOWN Moving vertically through a crossword
SQUARE A shape with four equal sides
WORD A meaningful unit of language`;

const STEPN_GO_WORD_BANK = [
  { word: 'STEPN', clue: 'Move-to-earn app at the center of this community' },
  { word: 'GO', clue: 'The new social app extension in the STEPN ecosystem' },
  { word: 'GMT', clue: 'Governance token in the ecosystem' },
  { word: 'GST', clue: 'Utility token earned through movement' },
  { word: 'SNEAKER', clue: 'NFT item you equip before movement sessions' },
  { word: 'ENERGY', clue: 'Resource consumed while earning in sessions' },
  { word: 'MINT', clue: 'Action to create a new sneaker from existing ones' },
  { word: 'GEM', clue: 'Socket item that boosts sneaker attributes' },
  { word: 'SOCKET', clue: 'Slot where a gem is inserted' },
  { word: 'RESILIENCE', clue: 'Attribute linked to durability efficiency' },
  { word: 'DURABILITY', clue: 'Stat that decreases over time and needs repair' },
  { word: 'REPAIR', clue: 'Spend resources to restore sneaker condition' },
  { word: 'COMFORT', clue: 'Attribute tied to GMT earning potential' },
  { word: 'LUCK', clue: 'Attribute that influences mystery box outcomes' },
  { word: 'JOGGER', clue: 'Sneaker class tuned for medium pace' },
  { word: 'RUNNER', clue: 'Sneaker class tuned for fast pace' },
  { word: 'WALKER', clue: 'Sneaker class tuned for easy pace' },
  { word: 'TRAINER', clue: 'Sneaker class that supports wide pace range' },
  { word: 'MARATHON', clue: 'Recurring in-app challenge format' },
  { word: 'BADGE', clue: 'Profile identity marker collected in social apps' },
  { word: 'STARLET', clue: 'Reward currency used in ecosystem experiences' },
  { word: 'MARKET', clue: 'Place where items and sneakers are listed' },
  { word: 'FSL', clue: 'Core brand behind the STEPN ecosystem' },
  { word: 'MOVE', clue: 'Primary action required to earn rewards' },
  { word: 'BOOST', clue: 'Short-term increase for performance or rewards' },
  { word: 'STREAK', clue: 'Consecutive activity run tracked over days' },
  { word: 'LEADERBOARD', clue: 'Ranking table of top community members' },
];

function dateSeedUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${day}`);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(items, seed) {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function orientationCounts(words) {
  let across = 0;
  let down = 0;
  for (const w of words) {
    if (w.number == null) continue;
    if (w.dir === 'across') across++;
    if (w.dir === 'down') down++;
  }
  return { across, down };
}

function bestDailyMini() {
  const baseSeed = dateSeedUTC();
  let best = null;

  for (let i = 0; i < 80; i++) {
    const pool = shuffleDeterministic(STEPN_GO_WORD_BANK, baseSeed + i * 97);
    const selected = pool.slice(0, DAILY_WORD_TARGET);
    const result = new CrosswordGenerator().generate(selected);
    const placed = result.words.filter(w => w.number != null).length;
    const { across, down } = orientationCounts(result.words);
    const score =
      placed * 100 +
      (placed === DAILY_WORD_TARGET ? 50 : 0) +
      Math.max(0, 25 - Math.abs(across - 5) * 8 - Math.abs(down - 5) * 8);

    if (!best || score > best.score) {
      best = { selected, result, score, across, down, placed };
    }

    if (placed === DAILY_WORD_TARGET && across === 5 && down === 5) break;
  }

  return best;
}

function loadDailyMini() {
  const best = bestDailyMini();
  if (!best) return;

  $('word-input').value = best.selected
    .map(entry => `${entry.word} ${entry.clue}`)
    .join('\n');

  const d = new Date();
  const dateLabel = d.toISOString().slice(0, 10);
  const exact = best.placed === DAILY_WORD_TARGET && best.across === 5 && best.down === 5;
  $('daily-meta').textContent = exact
    ? `Daily mini loaded for ${dateLabel} (5 across / 5 down).`
    : `Daily mini loaded for ${dateLabel} (${best.across} across / ${best.down} down).`;

  generate();
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('word-input').value = SAMPLE;
  $('generate-btn').addEventListener('click', generate);
  $('daily-btn').addEventListener('click', loadDailyMini);
  $('toggle-btn').addEventListener('click', toggleAnswers);
  $('export-btn').addEventListener('click', exportPNG);
  $('print-btn').addEventListener('click', () => window.print());
  document.addEventListener('keydown', handleKey, true);
});
