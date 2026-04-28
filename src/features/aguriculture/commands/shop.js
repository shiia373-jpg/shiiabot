const { SlashCommandBuilder } = require('discord.js');
const { loadFarm } = require('../game/farmState');
const { buildShopEmbed, buildShopButtons } = require('../game/farmView');

// /farm の🛒ボタンからも開けるが、スラッシュコマンドでも使えるよう残す
module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('種の購入・スロット解放（/farm のボタンからも操作できます）'),

  async execute(interaction) {
    const farm = await loadFarm(interaction.user.id);
    await interaction.reply({
      embeds: [buildShopEmbed(farm)],
      components: buildShopButtons(farm),
      ephemeral: true,
    });
  },
};
