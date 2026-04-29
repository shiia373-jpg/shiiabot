const fs = require('fs');
const path = require('path');
const { loadFarm, setFarmMessage } = require('./game/farmState');
const {
  buildFarmPayload,
  buildSlotPickerPayload,
  buildCropPickerPayload,
  plantCrop,
  harvestAll,
  buildHarvestEmbed,
  buildShopEmbed,
  buildShopButtons,
  handleShopButton,
  handleHouseShopButton,
} = require('./game/farmView');

// commands/ 内のファイルを自動ロード
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const mod = require(path.join(commandsPath, file));
  if (mod.data && mod.execute) commands.push(mod);
}

// ─── ボタン処理 ──────────────────────────────────────────────────────────────

async function handleButton(interaction) {
  const { customId, user } = interaction;
  if (!customId.startsWith('farm_')) return;

  // 家ショップ・家具関連ボタン
  if (customId === 'farm_house_shop' ||
      customId.startsWith('farm_house_') ||
      customId.startsWith('farm_furn_')) {
    return handleHouseShopButton(interaction);
  }

  // ショップ購入・解放ボタン（interaction.update() を使うため先に分岐）
  if (customId.startsWith('farm_buy_') || customId === 'farm_unlock_slot') {
    return handleShopButton(interaction);
  }

  // ショップ表示は ephemeral reply（メインの農場画像はそのまま残す）
  if (customId === 'farm_shop') {
    const farm = await loadFarm(user.id);
    return interaction.reply({
      embeds: [buildShopEmbed(farm)],
      components: buildShopButtons(farm),
      ephemeral: true,
    });
  }

  // それ以外は農場メッセージを上書き更新
  await interaction.deferUpdate();

  try {
    // ── 農場表示・更新 ──
    if (customId === 'farm_refresh') {
      await interaction.editReply(await buildFarmPayload(user.id));
      await setFarmMessage(user.id, interaction.message.id, interaction.channelId);
      return;
    }

    // ── 植えるメニュー（スロット選択）──
    if (customId === 'farm_plant_menu') {
      const farm = await loadFarm(user.id);
      return interaction.editReply(buildSlotPickerPayload(farm));
    }

    // ── スロット選択 → 作物選択 ──
    if (customId.startsWith('farm_plant_slot_')) {
      const slotIndex = parseInt(customId.replace('farm_plant_slot_', ''), 10);
      const farm = await loadFarm(user.id);
      return interaction.editReply(buildCropPickerPayload(farm, slotIndex));
    }

    // ── 作物選択 → 植える → 農場に戻る ──
    if (customId.startsWith('farm_plant_crop_')) {
      const rest = customId.replace('farm_plant_crop_', '');
      const sep = rest.indexOf('_');
      const slotIndex = parseInt(rest.substring(0, sep), 10);
      const cropId = rest.substring(sep + 1);

      try {
        const { crop } = await plantCrop(user.id, slotIndex, cropId);
        const payload = await buildFarmPayload(user.id);
        payload.content = `✅ スロット #${slotIndex + 1} に ${crop.emoji} **${crop.name}** を植えました！`;
        return interaction.editReply(payload);
      } catch (e) {
        const msgs = {
          'slot not empty':    '❌ そのスロットにはすでに作物があります。',
          'no seed':           '❌ 種がなくなっています。ショップで購入してください。',
          'slot not unlocked': '❌ そのスロットはまだ解放されていません。',
        };
        await interaction.followUp({ content: msgs[e.message] ?? '❌ エラーが発生しました。', ephemeral: true });
        return interaction.editReply(await buildFarmPayload(user.id));
      }
    }

    // ── 収穫 → 結果表示 → 農場更新 ──
    if (customId === 'farm_harvest_all') {
      const result = await harvestAll(user.id);
      const farmPayload = await buildFarmPayload(user.id);

      if (result) {
        const { results, totalCoins, totalExp, farm, levelUps } = result;
        await interaction.followUp({
          embeds: [buildHarvestEmbed(results, totalCoins, totalExp, farm.coins, farm.level, levelUps)],
          ephemeral: true,
        });
      }

      return interaction.editReply(farmPayload);
    }

  } catch (err) {
    console.error('[Farm Button Error]:', err);
    await interaction.followUp({ content: '⚠️ エラーが発生しました。', ephemeral: true }).catch(() => {});
  }
}

module.exports = { commands, handleButton };
