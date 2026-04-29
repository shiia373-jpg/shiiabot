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
const INTERIOR_H  = 100;
const HOUSE_H     = HOUSE_EXT_H + INTERIOR_H;
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
    ctx.fillStyle    = pal.text;
    ctx.font         = '36px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', cx, y + CELL_H / 2 - 8);
    ctx.textBaseline = 'alphabetic';
    ctx.font         = 'bold 11px sans-serif';
    ctx.fillStyle    = pal.text;
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
    ctx.fillStyle    = pal.text;
    ctx.font         = '32px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌱', cx, y + CELL_H / 2 - 8);
    ctx.textBaseline = 'alphabetic';
    ctx.font         = '12px sans-serif';
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
  if (status === 'optimal') {
    ctx.shadowColor = crop.color;
    ctx.shadowBlur  = 22;
  } else if (status === 'growing') {
    ctx.shadowColor = crop.color;
    ctx.shadowBlur  = 10;
  } else {
    ctx.shadowColor = crop.color;
    ctx.shadowBlur  = 14;
  }
  ctx.font         = '48px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#FFFFFF';
  ctx.fillText(crop.emoji, cx, y + CELL_H / 2 - 18);
  ctx.shadowBlur = 0;
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
  // 瓦ライン
  if (house.roof !== 'roof_golden') {
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
    const maxPerRow = 8;
    const iconSize  = 28;
    const iconPad   = (panelW - maxPerRow * iconSize) / (maxPerRow + 1);
    const iconRowY  = py + (panelH - floorH) / 2;

    furniture.slice(0, MAX_FURNITURE).forEach((id, i) => {
      const fi  = items[id];
      if (!fi) return;
      const col = i % maxPerRow;
      const row = Math.floor(i / maxPerRow);
      const ix  = px + iconPad + col * (iconSize + iconPad) + iconSize / 2;
      const iy  = iconRowY + row * (iconSize + 6) - 4;

      // 家具影
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(ix, iy + iconSize / 2 - 2, iconSize / 2 - 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.font         = `${iconSize - 4}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#FFFFFF';
      ctx.fillText(fi.emoji, ix, iy);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle    = 'rgba(0,0,0,0.55)';
      ctx.font         = '8px sans-serif';
      ctx.fillText(fi.name, ix, iy + iconSize / 2 - 1);
    });
  }

  ctx.fillStyle    = 'rgba(255,255,255,0.38)';
  ctx.font         = '10px sans-serif';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${furniture.length}/${MAX_FURNITURE}`, px + panelW - 6, py + panelH - 5);
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
  drawInterior(ctx, farm.house, HEADER_H + HOUSE_EXT_H);

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

module.exports = { generateFarmImage };
