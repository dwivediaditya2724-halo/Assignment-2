// ── Audio engine (subtle click/tick via Web Audio) ──────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playClick(type = 'num') {
  if (!audioCtx) return;
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'num') {
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'op') {
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.start(now); osc.stop(now + 0.07);
    } else if (type === 'eq') {
      // Two-tone confirm
      const osc2  = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);

      osc.frequency.setValueAtTime(700, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);

      osc2.frequency.setValueAtTime(1050, now + 0.07);
      gain2.gain.setValueAtTime(0.0001, now + 0.07);
      gain2.gain.linearRampToValueAtTime(0.07, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc2.start(now + 0.07); osc2.stop(now + 0.22);
    } else if (type === 'clear') {
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.start(now); osc.stop(now + 0.16);
    }
  } catch (_) {}
}

// ── State ────────────────────────────────────────────────
let current    = '0';
let prev       = null;
let operator   = null;
let justEvaled = false;
let newInput   = false;

// ── DOM refs ─────────────────────────────────────────────
const displayEl  = document.getElementById('display');
const mainEl     = document.getElementById('main');
const exprEl     = document.getElementById('expr');
const bkspBtn    = document.getElementById('bksp');
const clearBtn   = document.getElementById('clear-btn');

// ── Helpers ──────────────────────────────────────────────
function formatDisplay(raw) {
  // Add thousands commas, preserve decimal and negative
  if (raw === 'Error') return 'Error';
  const neg = raw.startsWith('-');
  const abs = neg ? raw.slice(1) : raw;
  const [intPart, decPart] = abs.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let result = neg ? '-' + intFormatted : intFormatted;
  if (decPart !== undefined) result += '.' + decPart;
  return result;
}

function formatNum(n) {
  if (isNaN(n) || !isFinite(n)) return 'Error';
  return parseFloat(n.toPrecision(12)).toString();
}

function sizeClass(s) {
  const len = s.replace(/[,.\-]/g, '').length + (s.includes('.') ? 1 : 0) + (s.includes(',') ? Math.floor((s.match(/,/g)||[]).length * 0.5) : 0);
  const raw = s.length;
  if (raw > 13) return 'tiny';
  if (raw > 9)  return 'small';
  return '';
}

function updateDisplay(val, expr = '') {
  const formatted = formatDisplay(String(val));
  mainEl.textContent = formatted;
  exprEl.textContent = expr ? formatDisplay(expr.replace(/(\d[\d,]*\.?\d*)/g, m => {
    // only format numeric tokens
    const n = m.replace(/,/g, '');
    return isNaN(n) ? m : formatDisplay(n);
  })) : '';

  // Size
  mainEl.classList.remove('small', 'tiny');
  const sc = sizeClass(formatted);
  if (sc) mainEl.classList.add(sc);

  // AC / C toggle
  const isZero = (val === '0' || val === 0) && !operator && !justEvaled;
  clearBtn.textContent = isZero ? 'AC' : 'C';

  // Backspace visibility
  const canBksp = String(val) !== '0' && !newInput && !justEvaled;
  bkspBtn.classList.toggle('visible', canBksp);

  // Typing cursor
  mainEl.classList.toggle('typing', canBksp);
}

function triggerPop() {
  mainEl.classList.remove('pop');
  void mainEl.offsetWidth;
  mainEl.classList.add('pop');
  setTimeout(() => mainEl.classList.remove('pop'), 130);
}

function flashDisplay() {
  displayEl.classList.remove('flash', 'error');
  void displayEl.offsetWidth;
  displayEl.classList.add('flash');
}

function errorDisplay() {
  displayEl.classList.remove('flash', 'error');
  void displayEl.offsetWidth;
  displayEl.classList.add('error');
}

function setActiveOp(op) {
  document.querySelectorAll('.btn-op').forEach(b => {
    b.classList.toggle('active', b.dataset.op === op);
  });
}

// ── Core calc ────────────────────────────────────────────
function doCalc(a, op, b) {
  a = parseFloat(String(a).replace(/,/g, ''));
  b = parseFloat(String(b).replace(/,/g, ''));
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? null : a / b;
  }
}

function reset() {
  current = '0'; prev = null; operator = null;
  justEvaled = false; newInput = false;
  setActiveOp(null);
}

// ── Action handlers ──────────────────────────────────────
function handleNum(val) {
  initAudio();
  if (justEvaled || newInput) {
    current = val;
    justEvaled = false;
    newInput = false;
  } else {
    if (current === '0' && val !== '.') current = val;
    else if (current.replace(/[,.\-]/g, '').length < 12) current += val;
    else return; // max digits
  }
  triggerPop();
  playClick('num');
  updateDisplay(current, operator ? `${prev} ${operator}` : '');
}

function handleDecimal() {
  initAudio();
  if (justEvaled || newInput) {
    current = '0.';
    justEvaled = false;
    newInput = false;
  } else if (!current.includes('.')) {
    current += '.';
  } else return;
  playClick('num');
  updateDisplay(current, operator ? `${prev} ${operator}` : '');
}

function handleOp(op) {
  initAudio();
  // Evaluate chain if already have op
  if (operator && !newInput) {
    const result = doCalc(prev, operator, current);
    if (result === null) { handleError(); return; }
    prev = formatNum(result);
    updateDisplay(prev, `${prev} ${op}`);
  } else {
    prev = current;
    updateDisplay(current, `${current} ${op}`);
  }
  operator = op;
  newInput = true;
  justEvaled = false;
  setActiveOp(op);
  playClick('op');
}

function handleEquals() {
  initAudio();
  if (!operator || prev === null) return;
  const result = doCalc(prev, operator, current);
  if (result === null) { handleError(); return; }
  const formatted = formatNum(result);
  flashDisplay();
  playClick('eq');
  updateDisplay(formatted, `${prev} ${operator} ${current} =`);
  current = formatted;
  prev = null;
  operator = null;
  justEvaled = true;
  newInput = false;
  setActiveOp(null);
}

function handleClear() {
  initAudio();
  // If AC: full reset. If C: clear current entry.
  if (clearBtn.textContent === 'AC' || (current === '0' && !operator)) {
    reset();
    updateDisplay('0', '');
  } else {
    current = '0';
    newInput = false;
    updateDisplay('0', operator ? `${prev} ${operator}` : '');
  }
  playClick('clear');
}

function handleSign() {
  initAudio();
  if (current === '0') return;
  current = current.startsWith('-') ? current.slice(1) : '-' + current;
  playClick('num');
  updateDisplay(current, operator ? `${prev} ${operator}` : '');
}

function handlePercent() {
  initAudio();
  const n = parseFloat(current) / 100;
  current = formatNum(n);
  playClick('num');
  updateDisplay(current, '');
}

function handleBackspace() {
  initAudio();
  if (justEvaled || newInput) return;
  if (current.length > 1) current = current.slice(0, -1);
  else current = '0';
  playClick('num');
  triggerPop();
  updateDisplay(current, operator ? `${prev} ${operator}` : '');
}

function handleError() {
  errorDisplay();
  playClick('error');
  updateDisplay('Error', '');
  setTimeout(reset, 1200);
}

// ── Ripple ───────────────────────────────────────────────
function addRipple(btn, e) {
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = (e.clientX ?? rect.left + rect.width  / 2) - rect.left - size / 2;
  const y = (e.clientY ?? rect.top  + rect.height / 2) - rect.top  - size / 2;
  const r = document.createElement('span');
  r.className = 'ripple';
  r.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

// ── Click delegation ─────────────────────────────────────
document.querySelector('.keypad').addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  addRipple(btn, e);
  dispatch(btn.dataset.action, btn.dataset.op, btn.dataset.val, e);
});

// Backspace button in display
bkspBtn.addEventListener('click', e => { e.stopPropagation(); handleBackspace(); });

function dispatch(action, op, val) {
  switch (action) {
    case 'num':     handleNum(val);     break;
    case 'op':      handleOp(op);       break;
    case 'equals':  handleEquals();     break;
    case 'clear':   handleClear();      break;
    case 'sign':    handleSign();       break;
    case 'percent': handlePercent();    break;
    case 'decimal': handleDecimal();    break;
  }
}

// ── Keyboard support ─────────────────────────────────────
const KEY_MAP = {
  '0':'0','1':'1','2':'2','3':'3','4':'4',
  '5':'5','6':'6','7':'7','8':'8','9':'9',
  '+':'+', '-':'−', '*':'×', '/':'÷',
  'Enter':'=', '=':'=',
  'Backspace':'back', 'Escape':'clear', '.':'.', ',':'.',
  'Delete':'clear', '%':'%'
};

document.addEventListener('keydown', e => {
  const k = KEY_MAP[e.key];
  if (!k) return;
  e.preventDefault();
  initAudio();

  if ('0123456789'.includes(k))          handleNum(k);
  else if (['+','−','×','÷'].includes(k)) handleOp(k);
  else if (k === '=')                     handleEquals();
  else if (k === 'clear')                 handleClear();
  else if (k === '.')                     handleDecimal();
  else if (k === '%')                     handlePercent();
  else if (k === 'back')                  handleBackspace();

  // Flash matching button
  document.querySelectorAll('.btn').forEach(btn => {
    const { action, op: bOp, val: bVal } = btn.dataset;
    const hit =
      bVal === k ||
      bOp  === k ||
      (action === 'equals'  && k === '=') ||
      (action === 'decimal' && k === '.') ||
      (action === 'percent' && k === '%') ||
      (action === 'clear'   && k === 'clear') ||
      (action === 'back'    && k === 'back');
    if (hit) {
      btn.dispatchEvent(new MouseEvent('mousedown'));
      setTimeout(() => btn.dispatchEvent(new MouseEvent('mouseup')), 80);
    }
  });
});

// ── Init ─────────────────────────────────────────────────
updateDisplay('0', '');
