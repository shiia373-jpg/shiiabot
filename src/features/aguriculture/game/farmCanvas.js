const { createCanvas } = require('@napi-rs/canvas');
const { CROPS } = require('./crops');
const {
  MAX_SLOTS,
  getSlotStatus,
  getGrowProgress,
  getTimeToReady,
  formatTime,
} = require('./mechanics');

const CELL = 140;        // スロット1マスのサイズ
const PAD = 14;          // マス間パディング
const COLS = 3;
const HEADER_H = 90;
const CANVAS_W = PAD + COLS * (CELL + PAD);

// ステータスごとの配色
const PALETTE = {
  empty:    { bg: '#5C4A1E', border: '#7A6030', label: '#BBA060' },
  growing:  { bg: '#1C3A10', border: '#3D7A26', label: '#7ADA50' },
  optimal:  { bg: '#1A2D08', border: '#FFD700', label: '#FFD700' },
  ready:    { bg: '#1E3A1E', border: '#5CB85C', label: '#90EE90' },
  overripe: { bg: '#3A1A00', border: '#CC5500', label: '#FF7733' },
  locked:   { bg: '#111111', border: '#2A2A2A', label: '#444444' },
};

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

function drawSlot(ctx, slot, index, unlockedCount) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = PAD + col * (CELL + PAD);
  const y = HEADER_H + PAD + row * (CELL + PAD);

  const isLocked = index >= unlockedCount;
  const status = isLocked ? 'locked' : getSlotStatus(slot);
  const pal = PALETTE[status];
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  // スロット背景
  roundRect(ctx, x, y, CELL, CELL, 8);
  ctx.fillStyle = pal.bg;
  ctx.fill();

  // 枠線（optimal だけ輝かせる）
  if (status === 'optimal') {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 12;
  }
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = status === 'optimal' ? 3 : 2;
  roundRect(ctx, x, y, CELL, CELL, 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // スロット番号
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`#${index + 1}`, x + 6, y + 16);

  if (isLocked) {
    ctx.fillStyle = pal.label;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOCKED', cx, cy + 5);
    return;
  }

  if (status === 'empty') {
    ctx.fillStyle = pal.label;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('空き', cx, cy + 5);
    return;
  }

  const crop = CROPS[slot.crop];

  // 作物カラーサークル
  const radius = 30;
  ctx.beginPath();
  ctx.arc(cx, cy - 12, radius, 0, Math.PI * 2);
  ctx.fillStyle = crop.color + '33'; // 透過背景
  ctx.fill();
  ctx.strokeStyle = crop.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 作物名
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(crop.name, cx, cy - 8);

  if (status === 'growing') {
    const progress = getGrowProgress(slot);
    const barX = x + 10;
    const barY = y + CELL - 30;
    const barW = CELL - 20;
    const barH = 7;

    // プログレスバー
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#3D7A26';
    ctx.fillRect(barX, barY, barW * progress, barH);

    const remaining = getTimeToReady(slot);
    ctx.fillStyle = pal.label;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(remaining), cx, barY - 4);

  } else {
    const labels = {
      optimal:  '⭐ BEST！',
      ready:    '収穫OK',
      overripe: '⚠ 過熟',
    };
    ctx.fillStyle = pal.label;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[status] || '', cx, y + CELL - 10);
  }
}

/**
 * 農場画像を生成して PNG バッファを返す
 * @param {Object} farm - loadFarm で取得したデータ
 * @returns {Buffer}
 */
function generateFarmImage(farm) {
  const rows = Math.ceil(MAX_SLOTS / COLS);
  const canvasH = HEADER_H + PAD + rows * (CELL + PAD) + PAD;
  const canvas = createCanvas(CANVAS_W, canvasH);
  const ctx = canvas.getContext('2d');

  // 全体背景
  ctx.fillStyle = '#0F1E08';
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  // ヘッダー背景
  ctx.fillStyle = '#1A3010';
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H);

  // ヘッダータイトル
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('農場', 16, 40);

  // コイン表示
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${farm.coins} G`, 16, 72);

  // レベル表示
  ctx.fillStyle = '#88DDFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Lv.${farm.level ?? 1}`, 16, 88);

  // 収穫数
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`収穫 ${farm.totalHarvests} 回`, CANVAS_W - 16, 40);
  ctx.fillText(`稼いだ計 ${farm.totalCoinsEarned} G`, CANVAS_W - 16, 62);

  // 各スロット描画
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slot = farm.slots[i] ?? { crop: null, planted_at: null };
    drawSlot(ctx, slot, i, farm.slots.length);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateFarmImage };
