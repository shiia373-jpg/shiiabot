const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');
const { setGame, getGame } = require('../game/gameState');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildImagePrompt(answer) {
  return (
    `A clean, vibrant, conceptual illustration representing "${answer}". ` +
    `Flat design style with bold colors and simple shapes. ` +
    `No text, no letters, no words in the image. ` +
    `Style of a distinct conceptual illustration for a quiz game.`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-quiz')
    .setDescription('クイズを作成します（出題者用）')
    .addStringOption((opt) =>
      opt
        .setName('answer')
        .setDescription('正解（例: パンダ）')
        .setRequired(true)
    ),
  // ↑ hints オプションを削除

  async execute(interaction) {
    const answer = interaction.options.getString('answer');

    await interaction.reply({
      content: '🎨 イラストを生成中です。少々お待ちください…',
      ephemeral: true,
    });

    let imageUrl;
    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: buildImagePrompt(answer),
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });
      imageUrl = response.data[0].url;
    } catch (err) {
      console.error('[DALL-E Error]:', err);
      return interaction.editReply({
        content: `❌ 画像生成に失敗しました。\`${err.message}\``,
      });
    }

    setGame(interaction.guildId, {
      answer,
      hints: [],   // 空配列で初期化
      imageUrl,
      quizmasterId: interaction.user.id,
    });

    await interaction.editReply({
      content:
        `✅ クイズの準備ができました！\n` +
        `🎯 正解: **${answer}**\n\n` +
        `準備ができたら \`/start\` コマンドでゲームを開始してください。`,
    });
  },
};