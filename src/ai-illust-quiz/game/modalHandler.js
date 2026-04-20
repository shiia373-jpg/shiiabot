const OpenAI = require('openai');
const sharp = require('sharp');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGame, updateGame, setGame, clearGame } = require('./gameState');
const { buildQuizMessage, buildRoundEndMessage, buildFinalMessage } = require('./quizBuilder');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildImagePrompt(answer) {
  return (
    `Create a cute, kawaii-style illustration where the hidden subject is "${answer}". ` +
    `The art style should be clean, friendly, and appealing — like a sticker or children's book illustration. ` +
    `Make it challenging to identify by using an unusual angle or showing only a partial view. ` +
    `Use soft pastel colors, smooth surfaces, and simple rounded shapes. ` +
    `No text, no letters, no words anywhere in the image. ` +
    `STRICTLY FORBIDDEN — must never appear under any circumstances: ` +
    `anything grotesque, disturbing, creepy, or disgusting; ` +
    `realistic depictions of insects, parasites, mold, rot, wounds, or bodily fluids; ` +
    `dark or horror-themed imagery; uncanny or unsettling faces; ` +
    `any cluster or group of holes, bumps, pores, or cavities; ` +
    `sponge, foam, mesh, or net-like textures; ` +
    `seed pods, lotus heads, sunflower centers, honeycombs, coral, insect nests, or egg masses; ` +
    `densely packed circles, dots, or irregular voids of any kind; ` +
    `fruit cross-sections showing many seeds (strawberries, kiwi, etc.); ` +
    `anything resembling a swarm, colony, or dense accumulation of similar shapes. ` +
    `The result must be something anyone would find pleasant and cute to look at.`
  );
}

async function pixelateImage(imageBuffer, pixelSize = 32) {
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

function buildPreviewRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quiz_image_approve').setLabel('このイラストで開始').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('quiz_image_reject').setLabel('再生成').setStyle(ButtonStyle.Danger),
  );
}

async function generateImageBuffer(answer) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: buildImagePrompt(answer),
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });
  return Buffer.from(response.data[0].b64_json, 'base64');
}

async function generatePreview(interaction, game, answer, channel) {
  const loadingMsg = await channel.send('🎨 イラストを生成中です…');

  let imageBuffer;
  try {
    imageBuffer = await generateImageBuffer(answer);
  } catch (err) {
    console.error(err);
    await loadingMsg.edit(`画像生成に失敗しました: ${err.message}`);
    return;
  }

  await loadingMsg.delete().catch(() => {});
  updateGame(interaction.guildId, { pendingAnswer: answer, pendingImageBuffer: imageBuffer });

  const attachment = new AttachmentBuilder(imageBuffer, { name: 'preview.png' });
  await interaction.followUp({
    content: '📋 生成されたイラストを確認してください。問題がなければ「このイラストで開始」を押してください。',
    files: [attachment],
    components: [buildPreviewRow()],
    ephemeral: true,
  });
}

async function regeneratePreview(buttonInteraction) {
  const guildId = buttonInteraction.guildId;
  const game = getGame(guildId);
  if (!game || !game.pendingAnswer) return;

  await buttonInteraction.deferUpdate();

  let imageBuffer;
  try {
    imageBuffer = await generateImageBuffer(game.pendingAnswer);
  } catch (err) {
    console.error(err);
    await buttonInteraction.editReply({ content: `画像生成に失敗しました: ${err.message}`, files: [], components: [] });
    return;
  }

  updateGame(guildId, { pendingImageBuffer: imageBuffer });

  const attachment = new AttachmentBuilder(imageBuffer, { name: 'preview.png' });
  await buttonInteraction.editReply({
    content: '📋 生成されたイラストを確認してください。問題がなければ「このイラストで開始」を押してください。',
    files: [attachment],
    components: [buildPreviewRow()],
  });
}

async function startApprovedRound(buttonInteraction, channel) {
  const guildId = buttonInteraction.guildId;
  const game = getGame(guildId);

  const pixelated = await pixelateImage(game.pendingImageBuffer, 100);
  const attachment = { attachment: pixelated, name: 'quiz.png' };

  setGame(guildId, {
    answer: game.pendingAnswer,
    answers: [game.pendingAnswer],
    hints: [],
    imageAttachment: attachment,
    quizmasterId: game.quizmasterId,
    totalRounds: game.totalRounds,
  });
  updateGame(guildId, {
    active: true,
    shownHints: 0,
    channelId: game.channelId || channel.id,
    roundWinners: [],
    currentRound: game.currentRound,
    scores: game.scores,
    pendingAnswer: null,
    pendingImageBuffer: null,
  });

  const updatedGame = getGame(guildId);
  const messagePayload = buildQuizMessage(updatedGame);
  const sent = await channel.send(messagePayload);
  updateGame(guildId, { messageId: sent.id });
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
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(answer)) {
      await interaction.followUp({ content: '⚠️ お題にはひらがな・カタカナのみ使用できます。漢字は使えません。', ephemeral: true });
      return;
    }
    await generatePreview(interaction, game, answer, interaction.channel);
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

    await interaction.reply({ content: `正解！${pts}ポイント獲得！`, ephemeral: true });

    if (newWinners.length >= 3) {
      const updatedGame = getGame(guildId);
      const isLastRound = updatedGame.currentRound >= updatedGame.totalRounds;
      const quizMessage = await interaction.channel.messages.fetch(updatedGame.messageId).catch(() => null);

      if (isLastRound) {
        clearGame(guildId);
        if (quizMessage) await quizMessage.edit({ ...buildRoundEndMessage(updatedGame, updatedGame.answer, newWinners), files: [] });
        await interaction.channel.send(buildFinalMessage(updatedGame));
      } else {
        if (quizMessage) await quizMessage.edit({ ...buildRoundEndMessage(updatedGame, updatedGame.answer, newWinners, true), files: [] });
      }
    }
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
    await interaction.deferUpdate();
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(answer)) {
      await interaction.followUp({ content: '⚠️ お題にはひらがな・カタカナのみ使用できます。漢字は使えません。', ephemeral: true });
      return;
    }

    const prevAnswer = game.answer;
    const winners = game.roundWinners || [];
    const isLastRound = game.currentRound >= game.totalRounds;

    await interaction.message.edit({ ...buildRoundEndMessage(game, prevAnswer, winners), files: [] });

    if (isLastRound) {
      const finalPayload = buildFinalMessage(game);
      await interaction.channel.send(finalPayload);
      clearGame(guildId);
      return;
    }

    const nextRound = game.currentRound + 1;
    updateGame(guildId, { currentRound: nextRound });
    const updatedGame = getGame(guildId);

    await generatePreview(interaction, updatedGame, answer, interaction.channel);
    return;
  }
}

module.exports = { handleModal, startApprovedRound, regeneratePreview };
