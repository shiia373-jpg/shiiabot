const { createCanvas } = require('@napi-rs/canvas');
const { CROPS }        = require('./crops');
const { HOUSE_ITEMS, DEFAULT_HOUSE, MAX_FURNITURE } = require('./houseItems');
const {
  MAX_SLOTS,
  getSlotStatus,
  getGrowProgress,
  getTimeToReady,
  formatTime,
} = require('./mechanics');

// ── キャンバス定数 ──────────────────────────────────────────────────────────
const COLS        = 3;
const CELL_W      = 150;
const CELL_H      = 162;
const PAD         = 10;
const DX          = 24;   // 3D 右奥行き幅
const DY          = 16;   // 3D 上方向オフセット（右面の傾き）
const ROW_GAP     = PAD + DY + 4;  // 行間（上面が前行に被らないよう DY より大きく）
const HEADER_H    = 62;
const HOUSE_EXT_H = 274;
const HOUSE_H     = HOUSE_EXT_H;
// CANVAS_W = PAD + 3*(CELL_W+PAD) + DX + margin
const CANVAS_W    = PAD + COLS * (CELL_W + PAD) + DX + 6;  // ≈ 520

// ── カラーパレット ──────────────────────────────────────────────────────────
const SLOT_PAL = {
  empty:    { bg: '#1A1208', side: '#2E1E0C', border: '#5A3E1A', text: '#9A7040' },
  growing:  { bg: '#071307', side: '#0E2210', border: '#2E6018', text: '#60C040' },
  optimal:  { bg: '#141000', side: '#241C00', border: '#D4A800', text: '#FFD700' },
  ready:    { bg: '#081508', side: '#0E2210', border: '#48A848', text: '#80D880' },
  overripe: { bg: '#180600', side: '#2C0E00', border: '#C04800', text: '#FF6820' },
  locked:   { bg: '#080808', side: '#121212', border: '#1E1E1E', text: '#2E2E2E' },
};

// ── ユーティリティ ──────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function lighten(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amount);
  const g = Math.min(255, ((n >>  8) & 255) + amount);
  const b = Math.min(255, ( n        & 255) + amount);
  return `rgb(${r},${g},${b})`;
}
function darken(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, ((n >> 16) & 255) - amount);
  const g = Math.max(0, ((n >>  8) & 255) - amount);
  const b = Math.max(0, ( n        & 255) - amount);
  return `rgb(${r},${g},${b})`;
}

// ── プログレスバー ──────────────────────────────────────────────────────────
function drawProgressBar(ctx, x, y, w, h, progress) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#050505';
  ctx.fill();
  if (progress > 0) {
    const grad = ctx.createLinearGradient(x, y, x + w * progress, y);
    grad.addColorStop(0, '#1A6008');
    grad.addColorStop(1, '#60C020');
    roundRect(ctx, x, y, Math.max(h, w * progress), h, h / 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.fillStyle = '#FFFFFFCC';
  ctx.font = `bold ${h}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.floor(progress * 100)}%`, x + w / 2, y + h - 1);
}

// ── 作物アイコン描画 ─────────────────────────────────────────────────────────
// cropId: CROPS のキー / cx,cy: 中心座標 / r: 半径
// shadowColor/shadowBlur: グロー設定（save/restore 内で適用）
function drawCropIcon(ctx, cropId, cx, cy, r, shadowColor = null, shadowBlur = 0) {
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  if (shadowColor) { ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur; }

  // ── 小麦 ─────────────────────────────────────────────────────────────────
  if (cropId === 'wheat') {
    for (let s = 0; s < 3; s++) {
      const ox = (s - 1) * r * 0.30, tilt = (s - 1) * 0.20;
      const tipX = cx + ox + tilt * r, tipY = cy - r * 0.80;
      ctx.strokeStyle = '#D4A830'; ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + r * 0.90);
      ctx.quadraticCurveTo(cx + ox, cy + r * 0.10, tipX, tipY);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const py = tipY + k * r * 0.20;
        for (const side of [-1, 1]) {
          ctx.fillStyle = k < 2 ? '#F0D050' : '#C89020';
          ctx.beginPath();
          ctx.ellipse(tipX + side * r * 0.11, py, r * 0.08, r * 0.13, side * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#F0D878'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY); ctx.lineTo(tipX, tipY - r * 0.38); ctx.stroke();
    }
  }

  // ── にんじん ───────────────────────────────────────────────────────────────
  else if (cropId === 'carrot') {
    for (const [lox, loy, ctrl] of [[-0.30, -0.92, -0.50], [0, -1.02, 0], [0.30, -0.92, 0.50]]) {
      ctx.strokeStyle = lox === 0 ? '#3CC840' : '#28A030';
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.60);
      ctx.quadraticCurveTo(cx + ctrl * r * 0.5, cy + loy * r * 0.4 + r * 0.2, cx + lox * r, cy + loy * r);
      ctx.stroke();
    }
    const cg = ctx.createLinearGradient(cx - r * 0.45, cy - r * 0.5, cx + r * 0.3, cy + r * 0.8);
    cg.addColorStop(0, '#FF8A45'); cg.addColorStop(1, '#D04010');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.90);
    ctx.bezierCurveTo(cx - r * 0.42, cy + r * 0.30, cx - r * 0.40, cy - r * 0.45, cx - r * 0.05, cy - r * 0.60);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.60);
    ctx.bezierCurveTo(cx + r * 0.40, cy - r * 0.45, cx + r * 0.42, cy + r * 0.30, cx, cy + r * 0.90);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,60,0,0.30)'; ctx.lineWidth = 0.7;
    for (const ry of [-0.08, 0.22, 0.52]) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.28, cy + ry * r); ctx.lineTo(cx + r * 0.28, cy + ry * r); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,100,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.10, cy + r * 0.05, r * 0.07, r * 0.35, -0.2, 0, Math.PI * 2); ctx.fill();
  }

  // ── じゃがいも ──────────────────────────────────────────────────────────────
  else if (cropId === 'potato') {
    const pg = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.15, r * 0.05, cx, cy, r * 0.82);
    pg.addColorStop(0, '#DBAF78'); pg.addColorStop(1, '#7A5230');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy + r * 0.12);
    ctx.bezierCurveTo(cx - r * 0.75, cy - r * 0.42, cx - r * 0.35, cy - r * 0.65, cx + r * 0.05, cy - r * 0.62);
    ctx.bezierCurveTo(cx + r * 0.55, cy - r * 0.58, cx + r * 0.78, cy - r * 0.18, cx + r * 0.72, cy + r * 0.30);
    ctx.bezierCurveTo(cx + r * 0.65, cy + r * 0.65, cx - r * 0.30, cy + r * 0.72, cx - r * 0.55, cy + r * 0.55);
    ctx.bezierCurveTo(cx - r * 0.75, cy + r * 0.42, cx - r * 0.70, cy + r * 0.30, cx - r * 0.72, cy + r * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4A2A10';
    for (const [ox, oy] of [[-0.22, -0.08], [0.25, 0.18], [-0.05, 0.32], [0.38, -0.22]]) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * r, cy + oy * r, r * 0.055, r * 0.045, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5A6030'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + ox * r, cy + oy * r - r * 0.04);
      ctx.lineTo(cx + ox * r + r * 0.04, cy + oy * r - r * 0.12); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.22, cy - r * 0.25, r * 0.24, r * 0.13, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  // ── トマト ─────────────────────────────────────────────────────────────────
  else if (cropId === 'tomato') {
    const tg = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.20, r * 0.05, cx, cy + r * 0.08, r * 0.78);
    tg.addColorStop(0, '#FF6050'); tg.addColorStop(0.7, '#E82020'); tg.addColorStop(1, '#A01010');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#30A040';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save(); ctx.translate(cx, cy - r * 0.62); ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.20, r * 0.08, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = '#2A8830'; ctx.lineWidth = r * 0.10;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.62); ctx.lineTo(cx + r * 0.12, cy - r * 0.92); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.22, cy - r * 0.18, r * 0.20, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
  }

  // ── キャベツ ───────────────────────────────────────────────────────────────
  else if (cropId === 'cabbage') {
    const leafColors = ['#5AB840', '#3A9828', '#2A8020', '#3A9828', '#5AB840'];
    const angles = [-0.8, -0.3, 0.2, 0.7, 1.2].map(a => a * Math.PI);
    for (let i = 4; i >= 0; i--) {
      ctx.fillStyle = leafColors[i];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angles[i]);
      ctx.beginPath();
      ctx.ellipse(0, -r * (0.15 + i * 0.08), r * (0.55 + i * 0.08), r * (0.38 + i * 0.05), 0, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#D8EEC8';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#B8D8A0';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2); ctx.fill();
  }

  // ── とうもろこし ────────────────────────────────────────────────────────────
  else if (cropId === 'corn') {
    ctx.fillStyle = '#3A8820';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.90);
      ctx.bezierCurveTo(cx + side * r * 0.55, cy + r * 0.30, cx + side * r * 0.65, cy - r * 0.20, cx + side * r * 0.18, cy - r * 0.45);
      ctx.bezierCurveTo(cx + side * r * 0.28, cy - r * 0.10, cx + side * r * 0.22, cy + r * 0.50, cx, cy + r * 0.90);
      ctx.fill();
    }
    const cg = ctx.createLinearGradient(cx - r * 0.38, cy - r * 0.85, cx + r * 0.38, cy + r * 0.45);
    cg.addColorStop(0, '#F8E040'); cg.addColorStop(1, '#C89010');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.22, r * 0.30, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    for (let ri = 0; ri < 6; ri++) {
      for (let ci = 0; ci < 4; ci++) {
        const kx = cx + (ci - 1.5) * r * 0.13, ky = cy - r * 0.72 + ri * r * 0.22;
        const dx = (kx - cx) / (r * 0.28), dy = (ky - (cy - r * 0.22)) / (r * 0.60);
        if (dx * dx + dy * dy > 0.82) continue;
        ctx.fillStyle = ri % 2 === 0 ? '#F8D830' : '#D89810';
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 0.055, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#C89840'; ctx.lineWidth = 0.7;
    for (let h = -2; h <= 2; h++) {
      ctx.beginPath();
      ctx.moveTo(cx + h * r * 0.07, cy - r * 0.82);
      ctx.lineTo(cx + h * r * 0.07 + h * r * 0.04, cy - r * 1.02); ctx.stroke();
    }
  }

  // ── ナス ───────────────────────────────────────────────────────────────────
  else if (cropId === 'eggplant') {
    const eg = ctx.createRadialGradient(cx - r * 0.20, cy - r * 0.10, r * 0.08, cx + r * 0.10, cy + r * 0.30, r * 0.88);
    eg.addColorStop(0, '#9040C0'); eg.addColorStop(1, '#3A006A');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.60);
    ctx.bezierCurveTo(cx + r * 0.55, cy - r * 0.58, cx + r * 0.72, cy + r * 0.15, cx + r * 0.65, cy + r * 0.55);
    ctx.bezierCurveTo(cx + r * 0.55, cy + r * 0.90, cx - r * 0.55, cy + r * 0.90, cx - r * 0.65, cy + r * 0.55);
    ctx.bezierCurveTo(cx - r * 0.72, cy + r * 0.15, cx - r * 0.55, cy - r * 0.58, cx, cy - r * 0.60);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2A8030';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4 - 0.125) * Math.PI * 2;
      ctx.save(); ctx.translate(cx, cy - r * 0.60); ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.18, r * 0.07, r * 0.20, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = '#3A9040'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.60); ctx.lineTo(cx + r * 0.08, cy - r * 0.95); ctx.stroke();
    ctx.fillStyle = 'rgba(180,80,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.20, cy - r * 0.05, r * 0.15, r * 0.38, -0.25, 0, Math.PI * 2); ctx.fill();
  }

  // ── ピーマン ───────────────────────────────────────────────────────────────
  else if (cropId === 'pepper') {
    const pBase = cy + r * 0.45;
    const pg = ctx.createRadialGradient(cx - r * 0.18, cy, r * 0.05, cx, cy + r * 0.10, r * 0.80);
    pg.addColorStop(0, '#60C040'); pg.addColorStop(1, '#1A6010');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.58);
    ctx.bezierCurveTo(cx - r * 0.68, cy - r * 0.55, cx - r * 0.75, cy + r * 0.40, cx - r * 0.50, pBase);
    ctx.bezierCurveTo(cx - r * 0.20, pBase + r * 0.12, cx - r * 0.05, pBase + r * 0.05, cx, pBase);
    ctx.bezierCurveTo(cx + r * 0.05, pBase + r * 0.05, cx + r * 0.20, pBase + r * 0.12, cx + r * 0.50, pBase);
    ctx.bezierCurveTo(cx + r * 0.75, cy + r * 0.40, cx + r * 0.68, cy - r * 0.55, cx, cy - r * 0.58);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,60,10,0.40)'; ctx.lineWidth = 1.0;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.52); ctx.lineTo(cx, pBase); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.32, cy - r * 0.28);
    ctx.bezierCurveTo(cx - r * 0.40, cy + r * 0.10, cx - r * 0.38, cy + r * 0.36, cx - r * 0.24, pBase + r * 0.04);
    ctx.moveTo(cx + r * 0.32, cy - r * 0.28);
    ctx.bezierCurveTo(cx + r * 0.40, cy + r * 0.10, cx + r * 0.38, cy + r * 0.36, cx + r * 0.24, pBase + r * 0.04);
    ctx.stroke();
    ctx.fillStyle = '#2A7020';
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.58, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A8030'; ctx.lineWidth = r * 0.10;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.58); ctx.lineTo(cx + r * 0.08, cy - r * 0.92); ctx.stroke();
    ctx.fillStyle = 'rgba(200,255,150,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.18, cy - r * 0.18, r * 0.14, r * 0.28, -0.2, 0, Math.PI * 2); ctx.fill();
  }

  // ── かぼちゃ ───────────────────────────────────────────────────────────────
  else if (cropId === 'pumpkin') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      const lx = cx + Math.cos(a) * r * 0.28, ly = cy + r * 0.08 + Math.sin(a) * r * 0.30;
      const gr = ctx.createRadialGradient(lx - r * 0.05, ly - r * 0.08, 0, lx, ly, r * 0.42);
      gr.addColorStop(0, '#FFA020'); gr.addColorStop(1, '#C06000');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.36, r * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    }
    const cg2 = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, r * 0.05, cx, cy + r * 0.08, r * 0.25);
    cg2.addColorStop(0, '#FFB030'); cg2.addColorStop(1, '#C06008');
    ctx.fillStyle = cg2;
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.08, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3A7010'; ctx.lineWidth = r * 0.10;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.60);
    ctx.bezierCurveTo(cx + r * 0.15, cy - r * 0.72, cx + r * 0.08, cy - r * 0.85, cx, cy - r * 0.90);
    ctx.stroke();
    ctx.fillStyle = '#408020';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.22, cy - r * 0.75, r * 0.16, r * 0.08, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,100,0.22)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      const lx = cx + Math.cos(a) * r * 0.28, ly = cy + r * 0.08 + Math.sin(a) * r * 0.30;
      ctx.beginPath();
      ctx.ellipse(lx - r * 0.08, ly - r * 0.12, r * 0.10, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── メロン ─────────────────────────────────────────────────────────────────
  else if (cropId === 'melon') {
    const mg = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, r * 0.05, cx, cy, r * 0.82);
    mg.addColorStop(0, '#C8E878'); mg.addColorStop(0.7, '#88CC30'); mg.addColorStop(1, '#508818');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.80, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,200,0.35)'; ctx.lineWidth = 0.8;
    for (let n = -3; n <= 3; n++) {
      ctx.beginPath();
      ctx.moveTo(cx + n * r * 0.22, cy - r * 0.72);
      ctx.bezierCurveTo(cx + n * r * 0.22 + r * 0.05, cy - r * 0.30, cx + n * r * 0.22 - r * 0.05, cy + r * 0.30, cx + n * r * 0.22, cy + r * 0.72);
      ctx.stroke();
    }
    for (let n = -2; n <= 2; n++) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.80, cy + n * r * 0.25);
      ctx.bezierCurveTo(cx - r * 0.30, cy + n * r * 0.25 + r * 0.05, cx + r * 0.30, cy + n * r * 0.25 - r * 0.05, cx + r * 0.80, cy + n * r * 0.25);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3A7820'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.72); ctx.lineTo(cx + r * 0.12, cy - r * 0.95); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.22, cy - r * 0.25, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  }

  // ── パイナップル ────────────────────────────────────────────────────────────
  else if (cropId === 'pineapple') {
    const pig = ctx.createRadialGradient(cx - r * 0.15, cy + r * 0.05, r * 0.05, cx, cy + r * 0.15, r * 0.70);
    pig.addColorStop(0, '#FFD840'); pig.addColorStop(1, '#B07808');
    ctx.fillStyle = pig;
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.10, r * 0.50, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,80,0,0.40)'; ctx.lineWidth = 0.8;
    for (let n = -3; n <= 3; n++) {
      ctx.beginPath();
      ctx.moveTo(cx + n * r * 0.18 - r * 0.50, cy + r * 0.10 - r * 0.72);
      ctx.lineTo(cx + n * r * 0.18 + r * 0.50, cy + r * 0.10 + r * 0.72); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - n * r * 0.18 + r * 0.50, cy + r * 0.10 - r * 0.72);
      ctx.lineTo(cx - n * r * 0.18 - r * 0.50, cy + r * 0.10 + r * 0.72); ctx.stroke();
    }
    // 王冠
    const crownY = cy - r * 0.60;
    const leafDat = [[-0.30, -0.95, -0.50], [-0.12, -1.05, -0.18], [0.12, -1.05, 0.18], [0.30, -0.95, 0.50], [0, -0.98, 0]];
    for (const [lx, ly, ctrl] of leafDat) {
      ctx.fillStyle = lx === 0 ? '#3CC848' : '#228832';
      ctx.beginPath();
      ctx.moveTo(cx, crownY + r * 0.05);
      ctx.bezierCurveTo(cx + ctrl * r * 0.30, crownY + ly * r * 0.40, cx + lx * r * 0.60, crownY + ly * r * 0.65, cx + lx * r, crownY + ly * r);
      ctx.bezierCurveTo(cx + lx * r * 0.55, crownY + ly * r * 0.60, cx + ctrl * r * 0.20, crownY + ly * r * 0.35, cx, crownY + r * 0.05);
      ctx.fill();
    }
    ctx.fillStyle = '#3A9840';
    ctx.beginPath(); ctx.arc(cx, crownY + r * 0.05, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  // ── ドラゴンフルーツ ─────────────────────────────────────────────────────────
  else if (cropId === 'dragonfruit') {
    const dfg = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.12, r * 0.05, cx, cy, r * 0.82);
    dfg.addColorStop(0, '#FF88C0'); dfg.addColorStop(0.75, '#E01878'); dfg.addColorStop(1, '#900838');
    ctx.fillStyle = dfg;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.72, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sx = cx + Math.cos(a) * r * 0.72, sy = cy + Math.sin(a) * r * 0.82;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.fillStyle = i % 3 === 0 ? '#3CB840' : '#28A030';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-r * 0.10, -r * 0.04, -r * 0.12, -r * 0.22, 0, -r * 0.26);
      ctx.bezierCurveTo(r * 0.12, -r * 0.22, r * 0.10, -r * 0.04, 0, 0);
      ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,240,250,0.15)';
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.40, r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,0,20,0.55)';
    for (const [ox, oy] of [[-0.18, -0.20], [0.22, -0.10], [-0.05, 0.18], [0.18, 0.22], [-0.24, 0.10]]) {
      ctx.beginPath(); ctx.arc(cx + ox * r, cy + oy * r, r * 0.04, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,200,230,0.30)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.22, cy - r * 0.28, r * 0.20, r * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  // ── 黄金作物 ───────────────────────────────────────────────────────────────
  else if (cropId === 'golden') {
    const oR = r * 0.72, iR = r * 0.32, pts = 8;
    const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, oR * 1.4);
    gg.addColorStop(0, 'rgba(255,220,50,0.55)'); gg.addColorStop(1, 'rgba(255,180,0,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(cx, cy, oR * 1.4, 0, Math.PI * 2); ctx.fill();
    const sg = ctx.createRadialGradient(cx - oR * 0.2, cy - oR * 0.2, 0, cx, cy, oR);
    sg.addColorStop(0, '#FFF068'); sg.addColorStop(0.5, '#FFD020'); sg.addColorStop(1, '#C08000');
    ctx.fillStyle = sg;
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI * 0.5;
      const rad = i % 2 === 0 ? oR : iR;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#FFFFC0'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * oR * 1.1, cy + Math.sin(a) * oR * 1.1);
      ctx.lineTo(cx + Math.cos(a) * oR * 1.5, cy + Math.sin(a) * oR * 1.5);
      ctx.moveTo(cx - Math.cos(a) * oR * 1.1, cy - Math.sin(a) * oR * 1.1);
      ctx.lineTo(cx - Math.cos(a) * oR * 1.5, cy - Math.sin(a) * oR * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

// ── 鍵アイコン描画（LOCKEDスロット用）────────────────────────────────────────
function drawLockIcon(ctx, cx, cy, r, color) {
  ctx.save();
  // 鍵穴の本体（丸）
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.18, r * 0.52, 0, Math.PI * 2); ctx.fill();
  // シャックル（弧）
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.12, r * 0.34, Math.PI, 0); ctx.stroke();
  // 鍵穴
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.12, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(cx - r * 0.07, cy + r * 0.10, r * 0.14, r * 0.32);
  ctx.restore();
}

// ── 芽アイコン描画（空きスロット用）──────────────────────────────────────────
function drawSproutIcon(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.lineCap = 'round';
  // 茎
  ctx.strokeStyle = '#508830'; ctx.lineWidth = r * 0.14;
  ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.60); ctx.lineTo(cx, cy - r * 0.10); ctx.stroke();
  // 左葉
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.10);
  ctx.bezierCurveTo(cx - r * 0.55, cy - r * 0.15, cx - r * 0.60, cy - r * 0.70, cx - r * 0.08, cy - r * 0.80);
  ctx.bezierCurveTo(cx - r * 0.08, cy - r * 0.40, cx, cy - r * 0.10, cx, cy + r * 0.10);
  ctx.fill();
  // 右葉（少し小さめ）
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.05);
  ctx.bezierCurveTo(cx + r * 0.50, cy - r * 0.20, cx + r * 0.55, cy - r * 0.65, cx + r * 0.06, cy - r * 0.72);
  ctx.bezierCurveTo(cx + r * 0.06, cy - r * 0.35, cx, cy - r * 0.08, cx, cy - r * 0.05);
  ctx.fill();
  ctx.restore();
}

// ── 3D スロット描画 ──────────────────────────────────────────────────────────
function drawSlot(ctx, slot, index, unlockedCount) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x   = PAD + col * (CELL_W + PAD);
  const y   = HEADER_H + HOUSE_H + PAD + DY + row * (CELL_H + ROW_GAP);
  const cx  = x + CELL_W / 2;

  const isLocked = index >= unlockedCount;
  const status   = isLocked ? 'locked' : getSlotStatus(slot);
  const pal      = SLOT_PAL[status];

  // ── 上面（トップフェイス）──
  const tfGrad = ctx.createLinearGradient(x, y, x + DX, y - DY);
  tfGrad.addColorStop(0, hexAlpha(pal.border, 0.38));
  tfGrad.addColorStop(1, hexAlpha(pal.border, 0.18));
  ctx.beginPath();
  ctx.moveTo(x,            y);
  ctx.lineTo(x + CELL_W,   y);
  ctx.lineTo(x + CELL_W + DX, y - DY);
  ctx.lineTo(x + DX,       y - DY);
  ctx.closePath();
  ctx.fillStyle = tfGrad;
  ctx.fill();
  ctx.strokeStyle = hexAlpha(pal.border, 0.45);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // ── 右側面（ライトフェイス）──
  const rfGrad = ctx.createLinearGradient(x + CELL_W, y, x + CELL_W + DX, y - DY);
  rfGrad.addColorStop(0, pal.side);
  rfGrad.addColorStop(1, hexAlpha(pal.border, 0.22));
  ctx.beginPath();
  ctx.moveTo(x + CELL_W,        y);
  ctx.lineTo(x + CELL_W + DX,   y - DY);
  ctx.lineTo(x + CELL_W + DX,   y + CELL_H - DY);
  ctx.lineTo(x + CELL_W,        y + CELL_H);
  ctx.closePath();
  ctx.fillStyle = rfGrad;
  ctx.fill();
  ctx.strokeStyle = hexAlpha(pal.border, 0.42);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // ── メイン面（正面）──
  if (status === 'optimal') {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 30;
  } else if (status === 'ready') {
    ctx.shadowColor = '#48A848';
    ctx.shadowBlur  = 20;
  } else if (status === 'overripe') {
    ctx.shadowColor = '#C04800';
    ctx.shadowBlur  = 16;
  }

  roundRect(ctx, x, y, CELL_W, CELL_H, 9);
  ctx.fillStyle = pal.bg;
  ctx.fill();

  // 光沢グラデーション（上部ハイライト）
  const gloss = ctx.createLinearGradient(x, y, x, y + CELL_H * 0.42);
  gloss.addColorStop(0, 'rgba(255,255,255,0.09)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, x, y, CELL_W, CELL_H, 9);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.strokeStyle = pal.border;
  ctx.lineWidth   = (status === 'optimal' || status === 'ready') ? 2.5 : 1.8;
  roundRect(ctx, x, y, CELL_W, CELL_H, 9);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // スロット番号（左上）
  ctx.fillStyle    = 'rgba(255,255,255,0.28)';
  ctx.font         = 'bold 10px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`#${index + 1}`, x + 7, y + 14);

  // ── LOCKED ──
  if (isLocked) {
    drawLockIcon(ctx, cx, y + CELL_H / 2 - 14, 18, pal.text);
    ctx.font      = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pal.text;
    ctx.fillText('LOCKED', cx, y + CELL_H / 2 + 20);
    return;
  }

  // ── 空きスロット ──
  if (status === 'empty') {
    // 土テクスチャ
    const soilGrad = ctx.createLinearGradient(x + 14, y + 30, x + 14, y + CELL_H - 22);
    soilGrad.addColorStop(0, 'rgba(56,32,10,0.55)');
    soilGrad.addColorStop(1, 'rgba(38,18,5,0.7)');
    roundRect(ctx, x + 14, y + 30, CELL_W - 28, CELL_H - 62, 6);
    ctx.fillStyle = soilGrad;
    ctx.fill();
    for (let sl = y + 44; sl < y + CELL_H - 30; sl += 10) {
      ctx.strokeStyle = 'rgba(90,55,18,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 18, sl); ctx.lineTo(x + CELL_W - 18, sl);
      ctx.stroke();
    }
    drawSproutIcon(ctx, cx, y + CELL_H / 2 - 14, 20, pal.text);
    ctx.textBaseline = 'alphabetic';
    ctx.font         = '12px sans-serif';
    ctx.textAlign    = 'center';
    ctx.fillStyle    = pal.text;
    ctx.fillText('空きスロット', cx, y + CELL_H / 2 + 22);
    return;
  }

  const crop = CROPS[slot.crop];

  // 状態バッジ（右上）
  const badges = { optimal: '⭐ BEST！', ready: '✅ 収穫OK', overripe: '⚠ 過熟！', growing: '🌱 育成中' };
  if (badges[status]) {
    ctx.font         = 'bold 9px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = pal.text;
    ctx.fillText(badges[status], x + CELL_W - 6, y + 13);
  }

  // 土壌帯（下部）
  const soilGrad = ctx.createLinearGradient(x, y + CELL_H - 28, x, y + CELL_H - 6);
  soilGrad.addColorStop(0, 'rgba(70,44,16,0)');
  soilGrad.addColorStop(1, 'rgba(55,32,8,0.55)');
  ctx.fillStyle = soilGrad;
  ctx.fillRect(x + 2, y + CELL_H - 28, CELL_W - 4, 22);

  // 仕切りライン
  ctx.strokeStyle = hexAlpha(pal.border, 0.28);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + CELL_H - 30);
  ctx.lineTo(x + CELL_W - 10, y + CELL_H - 30);
  ctx.stroke();

  // ── 作物アイコン（大・グロー付き）──
  {
    const glow = status === 'optimal' ? 22 : status === 'growing' ? 10 : 14;
    drawCropIcon(ctx, slot.crop, cx, y + CELL_H / 2 - 18, 26, crop.color, glow);
  }
  ctx.textBaseline = 'alphabetic';

  // 作物名
  ctx.fillStyle = '#FFFFFF';
  ctx.font      = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(crop.name, cx, y + CELL_H - 40);

  // 育成中
  if (status === 'growing') {
    const progress  = getGrowProgress(slot);
    const remaining = getTimeToReady(slot);
    ctx.fillStyle = SLOT_PAL.growing.text;
    ctx.font      = '10px sans-serif';
    ctx.fillText(`あと ${formatTime(remaining)}`, cx, y + CELL_H - 28);
    drawProgressBar(ctx, x + 8, y + CELL_H - 22, CELL_W - 16, 12, progress);
  } else {
    ctx.fillStyle = '#FFD70090';
    ctx.font      = '11px sans-serif';
    ctx.fillText(`売値 ${crop.sell} G～`, cx, y + CELL_H - 10);
  }
}

// ── 窓描画 ──────────────────────────────────────────────────────────────────
function drawWindow(ctx, wx, wy, ww, wh, wallpaperColor, floorColor) {
  // 外枠（木製）
  ctx.fillStyle = '#1A0E06';
  roundRect(ctx, wx - 3, wy - 3, ww + 6, wh + 6, 3);
  ctx.fill();
  // 壁紙上部 / 床下部
  ctx.fillStyle = wallpaperColor;
  ctx.fillRect(wx, wy, ww, wh * 0.6);
  ctx.fillStyle = floorColor;
  ctx.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4);
  // ガラス光沢
  ctx.fillStyle = 'rgba(180,220,255,0.14)';
  ctx.fillRect(wx, wy, ww, wh);
  // 十字桟
  ctx.fillStyle = '#1A0E0888';
  ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
  ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
}

// ── 家の描画 ────────────────────────────────────────────────────────────────
function drawHouse(ctx, house, startY) {
  if (!house) house = { ...DEFAULT_HOUSE };
  const items = HOUSE_ITEMS;

  const wallItem  = items[house.wall]      || items.wall_wood;
  const roofItem  = items[house.roof]      || items.roof_straw;
  const doorItem  = items[house.door]      || items.door_wood;
  const floorItem = items[house.floor]     || items.floor_dirt;
  const wpItem    = items[house.wallpaper] || items.wp_plain;

  const cx     = CANVAS_W / 2;
  const WALL_W = 228;
  const WALL_H = 112;
  const ROOF_H = 96;
  const FND_H  = 16;
  const WD     = 30;   // 右壁奥行き幅
  const WDY    = 20;   // 右壁奥行きの上方オフセット

  const wallX     = cx - WALL_W / 2;
  const wallY     = startY + ROOF_H + 12;
  const fndY      = wallY + WALL_H;
  const roofPeakX = cx;
  const roofPeakY = startY + 10;

  // ── 地面影（楕円）──
  const shadowGrad = ctx.createRadialGradient(cx, fndY + FND_H + 6, 10, cx, fndY + FND_H + 6, 140);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.40)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(cx, fndY + FND_H + 6, 140, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 庭 ──
  drawGarden(ctx, house.garden, cx, fndY + FND_H);

  // ── 基礎（3D ボックス）──
  // 基礎右面
  ctx.fillStyle = '#261608';
  ctx.beginPath();
  ctx.moveTo(wallX + WALL_W + 12,      fndY);
  ctx.lineTo(wallX + WALL_W + 12 + WD, fndY - WDY * 0.55);
  ctx.lineTo(wallX + WALL_W + 12 + WD, fndY + FND_H - WDY * 0.55);
  ctx.lineTo(wallX + WALL_W + 12,      fndY + FND_H);
  ctx.fill();
  // 基礎上面
  ctx.fillStyle = '#3A2818';
  ctx.beginPath();
  ctx.moveTo(wallX - 12,                fndY);
  ctx.lineTo(wallX + WALL_W + 12,       fndY);
  ctx.lineTo(wallX + WALL_W + 12 + WD,  fndY - WDY * 0.55);
  ctx.lineTo(wallX - 12 + WD,           fndY - WDY * 0.55);
  ctx.closePath();
  ctx.fill();
  // 基礎正面
  const fndGrad = ctx.createLinearGradient(0, fndY, 0, fndY + FND_H);
  fndGrad.addColorStop(0, '#4A3220');
  fndGrad.addColorStop(1, '#2A1A0C');
  ctx.fillStyle = fndGrad;
  ctx.fillRect(wallX - 12, fndY, WALL_W + 24, FND_H);

  // ── 右側壁（3D）──
  const rwGrad = ctx.createLinearGradient(wallX + WALL_W, wallY, wallX + WALL_W + WD, wallY - WDY);
  rwGrad.addColorStop(0, hexAlpha(wallItem.accent, 0.9));
  rwGrad.addColorStop(1, hexAlpha(wallItem.accent, 0.5));
  ctx.beginPath();
  ctx.moveTo(wallX + WALL_W,       wallY);
  ctx.lineTo(wallX + WALL_W + WD,  wallY - WDY);
  ctx.lineTo(wallX + WALL_W + WD,  fndY - WDY);
  ctx.lineTo(wallX + WALL_W,       fndY);
  ctx.closePath();
  ctx.fillStyle = rwGrad;
  ctx.fill();
  ctx.strokeStyle = hexAlpha(wallItem.accent, 0.3);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 右側壁の小窓
  {
    const rwcx = wallX + WALL_W + WD * 0.5;
    const rwwy = wallY + 22;
    const rwwW = WD * 0.55, rwwH = 22;
    ctx.fillStyle = '#1A0E06';
    ctx.fillRect(rwcx - rwwW / 2 - 2, rwwy - 2, rwwW + 4, rwwH + 4);
    ctx.fillStyle = hexAlpha(wpItem.color, 0.5);
    ctx.fillRect(rwcx - rwwW / 2, rwwy, rwwW, rwwH * 0.6);
    ctx.fillStyle = hexAlpha(floorItem.color, 0.5);
    ctx.fillRect(rwcx - rwwW / 2, rwwy + rwwH * 0.6, rwwW, rwwH * 0.4);
    ctx.fillStyle = 'rgba(180,220,255,0.1)';
    ctx.fillRect(rwcx - rwwW / 2, rwwy, rwwW, rwwH);
  }

  // ── 壁（正面）──
  ctx.fillStyle = wallItem.color;
  ctx.fillRect(wallX, wallY, WALL_W, WALL_H);

  // レンガパターン（brick のみ）
  if (house.wall === 'wall_brick') {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth   = 0.8;
    for (let ry = wallY + 12; ry < fndY; ry += 12) {
      ctx.beginPath(); ctx.moveTo(wallX, ry); ctx.lineTo(wallX + WALL_W, ry); ctx.stroke();
    }
    for (let rx = wallX + 6; rx < wallX + WALL_W; rx += 24) {
      ctx.beginPath(); ctx.moveTo(rx, wallY); ctx.lineTo(rx, fndY); ctx.stroke();
    }
  }

  // ヤミー壁：オーロラカーテン＋星座パターン
  if (house.wall === 'wall_yamii') {
    ctx.save();
    ctx.rect(wallX, wallY, WALL_W, WALL_H);
    ctx.clip();
    // オーロラカーテン（縦方向のグラデーション帯）
    const auroraBands = [
      { x: wallX + 20,  col1: 'rgba(80,200,255,0.22)',  col2: 'rgba(80,200,255,0)' },
      { x: wallX + 70,  col1: 'rgba(160,80,255,0.18)', col2: 'rgba(160,80,255,0)' },
      { x: wallX + 125, col1: 'rgba(80,255,180,0.20)', col2: 'rgba(80,255,180,0)' },
      { x: wallX + 175, col1: 'rgba(255,160,80,0.15)', col2: 'rgba(255,160,80,0)' },
      { x: wallX + 215, col1: 'rgba(80,180,255,0.18)', col2: 'rgba(80,180,255,0)' },
    ];
    auroraBands.forEach(ab => {
      const ag = ctx.createLinearGradient(ab.x - 18, wallY, ab.x + 18, wallY);
      ag.addColorStop(0, ab.col2); ag.addColorStop(0.5, ab.col1); ag.addColorStop(1, ab.col2);
      ctx.fillStyle = ag;
      ctx.fillRect(ab.x - 18, wallY, 36, WALL_H);
    });
    // 星座ドット（輝く星）
    const starDots = [
      [wallX+22, wallY+18], [wallX+58, wallY+12], [wallX+98, wallY+20], [wallX+140, wallY+10],
      [wallX+178, wallY+16], [wallX+214, wallY+22], [wallX+38, wallY+62], [wallX+78, wallY+55],
      [wallX+118, wallY+68], [wallX+158, wallY+58], [wallX+196, wallY+66], [wallX+48, wallY+38],
      [wallX+90, wallY+42], [wallX+132, wallY+36], [wallX+170, wallY+44], [wallX+10, wallY+44],
    ];
    // 星座ライン
    ctx.strokeStyle = 'rgba(200,220,255,0.20)'; ctx.lineWidth = 0.8;
    [[0,1],[1,2],[2,3],[3,4],[4,5],[6,7],[7,8],[8,9],[9,10],[11,12],[12,13],[13,14],[0,11],[5,14]].forEach(([a,b]) => {
      ctx.beginPath(); ctx.moveTo(starDots[a][0], starDots[a][1]); ctx.lineTo(starDots[b][0], starDots[b][1]); ctx.stroke();
    });
    // 星ドット描画
    starDots.forEach(([sx, sy], i) => {
      const sz = i % 3 === 0 ? 2.2 : 1.4;
      const sCol = i % 4 === 0 ? 'rgba(255,240,160,0.90)' : i % 4 === 1 ? 'rgba(160,200,255,0.85)' : i % 4 === 2 ? 'rgba(200,160,255,0.85)' : 'rgba(160,255,200,0.80)';
      ctx.save();
      ctx.shadowColor = sCol; ctx.shadowBlur = 5;
      ctx.fillStyle = sCol;
      ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    // 半透明ヤミーシルエット（大きめ・輝く）
    const ghostPos2 = [
      { x: wallX + 42, y: wallY + 36, s: 1.0 }, { x: wallX + 118, y: wallY + 30, s: 0.90 },
      { x: wallX + 192, y: wallY + 38, s: 0.95 },
    ];
    ghostPos2.forEach(gp => {
      ctx.save();
      ctx.globalAlpha = 0.22;
      drawYamii(ctx, gp.x, gp.y, 14 * gp.s, 0.0);
      ctx.restore();
    });
    ctx.restore();
  }

  // 壁右端シャドウ
  const wsh = ctx.createLinearGradient(wallX + WALL_W - 32, wallY, wallX + WALL_W, wallY);
  wsh.addColorStop(0, 'rgba(0,0,0,0)');
  wsh.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = wsh;
  ctx.fillRect(wallX + WALL_W - 32, wallY, 32, WALL_H);

  // ── 壁上面エッジ（3D 感） ──
  const wtGrad = ctx.createLinearGradient(wallX, wallY, wallX + WD, wallY - WDY);
  wtGrad.addColorStop(0, hexAlpha(wallItem.color, 0.65));
  wtGrad.addColorStop(1, hexAlpha(wallItem.color, 0.35));
  ctx.beginPath();
  ctx.moveTo(wallX,             wallY);
  ctx.lineTo(wallX + WALL_W,    wallY);
  ctx.lineTo(wallX + WALL_W + WD, wallY - WDY);
  ctx.lineTo(wallX + WD,        wallY - WDY);
  ctx.closePath();
  ctx.fillStyle = wtGrad;
  ctx.fill();

  // ── 窓（正面）──
  const winW = 50, winH = 42;
  const winY = wallY + 18;
  drawWindow(ctx, wallX + 22, winY, winW, winH, wpItem.color, floorItem.color);
  drawWindow(ctx, wallX + WALL_W - 22 - winW, winY, winW, winH, wpItem.color, floorItem.color);

  // ── 扉 ──
  const doorW = 38, doorH = 62;
  const doorX = cx - doorW / 2;
  const doorY = fndY - doorH;
  ctx.fillStyle = '#120A04';
  ctx.fillRect(doorX - 4, doorY - 4, doorW + 8, doorH + 4);
  ctx.fillStyle = doorItem.color;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  // 扉パネル
  ctx.strokeStyle = hexAlpha(doorItem.knob, 0.42);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(doorX + 5, doorY + 5, doorW - 10, doorH / 2 - 8);
  ctx.strokeRect(doorX + 5, doorY + doorH / 2 + 2, doorW - 10, doorH / 2 - 8);
  // ドアノブ
  ctx.beginPath();
  ctx.arc(doorX + doorW - 9, doorY + doorH * 0.54, 5, 0, Math.PI * 2);
  ctx.fillStyle = doorItem.knob;
  ctx.shadowColor = doorItem.knob;
  ctx.shadowBlur  = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ヤミー扉：豪華ゴールド枠＋宝石＋ヤミー
  if (house.door === 'door_yamii') {
    // 金縁フレーム（外側）
    const goldFrame = ctx.createLinearGradient(doorX - 6, doorY, doorX + doorW + 6, doorY);
    goldFrame.addColorStop(0,   '#A07800');
    goldFrame.addColorStop(0.3, '#FFE060');
    goldFrame.addColorStop(0.7, '#FFD030');
    goldFrame.addColorStop(1,   '#A07800');
    ctx.strokeStyle = goldFrame; ctx.lineWidth = 4;
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,50,0.65)'; ctx.shadowBlur = 8;
    ctx.strokeRect(doorX - 4, doorY - 4, doorW + 8, doorH + 4);
    ctx.restore();
    // 角の宝石
    const cornerGems = [
      { x: doorX - 4,       y: doorY - 4,       col: '#FF80B8', glow: '#FFB0D8' },
      { x: doorX + doorW + 4, y: doorY - 4,     col: '#80C8FF', glow: '#B0E0FF' },
      { x: doorX - 4,       y: doorY + doorH,   col: '#80FFB8', glow: '#B0FFD8' },
      { x: doorX + doorW + 4, y: doorY + doorH, col: '#FFD060', glow: '#FFE898' },
    ];
    cornerGems.forEach(g => {
      ctx.save();
      ctx.shadowColor = g.glow; ctx.shadowBlur = 8;
      ctx.fillStyle = g.col;
      ctx.beginPath(); ctx.arc(g.x, g.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.beginPath(); ctx.arc(g.x - 1.2, g.y - 1.4, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    // 扉上部に星座魔法陣
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#FFD060'; ctx.lineWidth = 0.8;
    const mcx = doorX + doorW/2, mcy = doorY + doorH * 0.22, mr = doorW * 0.32;
    ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(mcx, mcy, mr * 0.60, 0, Math.PI*2); ctx.stroke();
    for (let pi = 0; pi < 6; pi++) {
      const pa = (pi / 6) * Math.PI * 2 - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(mcx, mcy); ctx.lineTo(mcx + Math.cos(pa)*mr, mcy + Math.sin(pa)*mr); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // ヤミー（上パネル中央）
    drawYamii(ctx, doorX + doorW / 2, doorY + doorH * 0.24, 11, 0.8);
  }

  // ── 屋根 ──
  // 屋根右面（3D）
  ctx.fillStyle = hexAlpha(roofItem.peak, 0.88);
  ctx.beginPath();
  ctx.moveTo(roofPeakX,          roofPeakY);
  ctx.lineTo(roofPeakX + WD,     roofPeakY - WDY);
  ctx.lineTo(wallX + WALL_W + 18 + WD, wallY - WDY);
  ctx.lineTo(wallX + WALL_W + 18, wallY);
  ctx.closePath();
  ctx.fill();
  // 屋根正面
  ctx.fillStyle = roofItem.color;
  ctx.beginPath();
  ctx.moveTo(roofPeakX,            roofPeakY);
  ctx.lineTo(wallX - 18,           wallY);
  ctx.lineTo(wallX + WALL_W + 18,  wallY);
  ctx.closePath();
  ctx.fill();
  // 屋根棟ハイライト（正面中央）
  const ridgeGrad = ctx.createLinearGradient(roofPeakX, roofPeakY, roofPeakX, wallY);
  ridgeGrad.addColorStop(0,   hexAlpha(roofItem.peak, 0.8));
  ridgeGrad.addColorStop(0.28, hexAlpha(roofItem.peak, 0.4));
  ridgeGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = ridgeGrad;
  ctx.beginPath();
  ctx.moveTo(roofPeakX,     roofPeakY);
  ctx.lineTo(roofPeakX - 30, roofPeakY + ROOF_H * 0.4);
  ctx.lineTo(roofPeakX + 30, roofPeakY + ROOF_H * 0.4);
  ctx.closePath();
  ctx.fill();
  // ヤミー屋根：多重魔法オーラ＋月冠ヤミー
  if (house.roof === 'roof_yamii') {
    // 内側の金色オーラ
    const roofAura1 = ctx.createRadialGradient(roofPeakX, roofPeakY + 28, 0, roofPeakX, roofPeakY + 28, 70);
    roofAura1.addColorStop(0,   'rgba(255,220,80,0.42)');
    roofAura1.addColorStop(0.5, 'rgba(255,180,60,0.18)');
    roofAura1.addColorStop(1,   'rgba(255,160,40,0)');
    ctx.fillStyle = roofAura1;
    ctx.beginPath(); ctx.moveTo(roofPeakX, roofPeakY); ctx.lineTo(wallX - 18, wallY); ctx.lineTo(wallX + WALL_W + 18, wallY); ctx.closePath(); ctx.fill();
    // 外側の青白いオーラ
    const roofAura2 = ctx.createRadialGradient(roofPeakX, roofPeakY + 28, 20, roofPeakX, roofPeakY + 28, 105);
    roofAura2.addColorStop(0,   'rgba(120,180,255,0.22)');
    roofAura2.addColorStop(0.6, 'rgba(80,140,255,0.10)');
    roofAura2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = roofAura2;
    ctx.beginPath(); ctx.moveTo(roofPeakX, roofPeakY); ctx.lineTo(wallX - 18, wallY); ctx.lineTo(wallX + WALL_W + 18, wallY); ctx.closePath(); ctx.fill();
    // 屋根面に魔法のルーン星
    const roofStarData = [
      { rx: -78, ry: 0.68, sz: 2.2, col: 'rgba(255,220,100,0.90)' },
      { rx: -52, ry: 0.48, sz: 1.8, col: 'rgba(160,200,255,0.88)' },
      { rx: -26, ry: 0.32, sz: 1.4, col: 'rgba(200,160,255,0.85)' },
      { rx:   0, ry: 0.82, sz: 2.0, col: 'rgba(255,220,100,0.90)' },
      { rx:  26, ry: 0.32, sz: 1.4, col: 'rgba(160,255,200,0.85)' },
      { rx:  54, ry: 0.48, sz: 1.8, col: 'rgba(255,160,120,0.85)' },
      { rx:  80, ry: 0.68, sz: 2.2, col: 'rgba(255,220,100,0.90)' },
      { rx: -38, ry: 0.80, sz: 1.6, col: 'rgba(160,200,255,0.82)' },
      { rx:  40, ry: 0.80, sz: 1.6, col: 'rgba(200,160,255,0.82)' },
    ];
    roofStarData.forEach(rs => {
      const sx = roofPeakX + rs.rx;
      const sy = roofPeakY + (wallY - roofPeakY) * rs.ry;
      ctx.save();
      ctx.shadowColor = rs.col; ctx.shadowBlur = 8;
      ctx.fillStyle = rs.col;
      ctx.beginPath(); ctx.arc(sx, sy, rs.sz, 0, Math.PI * 2); ctx.fill();
      // 十字輝き
      ctx.strokeStyle = rs.col; ctx.lineWidth = rs.sz * 0.6;
      ctx.beginPath(); ctx.moveTo(sx - rs.sz*2, sy); ctx.lineTo(sx + rs.sz*2, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy - rs.sz*2); ctx.lineTo(sx, sy + rs.sz*2); ctx.stroke();
      ctx.restore();
    });
    // 頂点に大きなヤミー（ティアラ付き）
    drawYamii(ctx, roofPeakX, roofPeakY - 18, 18, 1.0);
    // 左右に小さなヤミー
    ctx.save(); ctx.globalAlpha = 0.75;
    drawYamii(ctx, roofPeakX - 55, roofPeakY + (wallY - roofPeakY)*0.52 - 8, 10, 0.7);
    drawYamii(ctx, roofPeakX + 55, roofPeakY + (wallY - roofPeakY)*0.52 - 8, 10, 0.7);
    ctx.restore();
  }

  // 瓦ライン
  if (house.roof !== 'roof_golden' && house.roof !== 'roof_yamii') {
    ctx.strokeStyle = hexAlpha(roofItem.peak, 0.28);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const r = i / 5;
      const lx1 = roofPeakX + (wallX - 18 - roofPeakX) * r;
      const lx2 = roofPeakX + (wallX + WALL_W + 18 - roofPeakX) * r;
      const ly  = roofPeakY + (wallY - roofPeakY) * r;
      ctx.beginPath(); ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly); ctx.stroke();
    }
  }
  // 屋根エッジライン（正面）
  ctx.strokeStyle = hexAlpha(roofItem.peak, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(roofPeakX, roofPeakY);
  ctx.lineTo(wallX - 18, wallY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(roofPeakX, roofPeakY);
  ctx.lineTo(wallX + WALL_W + 18, wallY);
  ctx.stroke();

  // ── 煙突 ──
  const chiX = wallX + WALL_W - 48;
  const chiY = roofPeakY + ROOF_H * 0.24;
  const chiW = 20, chiH = 36;
  // 煙突右面（3D）
  ctx.fillStyle = '#2A1608';
  ctx.beginPath();
  ctx.moveTo(chiX + chiW,          chiY);
  ctx.lineTo(chiX + chiW + 8,      chiY - 5);
  ctx.lineTo(chiX + chiW + 8,      chiY + chiH - 5);
  ctx.lineTo(chiX + chiW,          chiY + chiH);
  ctx.fill();
  // 煙突上面（3D）
  ctx.fillStyle = '#3A2010';
  ctx.beginPath();
  ctx.moveTo(chiX,          chiY);
  ctx.lineTo(chiX + chiW,   chiY);
  ctx.lineTo(chiX + chiW + 8, chiY - 5);
  ctx.lineTo(chiX + 8,      chiY - 5);
  ctx.closePath();
  ctx.fill();
  // 煙突正面
  const chiGrad = ctx.createLinearGradient(chiX, chiY, chiX + chiW, chiY);
  chiGrad.addColorStop(0, '#5A3A22');
  chiGrad.addColorStop(1, '#4A3018');
  ctx.fillStyle = chiGrad;
  ctx.fillRect(chiX, chiY, chiW, chiH);
  // 煙突帽
  ctx.fillStyle = '#3A2418';
  ctx.fillRect(chiX - 4, chiY - 6, chiW + 8, 7);
  ctx.fillStyle = '#2E1A0C';
  ctx.fillRect(chiX - 4 + 8, chiY - 11, chiW + 8, 6);
  // 煙（ゆらぎ）
  ctx.lineCap = 'round';
  for (let si = 0; si < 5; si++) {
    const alpha  = 0.14 - si * 0.025;
    const offset = Math.sin(si * 1.4) * 5;
    ctx.strokeStyle = `rgba(200,200,200,${alpha})`;
    ctx.lineWidth = 2.5 + si * 1.4;
    ctx.beginPath();
    ctx.moveTo(chiX + chiW / 2 + offset, chiY - 8 - si * 10);
    ctx.quadraticCurveTo(
      chiX + chiW / 2 + offset + 5, chiY - 12 - si * 10,
      chiX + chiW / 2 + offset,     chiY - 17 - si * 10
    );
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ── 室内ビュー ───────────────────────────────────────────────────────────────
function drawInterior(ctx, house, startY) {
  if (!house) house = { ...DEFAULT_HOUSE };
  const items     = HOUSE_ITEMS;
  const floorItem = items[house.floor]     || items.floor_dirt;
  const wpItem    = items[house.wallpaper] || items.wp_plain;
  const furniture = house.furniture || [];

  const panelW = 308;
  const panelH = INTERIOR_H - 12;
  const px     = (CANVAS_W - panelW) / 2;
  const py     = startY + 7;
  const floorH = 22;
  const PDX    = 10;  // パネル右奥行き
  const PDY    = 6;   // パネル上奥行き

  // ── パネル 3D 外枠 ──
  // 右面
  ctx.fillStyle = 'rgba(20,12,4,0.7)';
  ctx.beginPath();
  ctx.moveTo(px + panelW,       py);
  ctx.lineTo(px + panelW + PDX, py - PDY);
  ctx.lineTo(px + panelW + PDX, py + panelH - PDY);
  ctx.lineTo(px + panelW,       py + panelH);
  ctx.closePath();
  ctx.fill();
  // 上面
  ctx.fillStyle = 'rgba(40,25,8,0.5)';
  ctx.beginPath();
  ctx.moveTo(px,           py);
  ctx.lineTo(px + panelW,  py);
  ctx.lineTo(px + panelW + PDX, py - PDY);
  ctx.lineTo(px + PDX,     py - PDY);
  ctx.closePath();
  ctx.fill();

  // パネル背景（壁紙）
  ctx.fillStyle = wpItem.color;
  roundRect(ctx, px, py, panelW, panelH - floorH, 0);
  ctx.fill();

  // 床
  const floorGrad = ctx.createLinearGradient(px, py + panelH - floorH, px, py + panelH);
  floorGrad.addColorStop(0, floorItem.color);
  floorGrad.addColorStop(1, hexAlpha(floorItem.color, 0.7));
  ctx.fillStyle = floorGrad;
  ctx.fillRect(px, py + panelH - floorH, panelW, floorH);

  // 床板ライン（遠近感）
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth   = 0.8;
  for (let lx = px + 30; lx < px + panelW; lx += 30) {
    ctx.beginPath(); ctx.moveTo(lx, py + panelH - floorH); ctx.lineTo(lx, py + panelH); ctx.stroke();
  }
  // 床の光沢（斜め）
  const floorGloss = ctx.createLinearGradient(px, py + panelH - floorH, px + panelW, py + panelH);
  floorGloss.addColorStop(0, 'rgba(255,255,255,0.06)');
  floorGloss.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  floorGloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = floorGloss;
  ctx.fillRect(px, py + panelH - floorH, panelW, floorH);

  // 壁紙パターン（花柄のみ）
  if (house.wallpaper === 'wp_flower') {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let fx = px + 16; fx < px + panelW - 8; fx += 28) {
      for (let fy = py + 8; fy < py + panelH - floorH - 5; fy += 22) {
        ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // ヤミー壁紙：深夜空＋星座コンステレーション
  if (house.wallpaper === 'wp_yamii') {
    const wpArea = { x: px, y: py, w: panelW, h: panelH - floorH };
    ctx.save();
    ctx.beginPath(); ctx.rect(wpArea.x, wpArea.y, wpArea.w, wpArea.h); ctx.clip();
    // 深い紺色の夜空グラデーション
    const nightGrad = ctx.createLinearGradient(wpArea.x, wpArea.y, wpArea.x, wpArea.y + wpArea.h);
    nightGrad.addColorStop(0,   'rgba(10,12,38,0.78)');
    nightGrad.addColorStop(0.55,'rgba(18,22,60,0.68)');
    nightGrad.addColorStop(1,   'rgba(25,18,50,0.60)');
    ctx.fillStyle = nightGrad;
    ctx.fillRect(wpArea.x, wpArea.y, wpArea.w, wpArea.h);
    // 星々（多数・色とりどり）
    const wpStars = [];
    for (let si = 0; si < 55; si++) {
      wpStars.push({
        x: wpArea.x + 4 + (si * 47 + si * si * 3) % (wpArea.w - 8),
        y: wpArea.y + 4 + (si * 37 + si * 7) % (wpArea.h - 8),
        r: si % 5 === 0 ? 2.0 : si % 3 === 0 ? 1.5 : 1.0,
        col: si % 4 === 0 ? 'rgba(255,240,160,0.95)' : si % 4 === 1 ? 'rgba(160,200,255,0.90)' : si % 4 === 2 ? 'rgba(200,160,255,0.88)' : 'rgba(160,255,200,0.85)',
      });
    }
    wpStars.forEach(s => {
      ctx.save();
      ctx.shadowColor = s.col; ctx.shadowBlur = s.r > 1.5 ? 6 : 3;
      ctx.fillStyle = s.col;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.5) {
        ctx.strokeStyle = s.col; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(s.x - s.r*3, s.y); ctx.lineTo(s.x + s.r*3, s.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x, s.y - s.r*3); ctx.lineTo(s.x, s.y + s.r*3); ctx.stroke();
      }
      ctx.restore();
    });
    // 星座ライン（細く輝く）
    const consLines = [
      [wpStars[0], wpStars[4]], [wpStars[4], wpStars[9]], [wpStars[9], wpStars[14]],
      [wpStars[2], wpStars[7]], [wpStars[7], wpStars[12]], [wpStars[12], wpStars[17]],
      [wpStars[1], wpStars[6]], [wpStars[6], wpStars[11]], [wpStars[20], wpStars[25]],
      [wpStars[25], wpStars[30]], [wpStars[15], wpStars[20]],
    ];
    ctx.strokeStyle = 'rgba(180,200,255,0.20)'; ctx.lineWidth = 0.7;
    consLines.forEach(([a, b]) => {
      if (!a || !b) return;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    // 流れ星
    [[wpArea.x + 40, wpArea.y + 20, 55, -8], [wpArea.x + 180, wpArea.y + 15, 45, -6]].forEach(([sx, sy, len, dy]) => {
      const sg = ctx.createLinearGradient(sx, sy, sx + len, sy + dy);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(255,255,255,0.80)');
      ctx.strokeStyle = sg; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy + dy); ctx.stroke();
    });
    // 小さなヤミーシルエット（夜空に浮かぶ）
    [[wpArea.x + 55, wpArea.y + 35], [wpArea.x + 175, wpArea.y + 28], [wpArea.x + 255, wpArea.y + 42]].forEach(([gx, gy]) => {
      ctx.save(); ctx.globalAlpha = 0.30;
      drawYamii(ctx, gx, gy, 10, 0.0);
      ctx.restore();
    });
    ctx.restore();
  }
  // ヤミー床：魔法陣パターン
  if (house.floor === 'floor_yamii') {
    const floorTop = py + panelH - floorH;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, floorTop, panelW, floorH); ctx.clip();
    // 床に黄金の魔法陣サークル
    const circles = [
      { cx: px + panelW * 0.25, cy: floorTop + floorH * 0.55, r: floorH * 0.40 },
      { cx: px + panelW * 0.50, cy: floorTop + floorH * 0.55, r: floorH * 0.40 },
      { cx: px + panelW * 0.75, cy: floorTop + floorH * 0.55, r: floorH * 0.40 },
    ];
    circles.forEach(c => {
      // 外円
      ctx.shadowColor = 'rgba(255,200,80,0.60)'; ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(255,210,80,0.65)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2); ctx.stroke();
      // 内円
      ctx.strokeStyle = 'rgba(200,160,255,0.55)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r * 0.65, 0, Math.PI * 2); ctx.stroke();
      // 放射線（6角）
      ctx.strokeStyle = 'rgba(255,210,80,0.38)'; ctx.lineWidth = 0.6;
      for (let ri = 0; ri < 6; ri++) {
        const ra = (ri / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(c.cx, c.cy); ctx.lineTo(c.cx + Math.cos(ra)*c.r, c.cy + Math.sin(ra)*c.r); ctx.stroke();
      }
      // 中心ドット
      ctx.fillStyle = 'rgba(255,220,100,0.80)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(c.cx, c.cy, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // 天井・壁境界ライン
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py + panelH - floorH);
  ctx.lineTo(px + panelW, py + panelH - floorH);
  ctx.stroke();

  // 巾木
  ctx.fillStyle = hexAlpha(floorItem.color, 0.5);
  ctx.fillRect(px, py + panelH - floorH, panelW, 3);

  // パネル枠線（正面）
  ctx.strokeStyle = '#5A4020';
  ctx.lineWidth   = 1.8;
  roundRect(ctx, px, py, panelW, panelH, 4);
  ctx.stroke();

  // ラベル
  ctx.fillStyle    = 'rgba(255,255,255,0.5)';
  ctx.font         = 'bold 10px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🏠 室内', px + 7, py + 13);

  // ── 家具アイコン ──
  if (furniture.length === 0) {
    ctx.fillStyle    = 'rgba(0,0,0,0.3)';
    ctx.font         = '11px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('家具がありません', px + panelW / 2, py + (panelH - floorH) / 2 + 4);
  } else {
    const maxPerRow = 5;
    const iconSize  = 42;
    const iconPad   = (panelW - maxPerRow * iconSize) / (maxPerRow + 1);
    const iconRowY  = py + (panelH - floorH) * 0.38;

    furniture.slice(0, MAX_FURNITURE).forEach((id, i) => {
      const fi  = items[id];
      if (!fi) return;
      const col = i % maxPerRow;
      const row = Math.floor(i / maxPerRow);
      const ix  = px + iconPad + col * (iconSize + iconPad) + iconSize / 2;
      const iy  = iconRowY + row * (iconSize + 10);

      // 家具影
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(ix, iy + iconSize * 0.52, iconSize * 0.42, iconSize * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      drawFurnItem(ctx, id, ix, iy + iconSize * 0.44, iconSize * 0.90);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle    = 'rgba(255,255,255,0.75)';
      ctx.font         = `bold 9px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.fillText(fi.name, ix, iy + iconSize * 0.60);
    });
  }

  ctx.fillStyle    = 'rgba(255,255,255,0.38)';
  ctx.font         = '10px sans-serif';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${furniture.length}/${MAX_FURNITURE}`, px + panelW - 6, py + panelH - 5);
}

// ── カスタム家具描画 ─────────────────────────────────────────────────────────

// 水晶玉（🔮 絵文字がnapi-rs/canvasでバグるため完全カスタム描画）
function drawCrystalOrb(ctx, cx, cy, r) {
  // 台座
  const baseGrad = ctx.createLinearGradient(cx - r*0.6, cy + r*0.6, cx + r*0.6, cy + r*1.0);
  baseGrad.addColorStop(0, '#7038B8');
  baseGrad.addColorStop(1, '#3A1060');
  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.82, r * 0.58, r * 0.20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9050D0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.72, r * 0.40, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // 外側グロー
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.7);
  glow.addColorStop(0,   'rgba(160,100,255,0.45)');
  glow.addColorStop(0.45,'rgba(120,60,220,0.18)');
  glow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();

  // 球体本体
  const orbGrad = ctx.createRadialGradient(cx - r*0.28, cy - r*0.30, 0, cx, cy, r);
  orbGrad.addColorStop(0,   '#D8C8FF');
  orbGrad.addColorStop(0.22,'#9060E8');
  orbGrad.addColorStop(0.60,'#4820B8');
  orbGrad.addColorStop(1,   '#180870');
  ctx.save();
  ctx.shadowColor = 'rgba(160,80,255,0.85)';
  ctx.shadowBlur  = r * 0.9;
  ctx.fillStyle = orbGrad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 内部の渦
  ctx.strokeStyle = 'rgba(210,180,255,0.48)';
  ctx.lineWidth = r * 0.10;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(cx - r*0.10, cy + r*0.08, r*0.38, -0.5, Math.PI*1.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + r*0.14, cy - r*0.14, r*0.22, Math.PI*0.4, Math.PI*1.9); ctx.stroke();
  ctx.lineCap = 'butt';

  // ハイライト
  const hl = ctx.createRadialGradient(cx - r*0.28, cy - r*0.34, 0, cx - r*0.18, cy - r*0.22, r*0.54);
  hl.addColorStop(0, 'rgba(255,255,255,0.88)');
  hl.addColorStop(0.5,'rgba(255,255,255,0.28)');
  hl.addColorStop(1,  'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // 周囲の星きらめき
  ctx.fillStyle = '#FFFFFF';
  [[cx - r*1.10, cy - r*0.60], [cx + r*0.90, cy - r*0.80], [cx - r*0.80, cy + r*0.15]].forEach(([sx, sy]) => {
    const sr = r * 0.055;
    ctx.beginPath();
    ctx.moveTo(sx, sy - sr*2.4); ctx.lineTo(sx + sr*0.5, sy - sr*0.5);
    ctx.lineTo(sx + sr*2.4, sy); ctx.lineTo(sx + sr*0.5, sy + sr*0.5);
    ctx.lineTo(sx, sy + sr*2.4); ctx.lineTo(sx - sr*0.5, sy + sr*0.5);
    ctx.lineTo(sx - sr*2.4, sy); ctx.lineTo(sx - sr*0.5, sy - sr*0.5);
    ctx.closePath(); ctx.fill();
  });
}

// 木の机
function drawWoodDesk(ctx, x, y, w, h) {
  const legW = Math.max(3, w * 0.065);
  const topH = Math.max(5, h * 0.22);
  const legH = h - topH;

  // 引き出し部分（左側）
  const drawerW = w * 0.28;
  ctx.fillStyle = '#9A5C1A';
  roundRect(ctx, x + legW, y + topH + 1, drawerW, legH * 0.55, 2);
  ctx.fill();
  ctx.strokeStyle = '#6A3A08'; ctx.lineWidth = 0.8;
  ctx.strokeRect(x + legW + 2, y + topH + 3, drawerW - 4, legH * 0.55 - 6);
  ctx.fillStyle = '#C09040';
  ctx.beginPath(); ctx.arc(x + legW + drawerW * 0.5, y + topH + legH * 0.28, 2, 0, Math.PI*2); ctx.fill();

  // 脚
  ctx.fillStyle = '#7A4A14';
  ctx.fillRect(x + legW, y + topH, legW, legH);
  ctx.fillRect(x + w - legW*2, y + topH, legW, legH);

  // 天板
  const topGrad = ctx.createLinearGradient(x, y, x, y + topH);
  topGrad.addColorStop(0, '#D08840');
  topGrad.addColorStop(0.4,'#B06020');
  topGrad.addColorStop(1, '#8A4010');
  ctx.fillStyle = topGrad;
  roundRect(ctx, x - legW*0.3, y, w + legW*0.6, topH, 2);
  ctx.fill();
  // 木目
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 0.7;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + w*(i/4) - legW*0.3, y + 1);
    ctx.lineTo(x + w*(i/4), y + topH - 1);
    ctx.stroke();
  }
  // 天板ハイライト
  const hlG = ctx.createLinearGradient(x, y, x, y + topH * 0.45);
  hlG.addColorStop(0, 'rgba(255,220,120,0.32)');
  hlG.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = hlG;
  roundRect(ctx, x - legW*0.3, y, w + legW*0.6, topH * 0.5, 2);
  ctx.fill();
}

// 木の椅子
function drawWoodChair(ctx, x, y, w, h) {
  const seatH = Math.max(4, h * 0.18);
  const seatY = y + h * 0.44;
  const backH = seatY - y;
  const legH  = h - backH - seatH;
  const legW  = Math.max(2, w * 0.10);

  // 背もたれ
  const backGrad = ctx.createLinearGradient(x, y, x + w, y + backH);
  backGrad.addColorStop(0, '#C07030');
  backGrad.addColorStop(1, '#8A4010');
  ctx.fillStyle = backGrad;
  roundRect(ctx, x + w*0.10, y, w*0.80, backH, 3);
  ctx.fill();
  // 横桟
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + w*0.10 + 3, y + backH*0.50);
  ctx.lineTo(x + w*0.90 - 3, y + backH*0.50);
  ctx.stroke();
  // ハイライト
  ctx.fillStyle = 'rgba(255,200,100,0.18)';
  roundRect(ctx, x + w*0.12, y + 2, w*0.76, backH*0.38, 2);
  ctx.fill();

  // 座面
  const seatGrad = ctx.createLinearGradient(x, seatY, x, seatY + seatH);
  seatGrad.addColorStop(0, '#D08840');
  seatGrad.addColorStop(1, '#9A5010');
  ctx.fillStyle = seatGrad;
  roundRect(ctx, x, seatY, w, seatH, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,200,100,0.18)';
  roundRect(ctx, x + 2, seatY + 1, w - 4, seatH*0.4, 1);
  ctx.fill();

  // 脚
  ctx.fillStyle = '#7A4214';
  ctx.fillRect(x + legW, seatY + seatH, legW, legH);
  ctx.fillRect(x + w - legW*2, seatY + seatH, legW, legH);
  ctx.strokeStyle = '#6A3610'; ctx.lineWidth = legW * 0.7;
  ctx.beginPath();
  ctx.moveTo(x + legW*1.5, seatY + seatH + legH*0.55);
  ctx.lineTo(x + w - legW*1.5, seatY + seatH + legH*0.55);
  ctx.stroke();
}

// 本棚（カラフルな本入り）
function drawBookshelf(ctx, x, y, w, h) {
  // 外枠
  const frameGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  frameGrad.addColorStop(0, '#7A4218');
  frameGrad.addColorStop(1, '#5A2C08');
  ctx.fillStyle = frameGrad;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  // 内側
  ctx.fillStyle = '#3A1C06';
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  // 棚板2枚
  const sh1 = y + h*0.36, sh2 = y + h*0.65;
  ctx.fillStyle = '#8A4C1A';
  ctx.fillRect(x + 3, sh1, w - 6, 4);
  ctx.fillRect(x + 3, sh2, w - 6, 4);
  // 本を描く
  const bookColors = ['#CC3333','#3355CC','#228844','#BB8822','#9933CC','#DD5511','#2299CC','#CC3377','#33AA88'];
  const fillSection = (topY, botY, offset) => {
    const sH = botY - topY - 2;
    const nB = Math.max(2, Math.floor((w - 10) / Math.max(4, w*0.12)));
    const bW = (w - 10) / nB;
    for (let bi = 0; bi < nB; bi++) {
      const bX = x + 5 + bi*bW;
      const bH = sH * (0.75 + (bi % 3)*0.08);
      ctx.fillStyle = bookColors[(bi + offset) % bookColors.length];
      ctx.fillRect(bX, topY + (sH - bH), bW - 1, bH);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(bX + 1, topY + (sH - bH) + 1, 1.5, bH - 2);
    }
  };
  fillSection(y + 5, sh1 - 1, 0);
  fillSection(sh1 + 5, sh2 - 1, 3);
  fillSection(sh2 + 5, y + h - 5, 6);
  // 上辺ハイライト
  const tHL = ctx.createLinearGradient(x, y, x, y + 6);
  tHL.addColorStop(0, 'rgba(200,140,60,0.42)');
  tHL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tHL;
  roundRect(ctx, x, y, w, 6, 3);
  ctx.fill();
}

// フロアランプ
function drawFloorLamp(ctx, cx, baseY, r) {
  const poleH = r * 3.2;
  const poleW = Math.max(2, r * 0.18);
  const shadeR = r * 0.95;
  const shadeH = r * 0.72;

  // 台座
  ctx.fillStyle = '#886030';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 2, r*0.55, r*0.13, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#A07840';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 4, r*0.40, r*0.09, 0, 0, Math.PI*2); ctx.fill();

  // ポール
  const poleGrad = ctx.createLinearGradient(cx - poleW, 0, cx + poleW, 0);
  poleGrad.addColorStop(0, '#886030');
  poleGrad.addColorStop(0.4,'#C09050');
  poleGrad.addColorStop(1, '#886030');
  ctx.fillStyle = poleGrad;
  ctx.fillRect(cx - poleW/2, baseY - poleH, poleW, poleH);

  // シェード外側（影）
  const shadeTopY = baseY - poleH;
  ctx.fillStyle = '#2A1A0A';
  ctx.beginPath();
  ctx.moveTo(cx - shadeR, shadeTopY + shadeH);
  ctx.lineTo(cx + shadeR, shadeTopY + shadeH);
  ctx.lineTo(cx + shadeR*0.52, shadeTopY);
  ctx.lineTo(cx - shadeR*0.52, shadeTopY);
  ctx.closePath(); ctx.fill();

  // 光（内側グロー）
  const lampGlow = ctx.createRadialGradient(cx, shadeTopY + shadeH*0.7, 0, cx, shadeTopY + shadeH*0.9, shadeR*1.3);
  lampGlow.addColorStop(0, 'rgba(255,240,180,0.92)');
  lampGlow.addColorStop(0.4,'rgba(255,220,100,0.38)');
  lampGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lampGlow;
  ctx.fillRect(cx - shadeR*1.3, shadeTopY - r*0.5, shadeR*2.6, shadeR*2.2);

  // シェード本体
  const shadeGrad = ctx.createLinearGradient(cx, shadeTopY, cx, shadeTopY + shadeH);
  shadeGrad.addColorStop(0, '#C88840');
  shadeGrad.addColorStop(0.5,'#E0A850');
  shadeGrad.addColorStop(1, '#C07830');
  ctx.fillStyle = shadeGrad;
  ctx.beginPath();
  ctx.moveTo(cx - shadeR, shadeTopY + shadeH);
  ctx.lineTo(cx + shadeR, shadeTopY + shadeH);
  ctx.lineTo(cx + shadeR*0.52, shadeTopY);
  ctx.lineTo(cx - shadeR*0.52, shadeTopY);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8A5020'; ctx.lineWidth = 0.8;
  ctx.stroke();
}

// タンス
function drawDresser(ctx, x, y, w, h) {
  // 本体
  const bodyGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  bodyGrad.addColorStop(0, '#9A5C1E');
  bodyGrad.addColorStop(1, '#6A3A0A');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  // 引き出し3段
  const drawerH = (h - 10) / 3 - 2;
  for (let di = 0; di < 3; di++) {
    const dY = y + 5 + di*(drawerH + 2);
    const dGrad = ctx.createLinearGradient(x, dY, x, dY + drawerH);
    dGrad.addColorStop(0, '#B87030');
    dGrad.addColorStop(1, '#8A4A14');
    ctx.fillStyle = dGrad;
    roundRect(ctx, x + 4, dY, w - 8, drawerH, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.7;
    roundRect(ctx, x + 4, dY, w - 8, drawerH, 2);
    ctx.stroke();
    // ノブ
    ctx.fillStyle = '#D4A040';
    ctx.beginPath(); ctx.arc(x + w/2, dY + drawerH/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#A07020'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  // 天板ハイライト
  const topHL = ctx.createLinearGradient(x, y, x, y + 6);
  topHL.addColorStop(0, 'rgba(200,150,60,0.45)');
  topHL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topHL;
  roundRect(ctx, x, y, w, 6, 3);
  ctx.fill();
}

// キッチン台
function drawKitchen(ctx, x, y, w, h) {
  // 台本体
  const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
  bodyGrad.addColorStop(0, '#A0A0A8');
  bodyGrad.addColorStop(1, '#686870');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  // 扉2枚
  const doorW = (w - 10) / 2 - 1;
  for (let di = 0; di < 2; di++) {
    const dX = x + 5 + di*(doorW + 2);
    ctx.fillStyle = '#B8B8C2';
    roundRect(ctx, dX, y + h*0.18, doorW, h*0.72, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.7;
    roundRect(ctx, dX, y + h*0.18, doorW, h*0.72, 2);
    ctx.stroke();
    ctx.fillStyle = '#888898';
    ctx.beginPath(); ctx.arc(dX + doorW*(di === 0 ? 0.72 : 0.28), y + h*0.54, 2.5, 0, Math.PI*2); ctx.fill();
  }
  // カウンター天板（白）
  const ctGrad = ctx.createLinearGradient(x, y, x, y + h*0.17);
  ctGrad.addColorStop(0, '#F0F0F8');
  ctGrad.addColorStop(1, '#C8C8D4');
  ctx.fillStyle = ctGrad;
  roundRect(ctx, x - 2, y, w + 4, h*0.17, 2);
  ctx.fill();
  // コンロ（黒い丸2つ）
  ctx.fillStyle = '#303038';
  ctx.beginPath(); ctx.arc(x + w*0.32, y + h*0.085, w*0.095, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w*0.68, y + h*0.085, w*0.095, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#555560'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x + w*0.32, y + h*0.085, w*0.095, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w*0.68, y + h*0.085, w*0.095, 0, Math.PI*2); ctx.stroke();
}

// ── 小物アイコン（机・棚の上に描画）─────────────────────────────────────────
function drawTopItem(ctx, id, cx, cy, r) {
  const item = HOUSE_ITEMS[id];
  if (!item) return;
  if (id === 'furn_candle') {
    // 蝋燭本体
    ctx.fillStyle = '#F8F0D8';
    ctx.fillRect(cx - r*0.28, cy - r*0.8, r*0.56, r*0.85);
    ctx.fillStyle = '#C8A840';
    ctx.fillRect(cx - r*0.28, cy - r*0.8, r*0.56, r*0.10);
    // 炎
    const flameGrad = ctx.createRadialGradient(cx, cy - r*0.92, 0, cx, cy - r*0.92, r*0.28);
    flameGrad.addColorStop(0, '#FFFF88');
    flameGrad.addColorStop(0.4,'#FF9020');
    flameGrad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r*0.96, r*0.18, r*0.28, 0, 0, Math.PI*2);
    ctx.fill();
    return;
  }
  if (id === 'furn_snow_globe') {
    // ドーム
    const domeGrad = ctx.createRadialGradient(cx - r*0.22, cy - r*0.22, 0, cx, cy, r*0.72);
    domeGrad.addColorStop(0, 'rgba(200,230,255,0.88)');
    domeGrad.addColorStop(0.6,'rgba(140,180,240,0.60)');
    domeGrad.addColorStop(1, 'rgba(80,130,200,0.40)');
    ctx.fillStyle = domeGrad;
    ctx.beginPath(); ctx.arc(cx, cy - r*0.18, r*0.72, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    // 台座
    ctx.fillStyle = '#886030';
    ctx.beginPath(); ctx.ellipse(cx, cy + r*0.56, r*0.68, r*0.18, 0, 0, Math.PI*2); ctx.fill();
    // 雪と小木
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.beginPath(); ctx.arc(cx - r*0.24, cy - r*0.08, r*0.09, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r*0.18, cy - r*0.12, r*0.07, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#226622';
    ctx.beginPath();
    ctx.moveTo(cx + r*0.32, cy - r*0.05);
    ctx.lineTo(cx + r*0.32 - r*0.16, cy + r*0.28);
    ctx.lineTo(cx + r*0.32 + r*0.16, cy + r*0.28);
    ctx.closePath(); ctx.fill();
    return;
  }
  // デフォルト: 絵文字
  ctx.font = `${Math.ceil(r * 1.7)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(item.emoji, cx, cy);
}

// ── 家具1アイテムを統一的に描画 ──────────────────────────────────────────────
// cx, cy = 底面中心, size = 基準サイズ（fs）
// ── シャンデリア ─────────────────────────────────────────────────────────────
function drawChandelier(ctx, cx, cy, r) {
  ctx.save();
  // 暖かいオーラ（床への光）
  const glow = ctx.createRadialGradient(cx, cy + r * 0.5, r * 0.1, cx, cy + r * 0.5, r * 2.4);
  glow.addColorStop(0,   'rgba(255,220,80,0.55)');
  glow.addColorStop(0.4, 'rgba(255,180,40,0.22)');
  glow.addColorStop(1,   'rgba(255,140,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 2.4, 0, Math.PI * 2); ctx.fill();

  // 5本のアーム（左右に広がる）
  const armOffsets = [-0.92, -0.46, 0, 0.46, 0.92];
  armOffsets.forEach(oa => {
    const ax  = cx + oa * r;
    const ayS = cy + Math.abs(oa) * r * 0.18;  // 端ほど少し下がる
    const ay  = ayS + r * 0.10;

    // アーム本体（カーブ）
    ctx.strokeStyle = '#C8A820'; ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo((cx + ax) * 0.5, cy + r * 0.06, ax, ayS);
    ctx.stroke();

    // 短い吊り棒
    const cupY = ay + r * 0.16;
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.beginPath(); ctx.moveTo(ax, ayS); ctx.lineTo(ax, cupY); ctx.stroke();

    // ロウソク受け皿
    ctx.fillStyle = '#B89018';
    ctx.beginPath(); ctx.ellipse(ax, cupY, r * 0.11, r * 0.055, 0, 0, Math.PI * 2); ctx.fill();

    // ロウソク本体
    ctx.fillStyle = '#F5EDD5';
    ctx.fillRect(ax - r * 0.058, cupY - r * 0.20, r * 0.116, r * 0.20);

    // 炎グロー
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,60,0.95)'; ctx.shadowBlur = r * 0.5;
    ctx.fillStyle = 'rgba(255,120,20,0.80)';
    ctx.beginPath(); ctx.ellipse(ax, cupY - r * 0.29, r * 0.10, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFEE60';
    ctx.beginPath(); ctx.ellipse(ax, cupY - r * 0.31, r * 0.062, r * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  // 中心ハブ（金色の球）
  const hubGrad = ctx.createRadialGradient(cx - r*0.10, cy - r*0.13, 0, cx, cy, r * 0.36);
  hubGrad.addColorStop(0,   '#FFE898');
  hubGrad.addColorStop(0.5, '#D4A820');
  hubGrad.addColorStop(1,   '#806010');
  ctx.fillStyle = hubGrad;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2); ctx.fill();

  // ハブリング
  ctx.save();
  ctx.shadowColor = 'rgba(255,200,80,0.60)'; ctx.shadowBlur = r * 0.3;
  ctx.strokeStyle = '#FFD040'; ctx.lineWidth = Math.max(1.5, r * 0.065);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.50, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // ハブハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.beginPath(); ctx.arc(cx - r*0.10, cy - r*0.12, r * 0.10, 0, Math.PI * 2); ctx.fill();

  // ボトムペンダント（水晶）
  const pCy = cy + r * 0.56;
  ctx.strokeStyle = '#C8A820'; ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.36); ctx.lineTo(cx, pCy - r * 0.08); ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#A0D8FF'; ctx.shadowBlur = r * 0.55;
  const cryGrad = ctx.createLinearGradient(cx, pCy - r*0.22, cx, pCy + r*0.24);
  cryGrad.addColorStop(0,   '#D8F0FF');
  cryGrad.addColorStop(0.5, '#70BCFF');
  cryGrad.addColorStop(1,   '#3080D0');
  ctx.fillStyle = cryGrad;
  ctx.beginPath();
  ctx.moveTo(cx, pCy - r * 0.22);
  ctx.lineTo(cx + r * 0.14, pCy + r * 0.04);
  ctx.lineTo(cx, pCy + r * 0.26);
  ctx.lineTo(cx - r * 0.14, pCy + r * 0.04);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx - r*0.04, pCy - r*0.08, r*0.05, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ── サボテン ─────────────────────────────────────────────────────────────────
function drawCactus(ctx, cx, cy, size) {
  const s = size;
  // 鉢
  const potGrad = ctx.createLinearGradient(cx - s*0.25, cy - s*0.10, cx + s*0.25, cy);
  potGrad.addColorStop(0, '#C06020'); potGrad.addColorStop(1, '#803010');
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s*0.28, cy - s*0.14); ctx.lineTo(cx + s*0.28, cy - s*0.14);
  ctx.lineTo(cx + s*0.22, cy);          ctx.lineTo(cx - s*0.22, cy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#E07830';
  ctx.fillRect(cx - s*0.30, cy - s*0.18, s*0.60, s*0.06);

  // 本体幹（緑）
  const bodyGrad = ctx.createLinearGradient(cx - s*0.18, cy - s*1.0, cx + s*0.18, cy - s*0.12);
  bodyGrad.addColorStop(0, '#60C040'); bodyGrad.addColorStop(1, '#308020');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s*0.18, cy - s*1.02, s*0.36, s*0.90, s*0.18);
  ctx.fill();

  // 左アーム
  ctx.fillStyle = '#50A838';
  roundRect(ctx, cx - s*0.42, cy - s*0.70, s*0.26, s*0.14, s*0.07);
  ctx.fill();
  roundRect(ctx, cx - s*0.44, cy - s*0.90, s*0.14, s*0.25, s*0.07);
  ctx.fill();

  // 右アーム
  roundRect(ctx, cx + s*0.16, cy - s*0.55, s*0.26, s*0.14, s*0.07);
  ctx.fill();
  roundRect(ctx, cx + s*0.30, cy - s*0.75, s*0.14, s*0.25, s*0.07);
  ctx.fill();

  // トゲ（小さい線）
  ctx.strokeStyle = '#F0E8C0'; ctx.lineWidth = Math.max(0.8, s*0.025); ctx.lineCap = 'round';
  [[-0.02, -0.92], [0.06, -0.72], [-0.06, -0.55], [0.04, -0.38]].forEach(([ox, oy]) => {
    ctx.beginPath(); ctx.moveTo(cx + ox*s, cy + oy*s); ctx.lineTo(cx + (ox+0.10)*s, cy + (oy-0.08)*s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + ox*s, cy + oy*s); ctx.lineTo(cx + (ox-0.10)*s, cy + (oy-0.08)*s); ctx.stroke();
  });
  ctx.lineCap = 'butt';

  // 頂上の花
  ctx.save();
  ctx.shadowColor = 'rgba(255,100,150,0.6)'; ctx.shadowBlur = s*0.2;
  for (let p = 0; p < 5; p++) {
    const fa = (p/5)*Math.PI*2;
    ctx.fillStyle = '#FF70A0';
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(fa)*s*0.12, cy - s*1.02 + Math.sin(fa)*s*0.10, s*0.10, s*0.07, fa, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = '#FFE060';
  ctx.beginPath(); ctx.arc(cx, cy - s*1.02, s*0.07, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── くまのぬいぐるみ ──────────────────────────────────────────────────────────
function drawTeddyBear(ctx, cx, cy, size) {
  const s = size;
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, cy + s*0.04, s*0.42, s*0.10, 0, 0, Math.PI*2); ctx.fill();

  // 体（楕円）
  const bodyGrad = ctx.createRadialGradient(cx - s*0.12, cy - s*0.18, 0, cx, cy - s*0.10, s*0.60);
  bodyGrad.addColorStop(0, '#E8A860'); bodyGrad.addColorStop(1, '#A06020');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(cx, cy - s*0.14, s*0.40, s*0.50, 0, 0, Math.PI*2); ctx.fill();

  // お腹（明るいベージュ）
  ctx.fillStyle = '#F0CC90';
  ctx.beginPath(); ctx.ellipse(cx, cy - s*0.08, s*0.25, s*0.33, 0, 0, Math.PI*2); ctx.fill();

  // 左腕
  ctx.fillStyle = '#C08030';
  ctx.beginPath(); ctx.ellipse(cx - s*0.46, cy - s*0.22, s*0.18, s*0.28, 0.5, 0, Math.PI*2); ctx.fill();
  // 右腕
  ctx.beginPath(); ctx.ellipse(cx + s*0.46, cy - s*0.16, s*0.18, s*0.28, -0.5, 0, Math.PI*2); ctx.fill();

  // 脚
  ctx.beginPath(); ctx.ellipse(cx - s*0.20, cy + s*0.34, s*0.18, s*0.14, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + s*0.20, cy + s*0.34, s*0.18, s*0.14, 0, 0, Math.PI*2); ctx.fill();

  // 頭
  const headGrad = ctx.createRadialGradient(cx - s*0.10, cy - s*0.80, 0, cx, cy - s*0.70, s*0.44);
  headGrad.addColorStop(0, '#EEB058'); headGrad.addColorStop(1, '#A06020');
  ctx.fillStyle = headGrad;
  ctx.beginPath(); ctx.arc(cx, cy - s*0.70, s*0.40, 0, Math.PI*2); ctx.fill();

  // 耳
  ctx.fillStyle = '#C08030';
  ctx.beginPath(); ctx.arc(cx - s*0.30, cy - s*1.02, s*0.16, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s*0.30, cy - s*1.02, s*0.16, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#E8A060';
  ctx.beginPath(); ctx.arc(cx - s*0.30, cy - s*1.02, s*0.09, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s*0.30, cy - s*1.02, s*0.09, 0, Math.PI*2); ctx.fill();

  // 顔パーツ
  // 鼻
  ctx.fillStyle = '#804020';
  ctx.beginPath(); ctx.ellipse(cx, cy - s*0.65, s*0.12, s*0.08, 0, 0, Math.PI*2); ctx.fill();
  // 目
  ctx.fillStyle = '#1A0E06';
  ctx.beginPath(); ctx.arc(cx - s*0.16, cy - s*0.80, s*0.065, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s*0.16, cy - s*0.80, s*0.065, 0, Math.PI*2); ctx.fill();
  // 目のキラキラ
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.beginPath(); ctx.arc(cx - s*0.13, cy - s*0.83, s*0.025, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s*0.19, cy - s*0.83, s*0.025, 0, Math.PI*2); ctx.fill();
  // スマイル
  ctx.strokeStyle = '#804020'; ctx.lineWidth = Math.max(1, s*0.045); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy - s*0.60, s*0.14, 0.18, Math.PI - 0.18); ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawFurnItem(ctx, id, cx, cy, size) {
  if (id === 'furn_yamii_plush') {
    drawYamiiPlush(ctx, cx, cy - size*0.52, size*0.52);
    return;
  }
  if (id === 'furn_yamii') {
    drawYamii(ctx, cx, cy - size*0.52, size*0.52, 0.80);
    return;
  }
  if (id === 'furn_crystal_orb') {
    drawCrystalOrb(ctx, cx, cy - size*0.44, size*0.42);
    return;
  }
  if (id === 'furn_wood_desk') {
    drawWoodDesk(ctx, cx - size*0.55, cy - size*0.55, size*1.1, size*0.55);
    return;
  }
  if (id === 'furn_wood_chair') {
    drawWoodChair(ctx, cx - size*0.36, cy - size*0.72, size*0.72, size*0.72);
    return;
  }
  if (id === 'furn_bookshelf' || id === 'furn_big_shelf') {
    drawBookshelf(ctx, cx - size*0.50, cy - size*0.88, size, size*0.88);
    return;
  }
  if (id === 'furn_floor_lamp') {
    drawFloorLamp(ctx, cx, cy, size*0.52);
    return;
  }
  if (id === 'furn_dresser') {
    drawDresser(ctx, cx - size*0.46, cy - size*0.72, size*0.92, size*0.72);
    return;
  }
  if (id === 'furn_kitchen') {
    drawKitchen(ctx, cx - size*0.55, cy - size*0.60, size*1.10, size*0.60);
    return;
  }
  if (id === 'furn_chandelier') {
    drawChandelier(ctx, cx, cy - size * 0.30, size * 0.55);
    return;
  }
  if (id === 'furn_cactus') {
    drawCactus(ctx, cx, cy, size * 0.52);
    return;
  }
  if (id === 'furn_teddy_bear') {
    drawTeddyBear(ctx, cx, cy, size * 0.52);
    return;
  }
  // その他: シンプルな形で描画（絵文字はnapi-rs/canvasで非対応）
  const item = HOUSE_ITEMS[id];
  if (!item) return;
  const s = size;
  // 家具ごとの色マップ
  const colorMap = {
    furn_sofa:         '#8B4513', furn_bed:           '#4169E1',
    furn_rug:          '#C02020', furn_plant:         '#228B22',
    furn_table:        '#A0522D', furn_painting:      '#DAA520',
    furn_fireplace:    '#CC3300', furn_trophy:        '#FFD700',
    furn_clock:        '#555566', furn_piano:         '#111111',
    furn_aquarium:     '#006994', furn_golden_mirror: '#DAA520',
    furn_magic_bonsai: '#2E8B57', furn_ancient_altar: '#607080',
    furn_legend_sword: '#B8C8D8', furn_void_orb:      '#1A1050',
    furn_chest:        '#8B5A1A',
  };
  const baseColor = colorMap[id] ?? '#6688AA';
  drawGenericFurniture(ctx, id, cx, cy, s, baseColor, item.name);
}

function drawGenericFurniture(ctx, id, cx, cy, s, color, name) {
  // ── 宝箱 ──
  if (id === 'furn_chest') {
    const w = s * 0.90, h = s * 0.62;
    const x = cx - w / 2, y = cy - h;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, w * 0.42, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    // 本体
    const bodyGrad = ctx.createLinearGradient(x, y + h*0.4, x, y + h);
    bodyGrad.addColorStop(0, '#C87820'); bodyGrad.addColorStop(1, '#7A4010');
    ctx.fillStyle = bodyGrad; ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
    // 蓋
    const lidGrad = ctx.createLinearGradient(x, y, x, y + h * 0.42);
    lidGrad.addColorStop(0, '#E09030'); lidGrad.addColorStop(1, '#A06020');
    ctx.fillStyle = lidGrad;
    ctx.beginPath(); ctx.moveTo(x, y + h*0.38); ctx.lineTo(x + w, y + h*0.38);
    ctx.lineTo(x + w, y + h*0.10); ctx.quadraticCurveTo(x + w, y, cx, y);
    ctx.quadraticCurveTo(x, y, x, y + h*0.10); ctx.closePath(); ctx.fill();
    // 金具
    ctx.strokeStyle = '#FFD060'; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.strokeRect(x + 2, y + h*0.38, w - 4, h * 0.63);
    ctx.fillStyle = '#FFD060';
    ctx.fillRect(cx - s*0.07, y + h*0.30, s*0.14, h*0.22);
    ctx.beginPath(); ctx.arc(cx, y + h*0.41, s*0.06, 0, Math.PI*2); ctx.fill();
    // 光沢
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(cx - w*0.18, y + h*0.12, w*0.14, h*0.07, -0.3, 0, Math.PI*2); ctx.fill();
    return;
  }
  // ── ソファ ──
  if (id === 'furn_sofa') {
    const w = s * 1.0, h = s * 0.60;
    const x = cx - w/2, y = cy - h;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx, cy+2, w*0.45, h*0.12, 0,0,Math.PI*2); ctx.fill();
    // 座面
    const seatGrad = ctx.createLinearGradient(x,y+h*0.4,x,y+h);
    seatGrad.addColorStop(0, lighten(color,30)); seatGrad.addColorStop(1, color);
    ctx.fillStyle = seatGrad; ctx.fillRect(x + w*0.08, y + h*0.45, w*0.84, h*0.55);
    // 背もたれ
    const backGrad = ctx.createLinearGradient(x,y,x,y+h*0.55);
    backGrad.addColorStop(0, lighten(color,40)); backGrad.addColorStop(1, lighten(color,15));
    ctx.fillStyle = backGrad; ctx.fillRect(x + w*0.08, y, w*0.84, h*0.52);
    // 肘掛け
    ctx.fillStyle = darken(color, 20);
    ctx.fillRect(x, y+h*0.22, w*0.10, h*0.78);
    ctx.fillRect(x+w*0.90, y+h*0.22, w*0.10, h*0.78);
    // クッション線
    ctx.strokeStyle = darken(color,30); ctx.lineWidth = Math.max(1, s*0.025);
    ctx.beginPath(); ctx.moveTo(cx, y+h*0.02); ctx.lineTo(cx, y+h*0.50); ctx.stroke();
    return;
  }
  // ── ベッド ──
  if (id === 'furn_bed') {
    const w = s * 0.85, h = s * 0.70;
    const x = cx - w/2, y = cy - h;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx,cy+2,w*0.4,h*0.1,0,0,Math.PI*2); ctx.fill();
    // フレーム
    ctx.fillStyle = '#8B5A1A'; ctx.fillRect(x, y+h*0.12, w, h*0.88);
    // マットレス
    const matGrad = ctx.createLinearGradient(x,y+h*0.2,x,y+h*0.85);
    matGrad.addColorStop(0,'#F0F0F8'); matGrad.addColorStop(1,'#D0D0E0');
    ctx.fillStyle = matGrad; ctx.fillRect(x+w*0.05, y+h*0.22, w*0.90, h*0.62);
    // 枕
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x+w*0.08, y+h*0.26, w*0.28, h*0.20);
    ctx.fillRect(x+w*0.42, y+h*0.26, w*0.28, h*0.20);
    // ヘッドボード
    const hdGrad = ctx.createLinearGradient(x,y,x,y+h*0.18);
    hdGrad.addColorStop(0,'#C07030'); hdGrad.addColorStop(1,'#8B5A1A');
    ctx.fillStyle = hdGrad; ctx.fillRect(x, y, w, h*0.18);
    return;
  }
  // ── 絨毯 ──
  if (id === 'furn_rug') {
    const rw = s*0.90, rh = s*0.38;
    const rx = cx - rw/2, ry = cy - rh;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(rx+4, ry+4, rw, rh);
    ctx.fillStyle = color; ctx.fillRect(rx, ry, rw, rh);
    // ボーダー
    ctx.strokeStyle = lighten(color,40); ctx.lineWidth = Math.max(1.5, s*0.03);
    ctx.strokeRect(rx+s*0.05, ry+s*0.04, rw-s*0.10, rh-s*0.08);
    // 中央模様
    ctx.fillStyle = lighten(color,50);
    ctx.beginPath(); ctx.ellipse(cx, cy-rh*0.5, rw*0.20, rh*0.28, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(cx, cy-rh*0.5, rw*0.10, rh*0.15, 0,0,Math.PI*2); ctx.fill();
    return;
  }
  // ── 観葉植物 ──
  if (id === 'furn_plant') {
    const r = s * 0.44;
    // 鉢
    ctx.fillStyle = '#C06030';
    ctx.beginPath(); ctx.moveTo(cx-r*0.38, cy); ctx.lineTo(cx+r*0.38, cy);
    ctx.lineTo(cx+r*0.28, cy-r*0.45); ctx.lineTo(cx-r*0.28, cy-r*0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#A04020';
    ctx.fillRect(cx-r*0.32, cy-r*0.52, r*0.64, r*0.10);
    // 土
    ctx.fillStyle = '#3A2010'; ctx.fillRect(cx-r*0.28, cy-r*0.50, r*0.56, r*0.08);
    // 葉
    const leaves = [{ax:-0.4,ay:-0.9,rot:0.5},{ax:0.4,ay:-0.9,rot:-0.5},{ax:0,ay:-1.1,rot:0},{ax:-0.6,ay:-0.7,rot:0.8},{ax:0.6,ay:-0.7,rot:-0.8}];
    leaves.forEach(l => {
      ctx.save(); ctx.translate(cx+l.ax*r*0.3, cy+l.ay*r*0.5);
      ctx.rotate(l.rot);
      const lg = ctx.createLinearGradient(0,-r*0.4,0,0);
      lg.addColorStop(0,'#44CC44'); lg.addColorStop(1,'#228822');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.ellipse(0,-r*0.2, r*0.20, r*0.40, 0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    return;
  }
  // ── テーブル ──
  if (id === 'furn_table') {
    const w = s*0.85, h = s*0.55;
    const x = cx - w/2, y = cy - h;
    ctx.fillStyle='rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx,cy+2,w*0.4,h*0.1,0,0,Math.PI*2); ctx.fill();
    // 脚
    ctx.fillStyle = darken(color,20);
    ctx.fillRect(x+w*0.06, y+h*0.28, w*0.08, h*0.72);
    ctx.fillRect(x+w*0.86, y+h*0.28, w*0.08, h*0.72);
    // 天板
    const tgGrad = ctx.createLinearGradient(x,y,x,y+h*0.30);
    tgGrad.addColorStop(0, lighten(color,30)); tgGrad.addColorStop(1, color);
    ctx.fillStyle = tgGrad; ctx.fillRect(x, y, w, h*0.30);
    return;
  }
  // ── 絵画 ──
  if (id === 'furn_painting') {
    const w = s*0.72, h = s*0.60;
    const x = cx - w/2, y = cy - h*1.1;
    // 外枠
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x-3, y-3, w+6, h+6);
    // キャンバス
    const colors2 = ['#FF6644','#44AAFF','#FFDD44','#44DD88'];
    ctx.fillStyle = '#F8F0E0'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors2[0]; ctx.fillRect(x+w*0.08, y+h*0.10, w*0.38, h*0.55);
    ctx.fillStyle = colors2[1]; ctx.beginPath(); ctx.arc(x+w*0.72, y+h*0.35, w*0.18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors2[2]; ctx.fillRect(x+w*0.15, y+h*0.68, w*0.65, h*0.20);
    // 光沢
    ctx.fillStyle='rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w, h*0.12);
    return;
  }
  // ── 暖炉 ──
  if (id === 'furn_fireplace') {
    const w=s*0.80, h=s*0.80, x=cx-w/2, y=cy-h;
    ctx.fillStyle='rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx,cy+2,w*0.35,h*0.1,0,0,Math.PI*2); ctx.fill();
    // 石の外壁
    ctx.fillStyle='#888892'; ctx.fillRect(x,y,w,h);
    // アーチ型開口
    ctx.fillStyle='#181820';
    ctx.beginPath(); ctx.moveTo(x+w*0.15, y+h); ctx.lineTo(x+w*0.15, y+h*0.40);
    ctx.quadraticCurveTo(cx, y+h*0.10, x+w*0.85, y+h*0.40);
    ctx.lineTo(x+w*0.85, y+h); ctx.closePath(); ctx.fill();
    // 炎
    const flames = [{x:0,c:'#FF6600'},{x:-0.12,c:'#FF9900'},{x:0.12,c:'#FF4400'}];
    flames.forEach(f => {
      const fx = cx+f.x*w, fy1 = cy-h*0.25, fy2 = cy-h*0.60;
      const flameGrad = ctx.createLinearGradient(fx, fy2, fx, fy1);
      flameGrad.addColorStop(0, f.c); flameGrad.addColorStop(1, '#FFEE00');
      ctx.fillStyle = flameGrad;
      ctx.beginPath(); ctx.moveTo(fx-w*0.08, fy1); ctx.quadraticCurveTo(fx-w*0.04, fy2, fx, fy2-h*0.06);
      ctx.quadraticCurveTo(fx+w*0.04, fy2, fx+w*0.08, fy1); ctx.closePath(); ctx.fill();
    });
    // 石テクスチャ
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1;
    for(let sy=y+h*0.15;sy<y+h;sy+=h*0.20){
      ctx.beginPath(); ctx.moveTo(x,sy); ctx.lineTo(x+w,sy); ctx.stroke();
    }
    return;
  }
  // ── トロフィー ──
  if (id === 'furn_trophy') {
    const r=s*0.42;
    ctx.fillStyle='rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(cx,cy+2,r*0.4,r*0.1,0,0,Math.PI*2); ctx.fill();
    // 台座
    const baseGrad=ctx.createLinearGradient(cx-r*0.4,cy,cx+r*0.4,cy);
    baseGrad.addColorStop(0,'#C8A020'); baseGrad.addColorStop(0.5,'#FFE060'); baseGrad.addColorStop(1,'#C8A020');
    ctx.fillStyle=baseGrad; ctx.fillRect(cx-r*0.40,cy-r*0.18,r*0.80,r*0.18);
    ctx.fillRect(cx-r*0.22,cy-r*0.34,r*0.44,r*0.20);
    // カップ
    ctx.fillStyle=baseGrad;
    ctx.beginPath(); ctx.moveTo(cx-r*0.42,cy-r*0.38); ctx.lineTo(cx-r*0.50,cy-r*0.90);
    ctx.quadraticCurveTo(cx-r*0.50,cy-r*1.05,cx,cy-r*1.05);
    ctx.quadraticCurveTo(cx+r*0.50,cy-r*1.05,cx+r*0.50,cy-r*0.90);
    ctx.lineTo(cx+r*0.42,cy-r*0.38); ctx.closePath(); ctx.fill();
    // 持ち手
    ctx.strokeStyle='#FFE060'; ctx.lineWidth=Math.max(1.5,r*0.08);
    ctx.beginPath(); ctx.arc(cx-r*0.53,cy-r*0.68,r*0.14,0.5*Math.PI,1.5*Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+r*0.53,cy-r*0.68,r*0.14,-0.5*Math.PI,0.5*Math.PI); ctx.stroke();
    // 光沢
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(cx-r*0.12,cy-r*0.80,r*0.08,r*0.16,-0.4,0,Math.PI*2); ctx.fill();
    return;
  }
  // ── その他（ラベル付き汎用ボックス）──
  const bw = s*0.80, bh = s*0.60;
  const bx = cx - bw/2, by = cy - bh;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, cy+2, bw*0.42, bh*0.12, 0,0,Math.PI*2); ctx.fill();
  const boxGrad = ctx.createLinearGradient(bx, by, bx, by+bh);
  boxGrad.addColorStop(0, lighten(color, 25)); boxGrad.addColorStop(1, color);
  ctx.fillStyle = boxGrad; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = darken(color, 20); ctx.fillRect(bx+2, by+2, bw-4, bh-4);
  ctx.fillStyle = boxGrad; ctx.fillRect(bx+4, by+4, bw-8, bh-8);
  const fs2 = Math.max(8, Math.floor(s * 0.14));
  ctx.font = `bold ${fs2}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((name ?? '').slice(0, 5), cx, cy - bh*0.50);
}

// ── ヤミー描画ヘルパー ────────────────────────────────────────────────────────
// ヤミー: かわいい白〜ラベンダーのおばけキャラ
// x, y: 体の上部中心, r: 基準半径, glowAlpha: オーラ強度(0〜1)
function yamiiPath(ctx, x, y, r) {
  // おばけシルエット：丸い上部＋下部ふわふわ3バンプ
  const cx = x, cy = y + r * 0.05;
  const hr = r * 0.88;
  const peakY = cy + hr * 0.60;
  const tipY  = cy + hr * 1.08;

  ctx.beginPath();
  ctx.arc(cx, cy, hr, Math.PI, 0, false);          // 上半円
  ctx.lineTo(cx + hr, peakY);                       // 右側ライン
  // 右バンプ
  ctx.quadraticCurveTo(cx + hr * 0.80, tipY,        cx + hr * 0.52, peakY);
  // 中央バンプ
  ctx.quadraticCurveTo(cx + hr * 0.22, tipY - r * 0.12, cx,         tipY - r * 0.06);
  ctx.quadraticCurveTo(cx - hr * 0.22, tipY - r * 0.12, cx - hr * 0.52, peakY);
  // 左バンプ
  ctx.quadraticCurveTo(cx - hr * 0.80, tipY,        cx - hr, peakY);
  ctx.closePath();
}

function drawYamii(ctx, x, y, r, glowAlpha = 0.8) {
  const cx = x, cy = y;

  // ── 地面の影（楕円）
  ctx.fillStyle = `rgba(180,185,200,${glowAlpha * 0.22})`;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.08, cy + r * 1.18, r * 0.75, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 白いオーラ
  const aura = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.2);
  aura.addColorStop(0,    `rgba(220,230,255,${glowAlpha * 0.38})`);
  aura.addColorStop(0.45, `rgba(200,215,245,${glowAlpha * 0.18})`);
  aura.addColorStop(0.75, `rgba(215,225,255,${glowAlpha * 0.07})`);
  aura.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // ── ミニ星パーティクル（オーラ内に浮かぶ）
  if (glowAlpha > 0.5) {
    ctx.save();
    ctx.font = `${r * 0.22}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [[-1.55, -0.60], [1.45, -0.80], [-1.30, 0.30], [1.55, 0.15]].forEach(([ox, oy], i) => {
      ctx.globalAlpha = glowAlpha * (0.35 + i * 0.06);
      ctx.fillStyle = i % 2 === 0 ? '#D0D8F0' : '#B8C8E8';
      ctx.fillText('✦', cx + r * ox, cy + r * oy);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── 左腕
  ctx.save();
  ctx.translate(cx - r * 0.92, cy + r * 0.12);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#C0C8D8';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.31 + r * 0.05, r * 0.21 + r * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  const armGrad = ctx.createLinearGradient(-r * 0.3, -r * 0.2, r * 0.3, r * 0.2);
  armGrad.addColorStop(0, '#FFFFFF');
  armGrad.addColorStop(1, '#EEF0F8');
  ctx.fillStyle = armGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.31, r * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 右腕
  ctx.save();
  ctx.translate(cx + r * 0.90, cy - r * 0.10);
  ctx.rotate(0.55);
  ctx.fillStyle = '#C0C8D8';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.28 + r * 0.05, r * 0.19 + r * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  const armGrad2 = ctx.createLinearGradient(-r * 0.3, -r * 0.2, r * 0.3, r * 0.2);
  armGrad2.addColorStop(0, '#EEF0F8');
  armGrad2.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = armGrad2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.28, r * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 体（おばけ本体）アウトライン
  ctx.save();
  ctx.shadowColor = `rgba(160,170,200,${glowAlpha * 0.50})`;
  ctx.shadowBlur  = r * 0.65;
  yamiiPath(ctx, cx, cy, r * 1.06);
  ctx.fillStyle = '#C0C8D8';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── 体本体グラデーション（純白→淡グレー）
  yamiiPath(ctx, cx, cy, r);
  const bodyGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.6, cy + r * 1.1);
  bodyGrad.addColorStop(0,    '#FFFFFF');  // 上：純白
  bodyGrad.addColorStop(0.20, '#F8F9FF');  // 極淡ブルー白
  bodyGrad.addColorStop(0.55, '#ECEEF8');  // 淡グレー
  bodyGrad.addColorStop(1,    '#D8DCF0');  // やや青みグレー
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // ── ふわふわテクスチャ（体に淡いグレーの点）
  yamiiPath(ctx, cx, cy, r);
  ctx.save();
  ctx.clip();
  for (let di = 0; di < 6; di++) {
    const da = (di / 6) * Math.PI * 2;
    const dd = r * 0.38;
    ctx.fillStyle = 'rgba(180,190,215,0.15)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(da)*dd, cy + Math.sin(da)*dd*0.55 + r*0.15, r*0.18, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  // ── ハイライト（左上の光沢）
  yamiiPath(ctx, cx, cy, r);
  ctx.save();
  ctx.clip();
  const hl = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.38, 0, cx - r * 0.28, cy - r * 0.38, r * 0.62);
  hl.addColorStop(0,   'rgba(255,255,255,0.80)');
  hl.addColorStop(0.50,'rgba(255,255,255,0.25)');
  hl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  ctx.restore();

  // ── 魔法のティアラ（頭上）
  if (r >= 10) {
    const crX = cx;
    const crY = cy - r * 0.90;
    const crW = r * 0.58;
    ctx.save();
    // ティアラバンド（ゴールド）
    const bandGrad = ctx.createLinearGradient(crX - crW, crY + r*0.06, crX + crW, crY + r*0.06);
    bandGrad.addColorStop(0,   '#C8A000');
    bandGrad.addColorStop(0.5, '#FFE060');
    bandGrad.addColorStop(1,   '#C8A000');
    ctx.fillStyle = bandGrad;
    roundRect(ctx, crX - crW, crY, crW * 2, r * 0.13, r * 0.05);
    ctx.fill();
    // 中央の大きな宝石（サファイア青）
    ctx.shadowColor = '#80B8FF'; ctx.shadowBlur = r * 0.35;
    const gemGrad = ctx.createRadialGradient(crX - r*0.03, crY - r*0.07, 0, crX, crY - r*0.04, r*0.14);
    gemGrad.addColorStop(0,   '#E0F0FF');
    gemGrad.addColorStop(0.5, '#60A8FF');
    gemGrad.addColorStop(1,   '#1860C8');
    ctx.fillStyle = gemGrad;
    ctx.beginPath();
    ctx.arc(crX, crY - r * 0.04, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 中央宝石ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(crX - r*0.04, crY - r*0.10, r*0.05, 0, Math.PI * 2);
    ctx.fill();
    // 左の小宝石（ローズ）
    ctx.shadowColor = '#FFB0D8'; ctx.shadowBlur = r * 0.25;
    ctx.fillStyle = '#FF80B8';
    ctx.beginPath();
    ctx.arc(crX - crW * 0.52, crY + r*0.04, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // 右の小宝石（エメラルド）
    ctx.shadowColor = '#80FFB0'; ctx.shadowBlur = r * 0.25;
    ctx.fillStyle = '#40C870';
    ctx.beginPath();
    ctx.arc(crX + crW * 0.52, crY + r*0.04, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // ティアラから出る細い輝き
    if (r >= 16) {
      [[crX, crY - r*0.04, '#80C8FF'], [crX - crW*0.52, crY+r*0.04, '#FFB0D8'], [crX + crW*0.52, crY+r*0.04, '#80FFB8']].forEach(([gx, gy, gc]) => {
        ctx.strokeStyle = gc; ctx.lineWidth = r * 0.025; ctx.globalAlpha = 0.70;
        [-0.4, 0, 0.4].forEach(ang => {
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + Math.cos(-Math.PI/2 + ang) * r*0.28, gy + Math.sin(-Math.PI/2 + ang) * r*0.28);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      });
    }
    ctx.restore();
  }
  // ── リボン（ティアラの下）
  if (r >= 12) {
    const rbX = cx + r * 0.28;
    const rbY = cy - r * 0.76;
    const rbR = r * 0.18;
    ctx.fillStyle = '#FF70A8';
    ctx.beginPath();
    ctx.ellipse(rbX - rbR * 0.9, rbY, rbR, rbR * 0.60, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(rbX + rbR * 0.9, rbY, rbR, rbR * 0.60, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF90B8';
    ctx.beginPath();
    ctx.arc(rbX, rbY, rbR * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 目（大きなキラキラ目）
  const eyeR  = r * 0.21;
  const eyeY  = cy - r * 0.06;
  for (const sign of [-1, 1]) {
    const ex = cx + sign * r * 0.29;
    // 目の縁（濃いグレー）
    ctx.fillStyle = '#555870';
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR * 1.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2A2C38';
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // 虹彩（深ブルーグレー）
    ctx.fillStyle = '#485878';
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeR * 0.08, eyeR * 0.68, 0, Math.PI * 2);
    ctx.fill();
    // 白ハイライト（大）
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ex - eyeR * 0.28, eyeY - eyeR * 0.32, eyeR * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // 白ハイライト（小）
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.beginPath();
    ctx.arc(ex + eyeR * 0.24, eyeY + eyeR * 0.20, eyeR * 0.20, 0, Math.PI * 2);
    ctx.fill();
    // まつ毛（上）
    if (r >= 14) {
      ctx.strokeStyle = '#2A2C38';
      ctx.lineWidth = r * 0.042;
      ctx.lineCap = 'round';
      for (let li = 0; li < 3; li++) {
        const la = -Math.PI * 0.68 + li * 0.30;
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(la) * eyeR, eyeY + Math.sin(la) * eyeR);
        ctx.lineTo(ex + Math.cos(la) * eyeR * 1.55, eyeY + Math.sin(la) * eyeR * 1.55 - r * 0.06);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }

  // ── ほっぺ（淡いピンク）
  ctx.fillStyle = 'rgba(255,170,195,0.40)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.52, cy + r * 0.20, r * 0.24, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.52, cy + r * 0.20, r * 0.24, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 口（スマイル）
  ctx.strokeStyle = '#909DB8';
  ctx.lineWidth   = r * 0.090;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.32, r * 0.16, 0.12, Math.PI - 0.12);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ── ヤミーぬいぐるみ描画 ──────────────────────────────────────────────────────
// ぬいぐるみ版：縫い目・タグ付きのふわふわヤミー
function drawYamiiPlush(ctx, x, y, r) {
  // 地面影
  ctx.fillStyle = 'rgba(170,175,195,0.20)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.08, y + r * 1.20, r * 0.72, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 左腕（ぬいぐるみ感・楕円）
  ctx.fillStyle = '#C0C8D8';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.92, y + r * 0.12, r * 0.31 + r * 0.05, r * 0.21 + r * 0.05, -0.35, 0, Math.PI * 2);
  ctx.fill();
  const arm1Grad = ctx.createLinearGradient(x - r * 1.2, y, x - r * 0.6, y + r * 0.3);
  arm1Grad.addColorStop(0, '#FFFFFF');
  arm1Grad.addColorStop(1, '#ECEEF8');
  ctx.fillStyle = arm1Grad;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.92, y + r * 0.12, r * 0.31, r * 0.21, -0.35, 0, Math.PI * 2);
  ctx.fill();
  // 腕の縫い目（点線）
  ctx.strokeStyle = 'rgba(170,180,200,0.42)';
  ctx.lineWidth   = r * 0.06;
  ctx.setLineDash([r * 0.09, r * 0.09]);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.92, y + r * 0.12, r * 0.20, r * 0.13, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 右腕
  ctx.fillStyle = '#C0C8D8';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.90, y - r * 0.10, r * 0.29 + r * 0.05, r * 0.20 + r * 0.05, 0.55, 0, Math.PI * 2);
  ctx.fill();
  const arm2Grad = ctx.createLinearGradient(x + r * 0.6, y - r * 0.3, x + r * 1.2, y);
  arm2Grad.addColorStop(0, '#ECEEF8');
  arm2Grad.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = arm2Grad;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.90, y - r * 0.10, r * 0.29, r * 0.20, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,180,200,0.42)';
  ctx.lineWidth   = r * 0.06;
  ctx.setLineDash([r * 0.09, r * 0.09]);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.90, y - r * 0.10, r * 0.18, r * 0.12, 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 体アウトライン
  yamiiPath(ctx, x, y, r * 1.07);
  ctx.fillStyle = '#C0C8D8';
  ctx.fill();

  // ── 体本体（ぬいぐるみ生地・白グラデーション）
  yamiiPath(ctx, x, y, r);
  const bodyGrad = ctx.createLinearGradient(x - r, y - r, x + r * 0.6, y + r * 1.1);
  bodyGrad.addColorStop(0,   '#FFFFFF');
  bodyGrad.addColorStop(0.25,'#F8F9FF');
  bodyGrad.addColorStop(0.60,'#ECEEF8');
  bodyGrad.addColorStop(1,   '#D8DCF0');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // ── 縫い目ライン（ぬいぐるみらしさ）
  ctx.strokeStyle = 'rgba(165,175,200,0.38)';
  ctx.lineWidth   = r * 0.065;
  ctx.setLineDash([r * 0.10, r * 0.09]);
  // 縦の中央縫い目
  yamiiPath(ctx, x, y, r);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.86);
  ctx.lineTo(x, y + r * 0.50);
  ctx.stroke();
  // 横の境目縫い目（ボディ中間）
  ctx.beginPath();
  ctx.arc(x, y + r * 0.04, r * 0.68, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // ── ハイライト（光沢）
  yamiiPath(ctx, x, y, r);
  ctx.save();
  ctx.clip();
  const hl = ctx.createRadialGradient(x - r * 0.28, y - r * 0.38, 0, x - r * 0.28, y - r * 0.38, r * 0.60);
  hl.addColorStop(0,   'rgba(255,255,255,0.68)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  hl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.restore();

  // ── 刺繍目（ぬいぐるみ目・グレー縁）
  const eyeR = r * 0.19;
  const eyeY = y - r * 0.06;
  for (const sign of [-1, 1]) {
    const ex = x + sign * r * 0.28;
    ctx.strokeStyle = '#555870';
    ctx.lineWidth   = r * 0.07;
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2A2C38';
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR * 0.80, 0, Math.PI * 2);
    ctx.fill();
    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(ex - eyeR * 0.28, eyeY - eyeR * 0.32, eyeR * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 刺繍ほっぺ（淡ピンク）
  ctx.fillStyle = 'rgba(255,170,195,0.40)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.51, y + r * 0.20, r * 0.23, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.51, y + r * 0.20, r * 0.23, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 刺繍スマイル（グレーステッチ）
  ctx.strokeStyle = '#909DB8';
  ctx.lineWidth   = r * 0.09;
  ctx.lineCap     = 'round';
  ctx.setLineDash([r * 0.10, r * 0.09]);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.32, r * 0.15, 0.18, Math.PI - 0.18);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';

  // ── ミニリボン（頭の上）
  if (r >= 10) {
    const rbX = x + r * 0.28;
    const rbY = y - r * 0.82;
    const rbR = r * 0.20;
    ctx.fillStyle = '#FF70A8';
    ctx.beginPath();
    ctx.ellipse(rbX - rbR * 0.85, rbY, rbR, rbR * 0.58, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(rbX + rbR * 0.85, rbY, rbR, rbR * 0.58, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF90B8';
    ctx.beginPath();
    ctx.arc(rbX, rbY, rbR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── タグ（左下にぶら下がり）
  const tagX = x - r * 0.48;
  const tagY = y + r * 1.05;
  // タグの紐（ピンク）
  ctx.strokeStyle = '#E8A0C0';
  ctx.lineWidth   = r * 0.07;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(tagX, tagY - r * 0.02);
  ctx.lineTo(tagX + r * 0.04, tagY + r * 0.20);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // タグ本体
  const tagW = r * 0.42, tagH = r * 0.28;
  const tagBX = tagX - tagW / 2 + r * 0.04;
  const tagBY = tagY + r * 0.20;
  ctx.fillStyle   = '#FFF5FA';
  ctx.strokeStyle = '#E8A0C0';
  ctx.lineWidth   = r * 0.07;
  roundRect(ctx, tagBX, tagBY, tagW, tagH, r * 0.06);
  ctx.fill();
  ctx.stroke();
  // タグの穴
  ctx.strokeStyle = '#E8A0C0';
  ctx.lineWidth   = r * 0.06;
  ctx.beginPath();
  ctx.arc(tagBX + tagW / 2, tagBY + r * 0.04, r * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  // タグのハート＋文字
  ctx.fillStyle    = '#FF6090';
  ctx.font         = `${r * 0.18}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♡', tagBX + tagW / 2, tagBY + tagH * 0.65);
  ctx.textBaseline = 'alphabetic';
}

// ── 庭の描画 ─────────────────────────────────────────────────────────────────
function drawGarden(ctx, gardenId, cx, groundY) {
  switch (gardenId) {
    case 'garden_flowers': {
      const flowers = [
        { x: cx - 100, c: '#FF6699' }, { x: cx - 76, c: '#FFD700' },
        { x: cx - 52, c: '#FF8844' }, { x: cx + 52, c: '#88DD44' },
        { x: cx + 76, c: '#FF6699' }, { x: cx + 100, c: '#FFD700' },
      ];
      flowers.forEach(f => {
        ctx.fillStyle = '#228822';
        ctx.fillRect(f.x - 1, groundY - 16, 2, 16);
        ctx.beginPath();
        ctx.arc(f.x, groundY - 18, 8, 0, Math.PI * 2);
        ctx.fillStyle = f.c;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(f.x, groundY - 18, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFaa';
        ctx.fill();
      });
      break;
    }
    case 'garden_fence': {
      const fw = 260, fx = cx - fw / 2;
      // 奥のレール
      ctx.fillStyle = '#7B5828';
      ctx.fillRect(fx + 4, groundY - 30, fw, 3);
      ctx.fillRect(fx + 4, groundY - 19, fw, 3);
      // 正面のレール
      ctx.fillStyle = '#8B6430';
      ctx.fillRect(fx, groundY - 16, fw, 4);
      ctx.fillRect(fx, groundY - 28, fw, 4);
      for (let bx = fx; bx <= fx + fw; bx += 16) {
        ctx.fillStyle = '#9B7440';
        ctx.fillRect(bx, groundY - 33, 6, 37);
        ctx.fillStyle = '#7B5828';
        ctx.fillRect(bx + 6, groundY - 30, 2, 34);
      }
      break;
    }
    case 'garden_fountain': {
      // 台座（3D）
      ctx.fillStyle = '#606060';
      ctx.beginPath();
      ctx.ellipse(cx + 4, groundY - 4, 42, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7A7A7A';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 5, 42, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      // 池
      ctx.fillStyle = '#1A5080';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 7, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(100,180,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 7, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // 柱
      ctx.fillStyle = '#888888';
      ctx.fillRect(cx - 5, groundY - 40, 10, 33);
      ctx.fillStyle = '#A0A0A0';
      ctx.fillRect(cx - 5, groundY - 40, 4, 33);
      // 水しぶき
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        ctx.strokeStyle = `rgba(120,200,255,${0.5 - a * 0.05})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, groundY - 40);
        ctx.quadraticCurveTo(
          cx + Math.cos(angle) * 20, groundY - 55,
          cx + Math.cos(angle) * 30, groundY - 28
        );
        ctx.stroke();
      }
      break;
    }
    case 'garden_statue': {
      // 台座（3D）
      ctx.fillStyle = '#505050';
      ctx.fillRect(cx - 16 + 4, groundY - 10, 32, 10);
      ctx.fillStyle = '#686868';
      ctx.fillRect(cx - 16, groundY - 10, 32, 10);
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(cx - 12 + 4, groundY - 19, 24, 9);
      ctx.fillStyle = '#606060';
      ctx.fillRect(cx - 12, groundY - 19, 24, 9);
      // 像
      ctx.fillStyle = '#C8A020';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(cx, groundY - 40, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 9, groundY - 29, 18, 22);
      ctx.shadowBlur = 0;
      // 光輪
      ctx.strokeStyle = '#FFD70088';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, groundY - 42, 16, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'garden_zen': {
      // 砂紋（波紋ライン）
      ctx.strokeStyle = 'rgba(210,195,160,0.35)';
      ctx.lineWidth = 1;
      for (let r = 14; r <= 52; r += 9) {
        ctx.beginPath();
        ctx.ellipse(cx, groundY - 6, r, r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 置き石 × 3
      const zenStones = [
        { ox: -44, ow: 22, oh: 14 }, { ox: 0, ow: 14, oh: 10 }, { ox: 40, ow: 18, oh: 12 },
      ];
      zenStones.forEach(s => {
        ctx.fillStyle = '#555560';
        ctx.beginPath();
        ctx.ellipse(cx + s.ox + 3, groundY - s.oh / 2 - 2, s.ow / 2, s.oh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78787E';
        ctx.beginPath();
        ctx.ellipse(cx + s.ox, groundY - s.oh / 2 - 3, s.ow / 2, s.oh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // ハイライト
        ctx.fillStyle = 'rgba(200,200,210,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx + s.ox - 3, groundY - s.oh / 2 - 5, s.ow / 4, s.oh / 4, -0.4, 0, Math.PI * 2);
        ctx.fill();
      });
      // 石灯籠
      ctx.fillStyle = '#484848';
      ctx.fillRect(cx + 60 + 2, groundY - 34, 12, 34);   // 右面
      ctx.fillStyle = '#666666';
      ctx.fillRect(cx + 56, groundY - 34, 12, 34);        // 正面柱
      ctx.fillStyle = '#404040';
      ctx.fillRect(cx + 52, groundY - 36, 20, 6);         // 傘
      ctx.fillStyle = 'rgba(255,230,120,0.55)';
      ctx.beginPath();
      ctx.arc(cx + 62, groundY - 22, 5, 0, Math.PI * 2); // 灯り
      ctx.fill();
      break;
    }
    case 'garden_paradise': {
      // 地面グラデーション（明るい草）
      const paraGrad = ctx.createRadialGradient(cx, groundY - 4, 10, cx, groundY - 4, 70);
      paraGrad.addColorStop(0, 'rgba(60,160,60,0.30)');
      paraGrad.addColorStop(1, 'rgba(30,100,30,0)');
      ctx.fillStyle = paraGrad;
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 4, 80, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // ヤシの木（右）
      ctx.fillStyle = '#7A5020';
      ctx.fillRect(cx + 72 + 2, groundY - 60, 6, 62);    // 右面
      ctx.fillStyle = '#9A6828';
      ctx.fillRect(cx + 68, groundY - 60, 7, 62);         // 幹
      // 葉
      const palmLeaves = [
        { ax: -28, ay: -18 }, { ax: -14, ay: -28 }, { ax: 6, ay: -30 },
        { ax: 22, ay: -20 }, { ax: 28, ay: -8 },
      ];
      palmLeaves.forEach(l => {
        ctx.strokeStyle = '#2A9A2A';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 71, groundY - 60);
        ctx.quadraticCurveTo(
          cx + 71 + l.ax * 0.5, groundY - 60 + l.ay * 0.5,
          cx + 71 + l.ax, groundY - 60 + l.ay
        );
        ctx.stroke();
      });
      ctx.lineCap = 'butt';
      // 色とりどりの花 × 5
      const paraFlowers = [
        { x: -80, c: '#FF4488' }, { x: -58, c: '#FFAA00' }, { x: -38, c: '#FF6600' },
        { x: 38, c: '#44DDAA' }, { x: 56, c: '#FF88CC' },
      ];
      paraFlowers.forEach(f => {
        ctx.fillStyle = '#22AA22';
        ctx.fillRect(cx + f.x - 1, groundY - 20, 2, 20);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + f.x + Math.cos(a) * 6, groundY - 22 + Math.sin(a) * 4, 5, 0, Math.PI * 2);
          ctx.fillStyle = f.c;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx + f.x, groundY - 22, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFAA';
        ctx.fill();
      });
      // 蝶
      ctx.fillStyle = 'rgba(255,200,50,0.7)';
      ctx.beginPath();
      ctx.ellipse(cx - 20, groundY - 38, 8, 5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - 12, groundY - 36, 6, 4, -0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'garden_yamii': {
      // ── ヤミーの庭 ── 水晶魔法庭園・ファンタジー！

      // オーロラ空（背景の広いグラデーション）
      const skyAurora = ctx.createLinearGradient(cx - 130, groundY - 90, cx + 130, groundY - 10);
      skyAurora.addColorStop(0,   'rgba(20,0,60,0.55)');
      skyAurora.addColorStop(0.3, 'rgba(60,0,120,0.40)');
      skyAurora.addColorStop(0.6, 'rgba(0,60,120,0.35)');
      skyAurora.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = skyAurora;
      ctx.beginPath(); ctx.ellipse(cx, groundY - 50, 135, 90, 0, 0, Math.PI * 2); ctx.fill();

      // オーロラカーテン（縦の光の帯）
      [
        { x: cx - 95, col1: 'rgba(80,255,200,0.28)', col2: 'rgba(80,255,200,0)' },
        { x: cx - 45, col1: 'rgba(160,80,255,0.22)', col2: 'rgba(160,80,255,0)' },
        { x: cx + 10, col1: 'rgba(80,160,255,0.25)', col2: 'rgba(80,160,255,0)' },
        { x: cx + 65, col1: 'rgba(255,80,200,0.20)', col2: 'rgba(255,80,200,0)' },
        { x: cx + 110, col1: 'rgba(80,255,160,0.22)', col2: 'rgba(80,255,160,0)' },
      ].forEach(ab => {
        const ag = ctx.createLinearGradient(ab.x - 16, groundY - 90, ab.x + 16, groundY - 90);
        ag.addColorStop(0, ab.col2); ag.addColorStop(0.5, ab.col1); ag.addColorStop(1, ab.col2);
        const vg = ctx.createLinearGradient(ab.x, groundY - 90, ab.x, groundY - 5);
        vg.addColorStop(0, ab.col1); vg.addColorStop(1, ab.col2);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = vg;
        ctx.fillRect(ab.x - 16, groundY - 90, 32, 85);
        ctx.restore();
      });

      // 地面の魔法陣グロー
      const magicGlow = ctx.createRadialGradient(cx, groundY - 2, 5, cx, groundY - 2, 110);
      magicGlow.addColorStop(0,    'rgba(180,120,255,0.55)');
      magicGlow.addColorStop(0.35, 'rgba(100,60,200,0.28)');
      magicGlow.addColorStop(0.70, 'rgba(60,30,120,0.12)');
      magicGlow.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = magicGlow;
      ctx.beginPath(); ctx.ellipse(cx, groundY - 2, 110, 24, 0, 0, Math.PI * 2); ctx.fill();

      // 地面魔法陣（大きな円＋六角）
      ctx.save();
      ctx.shadowColor = 'rgba(160,100,255,0.75)'; ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(200,150,255,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, groundY - 1, 88, 12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,220,255,0.40)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(cx, groundY - 1, 60, 8, 0, 0, Math.PI * 2); ctx.stroke();
      for (let hi = 0; hi < 6; hi++) {
        const ha = (hi / 6) * Math.PI * 2;
        const hx = cx + Math.cos(ha) * 88;
        const hy = groundY - 1 + Math.sin(ha) * 12;
        ctx.fillStyle = 'rgba(220,180,255,0.80)';
        ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // 水晶柱（左側）
      const crystalDefs = [
        { x: cx - 105, h: 42, w: 10, col1: '#A0C8FF', col2: '#6090E0', glow: 'rgba(120,160,255,0.55)' },
        { x: cx - 90,  h: 28, w: 7,  col1: '#C8A0FF', col2: '#8060C0', glow: 'rgba(160,120,255,0.50)' },
        { x: cx + 86,  h: 38, w: 9,  col1: '#A0FFD8', col2: '#50C090', glow: 'rgba(100,220,180,0.55)' },
        { x: cx + 102, h: 24, w: 7,  col1: '#FFD0A0', col2: '#E09040', glow: 'rgba(255,180,100,0.50)' },
      ];
      crystalDefs.forEach(cr => {
        const crystalGrad = ctx.createLinearGradient(cr.x - cr.w/2, groundY - cr.h, cr.x + cr.w/2, groundY);
        crystalGrad.addColorStop(0,   cr.col1);
        crystalGrad.addColorStop(0.5, cr.col2);
        crystalGrad.addColorStop(1,   cr.col2);
        ctx.save();
        ctx.shadowColor = cr.glow; ctx.shadowBlur = 14;
        // 水晶の六角柱
        ctx.beginPath();
        ctx.moveTo(cr.x, groundY - cr.h - cr.w * 0.5);          // top tip
        ctx.lineTo(cr.x + cr.w * 0.5, groundY - cr.h * 0.65);   // top right
        ctx.lineTo(cr.x + cr.w * 0.5, groundY);                  // bottom right
        ctx.lineTo(cr.x - cr.w * 0.5, groundY);                  // bottom left
        ctx.lineTo(cr.x - cr.w * 0.5, groundY - cr.h * 0.65);   // top left
        ctx.closePath();
        ctx.fillStyle = crystalGrad; ctx.fill();
        // 水晶ハイライト
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(cr.x - cr.w * 0.15, groundY - cr.h - cr.w * 0.3);
        ctx.lineTo(cr.x - cr.w * 0.35, groundY - cr.h * 0.65);
        ctx.lineTo(cr.x - cr.w * 0.10, groundY - cr.h * 0.70);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });

      // 魔法の虹アーチ（虹色グラデーション）
      const arcBands = [
        { r: 78, col: 'rgba(255,80,80,0.45)' },   { r: 70, col: 'rgba(255,160,40,0.45)' },
        { r: 62, col: 'rgba(255,240,40,0.45)' },  { r: 54, col: 'rgba(80,220,80,0.45)' },
        { r: 46, col: 'rgba(40,160,255,0.48)' },  { r: 38, col: 'rgba(120,80,255,0.50)' },
        { r: 30, col: 'rgba(220,80,220,0.50)' },
      ];
      arcBands.forEach(b => {
        ctx.save(); ctx.strokeStyle = b.col; ctx.lineWidth = 7;
        ctx.shadowColor = b.col; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(cx, groundY - 6, b.r, Math.PI, 0); ctx.stroke();
        ctx.restore();
      });

      // 輝く花（宝石花）
      const gemFlowers = [
        { x: cx - 58, col: '#FF80C0', h: 16 }, { x: cx - 36, col: '#FFD060', h: 12 },
        { x: cx + 34, col: '#80FFD0', h: 13 }, { x: cx + 58, col: '#A080FF', h: 15 },
      ];
      gemFlowers.forEach(f => {
        // 茎
        ctx.strokeStyle = 'rgba(80,200,100,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, groundY); ctx.lineTo(f.x, groundY - f.h); ctx.stroke();
        // 花びら（宝石）
        for (let p = 0; p < 5; p++) {
          const fa = (p / 5) * Math.PI * 2;
          ctx.save();
          ctx.shadowColor = f.col; ctx.shadowBlur = 8;
          ctx.fillStyle = f.col;
          ctx.beginPath();
          ctx.ellipse(f.x + Math.cos(fa) * 5.5, groundY - f.h + Math.sin(fa) * 4, 5, 3.2, fa, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // 花芯
        ctx.save();
        ctx.shadowColor = '#FFFF80'; ctx.shadowBlur = 6;
        ctx.fillStyle = '#FFFF80';
        ctx.beginPath(); ctx.arc(f.x, groundY - f.h, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // ゴールドの魔法パーティクル
      const fantasySparkColors = [
        'rgba(255,220,80,0.95)', 'rgba(160,200,255,0.92)', 'rgba(200,160,255,0.90)',
        'rgba(80,255,200,0.88)', 'rgba(255,160,200,0.90)',
      ];
      for (let si = 0; si < 28; si++) {
        const sa = (si / 28) * Math.PI * 2;
        const sd = 38 + (si % 6) * 14;
        const sx = cx + Math.cos(sa) * sd;
        const sy = groundY - 18 + Math.sin(sa) * sd * 0.20 - (si % 6) * 8;
        const sc = fantasySparkColors[si % fantasySparkColors.length];
        const sr = si % 4 === 0 ? 2.5 : si % 4 === 1 ? 1.8 : 1.3;
        ctx.save();
        ctx.shadowColor = sc; ctx.shadowBlur = 8;
        ctx.fillStyle = sc;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        if (sr > 2) {
          ctx.strokeStyle = sc; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(sx - sr*2.5, sy); ctx.lineTo(sx + sr*2.5, sy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx, sy - sr*2.5); ctx.lineTo(sx, sy + sr*2.5); ctx.stroke();
        }
        ctx.restore();
      }

      // 輝く星・宝石の浮遊
      [
        { x: cx - 58, y: groundY - 68, col: 'rgba(255,220,80,0.95)', r: 3.0 },
        { x: cx + 52, y: groundY - 62, col: 'rgba(120,200,255,0.90)', r: 2.5 },
        { x: cx - 22, y: groundY - 82, col: 'rgba(200,120,255,0.92)', r: 2.8 },
        { x: cx + 28, y: groundY - 80, col: 'rgba(80,255,180,0.88)', r: 2.2 },
        { x: cx - 88, y: groundY - 45, col: 'rgba(255,160,80,0.90)', r: 2.5 },
        { x: cx + 90, y: groundY - 42, col: 'rgba(255,80,180,0.88)', r: 2.2 },
      ].forEach(gem => {
        ctx.save();
        ctx.shadowColor = gem.col; ctx.shadowBlur = 10;
        ctx.fillStyle = gem.col;
        ctx.beginPath(); ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = gem.col; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(gem.x - gem.r*3, gem.y); ctx.lineTo(gem.x + gem.r*3, gem.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gem.x, gem.y - gem.r*3); ctx.lineTo(gem.x, gem.y + gem.r*3); ctx.stroke();
        ctx.restore();
      });

      // 左のちびヤミー
      drawYamii(ctx, cx - 78, groundY - 20, 16, 0.78);
      // 右のちびヤミー
      drawYamii(ctx, cx + 76, groundY - 18, 17, 0.80);
      // 中央のメインヤミー（大きい！）
      drawYamii(ctx, cx, groundY - 48, 36, 1.0);

      ctx.shadowBlur = 0;
      break;
    }
    case 'garden_void': {
      // 暗い地面オーラ
      const voidGrad = ctx.createRadialGradient(cx, groundY - 4, 5, cx, groundY - 4, 90);
      voidGrad.addColorStop(0, 'rgba(100,0,200,0.45)');
      voidGrad.addColorStop(0.5, 'rgba(40,0,80,0.25)');
      voidGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = voidGrad;
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 4, 90, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      // 中央の虚空の裂け目
      const riftGrad = ctx.createRadialGradient(cx, groundY - 8, 3, cx, groundY - 8, 26);
      riftGrad.addColorStop(0, 'rgba(160,80,255,0.85)');
      riftGrad.addColorStop(0.5, 'rgba(60,0,120,0.5)');
      riftGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = riftGrad;
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 8, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // 浮遊する暗黒の結晶 × 4
      const crystals = [
        { ox: -62, h: 38, c1: '#6020A8', c2: '#3A1060' },
        { ox: -30, h: 28, c1: '#8030C8', c2: '#4A1480' },
        { ox:  28, h: 32, c1: '#7028B8', c2: '#401070' },
        { ox:  60, h: 42, c1: '#5018A0', c2: '#300C58' },
      ];
      crystals.forEach(cr => {
        // 影
        ctx.fillStyle = 'rgba(80,0,160,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx + cr.ox + 3, groundY - 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // 結晶本体
        ctx.fillStyle = cr.c1;
        ctx.beginPath();
        ctx.moveTo(cx + cr.ox,      groundY - cr.h);
        ctx.lineTo(cx + cr.ox + 9,  groundY - cr.h * 0.55);
        ctx.lineTo(cx + cr.ox + 7,  groundY - 4);
        ctx.lineTo(cx + cr.ox - 5,  groundY - 4);
        ctx.lineTo(cx + cr.ox - 8,  groundY - cr.h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = cr.c2;
        ctx.beginPath();
        ctx.moveTo(cx + cr.ox,      groundY - cr.h);
        ctx.lineTo(cx + cr.ox + 9,  groundY - cr.h * 0.55);
        ctx.lineTo(cx + cr.ox + 4,  groundY - cr.h * 0.55);
        ctx.closePath();
        ctx.fill();
        // 光る先端
        ctx.shadowColor = '#CC88FF';
        ctx.shadowBlur  = 8;
        ctx.fillStyle = 'rgba(220,180,255,0.8)';
        ctx.beginPath();
        ctx.arc(cx + cr.ox, groundY - cr.h, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      // 浮遊パーティクル
      for (let pi = 0; pi < 8; pi++) {
        const px = cx - 75 + pi * 22 + (pi % 3) * 5;
        const py = groundY - 18 - (pi % 4) * 10;
        ctx.fillStyle = `rgba(180,100,255,${0.3 + (pi % 3) * 0.15})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + (pi % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

// ── メイン生成関数 ───────────────────────────────────────────────────────────
function generateFarmImage(farm) {
  const rows    = Math.ceil(MAX_SLOTS / COLS);
  const canvasH = HEADER_H + HOUSE_H + PAD + DY + rows * (CELL_H + ROW_GAP) + PAD;
  const canvas  = createCanvas(CANVAS_W, canvasH);
  const ctx     = canvas.getContext('2d');

  // ── 背景グラデーション ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
  bgGrad.addColorStop(0,   '#0A1A30');
  bgGrad.addColorStop(0.28,'#081505');
  bgGrad.addColorStop(1,   '#040802');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  // ── ヘッダー ──
  const hGrad = ctx.createLinearGradient(0, 0, CANVAS_W, HEADER_H);
  hGrad.addColorStop(0, '#1A3A08');
  hGrad.addColorStop(1, '#0C2006');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H);

  // ヘッダー下境界
  const hBorderGrad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  hBorderGrad.addColorStop(0,   'rgba(60,120,30,0)');
  hBorderGrad.addColorStop(0.2, 'rgba(60,120,30,0.6)');
  hBorderGrad.addColorStop(0.8, 'rgba(60,120,30,0.6)');
  hBorderGrad.addColorStop(1,   'rgba(60,120,30,0)');
  ctx.fillStyle = hBorderGrad;
  ctx.fillRect(0, HEADER_H - 1, CANVAS_W, 2);

  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = 'bold 22px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🌾 農場', 14, 34);

  ctx.fillStyle = '#FFD700';
  ctx.font      = 'bold 15px sans-serif';
  ctx.fillText(`💰 ${farm.coins} G`, 14, 52);

  ctx.fillStyle = '#88DDFF';
  ctx.font      = 'bold 13px sans-serif';
  ctx.fillText(`⚡ Lv.${farm.level ?? 1}`, 122, 52);

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font      = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`収穫 ${farm.totalHarvests}回`, CANVAS_W - DX - 6, 30);
  ctx.fillText(`累計 ${farm.totalCoinsEarned} G`, CANVAS_W - DX - 6, 46);

  // ── 空と家のセクション ──
  const skyGrad = ctx.createLinearGradient(0, HEADER_H, 0, HEADER_H + HOUSE_H);
  skyGrad.addColorStop(0,   '#0A1A38');
  skyGrad.addColorStop(0.7, '#121E14');
  skyGrad.addColorStop(1,   '#1A2A10');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, HEADER_H, CANVAS_W, HOUSE_H);

  // 月
  ctx.shadowColor = 'rgba(220,220,160,0.6)';
  ctx.shadowBlur  = 24;
  ctx.fillStyle   = '#E8E0B0';
  ctx.beginPath();
  ctx.arc(CANVAS_W - DX - 38, HEADER_H + 32, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0A1A38';
  ctx.beginPath();
  ctx.arc(CANVAS_W - DX - 28, HEADER_H + 28, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 星
  const stars = [
    [30,12,1.2],[80,7,0.8],[148,18,1.0],[210,5,0.7],[290,16,1.1],
    [360,8,0.9],[420,20,1.3],[468,11,0.8],[500,5,0.6],[44,30,0.7],
    [130,30,0.9],[240,28,1.0],[390,32,0.8],[70,44,0.7],[310,40,1.1],
  ];
  stars.forEach(([sx, sy, sr]) => {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + sr * 0.25})`;
    ctx.beginPath();
    ctx.arc(sx, HEADER_H + sy, sr, 0, Math.PI * 2);
    ctx.fill();
  });

  // 地面
  const groundY    = HEADER_H + HOUSE_EXT_H - 24;
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, HEADER_H + HOUSE_EXT_H);
  groundGrad.addColorStop(0, '#2A4010');
  groundGrad.addColorStop(1, '#162608');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, CANVAS_W, HEADER_H + HOUSE_EXT_H - groundY);

  // 草のハイライト（地平線）
  const grassHL = ctx.createLinearGradient(0, groundY, 0, groundY + 6);
  grassHL.addColorStop(0, 'rgba(80,160,20,0.35)');
  grassHL.addColorStop(1, 'rgba(80,160,20,0)');
  ctx.fillStyle = grassHL;
  ctx.fillRect(0, groundY, CANVAS_W, 6);

  drawHouse(ctx, farm.house, HEADER_H + 8);

  // ── 農場スロットセクション背景 ──
  const farmSectionY = HEADER_H + HOUSE_H;
  const farmSectionH = canvasH - farmSectionY;
  const farmBg = ctx.createLinearGradient(0, farmSectionY, 0, canvasH);
  farmBg.addColorStop(0, '#0A0C06');
  farmBg.addColorStop(1, '#060804');
  ctx.fillStyle = farmBg;
  ctx.fillRect(0, farmSectionY, CANVAS_W, farmSectionH);

  // 農場セクション区切り
  const divGrad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  divGrad.addColorStop(0,   'rgba(60,120,30,0)');
  divGrad.addColorStop(0.25,'rgba(60,120,30,0.7)');
  divGrad.addColorStop(0.75,'rgba(60,120,30,0.7)');
  divGrad.addColorStop(1,   'rgba(60,120,30,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(0, farmSectionY, CANVAS_W, 2);

  // 農場セクション微妙な格子
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  for (let gy = farmSectionY + 20; gy < canvasH; gy += 40) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
  }
  for (let gx = 30; gx < CANVAS_W; gx += 60) {
    ctx.beginPath(); ctx.moveTo(gx, farmSectionY); ctx.lineTo(gx, canvasH); ctx.stroke();
  }

  // ── スロット描画 ──
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slot = farm.slots[i] ?? { crop: null, planted_at: null };
    drawSlot(ctx, slot, i, farm.slots.length);
  }

  // ── 周囲ビネット ──
  const vignette = ctx.createRadialGradient(
    CANVAS_W / 2, canvasH / 2, canvasH * 0.25,
    CANVAS_W / 2, canvasH / 2, canvasH * 0.75
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  return canvas.toBuffer('image/png');
}

// ── 室内全画面ビュー ─────────────────────────────────────────────────────────
function generateInteriorImage(farm, ownerName = null) {
  const W = 520, H = 420;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const house    = farm.house    || { ...DEFAULT_HOUSE };
  const flrItem  = HOUSE_ITEMS[house.floor]     || HOUSE_ITEMS.floor_dirt;
  const wpItem   = HOUSE_ITEMS[house.wallpaper] || HOUSE_ITEMS.wp_plain;
  const doorItem = HOUSE_ITEMS[house.door]      || HOUSE_ITEMS.door_wood;
  const furniture = (house.furniture || []).slice(0, MAX_FURNITURE);

  // ── 座標定数 ──
  const HDR  = 50;           // ヘッダー高
  const BX1  = 130, BX2 = 390; // 奥壁 X 範囲
  const BY1  = HDR + 32;     // 奥壁 上端
  const BY2  = HDR + 238;    // 奥壁 下端
  const FY   = H - 14;       // 手前床端

  // ── 背景 ──
  ctx.fillStyle = '#05050D';
  ctx.fillRect(0, 0, W, H);

  // ── ヘッダー ──
  const hGrad = ctx.createLinearGradient(0, 0, W, HDR);
  hGrad.addColorStop(0, '#1A1230');
  hGrad.addColorStop(1, '#0C0A1E');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, W, HDR);

  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = 'bold 19px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ownerName ? `🏠 ${ownerName} の部屋` : '🏠 あなたの部屋', 14, HDR / 2);

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font      = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`家具 ${furniture.length}/${MAX_FURNITURE}`, W - 14, HDR / 2);

  // ヘッダー境界線
  const hbGrad = ctx.createLinearGradient(0,0,W,0);
  hbGrad.addColorStop(0,'rgba(100,80,180,0)');
  hbGrad.addColorStop(0.3,'rgba(100,80,180,0.55)');
  hbGrad.addColorStop(0.7,'rgba(100,80,180,0.55)');
  hbGrad.addColorStop(1,'rgba(100,80,180,0)');
  ctx.fillStyle = hbGrad;
  ctx.fillRect(0, HDR - 1, W, 2);

  // ── 天井（台形）──
  const ceilGrad = ctx.createLinearGradient(W/2, HDR, W/2, BY1);
  ceilGrad.addColorStop(0, hexAlpha(wpItem.color, 0.18));
  ceilGrad.addColorStop(1, hexAlpha(wpItem.color, 0.42));
  ctx.beginPath();
  ctx.moveTo(0, HDR); ctx.lineTo(W, HDR);
  ctx.lineTo(BX2, BY1); ctx.lineTo(BX1, BY1);
  ctx.closePath();
  ctx.fillStyle = ceilGrad;
  ctx.fill();
  // 天井影
  const cShad = ctx.createLinearGradient(W/2, HDR, W/2, BY1);
  cShad.addColorStop(0, 'rgba(0,0,0,0.6)');
  cShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(0, HDR); ctx.lineTo(W, HDR);
  ctx.lineTo(BX2, BY1); ctx.lineTo(BX1, BY1); ctx.closePath();
  ctx.fillStyle = cShad; ctx.fill();

  // ── 左壁（台形）──
  const lwGrad = ctx.createLinearGradient(0, 0, BX1, 0);
  lwGrad.addColorStop(0, hexAlpha(wpItem.color, 0.32));
  lwGrad.addColorStop(1, hexAlpha(wpItem.color, 0.58));
  ctx.beginPath();
  ctx.moveTo(0, HDR); ctx.lineTo(BX1, BY1);
  ctx.lineTo(BX1, BY2); ctx.lineTo(0, FY);
  ctx.closePath(); ctx.fillStyle = lwGrad; ctx.fill();
  // 左端シャドウ
  const lwSh = ctx.createLinearGradient(BX1-50, 0, BX1, 0);
  lwSh.addColorStop(0, 'rgba(0,0,0,0)');
  lwSh.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.beginPath();
  ctx.moveTo(0, HDR); ctx.lineTo(BX1, BY1); ctx.lineTo(BX1, BY2); ctx.lineTo(0, FY);
  ctx.closePath(); ctx.fillStyle = lwSh; ctx.fill();

  // ── 右壁（台形）──
  const rwGrad = ctx.createLinearGradient(BX2, 0, W, 0);
  rwGrad.addColorStop(0, hexAlpha(wpItem.color, 0.58));
  rwGrad.addColorStop(1, hexAlpha(wpItem.color, 0.32));
  ctx.beginPath();
  ctx.moveTo(W, HDR); ctx.lineTo(BX2, BY1);
  ctx.lineTo(BX2, BY2); ctx.lineTo(W, FY);
  ctx.closePath(); ctx.fillStyle = rwGrad; ctx.fill();
  // 右端シャドウ
  const rwSh = ctx.createLinearGradient(BX2, 0, BX2+50, 0);
  rwSh.addColorStop(0, 'rgba(0,0,0,0.32)');
  rwSh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(W, HDR); ctx.lineTo(BX2, BY1); ctx.lineTo(BX2, BY2); ctx.lineTo(W, FY);
  ctx.closePath(); ctx.fillStyle = rwSh; ctx.fill();

  // ── 奥壁（壁紙）──
  ctx.fillStyle = wpItem.color;
  ctx.fillRect(BX1, BY1, BX2 - BX1, BY2 - BY1);
  // 壁紙パターン
  if (house.wallpaper === 'wp_flower') {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let fx = BX1 + 18; fx < BX2 - 8; fx += 32) {
      for (let fy = BY1 + 12; fy < BY2 - 6; fy += 26) {
        ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (house.wallpaper === 'wp_wood') {
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
    for (let fy = BY1 + 20; fy < BY2; fy += 20) {
      ctx.beginPath(); ctx.moveTo(BX1, fy); ctx.lineTo(BX2, fy); ctx.stroke();
    }
  }

  // 奥壁：窓2つ
  const winW = 58, winH = 56;
  const winY = BY1 + (BY2 - BY1) * 0.12;
  drawWindow(ctx, BX1 + 22, winY, winW, winH, wpItem.color, flrItem.color);
  drawWindow(ctx, BX2 - 22 - winW, winY, winW, winH, wpItem.color, flrItem.color);

  // 奥壁：扉（中央）
  const dW = 42, dH = 62;
  const dX = (BX1 + BX2) / 2 - dW / 2;
  const dY = BY2 - dH;
  ctx.fillStyle = '#120A04';
  ctx.fillRect(dX - 4, dY - 3, dW + 8, dH + 3);
  ctx.fillStyle = doorItem.color;
  ctx.fillRect(dX, dY, dW, dH);
  ctx.strokeStyle = hexAlpha(doorItem.knob, 0.4);
  ctx.lineWidth = 1.4;
  ctx.strokeRect(dX + 5, dY + 5, dW - 10, dH / 2 - 8);
  ctx.strokeRect(dX + 5, dY + dH / 2 + 2, dW - 10, dH / 2 - 9);
  ctx.beginPath();
  ctx.arc(dX + dW - 9, dY + dH * 0.54, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = doorItem.knob;
  ctx.fill();

  // ── 床（パース台形）──
  const flrGrad = ctx.createLinearGradient(W/2, BY2, W/2, FY);
  flrGrad.addColorStop(0, hexAlpha(flrItem.color, 0.65));
  flrGrad.addColorStop(1, flrItem.color);
  ctx.beginPath();
  ctx.moveTo(0, FY); ctx.lineTo(W, FY);
  ctx.lineTo(BX2, BY2); ctx.lineTo(BX1, BY2);
  ctx.closePath(); ctx.fillStyle = flrGrad; ctx.fill();

  // 床板ライン（横・奥行き感）
  ctx.strokeStyle = 'rgba(0,0,0,0.11)'; ctx.lineWidth = 0.8;
  for (let t = 0.2; t < 1; t += 0.2) {
    const lx1 = BX1 + (0 - BX1) * t;
    const lx2 = BX2 + (W - BX2) * t;
    const ly  = BY2 + (FY - BY2) * t;
    ctx.beginPath(); ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly); ctx.stroke();
  }
  // 床板ライン（縦・消失点）
  for (let i = 1; i <= 5; i++) {
    const t  = i / 6;
    const bx = BX1 + (BX2 - BX1) * t;
    const fx = W * t;
    ctx.beginPath(); ctx.moveTo(bx, BY2); ctx.lineTo(fx, FY); ctx.stroke();
  }
  // 床光沢
  const flrGls = ctx.createLinearGradient(0, BY2, W, FY);
  flrGls.addColorStop(0, 'rgba(255,255,255,0)');
  flrGls.addColorStop(0.35, 'rgba(255,255,255,0.09)');
  flrGls.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.moveTo(0,FY); ctx.lineTo(W,FY); ctx.lineTo(BX2,BY2); ctx.lineTo(BX1,BY2);
  ctx.closePath(); ctx.fillStyle = flrGls; ctx.fill();

  // ── 部屋のエッジライン ──
  ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(BX1, BY1); ctx.lineTo(BX1, BY2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX2, BY1); ctx.lineTo(BX2, BY2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX1, BY1); ctx.lineTo(0,   HDR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX2, BY1); ctx.lineTo(W,   HDR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX1, BY2); ctx.lineTo(0,   FY);  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX2, BY2); ctx.lineTo(W,   FY);  ctx.stroke();
  // 巾木
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(BX1, BY2); ctx.lineTo(0, FY);  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX2, BY2); ctx.lineTo(W, FY);  ctx.stroke();

  // ── 家具配置（パース座標変換）──
  // fx: 0=左端〜1=右端, fy: 0=奥壁〜1=手前
  function perspPos(fx, fy) {
    const lx = BX1 + (0   - BX1) * fy;
    const rx = BX2 + (W   - BX2) * fy;
    const sx = lx + (rx - lx) * fx;
    const sy = BY2 + (FY - BY2) * fy;
    // スケール：奥でも十分な大きさが出るよう底上げ
    return { x: sx, y: sy, scale: 0.62 + fy * 0.62 };
  }

  // 家具配置座標（奥→手前の順、壁際から中央へ）
  const positions = [
    { fx: 0.13, fy: 0.22 }, { fx: 0.87, fy: 0.22 },  // 奥・左右壁際
    { fx: 0.50, fy: 0.16 },                             // 奥・中央
    { fx: 0.27, fy: 0.45 }, { fx: 0.73, fy: 0.45 },  // 中間・左右
    { fx: 0.50, fy: 0.40 },                             // 中間・中央
    { fx: 0.16, fy: 0.67 }, { fx: 0.84, fy: 0.67 },  // 手前・左右
    { fx: 0.50, fy: 0.58 },                             // 手前・中央
    { fx: 0.34, fy: 0.85 }, { fx: 0.66, fy: 0.85 },  // 最前・左右
  ];

  const furnitureTop       = house.furnitureTop       ?? {};
  const furniturePositions = house.furniturePositions ?? {};

  // 奥→手前の順で描画（ペインターズアルゴリズム）
  // furniturePositions[itemId] が設定されていればそのインデックス、なければ追加順で割り当て
  const assignedIdx = {};
  let autoIdx = 0;
  const sortedFurn = furniture
    .map(id => {
      let posIdx;
      if (furniturePositions[id] !== undefined) {
        posIdx = furniturePositions[id];
      } else {
        // 既に他のアイテムに使われていないインデックスを探す
        const usedByPos = new Set(Object.values(furniturePositions));
        while (usedByPos.has(autoIdx) || Object.values(assignedIdx).includes(autoIdx)) autoIdx++;
        posIdx = autoIdx++;
      }
      assignedIdx[id] = posIdx;
      return { id, pos: positions[posIdx % positions.length] };
    })
    .sort((a, b) => a.pos.fy - b.pos.fy);

  for (const { id, pos } of sortedFurn) {
    const item = HOUSE_ITEMS[id];
    if (!item) continue;

    // シャンデリアは天井中央から吊るす（カスタム描画）
    if (id === 'furn_chandelier') {
      const chanCX = W / 2;
      const chanCY = BY1 + (BY2 - BY1) * 0.22;   // 天井近くに配置
      const chanR  = 50;
      // チェーン（天井 → シャンデリア上部）
      ctx.save();
      ctx.strokeStyle = '#C0A030'; ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(chanCX, HDR + 6); ctx.lineTo(chanCX, chanCY - chanR * 0.35); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawChandelier(ctx, chanCX, chanCY, chanR);
      // 名前ラベル
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(item.name, chanCX, chanCY + chanR * 1.0);
      continue;
    }

    const { x, y, scale } = perspPos(pos.fx, pos.fy);
    const fs = Math.floor(108 * scale);

    // 床影
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, fs * 0.48, fs * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 家具本体を描画
    drawFurnItem(ctx, id, x, y, fs);

    // 机・棚・キッチンの上の小物を描画
    const topItems = furnitureTop[id] ?? [];
    if (topItems.length > 0 && item.topSlots) {
      let topSurfaceY;
      if (id === 'furn_wood_desk' || id === 'furn_kitchen') {
        topSurfaceY = y - fs * 0.54;
      } else if (id === 'furn_bookshelf' || id === 'furn_big_shelf') {
        topSurfaceY = y - fs * 0.88;
      } else {
        topSurfaceY = y - fs * 0.70;
      }
      const topR   = fs * 0.24;
      const totalW = topItems.length * topR * 2.8;
      topItems.forEach((topId, ti) => {
        const tx = x - totalW/2 + topR*1.4 + ti * topR*2.8;
        const ty = topSurfaceY - topR * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.beginPath();
        ctx.ellipse(tx, topSurfaceY, topR*0.6, topR*0.12, 0, 0, Math.PI*2);
        ctx.fill();
        drawTopItem(ctx, topId, tx, ty, topR);
      });
    }

    // 家具名ラベル
    const nfs = Math.max(8, Math.floor(10 * scale));
    ctx.fillStyle    = 'rgba(255,255,255,0.60)';
    ctx.font         = `${nfs}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(item.name, x, y + 2);
  }

  // 空の場合
  if (furniture.length === 0) {
    ctx.fillStyle    = 'rgba(255,255,255,0.25)';
    ctx.font         = '15px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('家具がまだ置かれていません', W / 2, BY2 + (FY - BY2) * 0.45);
  }

  ctx.textBaseline = 'alphabetic';
  return canvas.toBuffer('image/png');
}

module.exports = { generateFarmImage, generateInteriorImage };
