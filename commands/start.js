const { SlashCommandBuilder } = require('discord.js');
const { getGame, updateGame } = require('../game/gameState');
const { buildQuizMessage } = require('../game/quizBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('クイズを開始します'),

  async execute(interaction) {
    const game = getGame(interaction.guildId);
    if (!game) return interaction.reply({ content: 'まず /set-quiz でクイズを設定してください。', ephemeral: true });
    if (game.active) return interaction.reply({ content: 'すでにクイズが進行中です。', ephemeral: true });

    updateGame(interaction.guildId, { active: true, shownHints: 0, channelId: interaction.channelId, roundWinners: [] });

    const updatedGame = getGame(interaction.guildId);
    const messagePayload = buildQuizMessage(updatedGame);
    const sent = await interaction.reply({ ...messagePayload, fetchReply: true });
    updateGame(interaction.guildId, { messageId: sent.id });
  },
};
