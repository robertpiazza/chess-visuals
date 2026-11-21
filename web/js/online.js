// Helpers for online games that don't touch the network, so they can be
// tested in Node.

// Room codes skip characters that are easy to misread: I, O, 0 and 1.
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function roomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return code;
}

// A code as typed or pasted: case, spaces and dashes don't matter, and a
// whole invite link works too. Returns null if it isn't a valid code.
export function parseCode(text) {
  if (!text) return null;
  const fromLink = /[?&]room=([^&#]+)/.exec(text);
  const code = (fromLink ? decodeURIComponent(fromLink[1]) : text).toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every(c => CODE_CHARS.includes(c)) ? code : null;
}

export const otherColor = c => (c === 'w' ? 'b' : 'w');

// The moves stored for a room, in order. Firebase hands back an object keyed
// by ply as an array, or as an object when it has gaps; either way, stop at
// the first missing ply so a move is never applied out of order.
export function movesList(value) {
  if (!value) return [];
  const out = [];
  for (let i = 0; value[i] && typeof value[i].uci === 'string'; i++) out.push(value[i]);
  return out;
}
