CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE CHECK(length(trim(username))>=3),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dompet(
  id_dompet INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_dompet TEXT NOT NULL UNIQUE CHECK(length(trim(nama_dompet))>0)
);
CREATE TABLE IF NOT EXISTS kategori(
  id_kategori INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_kategori TEXT NOT NULL CHECK(length(trim(nama_kategori))>0),
  tipe TEXT NOT NULL CHECK(tipe IN ('masuk','keluar')),
  UNIQUE (nama_kategori, tipe)
);
-- Saldo dompet = hasil hitung (tanpa kolom saldo tersimpan, anti-drift):
--   masuk/transfer-masuk menambah, keluar/transfer-keluar mengurangi.
CREATE TABLE IF NOT EXISTS transaksi(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT NOT NULL CHECK(tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  tipe TEXT NOT NULL CHECK(tipe IN ('masuk','keluar','transfer')),
  id_dompet INTEGER NOT NULL REFERENCES dompet(id_dompet) ON DELETE RESTRICT,
  id_kategori INTEGER REFERENCES kategori(id_kategori) ON DELETE RESTRICT,
  id_dompet_tujuan INTEGER REFERENCES dompet(id_dompet) ON DELETE RESTRICT,
  jumlah INTEGER NOT NULL CHECK(jumlah>0),
  catatan TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (
    (tipe IN ('masuk','keluar') AND id_kategori IS NOT NULL AND id_dompet_tujuan IS NULL)
    OR (tipe = 'transfer' AND id_kategori IS NULL AND id_dompet_tujuan IS NOT NULL AND id_dompet_tujuan != id_dompet)
  )
);
CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal ON transaksi(tanggal);
CREATE INDEX IF NOT EXISTS idx_transaksi_dompet ON transaksi(id_dompet);
CREATE TABLE IF NOT EXISTS anggaran(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_kategori INTEGER NOT NULL REFERENCES kategori(id_kategori) ON DELETE CASCADE,
  bulan TEXT NOT NULL CHECK(bulan GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  batas INTEGER NOT NULL CHECK(batas>0),
  UNIQUE (id_kategori, bulan)
);
CREATE TABLE IF NOT EXISTS utang(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arah TEXT NOT NULL CHECK(arah IN ('utang','piutang')),
  pihak TEXT NOT NULL CHECK(length(trim(pihak))>0),
  jumlah INTEGER NOT NULL CHECK(jumlah>0),
  terbayar INTEGER NOT NULL DEFAULT 0 CHECK(terbayar>=0),
  tanggal TEXT NOT NULL CHECK(tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  jatuh_tempo TEXT CHECK(jatuh_tempo IS NULL OR jatuh_tempo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  catatan TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (terbayar <= jumlah)
);
CREATE TABLE IF NOT EXISTS tagihan(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_tagihan TEXT NOT NULL UNIQUE CHECK(length(trim(nama_tagihan))>0),
  jumlah INTEGER NOT NULL CHECK(jumlah>0),
  hari INTEGER NOT NULL CHECK(hari>=1 AND hari<=31),
  id_kategori INTEGER NOT NULL REFERENCES kategori(id_kategori) ON DELETE RESTRICT,
  catatan TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tagihan_bayar(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_tagihan INTEGER NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
  bulan TEXT NOT NULL CHECK(bulan GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  id_transaksi INTEGER REFERENCES transaksi(id) ON DELETE SET NULL,
  dibayar_oleh INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (id_tagihan, bulan)
);
CREATE INDEX IF NOT EXISTS idx_tagihan_bayar_bulan ON tagihan_bayar(bulan);
