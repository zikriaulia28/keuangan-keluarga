# PRD — Desain Website Keuangan Keluarga

> Siap dibawa ke Figma / Stitch. Jawaban atas tiap halaman: komponen apa, data apa, state apa.

## 1. Ringkasan Produk

Website pencatatan keuangan keluarga (pasangan: admin + istri). Mobile-first (dipakai kebanyakan di HP), tetap rapi di laptop. 1 dompet tunggal **Kas Keluarga**. Bahasa Indonesia. Uang rupiah bulat (`Rp 5.000.000`).

## 2. Pengguna & Peran

| Peran | Bisa |
|---|---|
| Admin (suami) | Semua + kelola anggaran, tagihan master, pengguna |
| User (istri) | Catat transaksi, utang, bayar tagihan, ganti password sendiri |

## 3. Peta Halaman (6 + login)

`/ (login)` → `/app (Dashboard)` → Transaksi, Anggaran, Utang, Tagihan, Pengguna. Nav bawah di HP (6 ikon + label), sidebar kiri di laptop ≥768px.

## 4. Gaya Visual (bebas diganti desainer)

Mobile-first, kartu putih rounded, 1 kolom di HP → multi-kolom di laptop. Primer biru, merah untuk pengeluaran/hapus/lewat-budget, hijau untuk pemasukan/lunas. Uang selalu rata kanan, tebal. Setiap halaman wajib state: loading, kosong, error inline (tanpa alert).

## 5. Spesifikasi per Halaman

### 5.1 Login (`/`)
Form tengah: logo + nama app, username, password, tombol Masuk, pesan error inline. Sukses → `/app`.

### 5.2 Dashboard (`/app`)
- Pemilih bulan (default bulan berjalan).
- 3 kartu: Pemasukan (hijau), Pengeluaran (merah), Sisa (biru) + 1 kartu Saldo Kas Keluarga.
- Grafik batang horizontal CSS: pengeluaran per kategori, proporsional ke nilai max, label + nominal.
- Progress anggaran: `dipakai / batas` per kategori + bar; merah + badge "Lewat" bila over.
- Tagihan bulan ini: nama + jatuh tempo tgl + badge Lunas/Belum.
- Utang aktif: pihak + sisa + jatuh tempo (merah bila lewat).
- Kosong: "Belum ada transaksi bulan ini".

### 5.3 Transaksi (`/app/transaksi`)
- Form: toggle Keluar/Masuk, Tanggal (default hari ini), Dompet (select + tampil saldo), Kategori (select ikut tipe), Jumlah Rp (tolak ≤0), Catatan opsional, Simpan. Error inline: `INSUFFICIENT_BALANCE` → "Saldo tidak mencukupi".
- Daftar: filter Dari/Sampai/Tipe + tombol Terapkan; baris: kategori, tanggal · dompet · pencatat, catatan, nominal (+hijau/−merah), Hapus (konfirmasi inline 2-tap, bukan popup browser).

### 5.4 Anggaran (`/app/anggaran`, tulis = admin)
- Pemilih bulan + form upsert (kategori pengeluaran + batas Rp) + daftar batas + hapus. Non-admin: daftar saja.
- Tiap baris: progress dipakai/batas + status Lewat/Aman.

### 5.5 Utang & Piutang (`/app/utang`)
- Filter Arah (Semua/Utang/Piutang) + Status (Aktif/Lunas).
- Form: Jenis (kita berutang / orang berutang), Pihak, Jumlah, Tanggal, Jatuh tempo opsional, Catatan.
- Baris aktif: Total · Terbayar · Sisa + tombol Bayar (form inline jumlah + tanggal) + Hapus. Bayar otomatis mencatat transaksi (keluar untuk utang, masuk untuk piutang). Error: `OVERPAY`, `ALREADY_PAID`, `INSUFFICIENT_BALANCE`.
- Baris lunas: badge hijau, tanpa tombol Bayar.

### 5.6 Tagihan (`/app/tagihan`, master = admin)
- Pemilih bulan. Baris: nama, nominal, jatuh tempo tiap tgl, kategori, badge Lunas/Belum + tombol "Bayar Bulan Ini" (pilih dompet bila >1).
- Bayar sukses → transaksi keluar tercatat otomatis + badge jadi Lunas. Bayar ganda → error `ALREADY_PAID` inline.
- Form tambah (admin): nama, nominal, tgl jatuh tempo 1–31, kategori pengeluaran, catatan.

### 5.7 Pengguna (`/app/pengguna`, admin; password = semua)
- Tabel: username, role badge, tanggal dibuat, aksi hapus (larang hapus diri sendiri + admin terakhir — pesan inline).
- Form tambah: username (min 3), password (min 6), role.
- Form "Ganti Password Saya": lama + baru (min 6), error `WRONG_PASSWORD`.

## 6. Alur Kunci (happy path)

1. Catat belanja: Transaksi → Keluar → kategori → simpan → muncul di daftar + Dashboard terupdate.
2. Bayar listrik: Tagihan → Bayar Bulan Ini → badge Lunas + transaksi tercatat.
3. Catat + lunasi utang: Utang → Tambah → Bayar 2 tahap → badge Lunas.
4. Cek budget: Dashboard → progress Belanja merah → sadar diri.

## 7. Di Luar Skop v1 (jangan didesain dulu)

Dompet ganda/transfer, ekspor PDF/Excel, notifikasi push, foto struk, multi-bahasa, dark mode.
