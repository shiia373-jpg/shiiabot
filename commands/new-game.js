const { SlashCommandBuilder } = require('discord.js');
const { clearGame } = require('../game/gameState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('new-game')
    .setDescription('ゲームをリセットして最初から始めます'),

  async execute(interaction) {
    clearGame(interaction.guildId);
    await interaction.reply({
      content: '✅ ゲームをリセットしました！\n/set-quiz でラウンド1のお題を設定してください。',
      ephemeral: true,
    });
  },
};
