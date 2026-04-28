const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { loadFarm, saveFarm } = require('./farmState');
const { generateFarmImage } = require('./farmCanvas');
const { CROPS } = require('./crops');
const {
  MAX_SLOTS,
  getUnlockCost,
  getLevelExp,
  getSlotStatus,
  calcHarvest,
  getGrowProgress,
  getTimeToReady,
  formatTime,
} = require('./mechanics');

// ─── 農場メインビュー ────────────────────────────────────────────────────────

async function buildFarmPayload(userId) {
  const farm = await loadFarm(userId);
  // 既存データに level/exp がなければ補完
  if (!farm.level) farm.level = 1;
  if (!farm.exp)   farm.exp   = 0;

  const buf = generateFarmImage(farm);
  const attachment = new AttachmentBuilder(buf, { name: 'farm.png' });

  const slotLines = farm.slots.map((slot, i) => {
    const st = getSlotStatus(slot);
    if (st === 'empty') return `**#${i + 1}** 　空き`;
    const c = CROPS[slot.crop];
    if (st === 'growing') return `**#${i + 1}** 🌱 ${c.name} — あと ${formatTime(getTimeToReady(slot))}`;
    const labels = { optimal: '⭐ ベストタイミング！', ready: '✅ 収穫OK', overripe: '⚠️ 過熟（急いで！）' };
    return `**#${i + 1}** ${labels[st] ?? st} ${c.name}`;
  });

  const seedLines = Object.entries(farm.seeds)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${CROPS[id]?.emoji} ${CROPS[id]?.name} ×${n}`);

  const hasReady = farm.slots.some(s => ['optimal', 'ready', 'overripe'].includes(getSlotStatus(s)));
  const canPlant = farm.slots.some(s => getSlotStatus(s) === 'empty')
    && Object.values(farm.seeds).some(n => n > 0);

  const nextLevelExp = getLevelExp(farm.level);
  const expBar = Math.floor((farm.exp / nextLevelExp) * 10);
  const expBarStr = '█'.repeat(expBar) + '░'.repeat(10 - expBar);

  const embed = new EmbedBuilder()
    .setTitle('🌾 あなたの農場')
    .setColor(0x3D7A26)
    .addFields(
      { name: '📋 スロット', value: slotLines.join('\n') || '(なし)' },
      { name: '🌱 所持している種', value: seedLines.join(' ／ ') || 'なし', inline: true },
      { name: '💰 所持コイン', value: `${farm.coins} G`, inline: true },
      { name: '📦 解放スロット', value: `${farm.slots.length} / ${MAX_SLOTS}`, inline: true },
      { name: `⚡ Lv.${farm.level}`, value: `${expBarStr}\n${farm.exp} / ${nextLevelExp} EXP`, inline: true },
    )
    .setImage('attachment://farm.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_plant_menu')
      .setLabel('植える')
      .setEmoji('🌱')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canPlant),
    new ButtonBuilder()
      .setCustomId('farm_harvest_all')
      .setLabel('収穫する')
      .setEmoji('🧺')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasReady),
    new ButtonBuilder()
      .setCustomId('farm_shop')
      .setLabel('ショップ')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('farm_refresh')
      .setLabel('更新')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], files: [attachment], components: [row] };
}

// ─── 植えるフロー ────────────────────────────────────────────────────────────

function buildSlotPickerPayload(farm) {
  const empty = farm.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => getSlotStatus(s) === 'empty');

  const embed = new EmbedBuilder()
    .setTitle('🌱 どのスロットに植えますか？')
    .setColor(0x3D7A26)
    .setDescription('空いているスロットを選んでください。');

  const rows = [];
  for (let i = 0; i < empty.length; i += 4) {
    const chunk = empty.slice(i, i + 4);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(({ i: idx }) =>
        new ButtonBuilder()
          .setCustomId(`farm_plant_slot_${idx}`)
          .setLabel(`スロット #${idx + 1}`)
          .setStyle(ButtonStyle.Primary)
      )
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_refresh')
      .setLabel('← 戻る')
      .setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], files: [], components: rows.slice(0, 5) };
}

function buildCropPickerPayload(farm, slotIndex) {
  const available = Object.entries(farm.seeds)
    .filter(([, n]) => n > 0)
    .map(([id]) => CROPS[id])
    .filter(Boolean);

  const desc = available.map(c =>
    `${c.emoji} **${c.name}** — 成長: ${formatTime(c.growTime)}`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`スロット #${slotIndex + 1} に何を植えますか？`)
    .setColor(0x3D7A26)
    .setDescription(desc);

  const rows = [];
  for (let i = 0; i < available.length; i += 5) {
    const chunk = available.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(c =>
        new ButtonBuilder()
          .setCustomId(`farm_plant_crop_${slotIndex}_${c.id ?? Object.keys(CROPS).find(k => CROPS[k] === c)}`)
          .setLabel(`${c.name} (残り${farm.seeds[Object.keys(CROPS).find(k => CROPS[k] === c)]}個)`)
          .setEmoji(c.emoji)
          .setStyle(ButtonStyle.Success)
      )
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_plant_menu')
      .setLabel('← スロット選択に戻る')
      .setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], files: [], components: rows.slice(0, 5) };
}

async function plantCrop(userId, slotIndex, cropId) {
  const farm = await loadFarm(userId);
  const crop = CROPS[cropId];
  if (!crop) throw new Error('unknown crop');
  if (slotIndex >= farm.slots.length) throw new Error('slot not unlocked');
  if (getSlotStatus(farm.slots[slotIndex]) !== 'empty') throw new Error('slot not empty');
  if ((farm.seeds[cropId] ?? 0) <= 0) throw new Error('no seed');

  farm.slots[slotIndex] = { crop: cropId, planted_at: Date.now() };
  farm.seeds[cropId]--;
  await saveFarm(userId, farm);
  return { farm, crop };
}

// ─── 収穫フロー ──────────────────────────────────────────────────────────────

async function harvestAll(userId) {
  const farm = await loadFarm(userId);
  if (!farm.level) farm.level = 1;
  if (!farm.exp)   farm.exp   = 0;

  const results = [];
  let totalCoins = 0;
  let totalExp   = 0;

  for (let i = 0; i < farm.slots.length; i++) {
    const slot = farm.slots[i];
    if (!['optimal', 'ready', 'overripe'].includes(getSlotStatus(slot))) continue;

    const result = calcHarvest(slot, true);
    if (!result) continue;

    totalCoins += result.coins;
    totalExp   += result.exp;
    results.push({ slotNum: i + 1, cropId: slot.crop, crop: CROPS[slot.crop], result });
    farm.slots[i] = { crop: null, planted_at: null };
  }

  if (!results.length) return null;

  farm.coins += totalCoins;
  farm.exp   += totalExp;
  farm.totalHarvests      += results.length;
  farm.totalCoinsEarned   += totalCoins;

  // レベルアップ処理
  const levelUps = [];
  let needed = getLevelExp(farm.level);
  while (farm.exp >= needed) {
    farm.exp -= needed;
    farm.level++;
    levelUps.push(farm.level);
    needed = getLevelExp(farm.level);
  }

  await saveFarm(userId, farm);
  return { farm, results, totalCoins, totalExp, levelUps };
}

function buildHarvestEmbed(results, totalCoins, totalExp, newBalance, newLevel, levelUps) {
  const lines = results.map(({ slotNum, crop, result }) => {
    const bonus = result.bonuses.length ? `\n　${result.bonuses.join(' / ')}` : '';
    return `#${slotNum} ${crop.emoji} **${crop.name}** — ${result.quality.emoji} **${result.quality.label}** → **${result.coins} G** / +${result.exp} EXP${bonus}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🧺 収穫完了！')
    .setColor(0xFFD700)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '💰 今回の収益', value: `**${totalCoins} G**`, inline: true },
      { name: '💳 残高',       value: `${newBalance} G`,     inline: true },
      { name: '⚡ 獲得EXP',    value: `+${totalExp} EXP`,    inline: true },
    )
    .setFooter({ text: '⭐ ベストタイミングで収穫するとボーナスUP！' });

  if (levelUps.length > 0) {
    embed.addFields({
      name: '🎉 レベルアップ！',
      value: levelUps.map(l => `**Lv.${l}** に上がった！`).join('\n'),
    });
  }

  return embed;
}

// ─── ショップ ────────────────────────────────────────────────────────────────

function buildShopEmbed(farm) {
  // golden は shop非表示（レア入手のみ）
  const crops = Object.entries(CROPS)
    .filter(([id]) => id !== 'golden')
    .map(([id, c]) => ({ id, ...c }));

  const seedLines = crops.map(c => {
    const owned = farm.seeds[c.id] ?? 0;
    const priceStr = c.buy === 0 ? '無料' : `${c.buy} G`;
    return `${c.emoji} **${c.name}** — 種 ${priceStr} / 収穫 ${c.sell} G～ （所持 ${owned}個）`;
  });

  const nextSlot = farm.slots.length;
  const slotLine = nextSlot >= MAX_SLOTS
    ? 'スロットは最大まで解放済み'
    : `スロット #${nextSlot + 1} 解放: **${getUnlockCost(nextSlot)} G**`;

  return new EmbedBuilder()
    .setTitle('🛒 農場ショップ')
    .setColor(0x5C4A1E)
    .addFields(
      { name: '🌱 種（1個）', value: seedLines.join('\n') },
      { name: '🔓 スロット解放', value: slotLine, inline: true },
      { name: '💰 所持コイン',  value: `${farm.coins} G`, inline: true },
    )
    .setFooter({ text: '種を買ってスロットを増やすほど効率UP！' });
}

function buildShopButtons(farm) {
  const crops = Object.entries(CROPS)
    .filter(([id]) => id !== 'golden')
    .map(([id, c]) => ({ id, ...c }));

  const rows = [];
  for (let i = 0; i < crops.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      crops.slice(i, i + 5).map(c =>
        new ButtonBuilder()
          .setCustomId(`farm_buy_${c.id}`)
          .setLabel(c.buy === 0 ? `${c.name} 種 (無料)` : `${c.name} 種 (${c.buy}G)`)
          .setEmoji(c.emoji)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(c.buy > 0 && farm.coins < c.buy)
      )
    ));
  }

  const nextSlot = farm.slots.length;
  if (nextSlot < MAX_SLOTS) {
    const cost = getUnlockCost(nextSlot);
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('farm_unlock_slot')
        .setLabel(`スロット #${nextSlot + 1} 解放 (${cost}G)`)
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success)
        .setDisabled(farm.coins < cost)
    ));
  }

  return rows.slice(0, 5);
}

async function handleShopButton(interaction) {
  const { customId } = interaction;

  if (customId === 'farm_unlock_slot') {
    const farm = await loadFarm(interaction.user.id);
    const nextSlot = farm.slots.length;
    if (nextSlot >= MAX_SLOTS) {
      return interaction.reply({ content: '❌ これ以上解放できません。', ephemeral: true });
    }
    const cost = getUnlockCost(nextSlot);
    if (farm.coins < cost) {
      return interaction.reply({ content: `❌ コインが足りません（必要: ${cost} G）`, ephemeral: true });
    }
    farm.coins -= cost;
    farm.slots.push({ crop: null, planted_at: null });
    await saveFarm(interaction.user.id, farm);
    await interaction.update({ embeds: [buildShopEmbed(farm)], components: buildShopButtons(farm) });
    await interaction.followUp({ content: `✅ スロット **#${nextSlot + 1}** を解放！（残: ${farm.coins} G）`, ephemeral: true });
    return;
  }

  if (customId.startsWith('farm_buy_')) {
    const cropId = customId.replace('farm_buy_', '');
    const crop = CROPS[cropId];
    if (!crop) return;

    const farm = await loadFarm(interaction.user.id);
    if (crop.buy > 0 && farm.coins < crop.buy) {
      return interaction.reply({ content: `❌ コインが足りません（必要: ${crop.buy} G）`, ephemeral: true });
    }
    farm.coins -= crop.buy;
    farm.seeds[cropId] = (farm.seeds[cropId] ?? 0) + 1;
    await saveFarm(interaction.user.id, farm);
    await interaction.update({ embeds: [buildShopEmbed(farm)], components: buildShopButtons(farm) });
    const priceStr = crop.buy === 0 ? '無料で' : `${crop.buy} G で`;
    await interaction.followUp({ content: `✅ ${crop.emoji} **${crop.name}** の種を${priceStr}購入！（残: ${farm.coins} G）`, ephemeral: true });
  }
}

module.exports = {
  buildFarmPayload,
  buildSlotPickerPayload,
  buildCropPickerPayload,
  plantCrop,
  harvestAll,
  buildHarvestEmbed,
  buildShopEmbed,
  buildShopButtons,
  handleShopButton,
};
