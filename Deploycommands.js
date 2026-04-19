require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 ${commands.length} 件のコマンドを登録中...`);

    // グローバル登録（全サーバーに反映される、反映に最大1時間かかる場合あり）
    //  await rest.put(
    // Routes.applicationCommands(process.env.CLIENT_ID),
    //{ body: commands }
    //);

    // 特定サーバーへの即時登録（開発時に便利）
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('✅ コマンドの登録が完了しました！');
  } catch (err) {
    console.error('❌ コマンド登録エラー:', err);
  }
})();