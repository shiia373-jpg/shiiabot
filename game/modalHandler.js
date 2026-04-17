const OpenAI = require('openai');
const sharp = require('sharp');
const { getGame, updateGame, setGame, clearGame } = require('./gameState');
const { buildQuizMessage, buildRoundEndMessage, buildFinalMessage } = require('./quizBuilder');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildImagePrompt(answer) {
  return (
    `Create a challenging, heavily obscured illustration where the hidden subject is "${answer}". ` +
    `Apply TWO of these techniques simultaneously: extreme macro close-up of an unexpected detail, ` +
    `an unusual angle (top-down or bottom-up), silhouette blended into a busy background, ` +
    `double exposure with an unrelated object, or fragmented mosaic effect. ` +
    `The subject should take at least 30 seconds to a minute to identify. ` +
    `No text, no letters, no words anywhere in the image.`
  );
}

async function pixelateImage(imageBuffer, pixelSize = 100) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  const pixelated = await image
    .resize(Math.floor(width / pixelSize), Math.floor(height / pixelSize), { kernel: 'nearest' })
    .resize(width, height, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return pixelated;
}

function toHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function toKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function normalize(str) {
  return toHiragana(str).toLowerCase().normalize('NFKC').replace(/\s+/g, '');
}

async function generateAndStartRound(interaction, game, answer, channel) {
  const loadingMsg = await channel.send('🎨 イラストを生成中です…');

  let imageBuffer;
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: buildImagePrompt(answer),
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });
    imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
  } catch (err) {
    console.error(err);
    await loadingMsg.edit(`画像生成に失敗しました: ${err.message}`);
    return;
  }

  const pixelated = await pixelateImage(imageBuffer, 100);
  const attachment = { attachment: pixelated, name: 'quiz.png' };

  setGame(interaction.guildId, {
    answer,
    answers: [answer],
    hints: [],
    imageAttachment: attachment,
    quizmasterId: game.quizmasterId,
    totalRounds: game.totalRounds,
  });
  updateGame(interaction.guildId, {
    active: true,
    shownHints: 0,
    channelId: game.channelId || channel.id,
    roundWinners: [],
    currentRound: game.currentRound,
    scores: game.scores,
  });

  const updatedGame = getGame(interaction.guildId);
  const messagePayload = buildQuizMessage(updatedGame);
  const sent = await channel.send(messagePayload);
  updateGame(interaction.guildId, { messageId: sent.id });

  await loadingMsg.delete().catch(() => {});
}

async function handleModal(interaction) {
  const guildId = interaction.guildId;
  const game = getGame(guildId);

  if (interaction.customId === 'quiz_input_word_modal') {
    if (!game) {
      return interaction.reply({ content: 'まず /start-quiz でクイズを設定してください。', ephemeral: true });
    }
    if (interaction.user.id !== game.quizmasterId) {
      return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });
    }

    const answer = interaction.fields.getTextInputValue('word_input').trim();
    await interaction.deferUpdate();
    await generateAndStartRound(interaction, game, answer, interaction.channel);
    return;
  }

  if (interaction.customId === 'quiz_hint_modal') {
    if (!game || !game.active) {
      return interaction.reply({ content: '現在進行中のクイズがありません。', ephemeral: true });
    }
    if (interaction.user.id !== game.quizmasterId) {
      return interaction.reply({ content: 'ヒントを追加できるのは出題者だけです。', ephemeral: true });
    }
    const hint = interaction.fields.getTextInputValue('hint_input').trim();
    const updatedHints = [...game.hints, hint];
    updateGame(guildId, { hints: updatedHints, shownHints: updatedHints.length });
    await interaction.deferUpdate();
    await interaction.message.edit(buildQuizMessage(getGame(guildId)));
    return;
  }

  if (interaction.customId === 'quiz_answer_modal') {
    if (!game || !game.active) {
      return interaction.reply({ content: '現在進行中のクイズがありません。', ephemeral: true });
    }
    if (interaction.user.id === game.quizmasterId) {
      return interaction.reply({ content: '出題者は回答できません！', ephemeral: true });
    }

    const userAnswer = interaction.fields.getTextInputValue('answer_input').trim();
    const correct = game.answer.trim();
    const isCorrect =
      normalize(userAnswer) === normalize(correct) ||
      toKatakana(normalize(userAnswer)) === toKatakana(normalize(correct));

    if (!isCorrect) {
      return interaction.reply({ content: `不正解！「${userAnswer}」は違います。もう一度考えてみよう！`, ephemeral: true });
    }

    const pointList = [3, 2, 1];
    const winners = game.roundWinners || [];

    if (winners.includes(interaction.user.id)) {
      return interaction.reply({ content: 'すでに正解済みです！', ephemeral: true });
    }

    const newWinners = [...winners, interaction.user.id];
    const pts = pointList[winners.length] || 0;
    const scores = { ...game.scores };
    scores[interaction.user.id] = (scores[interaction.user.id] || 0) + pts;
    updateGame(guildId, { roundWinners: newWinners, scores });

    await interaction.reply({ content: `正解！${pts}ポイント獲得！`, ephemeral: false });
    return;
  }

  if (interaction.customId === 'quiz_next_round_modal') {
    if (!game) {
      return interaction.reply({ content: '現在進行中のクイズがありません。', ephemeral: true });
    }
    if (interaction.user.id !== game.quizmasterId) {
      return interaction.reply({ content: '出題者のみ操作できます。', ephemeral: true });
    }

    const answer = interaction.fields.getTextInputValue('next_word_input').trim();
    const prevAnswer = game.answer;
    const winners = game.roundWinners || [];
    const isLastRound = game.currentRound >= game.totalRounds;

    await interaction.deferUpdate();

    // ラウンド終了メッセージを表示
    await interaction.message.edit({ ...buildRoundEndMessage(game, prevAnswer, winners), files: [] });

    if (isLastRound) {
      // 最終ラウンド終了後に結果発表をチャンネルに送信
      const finalPayload = buildFinalMessage(game);
      await interaction.channel.send(finalPayload);
      clearGame(guildId);
      return;
    }

    const nextRound = game.currentRound + 1;
    updateGame(guildId, { currentRound: nextRound });
    const updatedGame = getGame(guildId);

    await generateAndStartRound(interaction, updatedGame, answer, interaction.channel);
    return;
  }
}

module.exports = { handleModal };
