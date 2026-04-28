const { CROPS } = require('./crops');

const MAX_SLOTS = 9;
const INITIAL_SLOTS = 2;

// 品質ランク
const QUALITY = {
  SS: { label: 'SS', emoji: '💎', multiplier: 4.0 },
  S:  { label: 'S',  emoji: '⭐', multiplier: 2.5 },
  A:  { label: 'A',  emoji: '✨', multiplier: 1.8 },
  B:  { label: 'B',  emoji: '👍', multiplier: 1.4 },
  C:  { label: 'C',  emoji: '😐', multiplier: 1.0 },
};

// 畑スロット解放コスト
function getUnlockCost(slots) {
  return Math.floor(150 * Math.pow(slots, 1.6));
}

// 次レベルまでの必要EXP
function getLevelExp(level) {
  return Math.floor(80 * Math.pow(level, 1.7));
}

// 放置ボーナス（最大1.8倍）
function getOfflineBonus(hours) {
  return Math.min(1 + hours * 0.03, 1.8);
}

// 手動収穫ボーナス
function getManualBonus() {
  return 1.3;
}

// 自動収穫効率
function getAutoEfficiency(level) {
  return Math.min(0.4 + level * 0.015, 0.75);
}

// ランダム品質を決定
function rollQuality() {
  const rand = Math.random();
  if (rand < 0.55) return QUALITY.C;
  if (rand < 0.80) return QUALITY.B;
  if (rand < 0.93) return QUALITY.A;
  if (rand < 0.99) return QUALITY.S;
  return QUALITY.SS;
}

// タイミングボーナス
function getTimingBonus(elapsed, growTime) {
  const ratio = elapsed / growTime;
  if (ratio >= 1 && ratio <= 1.15) return 1.6;
  if (ratio <= 1.8) return 1.0;
  return 0.7;
}

// スロットの現在状態
function getSlotStatus(slot) {
  if (!slot || !slot.crop) return 'empty';
  const crop = CROPS[slot.crop];
  if (!crop) return 'empty';
  const ratio = (Date.now() - slot.planted_at) / crop.growTime;
  if (ratio < 1)    return 'growing';
  if (ratio <= 1.15) return 'optimal';
  if (ratio <= 1.8)  return 'ready';
  return 'overripe';
}

// 収穫計算
function calcHarvest(slot, isManual = true) {
  const crop = CROPS[slot.crop];
  if (!crop) return null;
  const quality = rollQuality();
  const elapsed = Date.now() - slot.planted_at;
  const timingBonus = getTimingBonus(elapsed, crop.growTime);
  const manualBonus = isManual ? getManualBonus() : 1.0;

  const coins = Math.floor(crop.sell * quality.multiplier * timingBonus * manualBonus);
  const bonuses = [];
  if (isManual)        bonuses.push(`🤲 手動収穫 ×${getManualBonus()}`);
  if (timingBonus > 1) bonuses.push(`⏰ ベストタイミング ×${timingBonus}`);
  if (timingBonus < 1) bonuses.push(`⚠️ 過熟ペナルティ ×${timingBonus}`);

  return { coins, quality, exp: crop.exp, bonuses };
}

// 成長進捗 0.0〜1.0
function getGrowProgress(slot) {
  if (!slot || !slot.crop) return 0;
  const crop = CROPS[slot.crop];
  const elapsed = Date.now() - slot.planted_at;
  return Math.min(elapsed / crop.growTime, 1.0);
}

// 収穫可能になるまでの残り時間(ms)
function getTimeToReady(slot) {
  if (!slot || !slot.crop) return null;
  const crop = CROPS[slot.crop];
  const remaining = crop.growTime - (Date.now() - slot.planted_at);
  return remaining > 0 ? remaining : 0;
}

// ms → 表示文字列
function formatTime(ms) {
  if (ms <= 0) return '今すぐ！';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

module.exports = {
  QUALITY,
  MAX_SLOTS,
  INITIAL_SLOTS,
  getUnlockCost,
  getLevelExp,
  getOfflineBonus,
  getManualBonus,
  getAutoEfficiency,
  getTimingBonus,
  getSlotStatus,
  calcHarvest,
  getGrowProgress,
  getTimeToReady,
  formatTime,
};
