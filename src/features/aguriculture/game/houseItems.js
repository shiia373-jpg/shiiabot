// =============================================
// 家のアイテム定義
// bonus: { coinBonus: 0.10, expBonus: 0.05, qualityUp: 3 }
//   coinBonus  … コイン獲得量への加算倍率（0.10 = +10%）
//   expBonus   … EXP 獲得量への加算倍率
//   qualityUp  … 品質ロールを底上げするポイント（最大有効 20pt）
// =============================================

const HOUSE_ITEMS = {
  // ─── 外装：壁 ───────────────────────────────────────────────────────
  wall_wood:      { name: '木の壁',         category: 'wall', price: 0,      color: '#8B6430', accent: '#6B4A20', label: 'デフォルト' },
  wall_stone:     { name: '石の壁',         category: 'wall', price: 500,    color: '#8A8A8A', accent: '#686868' },
  wall_brick:     { name: 'レンガ壁',       category: 'wall', price: 800,    color: '#9E3A1A', accent: '#7A2A10' },
  wall_white:     { name: '白壁',           category: 'wall', price: 600,    color: '#E8E4DC', accent: '#C8C0B4' },
  wall_golden:    { name: '黄金の壁',       category: 'wall', price: 5000,   color: '#C8A020', accent: '#A07818',
                    bonus: { coinBonus: 0.05 } },
  wall_jade:      { name: '翡翠の壁',       category: 'wall', price: 12000,  color: '#2A8A6A', accent: '#1A6A4A',
                    bonus: { coinBonus: 0.10, expBonus: 0.05 } },
  wall_starlight: { name: '星光の壁',       category: 'wall', price: 28000,  color: '#C0C8E0', accent: '#8090B8',
                    bonus: { coinBonus: 0.18, expBonus: 0.10, qualityUp: 3 } },
  wall_void:      { name: '虚空の壁',       category: 'wall', price: 55000,  color: '#1A0830', accent: '#0C0418',
                    bonus: { coinBonus: 0.28, expBonus: 0.16, qualityUp: 6 } },
  wall_yamii:     { name: 'ヤミーの壁',     category: 'wall', price: 200000, color: '#EAE4F8', accent: '#B8A0D8',
                    bonus: { coinBonus: 0.60, expBonus: 0.45, qualityUp: 14 } },

  // ─── 外装：屋根 ─────────────────────────────────────────────────────
  roof_straw:     { name: 'わら屋根',       category: 'roof', price: 0,      color: '#9B7B40', peak: '#7B5B28', label: 'デフォルト' },
  roof_red:       { name: '赤い屋根',       category: 'roof', price: 300,    color: '#CC2200', peak: '#AA1A00' },
  roof_blue:      { name: '青い屋根',       category: 'roof', price: 300,    color: '#1144CC', peak: '#0A2AAA' },
  roof_green:     { name: '緑の屋根',       category: 'roof', price: 300,    color: '#2A8A2A', peak: '#1A6A1A' },
  roof_golden:    { name: '黄金屋根',       category: 'roof', price: 3000,   color: '#DAA520', peak: '#B88010',
                    bonus: { coinBonus: 0.03 } },
  roof_jade:      { name: '翡翠屋根',       category: 'roof', price: 10000,  color: '#2A9A70', peak: '#1A7A50',
                    bonus: { coinBonus: 0.08, expBonus: 0.04 } },
  roof_starlight: { name: '星光屋根',       category: 'roof', price: 22000,  color: '#A0B4D4', peak: '#6080A8',
                    bonus: { coinBonus: 0.14, expBonus: 0.08, qualityUp: 2 } },
  roof_void:      { name: '虚空屋根',       category: 'roof', price: 45000,  color: '#1C0A30', peak: '#0E0420',
                    bonus: { coinBonus: 0.22, expBonus: 0.14, qualityUp: 5 } },
  roof_yamii:     { name: 'ヤミー屋根',     category: 'roof', price: 180000, color: '#D8CCED', peak: '#9A78BE',
                    bonus: { coinBonus: 0.52, expBonus: 0.38, qualityUp: 12 } },

  // ─── 外装：扉 ───────────────────────────────────────────────────────
  door_wood:      { name: '木の扉',         category: 'door', price: 0,      color: '#6B3A1A', knob: '#B08030', label: 'デフォルト' },
  door_iron:      { name: '鉄の扉',         category: 'door', price: 400,    color: '#484848', knob: '#909090' },
  door_red:       { name: '赤い扉',         category: 'door', price: 600,    color: '#AA1A00', knob: '#FFD700' },
  door_fancy:     { name: '豪華な扉',       category: 'door', price: 2000,   color: '#2C1A0E', knob: '#FFD700' },
  door_ornate:    { name: '金細工の扉',     category: 'door', price: 8000,   color: '#5A2A00', knob: '#FFD700',
                    bonus: { coinBonus: 0.06, expBonus: 0.03 } },
  door_starlight: { name: '星光の扉',       category: 'door', price: 20000,  color: '#1A2854', knob: '#88AAFF',
                    bonus: { coinBonus: 0.12, expBonus: 0.06, qualityUp: 2 } },
  door_void:      { name: '虚空の扉',       category: 'door', price: 38000,  color: '#0A0418', knob: '#9060FF',
                    bonus: { coinBonus: 0.20, expBonus: 0.12, qualityUp: 4 } },
  door_yamii:     { name: 'ヤミーの扉',     category: 'door', price: 160000, color: '#EEE8FA', knob: '#C070D8',
                    bonus: { coinBonus: 0.45, expBonus: 0.32, qualityUp: 10 } },

  // ─── 外装：庭 ───────────────────────────────────────────────────────
  garden_none:      { name: 'なし',         category: 'garden', price: 0,      label: 'デフォルト' },
  garden_flowers:   { name: 'お花畑',       category: 'garden', price: 600 },
  garden_fence:     { name: '木の柵',       category: 'garden', price: 400 },
  garden_fountain:  { name: '噴水',         category: 'garden', price: 2000 },
  garden_statue:    { name: '豊作の神像',   category: 'garden', price: 8000,
                      bonus: { coinBonus: 0.08, expBonus: 0.05 } },
  garden_zen:       { name: '禅の庭',       category: 'garden', price: 16000,
                      bonus: { coinBonus: 0.14, expBonus: 0.10, qualityUp: 3 } },
  garden_paradise:  { name: '楽園の庭',     category: 'garden', price: 35000,
                      bonus: { coinBonus: 0.24, expBonus: 0.18, qualityUp: 6 } },
  garden_void:      { name: '虚空の庭',     category: 'garden', price: 65000,
                      bonus: { coinBonus: 0.35, expBonus: 0.25, qualityUp: 8 } },
  garden_yamii:     { name: 'ヤミーの庭',   category: 'garden', price: 300000,
                      bonus: { coinBonus: 0.80, expBonus: 0.65, qualityUp: 18 } },

  // ─── 内装：床 ───────────────────────────────────────────────────────
  floor_dirt:     { name: '土の床',         category: 'floor', price: 0,      color: '#5A3818', label: 'デフォルト' },
  floor_wood:     { name: '木の床',         category: 'floor', price: 500,    color: '#8B5E10' },
  floor_stone:    { name: '石の床',         category: 'floor', price: 800,    color: '#686868' },
  floor_tile:     { name: 'タイル床',       category: 'floor', price: 1200,   color: '#A09080' },
  floor_marble:   { name: '大理石床',       category: 'floor', price: 5000,   color: '#D8D0C8',
                    bonus: { expBonus: 0.05 } },
  floor_jade:     { name: '翡翠床',         category: 'floor', price: 12000,  color: '#2A7A5A',
                    bonus: { coinBonus: 0.05, expBonus: 0.10 } },
  floor_obsidian: { name: '黒曜石床',       category: 'floor', price: 25000,  color: '#1A1A2E',
                    bonus: { coinBonus: 0.10, expBonus: 0.16, qualityUp: 2 } },
  floor_void:     { name: '虚空の床',       category: 'floor', price: 50000,  color: '#0A0814',
                    bonus: { coinBonus: 0.15, expBonus: 0.24, qualityUp: 5 } },
  floor_yamii:    { name: 'ヤミーの床',     category: 'floor', price: 200000, color: '#E8E0F8',
                    bonus: { coinBonus: 0.45, expBonus: 0.58, qualityUp: 14 } },

  // ─── 内装：壁紙 ─────────────────────────────────────────────────────
  wp_plain:       { name: 'シンプル',       category: 'wallpaper', price: 0,      color: '#C0A880', label: 'デフォルト' },
  wp_flower:      { name: '花柄',           category: 'wallpaper', price: 400,    color: '#D4A0A8' },
  wp_wood:        { name: '木目',           category: 'wallpaper', price: 600,    color: '#907048' },
  wp_blue:        { name: '水色',           category: 'wallpaper', price: 400,    color: '#80A8C8' },
  wp_fancy:       { name: '豪華',           category: 'wallpaper', price: 3000,   color: '#8060B0' },
  wp_golden:      { name: '黄金の壁紙',     category: 'wallpaper', price: 8000,   color: '#B8900A',
                    bonus: { coinBonus: 0.04, expBonus: 0.06 } },
  wp_starlight:   { name: '星光の壁紙',     category: 'wallpaper', price: 20000,  color: '#6080C0',
                    bonus: { coinBonus: 0.09, expBonus: 0.12, qualityUp: 2 } },
  wp_void:        { name: '虚空の壁紙',     category: 'wallpaper', price: 40000,  color: '#1A0838',
                    bonus: { coinBonus: 0.14, expBonus: 0.20, qualityUp: 4 } },
  wp_yamii:       { name: 'ヤミーの壁紙',   category: 'wallpaper', price: 180000, color: '#F2EEFF',
                    bonus: { coinBonus: 0.38, expBonus: 0.50, qualityUp: 12 } },

  // ─── 家具 ───────────────────────────────────────────────────────────
  furn_plant:         { name: '観葉植物',   category: 'furniture', price: 400,   emoji: '🌿' },
  furn_clock:         { name: '時計',       category: 'furniture', price: 500,   emoji: '🕐' },
  furn_table:         { name: 'テーブル',   category: 'furniture', price: 600,   emoji: '🪑' },
  furn_bookshelf:     { name: '本棚',       category: 'furniture', price: 700,   emoji: '📚' },
  furn_rug:           { name: '絨毯',       category: 'furniture', price: 800,   emoji: '🟥' },
  furn_sofa:          { name: 'ソファ',     category: 'furniture', price: 800,   emoji: '🛋️' },
  furn_bed:           { name: 'ベッド',     category: 'furniture', price: 1000,  emoji: '🛏️' },
  furn_painting:      { name: '絵画',       category: 'furniture', price: 1200,  emoji: '🖼️' },
  furn_fireplace:     { name: '暖炉',       category: 'furniture', price: 1500,  emoji: '🔥' },
  furn_trophy:        { name: 'トロフィー', category: 'furniture', price: 2000,  emoji: '🏆',
                        bonus: { coinBonus: 0.03 } },
  furn_chest:         { name: '宝箱',       category: 'furniture', price: 3000,  emoji: '📦',
                        bonus: { coinBonus: 0.05 } },
  furn_chandelier:    { name: 'シャンデリア', category: 'furniture', price: 4000, emoji: '💡',
                        bonus: { expBonus: 0.04 } },
  furn_piano:         { name: 'ピアノ',     category: 'furniture', price: 5000,  emoji: '🎹',
                        bonus: { expBonus: 0.08 } },
  furn_aquarium:      { name: '水槽',       category: 'furniture', price: 6000,  emoji: '🐠',
                        bonus: { qualityUp: 2 } },
  furn_golden_mirror: { name: '黄金の鏡',   category: 'furniture', price: 8000,  emoji: '🪞',
                        bonus: { coinBonus: 0.08 } },
  furn_magic_bonsai:  { name: '魔法の盆栽', category: 'furniture', price: 12000, emoji: '🎋',
                        bonus: { qualityUp: 3, expBonus: 0.06 } },
  furn_crystal_orb:   { name: '水晶玉',     category: 'furniture', price: 18000, emoji: '🔮',
                        bonus: { qualityUp: 5, coinBonus: 0.05 } },
  furn_ancient_altar: { name: '古代の祭壇', category: 'furniture', price: 25000, emoji: '🗿',
                        bonus: { qualityUp: 4, coinBonus: 0.08, expBonus: 0.08 } },
  furn_legend_sword:  { name: '伝説の剣',   category: 'furniture', price: 35000, emoji: '⚔️',
                        bonus: { coinBonus: 0.12, expBonus: 0.06 } },
  furn_void_orb:      { name: '虚空の球',   category: 'furniture', price: 55000, emoji: '🌑',
                        bonus: { qualityUp: 8, coinBonus: 0.10, expBonus: 0.10 } },
  furn_yamii:         { name: 'ヤミー',     category: 'furniture', price: 250000, emoji: '👻',
                        bonus: { qualityUp: 20, coinBonus: 0.30, expBonus: 0.30 } },
};

const MAX_FURNITURE = 8;  // 最大設置数

const DEFAULT_HOUSE = {
  wall:      'wall_wood',
  roof:      'roof_straw',
  door:      'door_wood',
  garden:    'garden_none',
  floor:     'floor_dirt',
  wallpaper: 'wp_plain',
  furniture: [],
};

const CATEGORY_NAMES = {
  wall:      '🧱 壁',
  roof:      '🏠 屋根',
  door:      '🚪 扉',
  garden:    '🌸 庭',
  floor:     '🪵 床',
  wallpaper: '🖼 壁紙',
  furniture: '🪑 家具',
};

// ボーナス説明テキスト生成
function formatBonus(bonus) {
  if (!bonus) return null;
  const parts = [];
  if (bonus.coinBonus)  parts.push(`💰+${Math.round(bonus.coinBonus * 100)}%`);
  if (bonus.expBonus)   parts.push(`⚡+${Math.round(bonus.expBonus * 100)}%`);
  if (bonus.qualityUp)  parts.push(`✨品質+${bonus.qualityUp}`);
  return parts.length ? parts.join(' ') : null;
}

module.exports = { HOUSE_ITEMS, DEFAULT_HOUSE, CATEGORY_NAMES, MAX_FURNITURE, formatBonus };
