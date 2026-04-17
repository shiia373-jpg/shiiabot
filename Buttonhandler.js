const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
  } = require('discord.js');
  const { getGame, updateGame, clearGame } = require('./gameState');
  const { buildQuizMessage, buildEndMessage } = require('./quizBuilder');
  
  async function handleButton(interaction) {
    const guildId = interaction.guildId;
    const game = getGame(guildId);
  
    // ゲームが存在しない場合
    if (!game || !game.active) {
      return interaction.reply({
        content: '❌ 現在進行中のクイズがありません。',
        ephemeral: true,
      });
    }
  
    const isQuizmaster = interaction.user.id === game.quizmasterId;
  
    // ─── ヒントを追加 ───────────────────────────────────────────
    if (interaction.customId === 'quiz_add_hint') {
        if (!isQuizmaster) {
          return interaction.reply({
            content: '❌ ヒントを追加できるのは出題者だけです。',
            ephemeral: true,
          });
        }
      
        const modal = new ModalBuilder()
          .setCustomId('quiz_hint_modal')
          .setTitle('💡 ヒントを入力');
      
        const hintInput = new TextInputBuilder()
          .setCustomId('hint_input')
          .setLabel('ヒント')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('ヒントを入力…')
          .setRequired(true)
          .setMaxLength(100);
      
        const row = new ActionRowBuilder().addComponents(hintInput);
        modal.addComponents(row);
      
        await interaction.showModal(modal);
        return;
      }
  
    // ─── 回答する（Modal を開く） ────────────────────────────────
    if (interaction.customId === 'quiz_answer') {
      const modal = new ModalBuilder()
        .setCustomId('quiz_answer_modal')
        .setTitle('🎯 回答を入力してください');
  
      const answerInput = new TextInputBuilder()
        .setCustomId('answer_input')
        .setLabel('あなたの回答')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('正解だと思う言葉を入力…')
        .setRequired(true)
        .setMaxLength(100);
  
      const row = new ActionRowBuilder().addComponents(answerInput);
      modal.addComponents(row);
  
      await interaction.showModal(modal);
      return;
    }
  
    // ─── ギブアップ ─────────────────────────────────────────────
    if (interaction.customId === 'quiz_giveup') {
      if (!isQuizmaster) {
        return interaction.reply({
          content: '❌ ギブアップを宣言できるのは出題者だけです。',
          ephemeral: true,
        });
      }
  
      const answer = game.answer;
      clearGame(guildId);
  
      const endPayload = buildEndMessage(answer, null);
      await interaction.update(endPayload);
      return;
    }
  }
  
  module.exports = { handleButton };