const { SlashCommandBuilder } = require('discord.js');
const { buildInteriorPayload } = require('../game/farmView');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('visit')
    .setDescription('他のプレイヤーの部屋を訪問する')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('訪問したいユーザー')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user');

    // Bot は弾く
    if (target.bot) {
      return interaction.editReply({ content: '❌ Bot の部屋には入れません。' });
    }

    const ownerName = target.id === interaction.user.id ? null : target.username;
    const payload   = await buildInteriorPayload(target.id, ownerName);

    return interaction.editReply(payload);
  },
};
