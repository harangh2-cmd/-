// 직관 월드 서버: 접속자 위치/자리/채팅/예측을 주고받고, 팟 음성 연결 신호를 전달합니다.
// 영상과 음성은 서버를 거치지 않아요. (영상은 각자 합법적으로 시청, 음성은 사람끼리 직접 연결)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PER_ROOM = 24;
const POD_DEF = ['ㄱ팟', 'ㄴ팟', 'ㄷ팟'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const MOTIONS = new Set(['yes', 'headgrab', 'clap', 'angry', 'sad', 'wave']);
const OPT = {
  body: ['m', 'f'], hair: ['short', 'buzz', 'bob', 'long', 'ponytail', 'twintail', 'bun', 'none'],
  team: ['tog', 'kor', 'bra', 'arg', 'fra', 'jpn', 'eng', 'tot', 'mci', 'rma', 'fcb'],
  head: ['none', 'horns', 'band', 'cap'], neck: ['none', 'scarf'], hand: ['none', 'clappers', 'megaphone'],
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/') p = '/index.html';
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
const rooms = new Map();
let nextId = 1;

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
function cleanCfg(c) {
  c = c && typeof c === 'object' ? c : {};
  return {
    body: pick(c.body, OPT.body, 'm'), skin: Math.round(num(c.skin, 0, 5, 1)), hair: pick(c.hair, OPT.hair, 'short'), hairColor: Math.round(num(c.hairColor, 0, 7, 0)),
    face: Math.round(num(c.face, 0, 4, 0)), team: pick(c.team, OPT.team, 'tog'), number: Math.round(num(c.number, 1, 99, 10)),
    head: pick(c.head, OPT.head, 'none'), neck: pick(c.neck, OPT.neck, 'none'), hand: pick(c.hand, OPT.hand, 'none'),
  };
}
const pub = (u) => ({ id: u.id, name: u.name, cfg: u.cfg, x: u.x, z: u.z, yaw: u.yaw, m: u.m, seat: u.seat });
const newRoom = () => ({ players: new Map(), pods: POD_DEF.map((n) => n), match: null, score: { h: 0, a: 0 }, locked: false, preds: new Map(), hostId: 0 });

function send(u, msg) { if (u.ws.readyState === 1) u.ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const u of room.players.values()) if (u.id !== exceptId && u.ws.readyState === 1) u.ws.send(data);
}
const matchMsg = (r) => ({ t: 'match', match: r.match, score: r.score, locked: r.locked });
const predsMsg = (r) => ({ t: 'preds', list: [...r.preds].map(([id, v]) => ({ id, name: v.name, p: v.p })) });
function podEmpty(room, pod) { for (const u of room.players.values()) if (u.seat && u.seat.pod === pod) return false; return true; }

wss.on('connection', (ws) => {
  let room = null, me = null, lastChat = 0, lastWave = 0;
  ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'join' && !me) {
      const code = clean(m.room, 20).toUpperCase() || 'MAIN';
      if (!rooms.has(code)) rooms.set(code, newRoom());
      room = rooms.get(code);
      if (room.players.size >= MAX_PER_ROOM) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
      me = { id: nextId++, ws, name: clean(m.name, 8) || '직관러', cfg: cleanCfg(m.cfg), x: num(m.x, -40, 40, 0), z: num(m.z, -60, 40, 14), yaw: 0, m: m.m === 's' ? 's' : 'p', seat: null, joined: Date.now() };
      room.players.set(me.id, me);
      if (!room.hostId || !room.players.has(room.hostId)) room.hostId = me.id;
      send(me, { t: 'init', id: me.id, room: code, host: room.hostId, players: [...room.players.values()].map(pub), pods: room.pods, match: room.match, score: room.score, locked: room.locked, preds: predsMsg(room).list });
      broadcast(room, { t: 'join', p: pub(me) }, me.id);
      return;
    }
    if (!me) return;

    switch (m.t) {
      case 'pos':
        me.x = num(m.x, -60, 60, me.x); me.z = num(m.z, -80, 60, me.z); me.yaw = num(m.yaw, -7, 7, 0); me.m = m.m === 's' ? 's' : 'p';
        if (me.seat) { me.seat = null; broadcast(room, { t: 'stand', id: me.id }); }
        broadcast(room, { t: 'pos', id: me.id, x: me.x, z: me.z, yaw: me.yaw, m: me.m }, me.id);
        break;
      case 'sit': {
        const pod = Math.round(num(m.pod, 0, 2, -1)), idx = Math.round(num(m.idx, 0, 5, -1));
        if (pod < 0 || idx < 0) return;
        for (const u of room.players.values()) if (u !== me && u.seat && u.seat.pod === pod && u.seat.idx === idx) return send(me, { t: 'deny' });
        const old = me.seat; me.seat = { pod, idx }; me.m = 's';
        broadcast(room, { t: 'sit', id: me.id, pod, idx });
        if (old && old.pod !== pod && podEmpty(room, old.pod)) { room.pods[old.pod] = POD_DEF[old.pod]; broadcast(room, { t: 'pods', pods: room.pods }); }
        break;
      }
      case 'stand': {
        if (!me.seat) return; const old = me.seat; me.seat = null;
        broadcast(room, { t: 'stand', id: me.id });
        if (podEmpty(room, old.pod)) { room.pods[old.pod] = POD_DEF[old.pod]; broadcast(room, { t: 'pods', pods: room.pods }); }
        break;
      }
      case 'mo': if (MOTIONS.has(m.id)) broadcast(room, { t: 'mo', id: me.id, k: m.id }, me.id); break;
      case 'chat': {
        const now = Date.now(); if (now - lastChat < 300) return; lastChat = now;
        const text = clean(m.text, 80); if (text) broadcast(room, { t: 'chat', id: me.id, name: me.name, text }, me.id);
        break;
      }
      case 'wave': { const now = Date.now(); if (now - lastWave < 3500) return; lastWave = now; broadcast(room, { t: 'wave', name: me.name }); break; }
      case 'pod': {
        const pod = Math.round(num(m.pod, 0, 2, -1)); if (!me.seat || me.seat.pod !== pod) return;
        room.pods[pod] = clean(m.name, 6) || POD_DEF[pod]; broadcast(room, { t: 'pods', pods: room.pods });
        break;
      }
      case 'cfg': me.cfg = cleanCfg(m.cfg); me.name = clean(m.name, 8) || me.name; broadcast(room, { t: 'cfg', id: me.id, cfg: me.cfg, name: me.name }, me.id); break;
      case 'match':
        if (room.hostId !== me.id) return;
        { const home = clean(m.home, 8), away = clean(m.away, 8); if (!home || !away) return;
          room.match = { home, away }; room.score = { h: 0, a: 0 }; room.locked = false; room.preds = new Map();
          broadcast(room, matchMsg(room)); broadcast(room, predsMsg(room)); }
        break;
      case 'score': if (room.hostId === me.id && room.match) { room.score = { h: Math.round(num(m.h, 0, 20)), a: Math.round(num(m.a, 0, 20)) }; broadcast(room, matchMsg(room)); } break;
      case 'lock': if (room.hostId === me.id && room.match) { room.locked = !!m.v; broadcast(room, matchMsg(room)); } break;
      case 'pred':
        if (!room.match || room.locked) return;
        room.preds.set(me.id, { name: me.name, p: [Math.round(num(m.h, 0, 20)), Math.round(num(m.a, 0, 20))] }); broadcast(room, predsMsg(room));
        break;
      case 'rtc': {
        const target = room.players.get(Number(m.to));
        if (target && m.data && typeof m.data === 'object') send(target, { t: 'rtc', from: me.id, data: m.data });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!me || !room) return;
    room.players.delete(me.id);
    broadcast(room, { t: 'leave', id: me.id });
    if (me.seat && podEmpty(room, me.seat.pod)) { room.pods[me.seat.pod] = POD_DEF[me.seat.pod]; broadcast(room, { t: 'pods', pods: room.pods }); }
    if (room.hostId === me.id) {
      const next = [...room.players.values()].sort((a, b) => a.joined - b.joined)[0];
      room.hostId = next ? next.id : 0; if (next) broadcast(room, { t: 'host', id: next.id });
    }
    if (room.players.size === 0) for (const [k, v] of rooms) if (v === room) rooms.delete(k);
  });
});

setInterval(() => { wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 25000);

server.listen(PORT, () => {
  console.log(`직관 월드 서버가 켜졌어요: http://localhost:${PORT}`);
});
