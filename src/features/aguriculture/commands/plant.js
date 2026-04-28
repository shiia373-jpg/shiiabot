const { SlashCommandBuilder } = require('discord.js');
const { CROPS } = require('../game/crops');
const { plantCrop, buildFarmPayload } = require('../game/farmView');
const { formatTime } = require('../game/mechanics');

// /farm のボタンからも植えられるが、スラッシュコマンドでも使えるよう残す
module.exports = {
  data: new SlashCommandBuilder()
    .setName('plant')
    .setDescription('作物を植える（/farm のボタンからも操作できます）')
    .addStringOption(opt =>
      opt.setName('crop')
        .setDescription('植える作物')
        .setRequired(true)
        .addChoices(...Object.values(CROPS).map(c => ({ name: `${c.emoji} ${c.name}`, value: c.id })))
    )
    .addIntegerOption(opt =>
      opt.setName('slot')
        .setDescription('植えるスロット番号 (1〜9)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(9)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const cropId = interaction.options.getString('crop');
    const slotIndex = interaction.options.getInteger('slot') - 1;

    try {
      const { crop } = await plantCrop(interaction.user.id, slotIndex, cropId);
      const payload = await buildFarmPayload(interaction.user.id);
      payload.content = [
        `✅ スロット **#${slotIndex + 1}** に ${crop.emoji} **${crop.name}** を植えました！`,
        `⏱ 収穫まで: **${formatTime(crop.growTime)}** ／ S品質タイミング: 収穫可能後 **${formatTime(crop.optimalWindow / 2)}** 以内`,
      ].join('\n');
      await interaction.editReply(payload);
    } catch (e) {
      const msgs = {
        'slot not unlocked': `❌ スロット #${slotIndex + 1} はまだ解放されていません。`,
        'slot not empty': `❌ スロット #${slotIndex + 1} にはすでに作物があります。`,
        'no seed': `❌ その種を持っていません。\`/shop\` で購入できます。`,
      };
      await interaction.editReply({ content: msgs[e.message] ?? '❌ エラーが発生しました。' });
    }
  },
};
