const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getGame, updateGame, clearGame } = require('./gameState');
const { buildGiveupMessage, buildFinalMessage, buildStopMessage } = require('./quizBuilder');

async function handleButton(interaction) {
  const guildId = interaction.guildId;

  // お題入力ボタン（ラウンド開始前）
  if (interaction.customId === 'quiz_input_word') {
    const game = getGame(guildId);
    if (!game) return interaction.reply({ content: 'まず /start-quiz でクイズを設定してください。', ephemeral: true });
    if (interaction.user.id !== game.quizmasterId) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId('quiz_input_word_modal')
      .setTitle(`ラウンド${game.currentRound} のお題を入力`);
    const input = new TextInputBuilder()
      .setCustomId('word_input')
      .setLabel('お題（ひらがな・カタカナで入力）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // クイズ開始ボタン
  if (interaction.customId === 'quiz_start') {
    const game = getGame(guildId);
    if (!game) return interaction.reply({ content: 'まず /start-quiz でクイズを設定してください。', ephemeral: true });
    if (game.active) return interaction.reply({ content: 'すでにクイズが進行中です。', ephemeral: true });
    if (interaction.user.id !== game.quizmasterId) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });

    updateGame(guildId, { active: true, shownHints: 0, channelId: interaction.channelId, roundWinners: [] });

    const updatedGame = getGame(guildId);
    const { buildQuizMessage } = require('./quizBuilder');
    const messagePayload = buildQuizMessage(updatedGame);

    await interaction.deferReply();
    const sent = await interaction.followUp({ ...messagePayload, fetchReply: true });
    updateGame(guildId, { messageId: sent.id });
    return;
  }

  const game = getGame(guildId);
  if (!game || !game.active) return interaction.reply({ content: '進行中のクイズがありません。', ephemeral: true });
  const isQuizmaster = interaction.user.id === game.quizmasterId;

  if (interaction.customId === 'quiz_add_hint') {
    if (!isQuizmaster) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('quiz_hint_modal').setTitle('ヒントを入力');
    const input = new TextInputBuilder()
      .setCustomId('hint_input')
      .setLabel('ヒント')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'quiz_answer') {
    if (isQuizmaster) return interaction.reply({ content: '出題者は回答できません！', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('quiz_answer_modal').setTitle('回答を入力');
    const input = new TextInputBuilder()
      .setCustomId('answer_input')
      .setLabel('ひらがな・カタカナで入力してください')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'quiz_check_winners') {
    if (!isQuizmaster) return interaction.reply({ content: '出題者のみ確認できます。', ephemeral: true });

    const winners = game.roundWinners || [];
    if (winners.length === 0) {
      return interaction.reply({ content: '📋 まだ誰も正解していません。', ephemeral: true });
    }
    const pointList = [3, 2, 1];
    const list = winners.map((id, i) => `${i + 1}人目: <@${id}> (+${pointList[i] ?? 0}pt)`).join('\n');
    return interaction.reply({ content: `📋 **正解者一覧**\n${list}`, ephemeral: true });
  }

  if (interaction.customId === 'quiz_giveup') {
    if (!isQuizmaster) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });

    const isLastRound = game.currentRound >= game.totalRounds;
    await interaction.deferUpdate();
    if (isLastRound) clearGame(guildId);
    await interaction.message.edit({ ...buildGiveupMessage(game), files: [] });
    return;
  }

  if (interaction.customId === 'quiz_next_round') {
    if (!isQuizmaster) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });

    const isLastRound = game.currentRound >= game.totalRounds;

    if (isLastRound) {
      await interaction.deferUpdate();
      clearGame(guildId);
      await interaction.message.edit({ ...buildFinalMessage(game), files: [] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('quiz_next_round_modal')
      .setTitle(`ラウンド ${game.currentRound + 1} のお題を入力`);
    const input = new TextInputBuilder()
      .setCustomId('next_word_input')
      .setLabel('お題（ひらがな・カタカナで入力）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'quiz_stop') {
    if (!isQuizmaster) return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });

    const snapshot = { ...game };
    clearGame(guildId);
    await interaction.deferUpdate();
    await interaction.message.edit({ ...buildStopMessage(snapshot), files: [] });
    return;
  }
}

module.exports = { handleButton };
