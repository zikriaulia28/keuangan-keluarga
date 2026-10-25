import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diisi (lihat .env.example)');

// prepare:false wajib untuk Neon pooler (PgBouncer transaction mode); prepare:true memicu "prepared statement does not exist".
// max 16 = 11 untuk satu gelombang dashboard (8 loadRingkasan + 2 listTagihan +
// 1 listUtangAktif) + 5 cadangan; gelombang /api/laporan 12 masih muat dengan sisa 4.
// Karena tiap query menahan koneksi selama satu RTT iad1↔Singapore (~200 ms),
// pool default 10 membuat pengguna kedua antre bila keduanya membuka halaman
// bersamaan. Jangan dikembalikan ke default tanpa mengurangi query per request.
const client = postgres(url, { prepare: false, max: 16 });
export const db = drizzle(client, { schema });
export * from './schema';
