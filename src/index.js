require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.commands = new Collection();

const srcPath = __dirname;
const botModules = fs.readdirSync(srcPath)
  .filter(entry => {
    const full = path.join(srcPath, entry);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'index.js'));
  })
  .map(dir => require(path.join(srcPath, dir)));

for (const mod of botModules) {
  for (const command of (mod.commands || [])) {
    client.commands.set(command.data.name, command);
  }
}

const { startFarmUpdater } = require('./features/aguriculture/game/farmUpdater');

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startFarmUpdater(client);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[Command Error] ${interaction.commandName}:`, err);
      const msg = { content: '⚠️ コマンドの実行中にエラーが発生しました。', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  }

  if (interaction.isButton()) {
    for (const mod of botModules) {
      if (!mod.handleButton) continue;
      try {
        await mod.handleButton(interaction);
      } catch (err) {
        console.error('[Button Error]:', err);
        const msg = { content: '⚠️ ボタン処理中にエラーが発生しました。', flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
    }
  }

  if (interaction.isAnySelectMenu()) {
    for (const mod of botModules) {
      if (!mod.handleSelectMenu) continue;
      try {
        await mod.handleSelectMenu(interaction);
      } catch (err) {
        console.error('[SelectMenu Error]:', err);
        const msg = { content: '⚠️ 選択処理中にエラーが発生しました。', flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
    }
  }

  if (interaction.isModalSubmit()) {
    for (const mod of botModules) {
      if (!mod.handleModal) continue;
      try {
        await mod.handleModal(interaction);
      } catch (err) {
        console.error('[Modal Error]:', err);
        const msg = { content: '⚠️ 回答処理中にエラーが発生しました。', flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
