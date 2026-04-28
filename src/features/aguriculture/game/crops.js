const CROPS = {
  // ===== 序盤 =====
  wheat:       { name: '小麦',             emoji: '🌾', color: '#F5DEB3', growTime: 60     * 1000, buy: 0,    sell: 12,    exp: 2   },
  carrot:      { name: 'にんじん',         emoji: '🥕', color: '#FF6B35', growTime: 180    * 1000, buy: 15,   sell: 40,    exp: 5   },
  potato:      { name: 'じゃがいも',       emoji: '🥔', color: '#C19A6B', growTime: 300    * 1000, buy: 25,   sell: 70,    exp: 7   },

  // ===== 初期中盤 =====
  tomato:      { name: 'トマト',           emoji: '🍅', color: '#FF3333', growTime: 600    * 1000, buy: 50,   sell: 130,   exp: 12  },
  cabbage:     { name: 'キャベツ',         emoji: '🥬', color: '#90EE90', growTime: 900    * 1000, buy: 80,   sell: 200,   exp: 18  },
  corn:        { name: 'とうもろこし',     emoji: '🌽', color: '#FFD700', growTime: 1800   * 1000, buy: 120,  sell: 320,   exp: 25  },

  // ===== 中盤 =====
  eggplant:    { name: 'ナス',             emoji: '🍆', color: '#6A0DAD', growTime: 3600   * 1000, buy: 250,  sell: 700,   exp: 40  },
  pepper:      { name: 'ピーマン',         emoji: '🫑', color: '#228B22', growTime: 5400   * 1000, buy: 400,  sell: 1100,  exp: 55  },

  // ===== 中盤後半 =====
  pumpkin:     { name: 'かぼちゃ',         emoji: '🎃', color: '#FF8C00', growTime: 10800  * 1000, buy: 600,  sell: 1800,  exp: 80  },
  melon:       { name: 'メロン',           emoji: '🍈', color: '#AADD66', growTime: 21600  * 1000, buy: 1200, sell: 3500,  exp: 120 },

  // ===== 後半 =====
  pineapple:   { name: 'パイナップル',     emoji: '🍍', color: '#DDAA00', growTime: 43200  * 1000, buy: 2500, sell: 8000,  exp: 200 },
  dragonfruit: { name: 'ドラゴンフルーツ', emoji: '🐉', color: '#FF69B4', growTime: 86400  * 1000, buy: 5000, sell: 16000, exp: 350 },

  // ===== エンドコンテンツ（レア入手のみ）=====
  golden:      { name: '黄金作物',         emoji: '✨', color: '#FFD700', growTime: 172800 * 1000, buy: 0,    sell: 50000, exp: 1000, rare: 0.01 },
};

module.exports = { CROPS };
