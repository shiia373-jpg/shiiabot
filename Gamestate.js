/**
 * gameState.js
 * サーバーごとのゲーム状態を Map で管理する。
 *
 * 状態の構造:
 * {
 *   answer: string,         // 正解
 *   hints: string[],        // 文字ヒント一覧
 *   shownHints: number,     // 現在表示中のヒント数
 *   imageUrl: string,       // DALL-E が生成した画像URL
 *   quizmasterId: string,   // 出題者のユーザーID
 *   messageId: string|null, // /start で送ったメッセージのID
 *   channelId: string|null, // ゲームが動いているチャンネルID
 *   active: boolean,        // ゲームが進行中かどうか
 * }
 */

// guildId -> state
const games = new Map();

/**
 * 新しいゲーム状態を設定する（/set-quiz 時に呼ばれる）
 */
function setGame(guildId, data) {
  games.set(guildId, {
    answer: data.answer,
    hints: data.hints,
    shownHints: 0,
    imageUrl: data.imageUrl,
    quizmasterId: data.quizmasterId,
    messageId: null,
    channelId: null,
    active: false,
  });
}

/**
 * ゲームを取得する
 */
function getGame(guildId) {
  return games.get(guildId) || null;
}

/**
 * ゲームを更新する（部分更新）
 */
function updateGame(guildId, patch) {
  const existing = games.get(guildId);
  if (!existing) return;
  games.set(guildId, { ...existing, ...patch });
}

/**
 * ゲームを削除する（終了時）
 */
function clearGame(guildId) {
  games.delete(guildId);
}

module.exports = { setGame, getGame, updateGame, clearGame };