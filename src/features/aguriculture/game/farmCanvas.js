const { createCanvas } = require('@napi-rs/canvas');
const { CROPS }        = require('./crops');
const { HOUSE_ITEMS, DEFAULT_HOUSE } = require('./houseItems');
const {
  MAX_SLOTS,
  getSlotStatus,
  getGrowProgress,
  getTimeToReady,
  formatTime,
} = require('./mechanics');

// ── キャンバス定数 ──────────────────────────────────────────────────────────
const COLS      = 3;
const CELL_W    = 160;
const CELL_H    = 155;
const PAD       = 10;
const HEADER_H  = 55;
const HOUSE_H   = 255;   // 家セクション高さ
const CANVAS_W  = PAD + COLS * (CELL_W + PAD);  // 510px

// ── カラーパレット ──────────────────────────────────────────────────────────
const SLOT_PAL = {
  empty:    { bg: '#1E160A', border: '#5A3E1A', text: '#9A7040' },
  growing:  { bg: '#081508', border: '#2E6018', text: '#60C040' },
  optimal:  { bg: '#181400', border: '#D4A800', text: '#FFD700' },
  ready:    { bg: '#0A180A', border: '#48A848', text: '#80D880' },
  overripe: { bg: '#1C0800', border: '#C04800', text: '#FF6820' },
  locked:   { bg: '#0A0A0A', border: '#202020', text: '#303030' },
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
  ctx.fillStyle = '#080808';
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

// ── 3D風スロット描画 ────────────────────────────────────────────────────────
function drawSlot(ctx, slot, index, unlockedCount) {
  const col    = index % COLS;
  const row    = Math.floor(index / COLS);
  const x      = PAD + col * (CELL_W + PAD);
  const y      = HEADER_H + HOUSE_H + PAD + row * (CELL_H + PAD);
  const cx     = x + CELL_W / 2;
  const DEPTH  = 8;  // 3D奥行きの深さ

  const isLocked = index >= unlockedCount;
  const status   = isLocked ? 'locked' : getSlotStatus(slot);
  const pal      = SLOT_PAL[status];

  // ── 3D底面（奥行き感）──
  ctx.beginPath();
  ctx.moveTo(x + DEPTH, y + CELL_H);
  ctx.lineTo(x + CELL_W + DEPTH, y + CELL_H);
  ctx.lineTo(x + CELL_W + DEPTH, y + DEPTH);
  ctx.lineTo(x + CELL_W, y);
  ctx.lineTo(x + CELL_W, y + CELL_H - DEPTH);
  ctx.lineTo(x + DEPTH, y + CELL_H);
  ctx.fillStyle = hexAlpha(pal.border, 0.35);
  ctx.fill();

  // ── メイン面 ──
  if (status === 'optimal') {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 18;
  }
  roundRect(ctx, x, y, CELL_W, CELL_H, 10);
  ctx.fillStyle = pal.bg;
  ctx.fill();

  // 上グラデーション（光沢）
  const gloss = ctx.createLinearGradient(x, y, x, y + CELL_H * 0.4);
  gloss.addColorStop(0, 'rgba(255,255,255,0.06)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, x, y, CELL_W, CELL_H, 10);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.strokeStyle = pal.border;
  ctx.lineWidth   = status === 'optimal' ? 2.5 : 1.5;
  roundRect(ctx, x, y, CELL_W, CELL_H, 10);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 土台ライン
  ctx.fillStyle = hexAlpha(pal.border, 0.4);
  ctx.fillRect(x, y + CELL_H - 22, CELL_W, 1);

  // スロット番号
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font      = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`#${index + 1}`, x + 7, y + 14);

  // ── LOCKED ──
  if (isLocked) {
    ctx.fillStyle    = pal.text;
    ctx.font         = '32px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', cx, y + CELL_H / 2 - 8);
    ctx.textBaseline = 'alphabetic';
    ctx.font         = 'bold 11px sans-serif';
    ctx.fillText('LOCKED', cx, y + CELL_H / 2 + 18);
    return;
  }

  // ── 空きスロット ──
  if (status === 'empty') {
    ctx.fillStyle    = pal.text;
    ctx.font         = '30px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌱', cx, y + CELL_H / 2 - 8);
    ctx.textBaseline = 'alphabetic';
    ctx.font         = '12px sans-serif';
    ctx.fillText('空きスロット', cx, y + CELL_H / 2 + 20);
    return;
  }

  const crop = CROPS[slot.crop];

  // 状態バッジ（右上）
  const badges = { optimal: '⭐BEST！', ready: '✅収穫OK', overripe: '⚠過熟！', growing: '🌱育成中' };
  if (badges[status]) {
    ctx.font      = 'bold 9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.text;
    ctx.fillText(badges[status], x + CELL_W - 6, y + 13);
  }

  // 土壌エフェクト（スロット下部）
  const soilGrad = ctx.createLinearGradient(x, y + CELL_H - 22, x, y + CELL_H);
  soilGrad.addColorStop(0, 'rgba(80,50,20,0)');
  soilGrad.addColorStop(1, 'rgba(80,50,20,0.5)');
  ctx.fillStyle = soilGrad;
  ctx.fillRect(x, y + CELL_H - 22, CELL_W, 22);

  // 作物アイコン（大きく中央）
  ctx.font         = '44px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // アイコン背景グロー
  ctx.shadowColor = crop.color;
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#FFFFFF';
  const iconY = y + CELL_H / 2 - 18;
  ctx.fillText(crop.emoji, cx, iconY);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';

  // 作物名
  ctx.fillStyle = '#FFFFFF';
  ctx.font      = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(crop.name, cx, y + CELL_H - 36);

  // 育成中
  if (status === 'growing') {
    const progress  = getGrowProgress(slot);
    const remaining = getTimeToReady(slot);
    ctx.fillStyle = SLOT_PAL.growing.text;
    ctx.font      = '11px sans-serif';
    ctx.fillText(`あと ${formatTime(remaining)}`, cx, y + CELL_H - 24);
    drawProgressBar(ctx, x + 8, y + CELL_H - 18, CELL_W - 16, 11, progress);
  } else {
    // 売値
    ctx.fillStyle = '#FFD70099';
    ctx.font      = '11px sans-serif';
    ctx.fillText(`売値 ${crop.sell} G～`, cx, y + CELL_H - 8);
  }
}

// ── 家の描画 ────────────────────────────────────────────────────────────────

function drawWindow(ctx, wx, wy, ww, wh, wallpaperColor, floorColor) {
  // フレーム
  ctx.fillStyle = '#2A1A08';
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

  // 内装（壁紙上半分、床下半分）
  ctx.fillStyle = wallpaperColor;
  ctx.fillRect(wx, wy, ww, wh * 0.6);
  ctx.fillStyle = floorColor;
  ctx.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4);

  // ガラス光沢
  ctx.fillStyle = 'rgba(180,220,255,0.12)';
  ctx.fillRect(wx, wy, ww, wh);

  // 十字桟
  ctx.fillStyle = '#2A1A0888';
  ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
  ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
}

function drawHouse(ctx, house, startY) {
  if (!house) house = { ...DEFAULT_HOUSE };
  const items = HOUSE_ITEMS;

  const wallItem = items[house.wall] || items.wall_wood;
  const roofItem = items[house.roof] || items.roof_straw;
  const doorItem = items[house.door] || items.door_wood;
  const floorItem = items[house.floor] || items.floor_dirt;
  const wpItem   = items[house.wallpaper] || items.wp_plain;

  const cx     = CANVAS_W / 2;
  const WALL_W = 230;
  const WALL_H = 105;
  const ROOF_H = 90;
  const FND_H  = 14;
  const FND_D  = 8;    // 基礎3D奥行き

  const wallX = cx - WALL_W / 2;
  const wallY = startY + ROOF_H + 10;
  const fndY  = wallY + WALL_H;
  const roofPeakX = cx;
  const roofPeakY = startY + 10;

  // ── 庭 ──
  drawGarden(ctx, house.garden, cx, fndY + FND_H);

  // ── 基礎（3D）──
  ctx.fillStyle = '#3A2A18';
  ctx.fillRect(wallX - 10, fndY, WALL_W + 20, FND_H);
  // 奥行き面（右側）
  ctx.fillStyle = '#2A1A0A';
  ctx.beginPath();
  ctx.moveTo(wallX + WALL_W + 10, fndY);
  ctx.lineTo(wallX + WALL_W + 10 + FND_D, fndY - FND_D);
  ctx.lineTo(wallX + WALL_W + 10 + FND_D, fndY + FND_H - FND_D);
  ctx.lineTo(wallX + WALL_W + 10, fndY + FND_H);
  ctx.fill();

  // ── 壁（3D右面）──
  ctx.fillStyle = hexAlpha(wallItem.accent, 0.7);
  ctx.fillRect(wallX + WALL_W, wallY, FND_D, WALL_H);

  // ── 壁（正面）──
  ctx.fillStyle = wallItem.color;
  ctx.fillRect(wallX, wallY, WALL_W, WALL_H);

  // レンガパターン（brick のみ）
  if (house.wall === 'wall_brick') {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth   = 0.8;
    for (let ry = wallY + 12; ry < fndY; ry += 12) {
      ctx.beginPath();
      ctx.moveTo(wallX, ry); ctx.lineTo(wallX + WALL_W, ry);
      ctx.stroke();
    }
    for (let rx = wallX + 6; rx < wallX + WALL_W; rx += 24) {
      ctx.beginPath();
      ctx.moveTo(rx, wallY); ctx.lineTo(rx, fndY);
      ctx.stroke();
    }
  }

  // 壁右端シャドウ
  const wShadow = ctx.createLinearGradient(wallX + WALL_W - 24, wallY, wallX + WALL_W, wallY);
  wShadow.addColorStop(0, 'rgba(0,0,0,0)');
  wShadow.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = wShadow;
  ctx.fillRect(wallX + WALL_W - 24, wallY, 24, WALL_H);

  // ── 窓 ──
  const winW = 46, winH = 38;
  const winY = wallY + 18;
  drawWindow(ctx, wallX + 22, winY, winW, winH, wpItem.color, floorItem.color);
  drawWindow(ctx, wallX + WALL_W - 22 - winW, winY, winW, winH, wpItem.color, floorItem.color);

  // ── 扉 ──
  const doorW = 34, doorH = 58;
  const doorX = cx - doorW / 2;
  const doorY = fndY - doorH;

  // 扉枠
  ctx.fillStyle = '#1A0E06';
  ctx.fillRect(doorX - 3, doorY - 3, doorW + 6, doorH + 3);
  // 扉本体
  ctx.fillStyle = doorItem.color;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  // 扉パネル装飾
  ctx.strokeStyle = hexAlpha(doorItem.knob, 0.4);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(doorX + 4, doorY + 4, doorW - 8, doorH / 2 - 6);
  ctx.strokeRect(doorX + 4, doorY + doorH / 2 + 2, doorW - 8, doorH / 2 - 8);
  // ドアノブ
  ctx.beginPath();
  ctx.arc(doorX + doorW - 8, doorY + doorH * 0.55, 4, 0, Math.PI * 2);
  ctx.fillStyle = doorItem.knob;
  ctx.fill();

  // ── 屋根 ──
  // 屋根右面（3D）
  ctx.fillStyle = hexAlpha(roofItem.peak, 0.8);
  ctx.beginPath();
  ctx.moveTo(roofPeakX, roofPeakY);
  ctx.lineTo(roofPeakX + FND_D, roofPeakY - FND_D);
  ctx.lineTo(wallX + WALL_W + FND_D, wallY - FND_D);
  ctx.lineTo(wallX + WALL_W, wallY);
  ctx.fill();

  // 屋根正面
  ctx.fillStyle = roofItem.color;
  ctx.beginPath();
  ctx.moveTo(roofPeakX, roofPeakY);
  ctx.lineTo(wallX - 16, wallY);
  ctx.lineTo(wallX + WALL_W + 16, wallY);
  ctx.closePath();
  ctx.fill();

  // 屋根ハイライト（上部）
  ctx.fillStyle = hexAlpha(roofItem.peak, 0.5);
  ctx.beginPath();
  ctx.moveTo(roofPeakX, roofPeakY);
  ctx.lineTo(roofPeakX - 30, roofPeakY + ROOF_H * 0.4);
  ctx.lineTo(roofPeakX + 30, roofPeakY + ROOF_H * 0.4);
  ctx.closePath();
  ctx.fill();

  // 屋根瓦ライン（golden以外）
  if (house.roof !== 'roof_golden') {
    ctx.strokeStyle = hexAlpha(roofItem.peak, 0.35);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const ratio  = i / 5;
      const lx1 = roofPeakX + (wallX - 16 - roofPeakX) * ratio;
      const lx2 = roofPeakX + (wallX + WALL_W + 16 - roofPeakX) * ratio;
      const ly  = roofPeakY + (wallY - roofPeakY) * ratio;
      ctx.beginPath();
      ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly);
      ctx.stroke();
    }
  }

  // 煙突
  const chimneyX = wallX + WALL_W - 44;
  const chimneyY = roofPeakY + ROOF_H * 0.28;
  ctx.fillStyle = '#4A3220';
  ctx.fillRect(chimneyX, chimneyY, 18, 30);
  ctx.fillStyle = '#3A2418';
  ctx.fillRect(chimneyX - 3, chimneyY - 5, 24, 7);
}

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
        ctx.fillRect(f.x - 1, groundY - 14, 2, 14);
        ctx.beginPath();
        ctx.arc(f.x, groundY - 16, 7, 0, Math.PI * 2);
        ctx.fillStyle = f.c;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(f.x, groundY - 16, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFaa';
        ctx.fill();
      });
      break;
    }
    case 'garden_fence': {
      const fw = 250;
      const fx = cx - fw / 2;
      ctx.fillStyle = '#8B6430';
      ctx.fillRect(fx, groundY - 16, fw, 4);
      ctx.fillRect(fx, groundY - 28, fw, 4);
      for (let px = fx; px <= fx + fw; px += 16) {
        ctx.fillRect(px, groundY - 32, 6, 36);
      }
      break;
    }
    case 'garden_fountain': {
      // 台座
      ctx.fillStyle = '#7A7A7A';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 4, 38, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // 池
      ctx.fillStyle = '#1A5080';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 6, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // 柱
      ctx.fillStyle = '#909090';
      ctx.fillRect(cx - 4, groundY - 36, 8, 32);
      // 水しぶき
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        ctx.strokeStyle = '#88CCFF88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, groundY - 36);
        ctx.quadraticCurveTo(
          cx + Math.cos(angle) * 18, groundY - 50,
          cx + Math.cos(angle) * 28, groundY - 26
        );
        ctx.stroke();
      }
      break;
    }
    case 'garden_statue': {
      // 台座
      ctx.fillStyle = '#606060';
      ctx.fillRect(cx - 16, groundY - 10, 32, 10);
      ctx.fillRect(cx - 12, groundY - 18, 24, 8);
      // 像（人形）
      ctx.fillStyle = '#D4AF37';
      ctx.beginPath();
      ctx.arc(cx, groundY - 38, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 8, groundY - 28, 16, 20);
      // 光輪
      ctx.strokeStyle = '#FFD70088';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, groundY - 40, 14, 0, Math.PI * 2);
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
  const canvasH = HEADER_H + HOUSE_H + PAD + rows * (CELL_H + PAD) + PAD;
  const canvas  = createCanvas(CANVAS_W, canvasH);
  const ctx     = canvas.getContext('2d');

  // 背景グラデーション（空から地面へ）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
  bgGrad.addColorStop(0,   '#0A1A30');
  bgGrad.addColorStop(0.3, '#0A1505');
  bgGrad.addColorStop(1,   '#050A03');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  // ── ヘッダー ──
  const hGrad = ctx.createLinearGradient(0, 0, CANVAS_W, HEADER_H);
  hGrad.addColorStop(0, '#1A3A08');
  hGrad.addColorStop(1, '#0C2006');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H);
  ctx.strokeStyle = '#3A7A2040';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(CANVAS_W, HEADER_H); ctx.stroke();

  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = 'bold 22px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🌾 農場', 14, 34);

  ctx.fillStyle = '#FFD700';
  ctx.font      = 'bold 15px sans-serif';
  ctx.fillText(`💰 ${farm.coins} G`, 14, 50);

  ctx.fillStyle = '#88DDFF';
  ctx.font      = 'bold 13px sans-serif';
  ctx.fillText(`⚡ Lv.${farm.level ?? 1}`, 120, 50);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font      = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`収穫 ${farm.totalHarvests}回`, CANVAS_W - 12, 30);
  ctx.fillText(`累計 ${farm.totalCoinsEarned} G`, CANVAS_W - 12, 46);

  // ── 家 ──
  // 空と地平線
  const skyGrad = ctx.createLinearGradient(0, HEADER_H, 0, HEADER_H + HOUSE_H);
  skyGrad.addColorStop(0, '#0A1A38');
  skyGrad.addColorStop(1, '#1A2A10');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, HEADER_H, CANVAS_W, HOUSE_H);

  // 星（小さな白点）
  const stars = [[40,15],[90,8],[160,20],[230,6],[310,18],[380,10],[440,22],[490,14]];
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  stars.forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx, HEADER_H + sy, 1, 0, Math.PI * 2);
    ctx.fill();
  });

  // 地面
  const groundY = HEADER_H + HOUSE_H - 30;
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, HEADER_H + HOUSE_H);
  groundGrad.addColorStop(0, '#2A4010');
  groundGrad.addColorStop(1, '#1A2A08');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, CANVAS_W, 30);

  drawHouse(ctx, farm.house, HEADER_H + 8);

  // ── 区切り ──
  const divGrad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  divGrad.addColorStop(0,   'rgba(60,120,30,0)');
  divGrad.addColorStop(0.3, 'rgba(60,120,30,0.7)');
  divGrad.addColorStop(0.7, 'rgba(60,120,30,0.7)');
  divGrad.addColorStop(1,   'rgba(60,120,30,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(0, HEADER_H + HOUSE_H, CANVAS_W, 2);

  // ── 農場スロット ──
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slot = farm.slots[i] ?? { crop: null, planted_at: null };
    drawSlot(ctx, slot, i, farm.slots.length);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateFarmImage };
