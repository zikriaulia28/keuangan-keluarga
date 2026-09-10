import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = 8081;
const DB_PATH = path.join(__dir, 'keuangan.db');
const STATIC_DIR = path.join(__dir, 'static');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dir, 'schema.sql'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const b = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body ?? '');
  res.writeHead(status, { 'Content-Length': b.length, ...headers });
  res.end(b);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', ...headers });
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(hex, 'hex'), crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64));
  } catch { return false; }
}
function localNowPlus(hours) {
  const d = new Date(Date.now() + hours * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function sessionCookie(token) {
  return `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`;
}
function clearCookie() {
  return 'session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
}
function currentUser(req) {
  const { session } = cookies(req);
  if (!session) return null;
  const row = db.prepare(
    `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now','localtime')`
  ).get(session);
  return row ?? null;
}
function errCode(e) {
  return String(e?.code ?? e?.message ?? e);
}
function isUnique(e) { return errCode(e).includes('SQLITE_CONSTRAINT_UNIQUE'); }
function validMoney(n) { return Number.isInteger(n) && n > 0; }
function validTanggal(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

const SALDO_SELECT = `SELECT d.id_dompet, d.nama_dompet,
  COALESCE(SUM(CASE
    WHEN (t.tipe = 'masuk' AND t.id_dompet = d.id_dompet)
      OR (t.tipe = 'transfer' AND t.id_dompet_tujuan = d.id_dompet) THEN t.jumlah
    WHEN (t.tipe = 'keluar' AND t.id_dompet = d.id_dompet)
      OR (t.tipe = 'transfer' AND t.id_dompet = d.id_dompet) THEN -t.jumlah
    ELSE 0 END), 0) AS saldo
  FROM dompet d LEFT JOIN transaksi t
    ON (t.id_dompet = d.id_dompet OR t.id_dompet_tujuan = d.id_dompet)`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    const p = u.pathname;
    const m = req.method;

    if (m === 'GET' && !p.startsWith('/api/')) {
      const file = p === '/' ? 'index.html' : p.slice(1).split('?')[0];
      if (file.includes('..') || file.includes('\\')) { send(res, 400, 'bad path'); return; }
      const fp = path.join(STATIC_DIR, file);
      if (!fp.startsWith(STATIC_DIR)) { send(res, 400, 'bad path'); return; }
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        send(res, 200, fs.readFileSync(fp), { 'Content-Type': MIME[path.extname(fp).toLowerCase()] ?? 'application/octet-stream' });
      } else {
        send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
      }
      return;
    }
    if (!p.startsWith('/api/')) { json(res, 404, { error: 'NOT_FOUND' }); return; }

    if (p === '/api/login' && m === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
        json(res, 400, { error: 'INVALID_CREDENTIALS' }); return;
      }
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username);
      if (!row || !verifyPassword(body.password, row.password_hash)) {
        json(res, 401, { error: 'INVALID_CREDENTIALS' }); return;
      }
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, row.id, localNowPlus(12));
      json(res, 200, { id: row.id, username: row.username, role: row.role },
        { 'Set-Cookie': sessionCookie(token) });
      return;
    }

    const me = currentUser(req);
    if (!me) { json(res, 401, { error: 'UNAUTHENTICATED' }); return; }
    const admin = me.role === 'admin';
    const needAdmin = () => { if (!admin) { json(res, 403, { error: 'FORBIDDEN' }); return true; } return false; };

    if (p === '/api/logout' && m === 'POST') {
      const { session } = cookies(req);
      if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session);
      json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
      return;
    }
    if (p === '/api/me' && m === 'GET') { json(res, 200, me); return; }

    const body = (m === 'POST' || m === 'PUT') ? await readBody(req) : {};
    if (body === null) { json(res, 400, { error: 'INVALID_JSON' }); return; }

    // ---- dompet ----
    if (p === '/api/dompet' && m === 'GET') {
      json(res, 200, db.prepare(`${SALDO_SELECT} GROUP BY d.id_dompet ORDER BY d.nama_dompet`).all());
      return;
    }
    if (p === '/api/dompet' && m === 'POST') {
      if (needAdmin()) return;
      const name = String(body.nama_dompet ?? '').trim();
      if (!name) { json(res, 400, { error: 'INVALID_NAME' }); return; }
      try {
        const r = db.prepare('INSERT INTO dompet (nama_dompet) VALUES (?)').run(name);
        json(res, 201, { id_dompet: Number(r.lastInsertRowid), nama_dompet: name, saldo: 0 });
      } catch (e) { json(res, isUnique(e) ? 409 : 400, { error: isUnique(e) ? 'WALLET_DUPLICATE' : 'INVALID_NAME' }); }
      return;
    }
    const mDompet = p.match(/^\/api\/dompet\/(\d+)$/);
    if (mDompet && m === 'DELETE') {
      if (needAdmin()) return;
      try {
        const r = db.prepare('DELETE FROM dompet WHERE id_dompet = ?').run(Number(mDompet[1]));
        if (r.changes === 0) { json(res, 404, { error: 'NOT_FOUND' }); return; }
        json(res, 200, { ok: true });
      } catch { json(res, 400, { error: 'WALLET_IN_USE' }); }
      return;
    }

    // ---- kategori ----
    if (p === '/api/kategori' && m === 'GET') {
      const tipe = u.searchParams.get('tipe');
      json(res, 200, tipe === 'masuk' || tipe === 'keluar'
        ? db.prepare('SELECT * FROM kategori WHERE tipe = ? ORDER BY nama_kategori').all(tipe)
        : db.prepare('SELECT * FROM kategori ORDER BY tipe, nama_kategori').all());
      return;
    }
    if (p === '/api/kategori' && m === 'POST') {
      if (needAdmin()) return;
      const name = String(body.nama_kategori ?? '').trim();
      if (!name || (body.tipe !== 'masuk' && body.tipe !== 'keluar')) { json(res, 400, { error: 'INVALID_CATEGORY' }); return; }
      try {
        const r = db.prepare('INSERT INTO kategori (nama_kategori, tipe) VALUES (?, ?)').run(name, body.tipe);
        json(res, 201, { id_kategori: Number(r.lastInsertRowid), nama_kategori: name, tipe: body.tipe });
      } catch (e) { json(res, isUnique(e) ? 409 : 400, { error: isUnique(e) ? 'CATEGORY_DUPLICATE' : 'INVALID_CATEGORY' }); }
      return;
    }
    const mKat = p.match(/^\/api\/kategori\/(\d+)$/);
    if (mKat && m === 'DELETE') {
      if (needAdmin()) return;
      try {
        const r = db.prepare('DELETE FROM kategori WHERE id_kategori = ?').run(Number(mKat[1]));
        if (r.changes === 0) { json(res, 404, { error: 'NOT_FOUND' }); return; }
        json(res, 200, { ok: true });
      } catch { json(res, 400, { error: 'CATEGORY_IN_USE' }); }
      return;
    }

    // ---- transaksi ----
    if (p === '/api/transaksi' && m === 'GET') {
      let limit = Number(u.searchParams.get('limit') ?? 100);
      let offset = Number(u.searchParams.get('offset') ?? 0);
      if (!Number.isInteger(limit) || limit <= 0) limit = 100;
      if (limit > 500) limit = 500;
      if (!Number.isInteger(offset) || offset < 0) offset = 0;
      const conds = [], args = [];
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      if (from && validTanggal(from)) { conds.push('t.tanggal >= ?'); args.push(from); }
      if (to && validTanggal(to)) { conds.push('t.tanggal <= ?'); args.push(to); }
      const idd = u.searchParams.get('id_dompet'), tipe = u.searchParams.get('tipe');
      if (idd) { conds.push('(t.id_dompet = ? OR t.id_dompet_tujuan = ?)'); args.push(Number(idd), Number(idd)); }
      if (tipe === 'masuk' || tipe === 'keluar' || tipe === 'transfer') { conds.push('t.tipe = ?'); args.push(tipe); }
      const sql = `SELECT t.*, d1.nama_dompet AS dompet, d2.nama_dompet AS dompet_tujuan,
          k.nama_kategori AS kategori, usr.username AS pencatat
        FROM transaksi t JOIN dompet d1 ON d1.id_dompet = t.id_dompet
        LEFT JOIN dompet d2 ON d2.id_dompet = t.id_dompet_tujuan
        LEFT JOIN kategori k ON k.id_kategori = t.id_kategori
        JOIN users usr ON usr.id = t.user_id
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY t.tanggal DESC, t.id DESC LIMIT ? OFFSET ?`;
      json(res, 200, db.prepare(sql).all(...args, limit, offset));
      return;
    }
    if (p === '/api/transaksi' && m === 'POST') {
      const { tanggal, tipe, jumlah } = body;
      const idd = Number(body.id_dompet);
      if (!validTanggal(tanggal) || !validMoney(Number(jumlah)) || !Number.isInteger(idd)) {
        json(res, 400, { error: 'INVALID_TRANSACTION' }); return;
      }
      if (!db.prepare('SELECT 1 FROM dompet WHERE id_dompet = ?').get(idd)) {
        json(res, 400, { error: 'INVALID_WALLET' }); return;
      }
      let idk = null, idt = null;
      if (tipe === 'masuk' || tipe === 'keluar') {
        idk = Number(body.id_kategori);
        const k = Number.isInteger(idk) ? db.prepare('SELECT * FROM kategori WHERE id_kategori = ?').get(idk) : null;
        if (!k || k.tipe !== tipe) { json(res, 400, { error: 'INVALID_CATEGORY' }); return; }
      } else if (tipe === 'transfer') {
        idt = Number(body.id_dompet_tujuan);
        if (!Number.isInteger(idt) || idt === idd || !db.prepare('SELECT 1 FROM dompet WHERE id_dompet = ?').get(idt)) {
          json(res, 400, { error: 'INVALID_WALLET' }); return;
        }
      } else { json(res, 400, { error: 'INVALID_TRANSACTION' }); return; }
      // Saldo tak boleh minus akibat keluar/transfer.
      const saldo = db.prepare(`${SALDO_SELECT} AND d.id_dompet = ? GROUP BY d.id_dompet`).get(idd)?.saldo ?? 0;
      if ((tipe === 'keluar' || tipe === 'transfer') && Number(jumlah) > saldo) {
        json(res, 400, { error: 'INSUFFICIENT_BALANCE' }); return;
      }
      try {
        const r = db.prepare(`INSERT INTO transaksi (tanggal, tipe, id_dompet, id_kategori, id_dompet_tujuan, jumlah, catatan, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(tanggal, tipe, idd, idk, idt, Number(jumlah), String(body.catatan ?? ''), me.id);
        json(res, 201, db.prepare(`SELECT t.*, d1.nama_dompet AS dompet, d2.nama_dompet AS dompet_tujuan,
            k.nama_kategori AS kategori, usr.username AS pencatat
          FROM transaksi t JOIN dompet d1 ON d1.id_dompet = t.id_dompet
          LEFT JOIN dompet d2 ON d2.id_dompet = t.id_dompet_tujuan
          LEFT JOIN kategori k ON k.id_kategori = t.id_kategori
          JOIN users usr ON usr.id = t.user_id WHERE t.id = ?`).get(Number(r.lastInsertRowid)));
      } catch { json(res, 400, { error: 'INVALID_TRANSACTION' }); }
      return;
    }
    const mTr = p.match(/^\/api\/transaksi\/(\d+)$/);
    if (mTr && m === 'DELETE') {
      const row = db.prepare('SELECT * FROM transaksi WHERE id = ?').get(Number(mTr[1]));
      if (!row) { json(res, 404, { error: 'NOT_FOUND' }); return; }
      if (!admin && row.user_id !== me.id) { json(res, 403, { error: 'FORBIDDEN' }); return; }
      db.prepare('DELETE FROM transaksi WHERE id = ?').run(Number(mTr[1]));
      json(res, 200, { ok: true });
      return;
    }

    // ---- ringkasan bulan ----
    if (p === '/api/ringkasan' && m === 'GET') {
      const bulan = u.searchParams.get('bulan') || new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(bulan)) { json(res, 400, { error: 'INVALID_MONTH' }); return; }
      const masuk = db.prepare(`SELECT COALESCE(SUM(jumlah),0) AS n FROM transaksi
        WHERE tipe = 'masuk' AND substr(tanggal,1,7) = ?`).get(bulan).n;
      const keluar = db.prepare(`SELECT COALESCE(SUM(jumlah),0) AS n FROM transaksi
        WHERE tipe = 'keluar' AND substr(tanggal,1,7) = ?`).get(bulan).n;
      const perKategori = db.prepare(`SELECT k.nama_kategori AS kategori, SUM(t.jumlah) AS total
        FROM transaksi t JOIN kategori k ON k.id_kategori = t.id_kategori
        WHERE t.tipe = 'keluar' AND substr(t.tanggal,1,7) = ?
        GROUP BY t.id_kategori ORDER BY total DESC`).all(bulan);
      const dompet = db.prepare(`${SALDO_SELECT} GROUP BY d.id_dompet ORDER BY d.nama_dompet`).all();
      json(res, 200, { bulan, masuk, keluar, sisa: masuk - keluar, perKategori, dompet });
      return;
    }

    // ---- users (admin) ----
    if (p === '/api/users' && m === 'GET') {
      if (needAdmin()) return;
      json(res, 200, db.prepare('SELECT id, username, role, created_at FROM users ORDER BY username').all()); return;
    }
    if (p === '/api/users' && m === 'POST') {
      if (needAdmin()) return;
      const username = String(body.username ?? '').trim(), pw = String(body.password ?? ''), role = body.role;
      if (username.length < 3 || pw.length < 6 || (role !== 'admin' && role !== 'user')) { json(res, 400, { error: 'INVALID_USER' }); return; }
      try {
        const r = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hashPassword(pw), role);
        json(res, 201, { id: Number(r.lastInsertRowid), username, role });
      } catch { json(res, 409, { error: 'USER_DUPLICATE' }); }
      return;
    }
    const mUser = p.match(/^\/api\/users\/(\d+)$/);
    if (mUser && m === 'DELETE') {
      if (needAdmin()) return;
      const id = Number(mUser[1]);
      if (id === me.id) { json(res, 400, { error: 'CANNOT_DELETE_SELF' }); return; }
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) { json(res, 404, { error: 'NOT_FOUND' }); return; }
      if (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n <= 1 &&
        db.prepare('SELECT role FROM users WHERE id = ?').get(id).role === 'admin') {
        json(res, 400, { error: 'LAST_ADMIN' }); return;
      }
      try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        json(res, 200, { ok: true });
      } catch { json(res, 400, { error: 'USER_IN_USE' }); }
      return;
    }

    json(res, 404, { error: 'NOT_FOUND' });
  } catch (e) {
    console.error(e);
    try { json(res, 500, { error: 'INTERNAL' }); } catch {}
  }
});

server.listen(PORT, HOST, () => console.log(`keuangan-keluarga http://${HOST}:${PORT}`));
