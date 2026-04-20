const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) commands.push(command);
}

const { handleButton } = require('./game/buttonHandler');
const { handleModal } = require('./game/modalHandler');

module.exports = { commands, handleButton, handleModal };
