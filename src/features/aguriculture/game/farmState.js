const fs = require('fs').promises;
const path = require('path');
const { INITIAL_SLOTS } = require('./mechanics');
const { DEFAULT_HOUSE } = require('./houseItems');

const DATA_DIR = path.join(__dirname, '../data');

const userFilePath = (userId) => path.join(DATA_DIR, `${userId}.json`);

function createDefaultFarm() {
  return {
    coins: 100,
    level: 1,
    exp: 0,
    slots: Array.from({ length: INITIAL_SLOTS }, () => ({ crop: null, planted_at: null })),
    seeds: { wheat: 5 },
    totalHarvests: 0,
    totalCoinsEarned: 0,
    house: { ...DEFAULT_HOUSE },
    ownedHouseItems: Object.keys(require('./houseItems').HOUSE_ITEMS).filter(
      k => require('./houseItems').HOUSE_ITEMS[k].price === 0
    ),
  };
}

async function loadFarm(userId) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(userFilePath(userId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return createDefaultFarm();
  }
}

// アトミックな保存: tmp ファイルに書いてからリネームする
async function saveFarm(userId, farm) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const dest = userFilePath(userId);
  const tmp = dest + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(farm, null, 2), 'utf8');
  await fs.rename(tmp, dest);
}

// 農場メッセージの参照を保存（自動更新用）
async function setFarmMessage(userId, messageId, channelId) {
  const farm = await loadFarm(userId);
  farm.activeMessage = { messageId, channelId };
  await saveFarm(userId, farm);
}

// 全ユーザーIDを取得（自動更新用）
async function getAllFarmUserIds() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const files = await fs.readdir(DATA_DIR);
  return files
    .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
    .map(f => f.replace('.json', ''));
}

module.exports = { loadFarm, saveFarm, setFarmMessage, getAllFarmUserIds };
