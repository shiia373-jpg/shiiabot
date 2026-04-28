const { SlashCommandBuilder } = require('discord.js');
const { harvestAll, buildHarvestEmbed, buildFarmPayload } = require('../game/farmView');

// /farm のボタンからも収穫できるが、スラッシュコマンドでも使えるよう残す
module.exports = {
  data: new SlashCommandBuilder()
    .setName('harvest')
    .setDescription('収穫できる作物をすべて収穫する（/farm のボタンからも操作できます）'),

  async execute(interaction) {
    await interaction.deferReply();
    const result = await harvestAll(interaction.user.id);

    if (!result) {
      return interaction.editReply({ content: '⚠️ 収穫できる作物がありません。`/farm` で成長状況を確認してください。' });
    }

    const { results, totalCoins, farm } = result;
    const harvestEmbed = buildHarvestEmbed(results, totalCoins, farm.coins);
    const farmPayload = await buildFarmPayload(interaction.user.id);

    await interaction.editReply({ embeds: [harvestEmbed, ...farmPayload.embeds], files: farmPayload.files, components: farmPayload.components });
  },
};
