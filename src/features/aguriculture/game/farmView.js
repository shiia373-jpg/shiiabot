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
const { HOUSE_ITEMS, DEFAULT_HOUSE, CATEGORY_NAMES, MAX_FURNITURE } = require('./houseItems');
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
      .setLabel('農場ショップ')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('farm_house_shop')
      .setLabel('家をカスタマイズ')
      .setEmoji('🏠')
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

// ─── 家ショップ ──────────────────────────────────────────────────────────────

function buildHouseShopEmbed(farm) {
  const house  = farm.house ?? { ...DEFAULT_HOUSE };
  const owned  = farm.ownedHouseItems ?? [];

  const categories = ['wall', 'roof', 'door', 'garden', 'floor', 'wallpaper'];
  const fields = categories.map(cat => {
    const catItems = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === cat);
    const lines = catItems.map(([id, item]) => {
      const isOwned    = owned.includes(id);
      const isEquipped = house[cat] === id;
      const prefix = isEquipped ? '✅ ' : isOwned ? '📦 ' : '';
      const price  = item.price === 0 ? '無料' : `${item.price} G`;
      return `${prefix}**${item.name}** — ${isOwned ? (isEquipped ? '装備中' : '所持済') : price}`;
    });
    return { name: `${CATEGORY_NAMES[cat]}`, value: lines.join('\n'), inline: true };
  });

  return new EmbedBuilder()
    .setTitle('🏠 家のカスタマイズ')
    .setDescription(`💰 所持コイン: **${farm.coins} G**\nカテゴリを選んで購入・変更できます。`)
    .setColor(0x8B6430)
    .addFields(...fields);
}

function buildHouseShopCategoryButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    ['wall', 'roof', 'door', 'garden'].map(id =>
      new ButtonBuilder()
        .setCustomId(`farm_house_cat_${id}`)
        .setLabel(CATEGORY_NAMES[id])
        .setStyle(ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder().addComponents(
    ['floor', 'wallpaper', 'furniture'].map(id =>
      new ButtonBuilder()
        .setCustomId(`farm_house_cat_${id}`)
        .setLabel(CATEGORY_NAMES[id])
        .setStyle(id === 'furniture' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
  return [row1, row2];
}

function buildHouseCategoryEmbed(farm, category) {
  const house  = farm.house ?? { ...DEFAULT_HOUSE };
  const owned  = farm.ownedHouseItems ?? [];
  const items  = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === category);

  const lines = items.map(([id, item]) => {
    const isOwned    = owned.includes(id);
    const isEquipped = house[category] === id;
    const price      = item.price === 0 ? '無料' : `${item.price} G`;
    const status     = isEquipped ? '✅ 装備中' : isOwned ? '📦 所持済' : price;
    return `**${item.name}** — ${status}`;
  });

  return new EmbedBuilder()
    .setTitle(`${CATEGORY_NAMES[category]} のカスタマイズ`)
    .setDescription(`💰 所持コイン: **${farm.coins} G**\n\n${lines.join('\n')}`)
    .setColor(0x8B6430);
}

function buildHouseCategoryButtons(farm, category) {
  const house = farm.house ?? { ...DEFAULT_HOUSE };
  const owned = farm.ownedHouseItems ?? [];
  const items = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === category);
  const rows  = [];

  for (let i = 0; i < items.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      items.slice(i, i + 5).map(([id, item]) => {
        const isOwned    = owned.includes(id);
        const isEquipped = house[category] === id;
        const canAfford  = item.price === 0 || farm.coins >= item.price;
        return new ButtonBuilder()
          .setCustomId(`farm_house_buy_${id}`)
          .setLabel(isEquipped ? `✅ ${item.name}` : isOwned ? `📦 ${item.name}` : `${item.name} (${item.price === 0 ? '無料' : item.price + 'G'})`)
          .setStyle(isEquipped ? ButtonStyle.Success : isOwned ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(isEquipped || (!isOwned && !canAfford));
      })
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_house_shop')
      .setLabel('← カテゴリ選択に戻る')
      .setStyle(ButtonStyle.Secondary)
  ));

  return rows.slice(0, 5);
}

// ─── 家具ショップ ─────────────────────────────────────────────────────────────

function buildFurnitureEmbed(farm) {
  const house     = farm.house ?? { ...DEFAULT_HOUSE };
  const owned     = farm.ownedHouseItems ?? [];
  const placed    = house.furniture ?? [];
  const furnitures = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture');

  const lines = furnitures.map(([id, item]) => {
    const isOwned   = owned.includes(id);
    const isPlaced  = placed.includes(id);
    const prefix    = isPlaced ? '✅ ' : isOwned ? '📦 ' : '';
    const status    = isPlaced ? '設置中' : isOwned ? '所持済' : `${item.price} G`;
    return `${prefix}${item.emoji} **${item.name}** — ${status}`;
  });

  return new EmbedBuilder()
    .setTitle('🪑 家具ショップ')
    .setDescription(
      `💰 所持コイン: **${farm.coins} G**\n` +
      `設置数: **${placed.length} / ${MAX_FURNITURE}**\n\n` +
      lines.join('\n')
    )
    .setColor(0x8B6430)
    .setFooter({ text: '購入済み家具は「外す」ことで別の家具に変えられます' });
}

function buildFurnitureButtons(farm) {
  const house    = farm.house ?? { ...DEFAULT_HOUSE };
  const owned    = farm.ownedHouseItems ?? [];
  const placed   = house.furniture ?? [];
  const items    = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture');
  const rows     = [];
  const isFull   = placed.length >= MAX_FURNITURE;

  for (let i = 0; i < items.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      items.slice(i, i + 5).map(([id, item]) => {
        const isOwned  = owned.includes(id);
        const isPlaced = placed.includes(id);
        const canAfford = farm.coins >= item.price;

        if (isPlaced) {
          return new ButtonBuilder()
            .setCustomId(`farm_furn_remove_${id}`)
            .setLabel(`${item.emoji} 外す`)
            .setStyle(ButtonStyle.Danger);
        }
        return new ButtonBuilder()
          .setCustomId(`farm_furn_add_${id}`)
          .setLabel(isOwned ? `${item.emoji} 設置` : `${item.emoji} ${item.price}G`)
          .setStyle(isOwned ? ButtonStyle.Success : ButtonStyle.Primary)
          .setDisabled((!isOwned && !canAfford) || (!isPlaced && isFull));
      })
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_house_shop')
      .setLabel('← カテゴリ選択に戻る')
      .setStyle(ButtonStyle.Secondary)
  ));

  return rows.slice(0, 5);
}

async function handleHouseShopButton(interaction) {
  const { customId } = interaction;

  if (customId === 'farm_house_shop') {
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);
    return interaction.reply({
      embeds: [buildHouseShopEmbed(farm)],
      components: buildHouseShopCategoryButtons(),
      ephemeral: true,
    });
  }

  if (customId.startsWith('farm_house_cat_')) {
    const category = customId.replace('farm_house_cat_', '');
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);

    if (category === 'furniture') {
      return interaction.update({
        embeds: [buildFurnitureEmbed(farm)],
        components: buildFurnitureButtons(farm),
      });
    }

    return interaction.update({
      embeds: [buildHouseCategoryEmbed(farm, category)],
      components: buildHouseCategoryButtons(farm, category),
    });
  }

  // 家具：設置
  if (customId.startsWith('farm_furn_add_')) {
    const itemId = customId.replace('farm_furn_add_', '');
    const item   = HOUSE_ITEMS[itemId];
    if (!item) return;

    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.house.furniture) farm.house.furniture = [];
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);

    if (farm.house.furniture.length >= MAX_FURNITURE) {
      return interaction.reply({ content: `❌ 家具は最大 ${MAX_FURNITURE} 個まで設置できます。`, ephemeral: true });
    }

    const isOwned = farm.ownedHouseItems.includes(itemId);
    if (!isOwned) {
      if (farm.coins < item.price) {
        return interaction.reply({ content: `❌ コインが足りません（必要: ${item.price} G）`, ephemeral: true });
      }
      farm.coins -= item.price;
      farm.ownedHouseItems.push(itemId);
    }

    farm.house.furniture.push(itemId);
    await saveFarm(interaction.user.id, farm);

    const msg = isOwned ? `設置しました！` : `${item.price} G で購入・設置しました！`;
    await interaction.reply({ content: `✅ ${item.emoji} **${item.name}** を${msg}`, ephemeral: true });
    await interaction.update({
      embeds: [buildFurnitureEmbed(farm)],
      components: buildFurnitureButtons(farm),
    }).catch(() => {});
    await buildFarmPayload(interaction.user.id).then(p => interaction.message.edit(p)).catch(() => {});
    return;
  }

  // 家具：取り外し
  if (customId.startsWith('farm_furn_remove_')) {
    const itemId = customId.replace('farm_furn_remove_', '');
    const item   = HOUSE_ITEMS[itemId];
    if (!item) return;

    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.house.furniture) farm.house.furniture = [];

    farm.house.furniture = farm.house.furniture.filter(id => id !== itemId);
    await saveFarm(interaction.user.id, farm);

    await interaction.update({
      embeds: [buildFurnitureEmbed(farm)],
      components: buildFurnitureButtons(farm),
    });
    await buildFarmPayload(interaction.user.id).then(p => interaction.message.edit(p)).catch(() => {});
    return;
  }

  if (customId.startsWith('farm_house_buy_')) {
    const itemId = customId.replace('farm_house_buy_', '');
    const item   = HOUSE_ITEMS[itemId];
    if (!item) return;

    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);

    const isOwned = farm.ownedHouseItems.includes(itemId);

    if (!isOwned) {
      if (item.price > 0 && farm.coins < item.price) {
        return interaction.reply({ content: `❌ コインが足りません（必要: ${item.price} G）`, ephemeral: true });
      }
      farm.coins -= item.price;
      farm.ownedHouseItems.push(itemId);
    }

    // 装備
    farm.house[item.category] = itemId;
    await saveFarm(interaction.user.id, farm);

    const priceMsg = isOwned ? '' : item.price === 0 ? '無料で入手！ ' : `${item.price} G で購入！ `;
    await interaction.reply({
      content: `✅ ${priceMsg}**${item.name}** を装備しました！`,
      ephemeral: true,
    });

    // 農場画像も更新
    const payload = await buildFarmPayload(interaction.user.id);
    await interaction.message.edit(payload).catch(() => {});
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
  buildHouseShopEmbed,
  buildHouseShopCategoryButtons,
  buildFurnitureEmbed,
  buildFurnitureButtons,
  handleHouseShopButton,
};
