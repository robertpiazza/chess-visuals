// Online games between two people, stored in Firebase Realtime Database
// (the piazza555 project, shared with 5-3 Chess) under
// chessVisuals/rooms/{code}:
//   meta    { hostColor: 'w' | 'b', aids: bool, guestJoined: bool, created }
//   moves   { 0: { uci, color }, 1: … }  keyed by ply, each written once
//   result  { type: 'resign', color }    set once, by the player who resigned
// The database rules that enforce this are in firebase-rules.json.
//
// The Firebase SDK is loaded only when a game is created or joined, so the
// rest of the site doesn't depend on it. ?net=local swaps Firebase for a
// store shared by the tabs of one browser, for testing without a network.
import { roomCode, otherColor, movesList } from './online.js?v=35eaf00';

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CONFIG = {
  apiKey: 'AIzaSyC2Bdtg6aKP5qVJLhlfWvTlKjKadygfRsQ',
  authDomain: 'piazza555.firebaseapp.com',
  databaseURL: 'https://piazza555-default-rtdb.firebaseio.com',
  projectId: 'piazza555',
  storageBucket: 'piazza555.firebasestorage.app',
  messagingSenderId: '364996442335',
  appId: '1:364996442335:web:395518009d9880766d516a',
};
const ROOT = 'chessVisuals/rooms';

let storePromise = null;
function store() {
  storePromise ??= new URLSearchParams(location.search).get('net') === 'local'
    ? Promise.resolve(localStore())
    : firebaseStore();
  // A failed load (offline, blocked) can be retried later.
  storePromise.catch(() => { storePromise = null; });
  return storePromise;
}

async function firebaseStore() {
  let app, db;
  try {
    [app, db] = await Promise.all([import(`${FIREBASE}firebase-app.js`), import(`${FIREBASE}firebase-database.js`)]);
  } catch {
    throw new Error("Couldn't reach the game server. Check your connection and try again.");
  }
  const database = db.getDatabase(app.initializeApp(CONFIG));
  return {
    async get(path) { return (await db.get(db.ref(database, path))).val(); },
    set(path, value) { return db.set(db.ref(database, path), value); },
    watch(path, onValue, onError) {
      return db.onValue(db.ref(database, path), snap => onValue(snap.val()), onError);
    },
  };
}

// Same interface, kept in localStorage and announced to other tabs.
function localStore() {
  const KEY = 'chess-visuals-local-net';
  const channel = new BroadcastChannel(KEY);
  const watchers = new Set();
  const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const at = (tree, path) => path.split('/').reduce((n, k) => n?.[k], tree) ?? null;
  const notify = () => { for (const w of watchers) w(); };
  channel.onmessage = notify;
  return {
    async get(path) { return at(read(), path); },
    async set(path, value) {
      const tree = read();
      const keys = path.split('/');
      let n = tree;
      for (const k of keys.slice(0, -1)) n = n[k] ??= {};
      n[keys.at(-1)] = value;
      localStorage.setItem(KEY, JSON.stringify(tree));
      channel.postMessage(1);
      notify();
    },
    watch(path, onValue) {
      let last;
      const w = () => {
        const v = JSON.stringify(at(read(), path));
        if (v !== last) { last = v; onValue(JSON.parse(v)); }
      };
      watchers.add(w);
      setTimeout(w);
      return () => watchers.delete(w);
    },
  };
}

// The seat this tab holds in a room, so a reload (or opening the invite link
// again after leaving) rejoins as the same side. Kept per tab, so opening the
// link in another tab joins as the opponent.
const SEATS = 'chess-visuals-seats';
function seats() {
  try { return JSON.parse(sessionStorage.getItem(SEATS)) || {}; } catch { return {}; }
}
function setSeat(code, color) {
  const all = seats();
  all[code] = color;
  try { sessionStorage.setItem(SEATS, JSON.stringify(all)); } catch { /* ignore */ }
}

export class Room {
  constructor(db, code, { color, aids, joined }) {
    this.db = db;
    this.code = code;
    this.color = color;
    this.aids = aids;
    this.joined = joined;
    this.onError = () => {};
    this.unsubs = [];
  }

  static async create({ color, aids }) {
    const db = await store();
    for (let i = 0; i < 5; i++) {
      const code = roomCode();
      if (await db.get(`${ROOT}/${code}/meta`)) continue;
      await db.set(`${ROOT}/${code}/meta`, { hostColor: color, aids, guestJoined: false, created: Date.now() });
      setSeat(code, color);
      return new Room(db, code, { color, aids, joined: false });
    }
    throw new Error("Couldn't find a free room code. Try again.");
  }

  // Join as the opponent, or take back this tab's seat after a reload.
  static async join(code) {
    const db = await store();
    const meta = await db.get(`${ROOT}/${code}/meta`);
    if (!meta) throw new Error(`No game found with code ${code}.`);
    const seat = seats()[code];
    if (seat) return new Room(db, code, { color: seat, aids: !!meta.aids, joined: !!meta.guestJoined });
    if (meta.guestJoined) throw new Error('That game already has two players.');
    await db.set(`${ROOT}/${code}/meta/guestJoined`, true);
    const color = otherColor(meta.hostColor);
    setSeat(code, color);
    return new Room(db, code, { color, aids: !!meta.aids, joined: true });
  }

  watch(sub, onValue) {
    this.unsubs.push(this.db.watch(`${ROOT}/${this.code}/${sub}`, onValue, err => this.onError(err)));
  }

  onJoined(cb) { this.watch('meta/guestJoined', v => { if (v) cb(); }); }
  onMoves(cb) { this.watch('moves', v => cb(movesList(v))); }
  onResult(cb) { this.watch('result', v => { if (v) cb(v); }); }

  sendMove(ply, uci) {
    return this.db.set(`${ROOT}/${this.code}/moves/${ply}`, { uci, color: this.color });
  }

  resign() {
    return this.db.set(`${ROOT}/${this.code}/result`, { type: 'resign', color: this.color });
  }

  leave() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
