function buildQuizMessage(game) {
    const shownHintList = game.hints.slice(0, game.shownHints);
    const remainingHints = game.hints.length - game.shownHints;
  
    const embed = new EmbedBuilder()
      .setTitle('🎯 クイズ！これは何でしょう？')
      .setColor(0x5865f2)
      .setImage(game.imageUrl)
      .setFooter({ text: game.hints.length === 0 ? 'ヒントはまだありません' : `ヒント残り: ${remainingHints} 件` });
  
    if (shownHintList.length > 0) {
      const hintText = shownHintList
        .map((h, i) => `**ヒント ${i + 1}:** ${h}`)
        .join('\n');
      embed.addFields({ name: '💡 ヒント', value: hintText });
    } else {
      embed.setDescription('*まだ文字ヒントはありません。イラストから考えてみよう！*');
    }
  
    const addHintBtn = new ButtonBuilder()
  .setCustomId('quiz_add_hint')
  .setLabel('💡 ヒントを追加')
  .setStyle(ButtonStyle.Secondary)
  .setDisabled(false); // 常に有効
  
    const answerBtn = new ButtonBuilder()
      .setCustomId('quiz_answer')
      .setLabel('✏️ 回答する')
      .setStyle(ButtonStyle.Primary);
  
    const giveupBtn = new ButtonBuilder()
      .setCustomId('quiz_giveup')
      .setLabel('🏳️ ギブアップ')
      .setStyle(ButtonStyle.Danger);
  
    const row = new ActionRowBuilder().addComponents(addHintBtn, answerBtn, giveupBtn);
    return { embeds: [embed], components: [row] };
  }