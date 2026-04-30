const { CROPS } = require('./crops');
const { HOUSE_ITEMS } = require('./houseItems');

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

// 家ボーナス集計（装備中の外装・内装・家具から合算）
function getFarmBonus(farm) {
  const house = farm.house ?? {};
  let coinBonus = 0;
  let expBonus  = 0;
  let qualityUp = 0;

  // 外装・内装カテゴリ
  for (const cat of ['wall', 'roof', 'door', 'garden', 'floor', 'wallpaper']) {
    const itemId = house[cat];
    if (!itemId) continue;
    const item = HOUSE_ITEMS[itemId];
    if (item?.bonus) {
      coinBonus += item.bonus.coinBonus ?? 0;
      expBonus  += item.bonus.expBonus  ?? 0;
      qualityUp += item.bonus.qualityUp ?? 0;
    }
  }

  // 設置中の家具
  for (const itemId of (house.furniture ?? [])) {
    const item = HOUSE_ITEMS[itemId];
    if (item?.bonus) {
      coinBonus += item.bonus.coinBonus ?? 0;
      expBonus  += item.bonus.expBonus  ?? 0;
      qualityUp += item.bonus.qualityUp ?? 0;
    }
  }

  return { coinBonus, expBonus, qualityUp };
}

// ランダム品質を決定（qualityUp が高いほど高品質になりやすい）
function rollQuality(qualityUp = 0) {
  const rand = Math.random() * 100;               // 0〜100
  const eff  = rand + Math.min(qualityUp, 20) * 0.6; // 最大 +12 pt シフト
  if (eff >= 99) return QUALITY.SS;   // 基本 1%
  if (eff >= 93) return QUALITY.S;    // 基本 6%
  if (eff >= 80) return QUALITY.A;    // 基本 13%
  if (eff >= 55) return QUALITY.B;    // 基本 25%
  return QUALITY.C;                    // 基本 55%
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

// 収穫計算（farmBonus を渡すとコイン・EXP・品質にボーナス適用）
function calcHarvest(slot, isManual = true, farmBonus = null) {
  const crop = CROPS[slot.crop];
  if (!crop) return null;

  const quality     = rollQuality(farmBonus?.qualityUp ?? 0);
  const elapsed     = Date.now() - slot.planted_at;
  const timingBonus = getTimingBonus(elapsed, crop.growTime);
  const manualBonus = isManual ? getManualBonus() : 1.0;
  const coinMult    = 1 + (farmBonus?.coinBonus ?? 0);
  const expMult     = 1 + (farmBonus?.expBonus  ?? 0);

  const coins = Math.floor(crop.sell * quality.multiplier * timingBonus * manualBonus * coinMult);
  const exp   = Math.floor(crop.exp * expMult);

  const bonuses = [];
  if (isManual)        bonuses.push(`🤲 手動収穫 ×${getManualBonus()}`);
  if (timingBonus > 1) bonuses.push(`⏰ ベストタイミング ×${timingBonus}`);
  if (timingBonus < 1) bonuses.push(`⚠️ 過熟ペナルティ ×${timingBonus}`);
  if (farmBonus?.coinBonus > 0) bonuses.push(`🏡 家ボーナス ×${coinMult.toFixed(2)}`);

  return { coins, quality, exp, bonuses };
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
  getFarmBonus,
  getTimingBonus,
  getSlotStatus,
  calcHarvest,
  getGrowProgress,
  getTimeToReady,
  formatTime,
};
