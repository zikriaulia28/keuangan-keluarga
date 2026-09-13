import { check, index, integer, pgTable, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 8 }).notNull().default('user'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  check('users_role_check', sql`${t.role} IN ('admin','user')`),
]);

export const sessions = pgTable('sessions', {
  token: varchar('token', { length: 64 }).primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
});

// Satu baris: 'Kas Keluarga'. Tabel dipertahankan agar transfer/riwayat konsisten.
export const dompet = pgTable('dompet', {
  id: serial('id_dompet').primaryKey(),
  nama: varchar('nama_dompet', { length: 64 }).notNull().unique(),
});

export const kategori = pgTable('kategori', {
  id: serial('id_kategori').primaryKey(),
  nama: varchar('nama_kategori', { length: 64 }).notNull(),
  tipe: varchar('tipe', { length: 8 }).notNull(),
}, (t) => [
  check('kategori_tipe_check', sql`${t.tipe} IN ('masuk','keluar')`),
]);

export const transaksi = pgTable('transaksi', {
  id: serial('id').primaryKey(),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  tipe: varchar('tipe', { length: 8 }).notNull(),
  dompetId: integer('id_dompet').notNull().references(() => dompet.id, { onDelete: 'restrict' }),
  kategoriId: integer('id_kategori').references(() => kategori.id, { onDelete: 'restrict' }),
  jumlah: integer('jumlah').notNull(),
  catatan: text('catatan').notNull().default(''),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  check('transaksi_tipe_check', sql`${t.tipe} IN ('masuk','keluar')`),
  check('transaksi_jumlah_check', sql`${t.jumlah} > 0`),
  // Sort + filter utama daftar: ORDER BY tanggal DESC, id DESC + rentang tanggal.
  index('transaksi_tanggal_id_idx').on(t.tanggal, t.id),
  index('transaksi_dompet_idx').on(t.dompetId),
  index('transaksi_kategori_idx').on(t.kategoriId),
]);

export const anggaran = pgTable('anggaran', {
  id: serial('id').primaryKey(),
  kategoriId: integer('id_kategori').notNull().references(() => kategori.id, { onDelete: 'cascade' }),
  bulan: varchar('bulan', { length: 7 }).notNull(),
  batas: integer('batas').notNull(),
}, (t) => [
  check('anggaran_batas_check', sql`${t.batas} > 0`),
  unique('anggaran_kat_bulan').on(t.kategoriId, t.bulan),
]);

export const utang = pgTable('utang', {
  id: serial('id').primaryKey(),
  arah: varchar('arah', { length: 8 }).notNull(),
  pihak: varchar('pihak', { length: 128 }).notNull(),
  jumlah: integer('jumlah').notNull(),
  terbayar: integer('terbayar').notNull().default(0),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  jatuhTempo: varchar('jatuh_tempo', { length: 10 }),
  catatan: text('catatan').notNull().default(''),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  check('utang_arah_check', sql`${t.arah} IN ('utang','piutang')`),
  check('utang_jumlah_check', sql`${t.jumlah} > 0 AND ${t.terbayar} >= 0 AND ${t.terbayar} <= ${t.jumlah}`),
]);

export const tagihan = pgTable('tagihan', {
  id: serial('id').primaryKey(),
  nama: varchar('nama_tagihan', { length: 128 }).notNull().unique(),
  jumlah: integer('jumlah').notNull(),
  hari: integer('hari').notNull(),
  kategoriId: integer('id_kategori').notNull().references(() => kategori.id, { onDelete: 'restrict' }),
  catatan: text('catatan').notNull().default(''),
}, (t) => [
  check('tagihan_jumlah_check', sql`${t.jumlah} > 0`),
  check('tagihan_hari_check', sql`${t.hari} >= 1 AND ${t.hari} <= 31`),
]);

export const tagihanBayar = pgTable('tagihan_bayar', {
  id: serial('id').primaryKey(),
  tagihanId: integer('id_tagihan').notNull().references(() => tagihan.id, { onDelete: 'cascade' }),
  bulan: varchar('bulan', { length: 7 }).notNull(),
  transaksiId: integer('id_transaksi').references(() => transaksi.id, { onDelete: 'set null' }),
  dibayarOleh: integer('dibayar_oleh').notNull().references(() => users.id, { onDelete: 'restrict' }),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
});
