const fs = require('fs').promises;
const path = require('path');
const { INITIAL_SLOTS } = require('./mechanics');

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

module.exports = { loadFarm, saveFarm };
