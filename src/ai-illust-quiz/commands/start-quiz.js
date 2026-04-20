const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { setGame } = require('../game/gameState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start-quiz')
    .setDescription('クイズを作成します（出題者用）')
    .addIntegerOption((opt) =>
      opt.setName('rounds').setDescription('ラウンド数を入力してください（1〜10）').setRequired(true).setMinValue(1).setMaxValue(10)
    ),

  async execute(interaction) {
    const totalRounds = interaction.options.getInteger('rounds');

    setGame(interaction.guildId, {
      answer: null,
      answers: [],
      hints: [],
      imageAttachment: null,
      quizmasterId: interaction.user.id,
      totalRounds,
    });

    const startBtn = new ButtonBuilder()
      .setCustomId('quiz_input_word')
      .setLabel(`ラウンド1のお題を入力する`)
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(startBtn);

    await interaction.reply({
      content: `✅ 全${totalRounds}ラウンドで開始します！\nボタンを押してラウンド1のお題を入力してください。`,
      components: [row],
      ephemeral: true,
    });
  },
};
