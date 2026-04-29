// =============================================
// 家のアイテム定義
// =============================================

const HOUSE_ITEMS = {
  // ─── 外装：壁 ───────────────────────────────
  wall_wood:   { name: '木の壁',       category: 'wall',      price: 0,    color: '#8B6430', accent: '#6B4A20', label: 'デフォルト' },
  wall_stone:  { name: '石の壁',       category: 'wall',      price: 500,  color: '#8A8A8A', accent: '#686868' },
  wall_brick:  { name: 'レンガ壁',     category: 'wall',      price: 800,  color: '#9E3A1A', accent: '#7A2A10' },
  wall_white:  { name: '白壁',         category: 'wall',      price: 600,  color: '#E8E4DC', accent: '#C8C0B4' },
  wall_golden: { name: '黄金の壁',     category: 'wall',      price: 5000, color: '#C8A020', accent: '#A07818' },

  // ─── 外装：屋根 ──────────────────────────────
  roof_straw:  { name: 'わら屋根',     category: 'roof',      price: 0,    color: '#9B7B40', peak: '#7B5B28', label: 'デフォルト' },
  roof_red:    { name: '赤い屋根',     category: 'roof',      price: 300,  color: '#CC2200', peak: '#AA1A00' },
  roof_blue:   { name: '青い屋根',     category: 'roof',      price: 300,  color: '#1144CC', peak: '#0A2AAA' },
  roof_green:  { name: '緑の屋根',     category: 'roof',      price: 300,  color: '#2A8A2A', peak: '#1A6A1A' },
  roof_golden: { name: '黄金屋根',     category: 'roof',      price: 3000, color: '#DAA520', peak: '#B88010' },

  // ─── 外装：扉 ────────────────────────────────
  door_wood:   { name: '木の扉',       category: 'door',      price: 0,    color: '#6B3A1A', knob: '#B08030', label: 'デフォルト' },
  door_iron:   { name: '鉄の扉',       category: 'door',      price: 400,  color: '#484848', knob: '#909090' },
  door_red:    { name: '赤い扉',       category: 'door',      price: 600,  color: '#AA1A00', knob: '#FFD700' },
  door_fancy:  { name: '豪華な扉',     category: 'door',      price: 2000, color: '#2C1A0E', knob: '#FFD700' },

  // ─── 外装：庭 ────────────────────────────────
  garden_none:     { name: 'なし',           category: 'garden',    price: 0,    label: 'デフォルト' },
  garden_flowers:  { name: 'お花畑',         category: 'garden',    price: 600  },
  garden_fence:    { name: '木の柵',         category: 'garden',    price: 400  },
  garden_fountain: { name: '噴水',           category: 'garden',    price: 2000 },
  garden_statue:   { name: '豊作の神像',     category: 'garden',    price: 8000 },

  // ─── 内装：床 ────────────────────────────────
  floor_dirt:   { name: '土の床',       category: 'floor',     price: 0,    color: '#5A3818', label: 'デフォルト' },
  floor_wood:   { name: '木の床',       category: 'floor',     price: 500,  color: '#8B5E10' },
  floor_stone:  { name: '石の床',       category: 'floor',     price: 800,  color: '#686868' },
  floor_tile:   { name: 'タイル床',     category: 'floor',     price: 1200, color: '#A09080' },
  floor_marble: { name: '大理石床',     category: 'floor',     price: 5000, color: '#D8D0C8' },

  // ─── 内装：壁紙 ──────────────────────────────
  wp_plain:    { name: 'シンプル',      category: 'wallpaper', price: 0,    color: '#C0A880', label: 'デフォルト' },
  wp_flower:   { name: '花柄',          category: 'wallpaper', price: 400,  color: '#D4A0A8' },
  wp_wood:     { name: '木目',          category: 'wallpaper', price: 600,  color: '#907048' },
  wp_blue:     { name: '水色',          category: 'wallpaper', price: 400,  color: '#80A8C8' },
  wp_fancy:    { name: '豪華',          category: 'wallpaper', price: 3000, color: '#8060B0' },

  // ─── 家具 ─────────────────────────────────────
  furn_plant:      { name: '観葉植物',     category: 'furniture', price: 400,  emoji: '🌿' },
  furn_clock:      { name: '時計',         category: 'furniture', price: 500,  emoji: '🕐' },
  furn_table:      { name: 'テーブル',     category: 'furniture', price: 600,  emoji: '🪑' },
  furn_bookshelf:  { name: '本棚',         category: 'furniture', price: 700,  emoji: '📚' },
  furn_rug:        { name: '絨毯',         category: 'furniture', price: 800,  emoji: '🟥' },
  furn_sofa:       { name: 'ソファ',       category: 'furniture', price: 800,  emoji: '🛋️' },
  furn_bed:        { name: 'ベッド',       category: 'furniture', price: 1000, emoji: '🛏️' },
  furn_painting:   { name: '絵画',         category: 'furniture', price: 1200, emoji: '🖼️' },
  furn_fireplace:  { name: '暖炉',         category: 'furniture', price: 1500, emoji: '🔥' },
  furn_trophy:     { name: 'トロフィー',   category: 'furniture', price: 2000, emoji: '🏆' },
  furn_chest:      { name: '宝箱',         category: 'furniture', price: 3000, emoji: '📦' },
  furn_chandelier: { name: 'シャンデリア', category: 'furniture', price: 4000, emoji: '💡' },
  furn_piano:      { name: 'ピアノ',       category: 'furniture', price: 5000, emoji: '🎹' },
  furn_aquarium:   { name: '水槽',         category: 'furniture', price: 6000, emoji: '🐠' },
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

module.exports = { HOUSE_ITEMS, DEFAULT_HOUSE, CATEGORY_NAMES, MAX_FURNITURE };
