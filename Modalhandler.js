const { getGame, clearGame } = require('./gameState');
const { buildEndMessage } = require('./quizBuilder');

async function handleModal(interaction) {
    if (interaction.customId === 'quiz_hint_modal') {
        const guildId = interaction.guildId;
        const game = getGame(guildId);
      
        if (!game || !game.active) {
          return interaction.reply({
            content: '❌ 現在進行中のクイズがありません。',
            ephemeral: true,
          });
        }
      
        if (interaction.user.id !== game.quizmasterId) {
          return interaction.reply({
            content: '❌ ヒントを追加できるのは出題者だけです。',
            ephemeral: true,
          });
        }
      
        const hint = interaction.fields.getTextInputValue('hint_input').trim();
        const updatedHints = [...game.hints, hint];
        updateGame(guildId, {
          hints: updatedHints,
          shownHints: updatedHints.length, // 追加したら即表示
        });
      
        const updatedGame = getGame(guildId);
        const messagePayload = buildQuizMessage(updatedGame);
      
        await interaction.update(messagePayload);
        return;
      }
      interaction.reply({
      content: '❌ 現在進行中のクイズがありません。',
      ephemeral: true,
    });
  }

  const userAnswer = interaction.fields.getTextInputValue('answer_input').trim();
  const correct = game.answer.trim();

  // 大文字小文字・全角半角を正規化して比較
  const normalize = (s) =>
    s
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, '');

  const isCorrect = normalize(userAnswer) === normalize(correct);

  if (isCorrect) {
    // ゲームを終了させる
    clearGame(guildId);

    // パブリックに正解者を発表
    const endPayload = buildEndMessage(correct, interaction.user.id);

    // インタラクションが属するメッセージを更新
    await interaction.message.edit(endPayload).catch(() => {});
    await interaction.reply({
      content: `🎉 **正解です！** おめでとうございます！`,
      ephemeral: false,
    });
  } else {
    // 不正解は ephemeral で本人にのみ伝える
    await interaction.reply({
      content: `❌ 残念！「**${userAnswer}**」は不正解です。もう一度考えてみよう！`,
      ephemeral: true,
    });
  }


module.exports = { handleModal };