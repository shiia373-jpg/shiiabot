const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { loadFarm, saveFarm } = require('./farmState');
const { generateFarmImage, generateInteriorImage } = require('./farmCanvas');
const { CROPS } = require('./crops');
const { HOUSE_ITEMS, DEFAULT_HOUSE, CATEGORY_NAMES, MAX_FURNITURE, MAX_TOP_ITEMS, formatBonus } = require('./houseItems');
const {
  MAX_SLOTS,
  getUnlockCost,
  getLevelExp,
  getSlotStatus,
  getFarmBonus,
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

  const farmBonus = getFarmBonus(farm);
  const bonusParts = [];
  if (farmBonus.coinBonus > 0) bonusParts.push(`💰 +${Math.round(farmBonus.coinBonus * 100)}%`);
  if (farmBonus.expBonus  > 0) bonusParts.push(`⚡ +${Math.round(farmBonus.expBonus  * 100)}%`);
  if (farmBonus.qualityUp > 0) bonusParts.push(`✨ 品質+${farmBonus.qualityUp}`);

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

  if (bonusParts.length > 0) {
    embed.addFields({ name: '🏡 家ボーナス', value: bonusParts.join('　'), inline: true });
  }

  const row1 = new ActionRowBuilder().addComponents(
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
      .setLabel('外装カスタマイズ')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_enter_room')
      .setLabel('入室')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('farm_visit_menu')
      .setLabel('訪問')
      .setEmoji('🏘️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('farm_refresh')
      .setLabel('更新')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], files: [attachment], components: [row1, row2] };
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

  const farmBonus = getFarmBonus(farm);
  const results = [];
  let totalCoins = 0;
  let totalExp   = 0;

  for (let i = 0; i < farm.slots.length; i++) {
    const slot = farm.slots[i];
    if (!['optimal', 'ready', 'overripe'].includes(getSlotStatus(slot))) continue;

    const result = calcHarvest(slot, true, farmBonus);
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
  return { farm, results, totalCoins, totalExp, levelUps, farmBonus };
}

// ─── 室内ビュー ──────────────────────────────────────────────────────────────

// farm オブジェクトの初期化ヘルパー
// 部屋内の配置スポット名（farmCanvas.js の positions[] に対応）
const ROOM_POSITIONS = [
  '奥・左',   // 0  fx:0.13 fy:0.22
  '奥・右',   // 1  fx:0.87 fy:0.22
  '奥・中央', // 2  fx:0.50 fy:0.16
  '中間・左', // 3  fx:0.27 fy:0.45
  '中間・右', // 4  fx:0.73 fy:0.45
  '中間・中央', // 5 fx:0.50 fy:0.40
  '手前・左', // 6  fx:0.16 fy:0.67
  '手前・右', // 7  fx:0.84 fy:0.67
  '手前・中央', // 8 fx:0.50 fy:0.58
  '最前・左', // 9  fx:0.34 fy:0.85
  '最前・右', // 10 fx:0.66 fy:0.85
];

// 配置中の家具が使っていない最初のスロット番号を返す
function getNextFreePos(placed, furniturePositions) {
  const used = new Set(placed.map(id => furniturePositions[id]).filter(v => v !== undefined));
  for (let i = 0; i < ROOM_POSITIONS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function initFarmHouse(farm) {
  if (!farm.house)                     farm.house = { ...DEFAULT_HOUSE };
  if (!farm.house.furniture)           farm.house.furniture = [];
  if (!farm.house.furniturePositions)  farm.house.furniturePositions = {};
  if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);
}

async function buildInteriorPayload(targetUserId, ownerName = null) {
  const farm      = await loadFarm(targetUserId);
  const buf       = generateInteriorImage(farm, ownerName);
  const attachment = new AttachmentBuilder(buf, { name: 'interior.png' });

  const furniture = (farm.house?.furniture ?? []);
  const furnNames = furniture
    .map(id => HOUSE_ITEMS[id])
    .filter(Boolean)
    .map(item => `${item.emoji} ${item.name}`);

  const furnitureTop = farm.house?.furnitureTop ?? {};
  const topLines = furniture
    .filter(id => HOUSE_ITEMS[id]?.topSlots)
    .map(id => {
      const item = HOUSE_ITEMS[id];
      const tops = furnitureTop[id] ?? [];
      const topNames = tops.map(tid => `${HOUSE_ITEMS[tid]?.emoji ?? ''}${HOUSE_ITEMS[tid]?.name ?? tid}`).join(' ');
      return `${item.emoji}**${item.name}**の上: ${tops.length === 0 ? '（何もない）' : topNames}`;
    });

  const title = ownerName ? `🏠 ${ownerName} の部屋` : '🏠 あなたの部屋';
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x6A4A2A)
    .setImage('attachment://interior.png');

  if (furnNames.length > 0) {
    embed.addFields({ name: `🪑 設置中の家具 (${furniture.length}/${MAX_FURNITURE})`, value: furnNames.join('　') });
    if (topLines.length > 0) {
      embed.addFields({ name: '📦 机・棚の上', value: topLines.join('\n') });
    }
  } else {
    embed.setDescription('家具がまだ置かれていません。\n「🪑 家具を管理」から追加しましょう！');
  }

  const components = [];

  if (!ownerName) {
    // オーナーの部屋 → 管理ボタンを表示
    const containers = furniture.filter(id => HOUSE_ITEMS[id]?.topSlots);
    const row1Comps = [
      new ButtonBuilder()
        .setCustomId('farm_room_furn_manage')
        .setLabel('家具を管理')
        .setEmoji('🪑')
        .setStyle(ButtonStyle.Primary),
    ];
    // 机・棚がある場合は「の上を整理」ボタンを追加（最大2個）
    containers.slice(0, 2).forEach(id => {
      row1Comps.push(
        new ButtonBuilder()
          .setCustomId(`farm_room_small_setup_${id}`)
          .setLabel(`${HOUSE_ITEMS[id].emoji}の上を整理`)
          .setStyle(ButtonStyle.Success)
      );
    });
    row1Comps.push(
      new ButtonBuilder()
        .setCustomId('farm_refresh')
        .setLabel('← 退室')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(new ActionRowBuilder().addComponents(row1Comps));
  } else {
    // 訪問者 → 退室のみ
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('farm_refresh')
        .setLabel('← 退室')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Secondary),
    ));
  }

  return { embeds: [embed], files: [attachment], components };
}

// ─── 室内 家具管理（farm_room_* ボタン）──────────────────────────────────────

function buildInteriorFurnEmbed(farm, page = 0) {
  const house      = farm.house ?? { ...DEFAULT_HOUSE };
  const owned      = farm.ownedHouseItems ?? [];
  const placed     = house.furniture ?? [];
  const furnitures = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture').sort(([, a], [, b]) => a.price - b.price);
  const pageItems  = furnitures.slice(page * FURN_PAGE_SIZE, (page + 1) * FURN_PAGE_SIZE);
  const totalPages = Math.ceil(furnitures.length / FURN_PAGE_SIZE);

  const lines = pageItems.map(([id, item]) => {
    const isOwned   = owned.includes(id);
    const isPlaced  = placed.includes(id);
    const prefix    = isPlaced ? '✅ ' : isOwned ? '📦 ' : '';
    const status    = isPlaced ? '設置中' : isOwned ? '所持済' : `${item.price} G`;
    const bonusText = formatBonus(item.bonus);
    const topInfo   = item.topSlots ? `  📦×${item.topSlots}` : '';
    return `${prefix}${item.emoji} **${item.name}** — ${status}${topInfo}${bonusText ? `  \`${bonusText}\`` : ''}`;
  });

  const furnitureTop = house.furnitureTop ?? {};
  const topLines = placed
    .filter(id => HOUSE_ITEMS[id]?.topSlots)
    .map(id => {
      const item = HOUSE_ITEMS[id];
      const tops = furnitureTop[id] ?? [];
      const topNames = tops.map(tid => `${HOUSE_ITEMS[tid]?.emoji ?? ''}${HOUSE_ITEMS[tid]?.name ?? tid}`).join(' ');
      return `${item.emoji}**${item.name}**の上: ${tops.length === 0 ? '（何もない）' : topNames}`;
    });

  let desc = `💰 所持コイン: **${farm.coins} G**\n設置数: **${placed.length} / ${MAX_FURNITURE}**`;
  if (totalPages > 1) desc += `　ページ: ${page + 1}/${totalPages}`;
  desc += `\n\n${lines.join('\n')}`;
  if (topLines.length > 0) desc += `\n\n**📦 机・棚の上**\n${topLines.join('\n')}`;

  return new EmbedBuilder()
    .setTitle('🪑 家具を管理')
    .setDescription(desc)
    .setColor(0x8B6430)
    .setFooter({ text: '📦マークの家具は上に小物を置けます！' });
}

function buildInteriorFurnButtons(farm, page = 0) {
  const house      = farm.house ?? { ...DEFAULT_HOUSE };
  const owned      = farm.ownedHouseItems ?? [];
  const placed     = house.furniture ?? [];
  const furnitures = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture').sort(([, a], [, b]) => a.price - b.price);
  const pageItems  = furnitures.slice(page * FURN_PAGE_SIZE, (page + 1) * FURN_PAGE_SIZE);
  const totalPages = Math.ceil(furnitures.length / FURN_PAGE_SIZE);
  const isFull     = placed.length >= MAX_FURNITURE;
  const rows       = [];

  for (let i = 0; i < pageItems.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(
      pageItems.slice(i, i + 4).map(([id, item]) => {
        const isOwned   = owned.includes(id);
        const isPlaced  = placed.includes(id);
        const canAfford = farm.coins >= item.price;
        if (isPlaced) {
          return new ButtonBuilder()
            .setCustomId(`farm_room_furn_remove_${id}`)
            .setLabel(`${item.emoji} 外す`)
            .setStyle(ButtonStyle.Danger);
        }
        return new ButtonBuilder()
          .setCustomId(`farm_room_furn_add_${id}`)
          .setLabel(isOwned ? `${item.emoji} 設置` : `${item.emoji} ${item.price}G`)
          .setStyle(isOwned ? ButtonStyle.Success : ButtonStyle.Primary)
          .setDisabled((!isOwned && !canAfford) || isFull);
      })
    ));
  }

  // 場所を変えるボタン（設置中の家具がある場合のみ）
  if (placed.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('farm_room_furn_move_menu')
        .setLabel('📍 場所を変える')
        .setStyle(ButtonStyle.Primary)
    ));
  }

  const navComps = [];
  if (page > 0) {
    navComps.push(new ButtonBuilder()
      .setCustomId(`farm_room_furn_page_${page - 1}`)
      .setLabel('← 前のページ')
      .setStyle(ButtonStyle.Secondary));
  }
  if (page < totalPages - 1) {
    navComps.push(new ButtonBuilder()
      .setCustomId(`farm_room_furn_page_${page + 1}`)
      .setLabel('次のページ →')
      .setStyle(ButtonStyle.Secondary));
  }
  // 設置中の机・棚の「上を整理」ボタン
  const containers = placed.filter(id => HOUSE_ITEMS[id]?.topSlots);
  containers.slice(0, 2).forEach(id => {
    navComps.push(new ButtonBuilder()
      .setCustomId(`farm_room_small_setup_${id}`)
      .setLabel(`${HOUSE_ITEMS[id].emoji}の上を整理`)
      .setStyle(ButtonStyle.Primary));
  });
  navComps.push(new ButtonBuilder()
    .setCustomId('farm_enter_room')
    .setLabel('← 部屋に戻る')
    .setEmoji('🚪')
    .setStyle(ButtonStyle.Secondary));
  rows.push(new ActionRowBuilder().addComponents(navComps.slice(0, 5)));

  return rows.slice(0, 5);
}

function buildInteriorTopSetupEmbed(farm, containerId) {
  // buildTopSetupEmbed と同じ内容
  return buildTopSetupEmbed(farm, containerId);
}

function buildInteriorTopSetupButtons(farm, containerId) {
  const house      = farm.house ?? { ...DEFAULT_HOUSE };
  const owned      = farm.ownedHouseItems ?? [];
  const cItem      = HOUSE_ITEMS[containerId];
  const furnitureTop = house.furnitureTop ?? {};
  const topItems   = furnitureTop[containerId] ?? [];
  const allSmall   = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'small').sort(([, a], [, b]) => a.price - b.price);
  const isFull     = topItems.length >= (cItem.topSlots ?? MAX_TOP_ITEMS);
  const rows       = [];

  // 置く
  const canPlace = allSmall.filter(([id]) => owned.includes(id) && !topItems.includes(id));
  if (canPlace.length > 0) {
    for (let i = 0; i < canPlace.length; i += 4) {
      rows.push(new ActionRowBuilder().addComponents(
        canPlace.slice(i, i + 4).map(([id, item]) =>
          new ButtonBuilder()
            .setCustomId(`farm_room_small_place_${containerId}_${id}`)
            .setLabel(`${item.emoji} 置く`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(isFull)
        )
      ));
    }
  }
  // 外す
  if (topItems.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      topItems.slice(0, 4).map(id => {
        const item = HOUSE_ITEMS[id];
        return new ButtonBuilder()
          .setCustomId(`farm_room_small_remove_${containerId}_${id}`)
          .setLabel(`${item?.emoji ?? ''} 外す`)
          .setStyle(ButtonStyle.Danger);
      })
    ));
  }
  // 所持小物がない場合は購入案内（ephemeral ショップ）
  if (canPlace.length === 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('farm_room_small_shop')
        .setLabel('小物を購入する')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_room_furn_manage')
      .setLabel('← 家具リストに戻る')
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows.slice(0, 5);
}

// ─── 家具・場所変更 UI ────────────────────────────────────────────────────────

// 「どの家具を動かすか」選択画面
function buildInteriorMoveMenuEmbed(farm) {
  const placed     = farm.house?.furniture ?? [];
  const furniturePositions = farm.house?.furniturePositions ?? {};

  const lines = placed.map(id => {
    const item   = HOUSE_ITEMS[id];
    if (!item) return null;
    const posIdx = furniturePositions[id] ?? null;
    const posName = posIdx !== null ? ROOM_POSITIONS[posIdx] ?? `位置${posIdx}` : '（自動）';
    return `${item.emoji} **${item.name}** — 📍 ${posName}`;
  }).filter(Boolean);

  return new EmbedBuilder()
    .setTitle('📍 家具の場所を変える')
    .setDescription(
      `移動させたい家具を選んでください。\n\n${lines.join('\n') || '（設置中の家具なし）'}`
    )
    .setColor(0x5A8FC0)
    .setFooter({ text: '場所を変えても既に置いてある小物はそのままです' });
}

function buildInteriorMoveMenuButtons(farm) {
  const placed = farm.house?.furniture ?? [];
  const rows   = [];

  for (let i = 0; i < placed.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(
      placed.slice(i, i + 4).map(id => {
        const item = HOUSE_ITEMS[id];
        return new ButtonBuilder()
          .setCustomId(`farm_room_furn_move_${id}`)
          .setLabel(`${item?.emoji ?? ''} ${item?.name ?? id}`)
          .setStyle(ButtonStyle.Primary);
      })
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_room_furn_manage')
      .setLabel('← 家具リストに戻る')
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows.slice(0, 5);
}

// 「どこに置くか」位置選択画面（3列グリッド）
function buildInteriorPosSelectEmbed(farm, itemId) {
  const item   = HOUSE_ITEMS[itemId];
  const placed = farm.house?.furniture ?? [];
  const furniturePositions = farm.house?.furniturePositions ?? {};

  // 各スロットに置かれている家具を逆引き
  const posOccupied = {};   // posIdx → itemId
  placed.forEach(id => {
    const p = furniturePositions[id];
    if (p !== undefined) posOccupied[p] = id;
  });

  const current = furniturePositions[itemId] ?? null;
  const lines   = ROOM_POSITIONS.map((name, i) => {
    const occ = posOccupied[i];
    if (i === current) return `▶ **${name}** ← 現在の場所`;
    if (occ) {
      const occItem = HOUSE_ITEMS[occ];
      return `　${name} （${occItem?.emoji ?? ''} ${occItem?.name ?? occ} がいる → 入れ替わります）`;
    }
    return `　${name}`;
  });

  return new EmbedBuilder()
    .setTitle(`📍 ${item?.emoji ?? ''} ${item?.name ?? itemId} の場所を選ぶ`)
    .setDescription(lines.join('\n'))
    .setColor(0x5A8FC0)
    .setFooter({ text: '別の家具が居る場所を選ぶと位置が入れ替わります' });
}

function buildInteriorPosSelectButtons(farm, itemId) {
  const placed = farm.house?.furniture ?? [];
  const furniturePositions = farm.house?.furniturePositions ?? {};

  const posOccupied = {};
  placed.forEach(id => {
    const p = furniturePositions[id];
    if (p !== undefined) posOccupied[p] = id;
  });

  const current = furniturePositions[itemId] ?? null;

  // 3列グリッド配置（positions 配列順）
  // Row0: [0:奥左] [2:奥中] [1:奥右]
  // Row1: [3:中左] [5:中中] [4:中右]
  // Row2: [6:手左] [8:手中] [7:手右]
  // Row3: [9:最左] [---] [10:最右]
  const grid = [
    [0, 2, 1],
    [3, 5, 4],
    [6, 8, 7],
    [9, null, 10],
  ];

  const rows = [];
  for (const rowIdxs of grid) {
    const comps = rowIdxs.map(posIdx => {
      if (posIdx === null) {
        return new ButtonBuilder()
          .setCustomId('farm_room_furn_pos_noop')
          .setLabel('－')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);
      }
      const name    = ROOM_POSITIONS[posIdx];
      const isCurrent  = posIdx === current;
      const occ     = posOccupied[posIdx];
      const occItem = occ ? HOUSE_ITEMS[occ] : null;
      const label   = occItem ? `${occItem.emoji} ${name}` : name;
      return new ButtonBuilder()
        .setCustomId(`farm_room_furn_setpos_${itemId}_${posIdx}`)
        .setLabel(label.slice(0, 80))
        .setStyle(isCurrent ? ButtonStyle.Success : occ ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(isCurrent);
    });
    rows.push(new ActionRowBuilder().addComponents(comps));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_room_furn_move_menu')
      .setLabel('← 家具一覧に戻る')
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows.slice(0, 5);
}

async function handleInteriorFurnButton(interaction) {
  const { customId, user } = interaction;

  // ── エラーラッパー ─────────────────────────────────────────────────────────
  const safeUpdate = async (payload) => {
    try {
      await interaction.update(payload);
    } catch {
      // update 失敗時はフォールバックで reply/followUp
      await safeReply({ content: '⚠️ 表示を更新できませんでした。もう一度お試しください。' });
    }
  };
  const safeReply = async (opts) => {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ ...opts, ephemeral: true });
      } else {
        await interaction.reply({ ...opts, ephemeral: true });
      }
    } catch { /* ignore */ }
  };

  try {

  // 家具管理メニューを開く
  if (customId === 'farm_room_furn_manage') {
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    await safeUpdate({
      embeds: [buildInteriorFurnEmbed(farm, 0)],
      components: buildInteriorFurnButtons(farm, 0),
      files: [],
      content: null,
    });
    return;
  }

  // ページ切り替え
  if (customId.startsWith('farm_room_furn_page_')) {
    const page = parseInt(customId.replace('farm_room_furn_page_', ''), 10);
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    await safeUpdate({
      embeds: [buildInteriorFurnEmbed(farm, page)],
      components: buildInteriorFurnButtons(farm, page),
      files: [],
      content: null,
    });
    return;
  }

  // 家具を追加（購入 or 設置）
  if (customId.startsWith('farm_room_furn_add_')) {
    const itemId = customId.replace('farm_room_furn_add_', '');
    const item   = HOUSE_ITEMS[itemId];
    if (!item) return safeReply({ content: '❌ 不明な家具です。' });
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);

    if (farm.house.furniture.length >= MAX_FURNITURE) {
      return safeReply({ content: `❌ 家具は最大 ${MAX_FURNITURE} 個まで設置できます。` });
    }
    const isOwned = farm.ownedHouseItems.includes(itemId);
    if (!isOwned) {
      if (farm.coins < item.price) {
        return safeReply({ content: `❌ コインが足りません（必要: ${item.price} G）` });
      }
      farm.coins -= item.price;
      farm.ownedHouseItems.push(itemId);
    }
    farm.house.furniture.push(itemId);
    await saveFarm(user.id, farm);

    const msg     = isOwned ? `設置しました！` : `${item.price} G で購入・設置しました！`;
    const topHint = item.topSlots ? `\n📦 上に小物を${item.topSlots}個まで置けます！` : '';
    await interaction.update({
      embeds: [buildInteriorFurnEmbed(farm, 0)],
      components: buildInteriorFurnButtons(farm, 0),
      files: [],
    });
    await interaction.followUp({ content: `✅ ${item.emoji} **${item.name}** を${msg}${topHint}`, ephemeral: true });
    return;
  }

  // 家具を取り外し
  if (customId.startsWith('farm_room_furn_remove_')) {
    const itemId = customId.replace('farm_room_furn_remove_', '');
    const farm   = await loadFarm(user.id);
    initFarmHouse(farm);

    farm.house.furniture = farm.house.furniture.filter(id => id !== itemId);
    if (farm.house.furnitureTop) delete farm.house.furnitureTop[itemId];
    await saveFarm(user.id, farm);

    await safeUpdate({
      embeds: [buildInteriorFurnEmbed(farm, 0)],
      components: buildInteriorFurnButtons(farm, 0),
      files: [],
      content: null,
    });
    return;
  }

  // 机・棚の上を整理（入室中）
  if (customId.startsWith('farm_room_small_setup_')) {
    const containerId = customId.replace('farm_room_small_setup_', '');
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    if (!farm.house.furnitureTop) farm.house.furnitureTop = {};

    await safeUpdate({
      embeds: [buildInteriorTopSetupEmbed(farm, containerId)],
      components: buildInteriorTopSetupButtons(farm, containerId),
      files: [],
      content: null,
    });
    return;
  }

  // 小物を置く（入室中）
  if (customId.startsWith('farm_room_small_place_')) {
    const rest = customId.replace('farm_room_small_place_', '');
    const allContainers = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].topSlots);
    let cId = null, iId = null;
    for (const cKey of allContainers) {
      if (rest.startsWith(cKey + '_')) { cId = cKey; iId = rest.slice(cKey.length + 1); break; }
    }
    if (!cId || !iId || !HOUSE_ITEMS[cId] || !HOUSE_ITEMS[iId]) {
      return safeReply({ content: '❌ 不明なアイテムです。' });
    }
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    if (!farm.house.furnitureTop)       farm.house.furnitureTop = {};
    if (!farm.house.furnitureTop[cId])  farm.house.furnitureTop[cId] = [];

    const topSlots = HOUSE_ITEMS[cId].topSlots ?? MAX_TOP_ITEMS;
    if (farm.house.furnitureTop[cId].length >= topSlots) {
      return safeReply({ content: `❌ もう置けません（最大${topSlots}個）` });
    }
    farm.house.furnitureTop[cId].push(iId);
    await saveFarm(user.id, farm);

    await safeUpdate({
      embeds: [buildInteriorTopSetupEmbed(farm, cId)],
      components: buildInteriorTopSetupButtons(farm, cId),
      files: [],
      content: null,
    });
    return;
  }

  // 小物を外す（入室中）
  if (customId.startsWith('farm_room_small_remove_')) {
    const rest = customId.replace('farm_room_small_remove_', '');
    const allContainers = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].topSlots);
    let cId = null, iId = null;
    for (const cKey of allContainers) {
      if (rest.startsWith(cKey + '_')) { cId = cKey; iId = rest.slice(cKey.length + 1); break; }
    }
    if (!cId || !iId) return safeReply({ content: '❌ 不明なアイテムです。' });
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    if (!farm.house.furnitureTop) farm.house.furnitureTop = {};
    farm.house.furnitureTop[cId] = (farm.house.furnitureTop[cId] ?? []).filter(id => id !== iId);
    await saveFarm(user.id, farm);

    await safeUpdate({
      embeds: [buildInteriorTopSetupEmbed(farm, cId)],
      components: buildInteriorTopSetupButtons(farm, cId),
      files: [],
      content: null,
    });
    return;
  }

  // 小物ショップを ephemeral で開く（入室中）
  if (customId === 'farm_room_small_shop') {
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    return interaction.reply({
      embeds: [buildSmallItemEmbed(farm)],
      components: buildSmallItemButtons(farm),
      ephemeral: true,
    });
  }

  // ── 場所変更メニュー（どの家具を動かすか）──
  if (customId === 'farm_room_furn_move_menu') {
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    await safeUpdate({
      embeds: [buildInteriorMoveMenuEmbed(farm)],
      components: buildInteriorMoveMenuButtons(farm),
      files: [],
      content: null,
    });
    return;
  }

  // ── 家具選択 → 位置グリッドへ ──
  if (customId.startsWith('farm_room_furn_move_')) {
    const itemId = customId.replace('farm_room_furn_move_', '');
    if (!HOUSE_ITEMS[itemId]) return safeReply({ content: '❌ 不明な家具です。' });
    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    await safeUpdate({
      embeds: [buildInteriorPosSelectEmbed(farm, itemId)],
      components: buildInteriorPosSelectButtons(farm, itemId),
      files: [],
      content: null,
    });
    return;
  }

  // ── 位置確定 → 保存 → 家具一覧に戻る ──
  if (customId.startsWith('farm_room_furn_setpos_')) {
    const rest   = customId.replace('farm_room_furn_setpos_', '');
    // rest = "ITEMID_N" — ITEMID に _ が含まれることがあるので末尾から分割
    const lastUs = rest.lastIndexOf('_');
    const itemId = rest.substring(0, lastUs);
    const posIdx = parseInt(rest.substring(lastUs + 1), 10);

    if (!HOUSE_ITEMS[itemId] || isNaN(posIdx)) return safeReply({ content: '❌ 不明な操作です。' });

    const farm = await loadFarm(user.id);
    initFarmHouse(farm);
    const fp = farm.house.furniturePositions;

    // 同じ位置に別の家具があれば入れ替え（スワップ）
    const currentOwner = Object.entries(fp).find(([id, v]) => v === posIdx && id !== itemId)?.[0];
    if (currentOwner) {
      // currentOwner に itemId の元の位置を渡す（なければ空きスロットを割り当て）
      const myOldPos = fp[itemId];
      if (myOldPos !== undefined) {
        fp[currentOwner] = myOldPos;
      } else {
        fp[currentOwner] = getNextFreePos(
          farm.house.furniture.filter(id => id !== itemId && id !== currentOwner),
          fp
        );
      }
    }
    fp[itemId] = posIdx;
    await saveFarm(user.id, farm);

    const item = HOUSE_ITEMS[itemId];
    await safeUpdate({
      embeds: [buildInteriorMoveMenuEmbed(farm)],
      components: buildInteriorMoveMenuButtons(farm),
      files: [],
      content: null,
    });
    await interaction.followUp({
      content: `✅ ${item.emoji} **${item.name}** を **${ROOM_POSITIONS[posIdx]}** に移動しました！`,
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  // ── どのハンドラにもマッチしなかった場合のフォールバック ──
  await safeReply({ content: '❌ 不明な操作です。' });

  } catch (err) {
    console.error('[InteriorFurnButton Error]:', err);
    await safeReply({ content: '⚠️ エラーが発生しました。' });
  }
}

// members: [{ id, displayName }]  vcName: VCの名前
function buildVCVisitPayload(members, vcName) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('farm_visit_select')
      .setPlaceholder('訪問するプレイヤーを選んでください…')
      .addOptions(members.map(m => ({
        label: m.displayName.slice(0, 100),
        value: m.id,
        emoji: '🏠',
      })))
  );
  return {
    content: `🏘️ VC「**${vcName}**」のメンバーから選んでください：`,
    components: [row],
    ephemeral: true,
  };
}

function buildHarvestEmbed(results, totalCoins, totalExp, newBalance, newLevel, levelUps, farmBonus = null) {
  const lines = results.map(({ slotNum, crop, result }) => {
    const bonus = result.bonuses.length ? `\n　${result.bonuses.join(' / ')}` : '';
    return `#${slotNum} ${crop.emoji} **${crop.name}** — ${result.quality.emoji} **${result.quality.label}** → **${result.coins} G** / +${result.exp} EXP${bonus}`;
  });

  // フッター：家ボーナスがあれば表示
  let footerText = '⭐ ベストタイミングで収穫するとボーナスUP！';
  if (farmBonus && (farmBonus.coinBonus > 0 || farmBonus.expBonus > 0 || farmBonus.qualityUp > 0)) {
    const fp = [];
    if (farmBonus.coinBonus > 0) fp.push(`コイン +${Math.round(farmBonus.coinBonus * 100)}%`);
    if (farmBonus.expBonus  > 0) fp.push(`EXP +${Math.round(farmBonus.expBonus  * 100)}%`);
    if (farmBonus.qualityUp > 0) fp.push(`品質 +${farmBonus.qualityUp}`);
    footerText = `🏡 家ボーナス適用中: ${fp.join(' / ')}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🧺 収穫完了！')
    .setColor(0xFFD700)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '💰 今回の収益', value: `**${totalCoins} G**`, inline: true },
      { name: '💳 残高',       value: `${newBalance} G`,     inline: true },
      { name: '⚡ 獲得EXP',    value: `+${totalExp} EXP`,    inline: true },
    )
    .setFooter({ text: footerText });

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

  const safeReply = async (content) => {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: 64 });
      } else {
        await interaction.reply({ content, flags: 64 });
      }
    } catch { /* ignore */ }
  };

  try {

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

  } catch (err) {
    console.error('[ShopButton Error]:', err?.rawError ?? err);
    await safeReply('⚠️ エラーが発生しました。');
  }
}

// ─── 家ショップ ──────────────────────────────────────────────────────────────

function buildHouseShopEmbed(farm) {
  const house  = farm.house ?? { ...DEFAULT_HOUSE };
  const owned  = farm.ownedHouseItems ?? [];

  const categories = ['wall', 'roof', 'door', 'garden', 'floor', 'wallpaper'];
  const fields = categories.map(cat => {
    const catItems = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === cat).sort(([, a], [, b]) => a.price - b.price);
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
    ['floor', 'wallpaper'].map(id =>
      new ButtonBuilder()
        .setCustomId(`farm_house_cat_${id}`)
        .setLabel(CATEGORY_NAMES[id])
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return [row1, row2];
}

function buildHouseCategoryEmbed(farm, category) {
  const house  = farm.house ?? { ...DEFAULT_HOUSE };
  const owned  = farm.ownedHouseItems ?? [];
  const items  = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === category).sort(([, a], [, b]) => a.price - b.price);

  const lines = items.map(([id, item]) => {
    const isOwned    = owned.includes(id);
    const isEquipped = house[category] === id;
    const price      = item.price === 0 ? '無料' : `${item.price} G`;
    const status     = isEquipped ? '✅ 装備中' : isOwned ? '📦 所持済' : price;
    const bonusText  = formatBonus(item.bonus);
    return `**${item.name}** — ${status}${bonusText ? `  \`${bonusText}\`` : ''}`;
  });

  return new EmbedBuilder()
    .setTitle(`${CATEGORY_NAMES[category]} のカスタマイズ`)
    .setDescription(`💰 所持コイン: **${farm.coins} G**\n\n${lines.join('\n')}`)
    .setColor(0x8B6430);
}

function buildHouseCategoryButtons(farm, category) {
  const house = farm.house ?? { ...DEFAULT_HOUSE };
  const owned = farm.ownedHouseItems ?? [];
  const items = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === category).sort(([, a], [, b]) => a.price - b.price);
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

const FURN_PAGE_SIZE = 12; // 1ページあたりの家具数（3行×4 = ボタン4個/行）

function buildFurnitureEmbed(farm, page = 0) {
  const house      = farm.house ?? { ...DEFAULT_HOUSE };
  const owned      = farm.ownedHouseItems ?? [];
  const placed     = house.furniture ?? [];
  const furnitures = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture').sort(([, a], [, b]) => a.price - b.price);
  const pageItems  = furnitures.slice(page * FURN_PAGE_SIZE, (page + 1) * FURN_PAGE_SIZE);
  const totalPages = Math.ceil(furnitures.length / FURN_PAGE_SIZE);

  const lines = pageItems.map(([id, item]) => {
    const isOwned   = owned.includes(id);
    const isPlaced  = placed.includes(id);
    const prefix    = isPlaced ? '✅ ' : isOwned ? '📦 ' : '';
    const status    = isPlaced ? '設置中' : isOwned ? '所持済' : `${item.price} G`;
    const bonusText = formatBonus(item.bonus);
    const topInfo   = item.topSlots ? `  📦×${item.topSlots}` : '';
    return `${prefix}${item.emoji} **${item.name}** — ${status}${topInfo}${bonusText ? `  \`${bonusText}\`` : ''}`;
  });

  // 机・棚の上の小物状況
  const furnitureTop = house.furnitureTop ?? {};
  const topLines = placed
    .filter(id => HOUSE_ITEMS[id]?.topSlots)
    .map(id => {
      const item = HOUSE_ITEMS[id];
      const tops = furnitureTop[id] ?? [];
      const topNames = tops.map(tid => HOUSE_ITEMS[tid]?.emoji + HOUSE_ITEMS[tid]?.name ?? tid).join(' ');
      return `${item.emoji}**${item.name}**の上: ${tops.length === 0 ? '（何も置いていない）' : topNames}`;
    });

  let desc = `💰 所持コイン: **${farm.coins} G**\n設置数: **${placed.length} / ${MAX_FURNITURE}**\nページ: ${page + 1}/${totalPages}\n\n${lines.join('\n')}`;
  if (topLines.length > 0) desc += `\n\n**📦 机・棚の上**\n${topLines.join('\n')}`;

  return new EmbedBuilder()
    .setTitle('🪑 家具ショップ')
    .setDescription(desc)
    .setColor(0x8B6430)
    .setFooter({ text: '📦マークのついた家具は上に小物を置けます！' });
}

function buildFurnitureButtons(farm, page = 0) {
  const house      = farm.house ?? { ...DEFAULT_HOUSE };
  const owned      = farm.ownedHouseItems ?? [];
  const placed     = house.furniture ?? [];
  const furnitures = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'furniture').sort(([, a], [, b]) => a.price - b.price);
  const pageItems  = furnitures.slice(page * FURN_PAGE_SIZE, (page + 1) * FURN_PAGE_SIZE);
  const totalPages = Math.ceil(furnitures.length / FURN_PAGE_SIZE);
  const isFull     = placed.length >= MAX_FURNITURE;
  const rows       = [];

  for (let i = 0; i < pageItems.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(
      pageItems.slice(i, i + 4).map(([id, item]) => {
        const isOwned   = owned.includes(id);
        const isPlaced  = placed.includes(id);
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
          .setDisabled((!isOwned && !canAfford) || isFull);
      })
    ));
  }

  // ページナビ＋机の上を整理ボタン
  const navComponents = [];
  if (page > 0) {
    navComponents.push(
      new ButtonBuilder()
        .setCustomId(`farm_furn_page_${page - 1}`)
        .setLabel('← 前のページ')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (page < totalPages - 1) {
    navComponents.push(
      new ButtonBuilder()
        .setCustomId(`farm_furn_page_${page + 1}`)
        .setLabel('次のページ →')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  // 机・棚が設置されていれば「上を整理」ボタン
  const containers = placed.filter(id => HOUSE_ITEMS[id]?.topSlots);
  containers.slice(0, 2).forEach(id => {
    navComponents.push(
      new ButtonBuilder()
        .setCustomId(`farm_small_setup_${id}`)
        .setLabel(`${HOUSE_ITEMS[id].emoji}の上を整理`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  navComponents.push(
    new ButtonBuilder()
      .setCustomId('farm_house_shop')
      .setLabel('← 戻る')
      .setStyle(ButtonStyle.Secondary)
  );
  if (navComponents.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(navComponents.slice(0, 5)));
  }

  return rows.slice(0, 5);
}

// ─── 小物ショップ ─────────────────────────────────────────────────────────────

function buildSmallItemEmbed(farm) {
  const house    = farm.house ?? { ...DEFAULT_HOUSE };
  const owned    = farm.ownedHouseItems ?? [];
  const items    = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'small').sort(([, a], [, b]) => a.price - b.price);
  const furnitureTop = house.furnitureTop ?? {};

  // 置ける場所を案内
  const containers = (house.furniture ?? []).filter(id => HOUSE_ITEMS[id]?.topSlots);
  const containerInfo = containers.length > 0
    ? containers.map(id => `${HOUSE_ITEMS[id].emoji}${HOUSE_ITEMS[id].name}（空き${HOUSE_ITEMS[id].topSlots - (furnitureTop[id]?.length ?? 0)}個）`).join(' ')
    : '（机・棚が設置されていません）';

  const lines = items.map(([id, item]) => {
    const isOwned   = owned.includes(id);
    const bonusText = formatBonus(item.bonus);
    const status    = isOwned ? '📦 所持済' : `${item.price} G`;
    return `${item.emoji} **${item.name}** — ${status}${bonusText ? `  \`${bonusText}\`` : ''}`;
  });

  return new EmbedBuilder()
    .setTitle('📦 小物ショップ')
    .setDescription(
      `💰 所持コイン: **${farm.coins} G**\n` +
      `置ける場所: ${containerInfo}\n\n` +
      lines.join('\n')
    )
    .setColor(0x6A8B30)
    .setFooter({ text: '小物は机・棚の上に置けます。家具ショップから「の上を整理」で配置！' });
}

function buildSmallItemButtons(farm) {
  const owned  = farm.ownedHouseItems ?? [];
  const items  = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'small').sort(([, a], [, b]) => a.price - b.price);
  const rows   = [];

  for (let i = 0; i < items.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(
      items.slice(i, i + 4).map(([id, item]) => {
        const isOwned   = owned.includes(id);
        const canAfford = farm.coins >= item.price;
        return new ButtonBuilder()
          .setCustomId(`farm_small_buy_${id}`)
          .setLabel(isOwned ? `📦 ${item.name}（所持済）` : `${item.emoji} ${item.price}G`)
          .setStyle(isOwned ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(isOwned || !canAfford);
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

// 机・棚の上の小物を管理する画面
function buildTopSetupEmbed(farm, containerId) {
  const house    = farm.house ?? { ...DEFAULT_HOUSE };
  const owned    = farm.ownedHouseItems ?? [];
  const cItem    = HOUSE_ITEMS[containerId];
  const furnitureTop = house.furnitureTop ?? {};
  const topItems = furnitureTop[containerId] ?? [];
  const allSmall = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'small').sort(([, a], [, b]) => a.price - b.price);

  const currentLines = topItems.length > 0
    ? topItems.map(id => `${HOUSE_ITEMS[id]?.emoji} **${HOUSE_ITEMS[id]?.name}**`).join('  ')
    : '（何も置いていません）';

  const availLines = allSmall
    .filter(([id]) => owned.includes(id) && !topItems.includes(id))
    .map(([id, item]) => `${item.emoji} **${item.name}**`)
    .join('  ') || '（所持している小物がありません）';

  return new EmbedBuilder()
    .setTitle(`${cItem.emoji} ${cItem.name}の上を整理`)
    .setDescription(
      `現在置いているもの（${topItems.length}/${cItem.topSlots}）:\n${currentLines}\n\n` +
      `置けるもの:\n${availLines}`
    )
    .setColor(0x8B6430);
}

function buildTopSetupButtons(farm, containerId) {
  const house    = farm.house ?? { ...DEFAULT_HOUSE };
  const owned    = farm.ownedHouseItems ?? [];
  const cItem    = HOUSE_ITEMS[containerId];
  const furnitureTop = house.furnitureTop ?? {};
  const topItems = furnitureTop[containerId] ?? [];
  const allSmall = Object.entries(HOUSE_ITEMS).filter(([, v]) => v.category === 'small').sort(([, a], [, b]) => a.price - b.price);
  const isFull   = topItems.length >= (cItem.topSlots ?? MAX_TOP_ITEMS);
  const rows     = [];

  // 置く
  const canPlace = allSmall.filter(([id]) => owned.includes(id) && !topItems.includes(id));
  if (canPlace.length > 0) {
    for (let i = 0; i < canPlace.length; i += 4) {
      rows.push(new ActionRowBuilder().addComponents(
        canPlace.slice(i, i + 4).map(([id, item]) =>
          new ButtonBuilder()
            .setCustomId(`farm_small_place_${containerId}_${id}`)
            .setLabel(`${item.emoji} 置く`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(isFull)
        )
      ));
    }
  }
  // 外す
  if (topItems.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      topItems.slice(0, 4).map(id => {
        const item = HOUSE_ITEMS[id];
        return new ButtonBuilder()
          .setCustomId(`farm_small_remove_${containerId}_${id}`)
          .setLabel(`${item?.emoji ?? ''} 外す`)
          .setStyle(ButtonStyle.Danger);
      })
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`farm_furn_page_0`)
      .setLabel('← 家具リストに戻る')
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows.slice(0, 5);
}

async function handleHouseShopButton(interaction) {
  const { customId } = interaction;

  const safeReply = async (content) => {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    } catch { /* ignore */ }
  };

  try {

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
        embeds: [buildFurnitureEmbed(farm, 0)],
        components: buildFurnitureButtons(farm, 0),
      });
    }
    if (category === 'small') {
      return interaction.update({
        embeds: [buildSmallItemEmbed(farm)],
        components: buildSmallItemButtons(farm),
      });
    }
    return interaction.update({
      embeds: [buildHouseCategoryEmbed(farm, category)],
      components: buildHouseCategoryButtons(farm, category),
    });
  }

  // 家具ページ切り替え
  if (customId.startsWith('farm_furn_page_')) {
    const page = parseInt(customId.replace('farm_furn_page_', ''), 10);
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);
    return interaction.update({
      embeds: [buildFurnitureEmbed(farm, page)],
      components: buildFurnitureButtons(farm, page),
    });
  }

  // 小物を購入
  if (customId.startsWith('farm_small_buy_')) {
    const itemId = customId.replace('farm_small_buy_', '');
    const item   = HOUSE_ITEMS[itemId];
    if (!item) return;
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);
    if (farm.ownedHouseItems.includes(itemId)) {
      return interaction.reply({ content: `❌ すでに所持しています。`, ephemeral: true });
    }
    if (farm.coins < item.price) {
      return interaction.reply({ content: `❌ コインが足りません（必要: ${item.price} G）`, ephemeral: true });
    }
    farm.coins -= item.price;
    farm.ownedHouseItems.push(itemId);
    await saveFarm(interaction.user.id, farm);
    await interaction.reply({ content: `✅ ${item.emoji} **${item.name}** を **${item.price} G** で購入しました！\n家具ショップの「の上を整理」から置いてみましょう。`, ephemeral: true });
    await interaction.update({
      embeds: [buildSmallItemEmbed(farm)],
      components: buildSmallItemButtons(farm),
    }).catch(() => {});
    return;
  }

  // 机・棚の上を整理する画面を開く
  if (customId.startsWith('farm_small_setup_')) {
    const containerId = customId.replace('farm_small_setup_', '');
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.ownedHouseItems) farm.ownedHouseItems = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].price === 0);
    if (!farm.house.furnitureTop) farm.house.furnitureTop = {};
    return interaction.update({
      embeds: [buildTopSetupEmbed(farm, containerId)],
      components: buildTopSetupButtons(farm, containerId),
    });
  }

  // 小物を置く
  if (customId.startsWith('farm_small_place_')) {
    const rest        = customId.replace('farm_small_place_', '');
    const sepIdx      = rest.lastIndexOf('_furn_');
    const containerId = rest.substring(0, sepIdx + 1) + rest.substring(sepIdx + 1, sepIdx + 5) + rest.slice(sepIdx + 5).split('_furn_')[0];
    // containerId と itemId を分割（farm_small_place_CONTAINER_ITEM）
    const parts     = rest.split('_furn_');
    // parts[0] = container suffix, parts[1] = item suffix
    // customId format: farm_small_place_furn_XXX_furn_YYY
    const fullRest  = rest; // e.g. "furn_wood_desk_furn_candle"
    // Find which container IDs match
    const allContainers = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].topSlots);
    let cId = null, iId = null;
    for (const cKey of allContainers) {
      if (fullRest.startsWith(cKey + '_')) {
        cId = cKey;
        iId = fullRest.slice(cKey.length + 1);
        break;
      }
    }
    if (!cId || !iId || !HOUSE_ITEMS[cId] || !HOUSE_ITEMS[iId]) {
      return interaction.reply({ content: '❌ 不明なアイテムです。', ephemeral: true });
    }
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.house.furnitureTop) farm.house.furnitureTop = {};
    if (!farm.house.furnitureTop[cId]) farm.house.furnitureTop[cId] = [];
    const topSlots  = HOUSE_ITEMS[cId].topSlots ?? MAX_TOP_ITEMS;
    if (farm.house.furnitureTop[cId].length >= topSlots) {
      return interaction.reply({ content: `❌ もう置けません（最大${topSlots}個）`, ephemeral: true });
    }
    farm.house.furnitureTop[cId].push(iId);
    await saveFarm(interaction.user.id, farm);
    await interaction.update({
      embeds: [buildTopSetupEmbed(farm, cId)],
      components: buildTopSetupButtons(farm, cId),
    });
    await buildFarmPayload(interaction.user.id).then(p => interaction.message.edit(p)).catch(() => {});
    return;
  }

  // 小物を外す
  if (customId.startsWith('farm_small_remove_')) {
    const rest = customId.replace('farm_small_remove_', '');
    const allContainers = Object.keys(HOUSE_ITEMS).filter(k => HOUSE_ITEMS[k].topSlots);
    let cId = null, iId = null;
    for (const cKey of allContainers) {
      if (rest.startsWith(cKey + '_')) {
        cId = cKey;
        iId = rest.slice(cKey.length + 1);
        break;
      }
    }
    if (!cId || !iId) return interaction.reply({ content: '❌ 不明なアイテムです。', ephemeral: true });
    const farm = await loadFarm(interaction.user.id);
    if (!farm.house) farm.house = { ...DEFAULT_HOUSE };
    if (!farm.house.furnitureTop) farm.house.furnitureTop = {};
    farm.house.furnitureTop[cId] = (farm.house.furnitureTop[cId] ?? []).filter(id => id !== iId);
    await saveFarm(interaction.user.id, farm);
    await interaction.update({
      embeds: [buildTopSetupEmbed(farm, cId)],
      components: buildTopSetupButtons(farm, cId),
    });
    await buildFarmPayload(interaction.user.id).then(p => interaction.message.edit(p)).catch(() => {});
    return;
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
    const topHint = item.topSlots ? `\n📦 上に小物を${item.topSlots}個まで置けます！「の上を整理」から配置してみましょう。` : '';
    await interaction.reply({ content: `✅ ${item.emoji} **${item.name}** を${msg}${topHint}`, ephemeral: true });
    await interaction.update({
      embeds: [buildFurnitureEmbed(farm, 0)],
      components: buildFurnitureButtons(farm, 0),
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
    // コンテナ家具を外す場合は上の小物もクリア
    if (farm.house.furnitureTop) delete farm.house.furnitureTop[itemId];
    await saveFarm(interaction.user.id, farm);

    await interaction.update({
      embeds: [buildFurnitureEmbed(farm, 0)],
      components: buildFurnitureButtons(farm, 0),
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

  } catch (err) {
    console.error('[HouseShopButton Error]:', err);
    await safeReply('⚠️ エラーが発生しました。');
  }
}

module.exports = {
  buildFarmPayload,
  buildInteriorPayload,
  buildVCVisitPayload,
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
  buildSmallItemEmbed,
  buildSmallItemButtons,
  handleHouseShopButton,
  handleInteriorFurnButton,
};
