const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');

function buildQuizMessage(game) {
  const shownHintList = game.hints.slice(0, game.shownHints);

  const embed = new EmbedBuilder()
    .setTitle(`ラウンド ${game.currentRound} / ${game.totalRounds}　クイズ！これは何でしょう？`)
    .setColor(0x5865f2)
    .setImage('attachment://quiz.png')
    .setFooter({ text: '⚠️ 回答はひらがなまたはカタカナで入力してください' });

  if (shownHintList.length > 0) {
    const hintText = shownHintList.map((h, i) => `ヒント ${i + 1}: ${h}`).join('\n');
    embed.addFields({ name: 'ヒント', value: hintText });
  } else {
    embed.setDescription('まだヒントはありません。イラストから考えてみよう！');
  }

  const addHintBtn = new ButtonBuilder()
    .setCustomId('quiz_add_hint')
    .setLabel('ヒントを追加')
    .setStyle(ButtonStyle.Secondary);

  const answerBtn = new ButtonBuilder()
    .setCustomId('quiz_answer')
    .setLabel('回答する')
    .setStyle(ButtonStyle.Primary);

  const giveupBtn = new ButtonBuilder()
    .setCustomId('quiz_giveup')
    .setLabel('ギブアップ')
    .setStyle(ButtonStyle.Danger);

  const checkWinnersBtn = new ButtonBuilder()
    .setCustomId('quiz_check_winners')
    .setLabel('正解者確認')
    .setStyle(ButtonStyle.Secondary);

  const nextRoundBtn = new ButtonBuilder()
    .setCustomId('quiz_next_round')
    .setLabel('次のラウンドへ')
    .setStyle(ButtonStyle.Success);

  const stopBtn = new ButtonBuilder()
    .setCustomId('quiz_stop')
    .setLabel('クイズを終了')
    .setStyle(ButtonStyle.Danger);

  const row1 = new ActionRowBuilder().addComponents(addHintBtn, answerBtn, giveupBtn, checkWinnersBtn);
  const row2 = new ActionRowBuilder().addComponents(nextRoundBtn, stopBtn);

  const attachment = new AttachmentBuilder(game.imageAttachment.attachment, { name: 'quiz.png' });

  return { embeds: [embed], components: [row1, row2], files: [attachment] };
}

function buildRoundEndMessage(game, answer, winners, includeButtons = false) {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`ラウンド ${game.currentRound} 終了！`);

  if (winners.length > 0) {
    const pointList = [3, 2, 1];
    const winnerText = winners.map((id, i) => {
      const pts = pointList[i] || 0;
      return `${i + 1}位: <@${id}> (+${pts}ポイント)`;
    }).join('\n');
    embed.addFields({ name: `正解: ${answer}`, value: winnerText });
  } else {
    embed.addFields({ name: `正解: ${answer}`, value: '誰も正解できませんでした！' });
  }

  const scores = game.scores;
  const scoreText = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([id, pts], i) => `${i + 1}位: <@${id}> ${pts}ポイント`)
    .join('\n');

  if (scoreText) {
    embed.addFields({ name: '現在のスコア', value: scoreText });
  }

  if (!includeButtons) return { embeds: [embed], components: [] };

  const isLastRound = game.currentRound >= game.totalRounds;
  if (isLastRound) return { embeds: [embed], components: [] };

  const nextRoundBtn = new ButtonBuilder()
    .setCustomId('quiz_next_round')
    .setLabel('次のラウンドへ')
    .setStyle(ButtonStyle.Success);

  const stopBtn = new ButtonBuilder()
    .setCustomId('quiz_stop')
    .setLabel('クイズを終了')
    .setStyle(ButtonStyle.Danger);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(nextRoundBtn, stopBtn)] };
}

function buildFinalMessage(game) {
  const scores = game.scores;
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('全ラウンド終了！最終結果');

  if (sorted.length > 0) {
    const resultText = sorted.map(([id, pts], i) => `${i + 1}位: <@${id}> ${pts}ポイント`).join('\n');
    embed.setDescription(resultText);
  } else {
    embed.setDescription('誰も正解しませんでした！');
  }

  return { embeds: [embed], components: [] };
}

function buildGiveupMessage(game) {
  const isLastRound = game.currentRound >= game.totalRounds;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`ラウンド ${game.currentRound} / ${game.totalRounds}　ギブアップ！`)
    .addFields({ name: '正解', value: `**${game.answer}**` });

  const scores = game.scores;
  const scoreText = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([id, pts], i) => `${i + 1}位: <@${id}> ${pts}ポイント`)
    .join('\n');
  if (scoreText) embed.addFields({ name: '現在のスコア', value: scoreText });

  if (isLastRound) {
    return { embeds: [embed], components: [] };
  }

  const nextRoundBtn = new ButtonBuilder()
    .setCustomId('quiz_next_round')
    .setLabel('次のラウンドへ')
    .setStyle(ButtonStyle.Success);

  const stopBtn = new ButtonBuilder()
    .setCustomId('quiz_stop')
    .setLabel('クイズを終了')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(nextRoundBtn, stopBtn);
  return { embeds: [embed], components: [row] };
}

function buildStopMessage(game) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('クイズを終了しました');

  const scores = game ? game.scores : {};
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  if (sorted.length > 0) {
    const resultText = sorted.map(([id, pts], i) => `${i + 1}位: <@${id}> ${pts}ポイント`).join('\n');
    embed.addFields({ name: '最終順位', value: resultText });
  } else {
    embed.setDescription('またいつでも遊んでね！');
  }

  return { embeds: [embed], components: [] };
}

module.exports = { buildQuizMessage, buildRoundEndMessage, buildGiveupMessage, buildFinalMessage, buildStopMessage };
