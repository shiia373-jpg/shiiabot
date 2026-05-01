const { loadFarm, saveFarm, getAllFarmUserIds } = require('./farmState');
const { buildFarmPayload } = require('./farmView');
const { getSlotStatus } = require('./mechanics');

// 30秒ごとに農場メッセージを自動更新する
async function refreshActiveFarms(client) {
  let userIds;
  try {
    userIds = await getAllFarmUserIds();
  } catch {
    return;
  }

  for (const userId of userIds) {
    const farm = await loadFarm(userId);
    if (!farm.activeMessage) continue;
    // 入室中は上書きしない
    if (farm.activeMessage.inRoom) continue;

    // 育成中または収穫可能なスロットがあるときだけ更新
    const hasActive = farm.slots.some(s => getSlotStatus(s) !== 'empty');
    if (!hasActive) continue;

    const { messageId, channelId } = farm.activeMessage;

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        // メッセージが削除されていたら参照をクリア
        farm.activeMessage = null;
        await saveFarm(userId, farm);
        continue;
      }

      const payload = await buildFarmPayload(userId);
      await message.edit(payload);
    } catch (err) {
      // Unknown Message (10008) はクリア、それ以外はスキップ
      if (err.code === 10008) {
        farm.activeMessage = null;
        await saveFarm(userId, farm);
      }
    }

    // ユーザー間に少し待機してレート制限を回避
    await new Promise(r => setTimeout(r, 1500));
  }
}

function startFarmUpdater(client, intervalMs = 30000) {
  setInterval(() => refreshActiveFarms(client), intervalMs);
  console.log(`🌾 農場自動更新を開始（${intervalMs / 1000}秒間隔）`);
}

module.exports = { startFarmUpdater };
