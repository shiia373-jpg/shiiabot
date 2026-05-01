const fs = require('fs');
const path = require('path');

const commands = [];
const buttonHandlers = [];
const modalHandlers = [];
const selectMenuHandlers = [];

// features/ 内の各ディレクトリを自動ロード
for (const entry of fs.readdirSync(__dirname)) {
  const full = path.join(__dirname, entry);
  if (!fs.statSync(full).isDirectory()) continue;
  const indexFile = path.join(full, 'index.js');
  if (!fs.existsSync(indexFile)) continue;

  const mod = require(indexFile);
  for (const cmd of mod.commands ?? []) commands.push(cmd);
  if (mod.handleButton)     buttonHandlers.push(mod.handleButton);
  if (mod.handleModal)      modalHandlers.push(mod.handleModal);
  if (mod.handleSelectMenu) selectMenuHandlers.push(mod.handleSelectMenu);
}

async function handleButton(interaction) {
  for (const handler of buttonHandlers) {
    try {
      await handler(interaction);
    } catch (err) {
      console.error('[Button Error]', err?.rawError ?? err);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '⚠️ エラーが発生しました。', flags: 64 });
        } else {
          await interaction.reply({ content: '⚠️ エラーが発生しました。', flags: 64 });
        }
      } catch { /* ignore */ }
    }
  }
}

async function handleModal(interaction) {
  for (const handler of modalHandlers) {
    try {
      await handler(interaction);
    } catch (err) {
      console.error('[Modal Error]', err?.rawError ?? err);
    }
  }
}

async function handleSelectMenu(interaction) {
  for (const handler of selectMenuHandlers) {
    try {
      await handler(interaction);
    } catch (err) {
      console.error('[SelectMenu Error]', err?.rawError ?? err);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '⚠️ エラーが発生しました。', flags: 64 });
        } else {
          await interaction.reply({ content: '⚠️ エラーが発生しました。', flags: 64 });
        }
      } catch { /* ignore */ }
    }
  }
}

module.exports = { commands, handleButton, handleModal, handleSelectMenu };
