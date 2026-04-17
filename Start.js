const { SlashCommandBuilder } = require('discord.js');
const { getGame, updateGame } = require('../game/gameState');
const { buildQuizMessage } = require('../game/quizBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('クイズを開始します'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const game = getGame(guildId);

    if (!game) {
      return interaction.reply({
        content: '❌ まず `/set-quiz` でクイズを設定してください。',
        ephemeral: true,
      });
    }

    if (game.active) {
      return interaction.reply({
        content: '❌ すでにクイズが進行中です。',
        ephemeral: true,
      });
    }

    // ゲームをアクティブにし、最初のヒントを1件表示
    updateGame(guildId, {
        active: true,
        shownHints: 0,  // 1 → 0 に変更
        channelId: interaction.channelId,
      });
    const updatedGame = getGame(guildId);
    const messagePayload = buildQuizMessage(updatedGame);

    const sent = await interaction.reply({ ...messagePayload, fetchReply: true });

    // メッセージIDを保存（後で edit するため）
    updateGame(guildId, { messageId: sent.id });
  },
};