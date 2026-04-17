const games = new Map();

function setGame(guildId, data) {
  const existing = games.get(guildId) || {};
  games.set(guildId, {
    answer: data.answer,
    answers: data.answers || [data.answer],
    hints: data.hints || [],
    shownHints: 0,
    imageAttachment: data.imageAttachment,
    quizmasterId: data.quizmasterId,
    messageId: null,
    channelId: existing.channelId || null,
    active: false,
    currentRound: existing.currentRound || 1,
    totalRounds: data.totalRounds || existing.totalRounds || 5,
    scores: existing.scores || {},
    roundWinners: [],
  });
}

function getGame(guildId) {
  return games.get(guildId) || null;
}

function updateGame(guildId, patch) {
  const existing = games.get(guildId);
  if (!existing) return;
  games.set(guildId, { ...existing, ...patch });
}

function clearGame(guildId) {
  games.delete(guildId);
}

module.exports = { setGame, getGame, updateGame, clearGame };
