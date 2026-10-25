# Optimasi Latensi Query — Desain

Tanggal: 2026-10-26
Status: menunggu review pemilik
Jalur: arsitektural (desain → review → rencana implementasi)

## 1. Konteks dan masalah

Aplikasi Kas Keluarga (SvelteKit + Neon Singapore, deploy di Vercel) terasa lambat saat
dibuka, khususnya first load. Keluhan datang dari pengguna kedua (istri pemilik repo).

Temuan terukur dari mesin di Indonesia ke produksi `https://keuangan-keluarga-chi.vercel.app`:

| Endpoint | Tanpa DB | Dengan DB | Status |
|---|---|---|---|
| `/` (SSR login) | 370 ms (cold 1.270 ms) | — | 200 |
| `/api/push/vapid-public` | 375 ms | — | 200 |
| `/api/me` | — | 371 ms (cold 1.048 ms) | 401 |
| `/app` (SSR, belum login) | — | 705–857 ms | 200 |
| aset statis (deploy lama) | 31 ms | — | 200 |

Header respons: `x-vercel-id: sin1::iad1::…` → **edge di Singapore, fungsi dieksekusi di
`iad1` (Virginia, USA)**. `apps/web/vercel.json` tidak menyet `regions`, jadi memakai
default Vercel. Database Neon berada di Singapore. Konsekuensinya dua lapis:

1. Setiap request menembus jaringan lintas samudra (edge → fungsi → kembali) — ini
   **lantai ~370 ms** yang dibayar semua endpoint, termasuk yang tanpa database.
2. Setiap query berjalan dari `iad1` ke Singapore — **membayar RTT lagi per round trip**.

Lapis kedua yang bisa dikurangi oleh kode adalah jumlah round trip berantai per halaman.
Pembacaan kode menunjukkan beberapa halaman menjalankan query secara berurutan yang bisa
berjalan bersamaan, terutama pola `for … await saldoDompet` (1 query per dompet).

Catatan kejujuran pengukuran: pengukuran anonim di atas belum bisa memisahkan ongkos
jaringan dari ongkos query per query. Karena itu angka penghematan **tidak dijanjikan di
dalam desain ini** — diukur pada tahap implementasi.

## 2. Tujuan

Mengurangi jumlah round trip berantai pada setiap halaman dan endpoint panas, **tanpa
mengubah perilaku aplikasi apa pun**: bentuk response, isi data, urutan, skema database,
alur auth, dan rendering client tetap persis sama.

Ukuran keberhasilan: `Server-Timing` pada tiap halaman yang disentuh turun dibanding
baseline yang diukur pada tahap 0.

## 3. Batasan (keputusan yang sudah diambil)

- Semua perubahan melalui **kode di repo ini**. Tidak ada perubahan setting Vercel, tidak
  pindah hosting/plan, tidak ada layanan berbayar atau baru.
- Kebutuhan awal "data lokal lalu disinkronkan" **dicabut oleh pemilik**: yang diinginkan
  hanya kecepatan dengan koneksi yang selalu ada. Mode offline, antrian mutasi, dan
  resolusi konflik keluar dari lingkup.
- Tidak ada perubahan bentuk response API, tidak ada perubahan skema DB, tidak ada
  perubahan alur auth, tidak ada perubahan rendering client.

## 4. Non-goal (sengaja tidak dikerjakan di desain ini)

| Ditolak | Alasan |
|---|---|
| Cache memori dalam lambda (TTL kategori/dompet/tagihan) | Tiap instance lambda punya memori terpisah → user A menulis, user B di instance lain tidak melihat sampai TTL habis. Menambah masalah konsistensi demi penghematan yang belum terbukti. Kandidat "fase 1.5" hanya jika pengukuran menunjukkan query masih dominan. |
| Cache sesi/auth untuk melewati query `currentUser` | Menunda efek logout dan pencabutan sesi, bertentangan dengan temuan keamanan "ganti password harus mencabut sesi lama". |
| Keep-warm lewat cron | Di luar kode (setting platform) dan kemungkinan tidak tersedia di plan Hobby. |
| Pendekatan "tampil dulu, isi kemudian" (render tanpa menunggu server + cache lokal + UI optimis) | Perubahan arsitektural besar yang memberi sebagian besar manfaatnya sebagai *rasa* cepat. Dibayar hanya jika hasil ukur Pendekatan 1 dinilai belum cukup. |

## 5. Desain

### 5.1 Primitive baru: `daftarDompetDenganSaldo`

Lokasi: `apps/web/src/lib/server/saldo.ts`.

```ts
daftarDompetDenganSaldo(database: Db): Promise<{ id: number; nama: string; saldo: number }[]>
```

Satu query, menggantikan pola `select dompet` → `for … await saldoDompet`:

```sql
SELECT d.id, d.nama,
       COALESCE(SUM(CASE WHEN t.tipe = 'masuk' THEN t.jumlah ELSE -t.jumlah END), 0) AS saldo
FROM dompet d
LEFT JOIN transaksi t ON t.id_dompet = d.id
GROUP BY d.id, d.nama
ORDER BY d.nama
```

`LEFT JOIN` wajib: dompet tanpa transaksi tetap harus muncul dengan saldo `0`, sama persis
dengan hasil versi lama.

`saldoDompet(database, id)` **tetap dipertahankan** untuk cek satu dompet.

Empat pemakaian yang berpola loop dan akan beralih ke primitive baru:

1. `lib/server/dashboard.ts` → `loadRingkasan`
2. `routes/app/transaksi/+page.server.ts`
3. `routes/app/tagihan/+page.server.ts`
4. `routes/api/dompet/+server.ts` (`GET /api/dompet`)

### 5.2 Paralelisasi query per halaman

Semua query yang tidak saling bergantung digabung ke satu `Promise.all` **setelah**
`currentUser` (karena seluruh query butuh sesi valid).

- `loadRingkasan`: 4× agregat bulanan + `perKategori` + saldo dompet + `anggaran` → satu
  `Promise.all` (sebelumnya: 4 paralel → `perKategori` → `daftarDompet` → loop saldo → `ang`).
- `listTagihan`: `list` + `sudah` → satu `Promise.all` (sebelumnya berurutan).
- Tiap `+page.server.ts`: seluruh query dalam satu `Promise.all`.

Perhop (rantai `await` berurutan), N = jumlah dompet:

| Halaman / endpoint | Sekarang | Sesudah |
|---|---|---|
| `/app` (dashboard) | 6 (+1 per N) | 2 |
| `/app/transaksi` | 4 | 2 |
| `/app/tagihan` | 4 | 2 |
| `GET /api/ringkasan` | 6 (+1 per N) | 2 |
| `GET /api/dompet` | 2 + N | 2 |
| `GET /api/tagihan` | 3 | 2 |

### 5.3 Jalur tulis (API mutasi)

Urutan **validasi saldo sebelum insert dipertahankan** — ini penjaga invariant "saldo
anti-minus" dan tidak boleh dikorbankan. Yang dilakukan hanya menarik seluruh validasi ke
satu lapis paralel.

| Endpoint | Sekarang | Sesudah |
|---|---|---|
| `POST /api/transaksi` | 5 | 3 |
| `PATCH /api/transaksi/[id]` | ~7 | 4 |
| `POST /api/utang/[id]/bayar` | 7 | 5 |
| `POST /api/tagihan/[id]/bayar` | ~8 | 5 |

Pola umum: `currentUser` → `Promise.all([dompet, kategori, cek saldo])` → operasi tulis.

### 5.4 Daftar file yang disentuh

Perubahan (5.1–5.3, 5.6):

- `apps/web/src/lib/server/saldo.ts` — tambah `daftarDompetDenganSaldo`
- `apps/web/src/lib/server/dashboard.ts` — `loadRingkasan`, `listTagihan`
- `apps/web/src/routes/app/transaksi/+page.server.ts`
- `apps/web/src/routes/app/tagihan/+page.server.ts`
- `apps/web/src/routes/api/dompet/+server.ts`
- `apps/web/src/routes/api/tagihan/+server.ts` (`GET`)
- `apps/web/src/routes/api/transaksi/+server.ts` (`POST`)
- `apps/web/src/routes/api/transaksi/[id]/+server.ts` (`PATCH`)
- `apps/web/src/routes/api/utang/[id]/bayar/+server.ts`
- `apps/web/src/routes/api/tagihan/[id]/bayar/+server.ts`
- `packages/db/src/index.ts` — `postgres(url, { prepare: false, max: 16 })`

Instrumentasi `Server-Timing` (5.5): tiga `+page.server.ts` di atas `app/*` plus
`api/ringkasan`, `api/dompet`, `api/transaksi`.

Tidak disentuh: `lib/server/auth.ts`, `lib/server/push.ts`, skema di
`packages/db/src/schema.ts`, seluruh file `.svelte`, `vercel.json`.

### 5.5 Instrumentasi `Server-Timing`

Setiap `+page.server.ts` dan endpoint panas memasang header:

```
Server-Timing: total;dur=<ms>;desc="<n> hop"
```

Dipakai untuk pengukuran before/after di DevTools → Network → Timing. Instrumentasi
dipasang **terpisah dan lebih dulu** dari optimasi agar baseline valid.

### 5.6 Batas pool koneksi

Setelah paralelisasi, dashboard menembakkan ±10 query dalam satu gelombang — persis
sebesar default postgres.js `max: 10`. Pengguna kedua yang datang pada saat bersamaan
harus menunggu gelombang pertama selesai, dan tiap query menahan koneksi selama satu RTT
`iad1↔Singapore` (~200 ms).

Perubahan: `packages/db/src/index.ts`

```ts
const client = postgres(url, { prepare: false, max: 16 });
```

16 = 10 untuk satu gelombang dashboard + 6 cadangan untuk pengguna kedua. Neon pooler
mengizinkan jauh lebih banyak, dan dengan hanya 2 pengguna angka ini sangat konservatif.
Komentar di samping kode menjelaskan asal angka 16 agar tidak ada yang "mengembalikan ke
default" di kemudian hari.

## 6. Urutan implementasi dan pengukuran

1. **Tahap 0 — instrumentasi.** Pasang `Server-Timing` saja, deploy, ukur baseline.
   Pengukuran dilakukan oleh pemilik di DevTools, atau dengan nilai cookie `session` yang
   diberikan sukarela sehingga pengukuran bisa dijalankan dari satu tempat.
2. **Tahap 1 — optimasi.** Kerjakan bagian 5.1–5.3 dan 5.6, deploy terpisah, ukur ulang
   dalam kondisi yang sama.
3. **Tahap 2 — verifikasi** (bagian 7).

## 7. Verifikasi dan kriteria lolos

- `bun run check` (svelte-check) lolos tanpa error baru.
- **Uji saldo:** skrip hanya-`SELECT` yang membandingkan `daftarDompetDenganSaldo()`
  terhadap `saldoDompet(id)` per dompet pada database asli — semua angka wajib identik.
  Perbedaan apa pun menolak perubahan.
- **Diff response JSON** antara hasil versi lama dan versi baru (dijalankan pada tahap 0
  dan tahap 1 terhadap kondisi data yang sama) untuk `/api/dompet`, `/api/ringkasan`,
  `/api/transaksi`, `/api/tagihan` — bentuk dan isi identik.
- **Smoke test manual:** buka 5 halaman, tambah/edit/hapus transaksi, bayar utang, bayar
  tagihan, ganti bulan.
- **Kriteria kecepatan:** `Server-Timing` turun pada setiap halaman yang disentuh.

## 8. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Query agregat menghasilkan angka berbeda → invariant saldo rusak | `LEFT JOIN` (dompet tanpa transaksi = 0) + uji perbandingan lama-vs-baru sebelum digabung. Perbedaan = perubahan ditolak. |
| Bentuk JSON berubah → client rusak | Shape `{id_dompet, nama_dompet, saldo}` dan `ORDER BY nama` dipertahankan persis. |
| Gelombang ~10 query menyebabkan kejenuhan pool `max: 10` → pengguna kedua antre | Dinaikkan ke `max: 16` (bagian 5.6). Dengan 2 pengguna, sisa 6 koneksi lebih dari cukup. |
| Salah satu query dalam `Promise.all` gagal | Sama seperti sekarang — semua query memang wajib, seluruh load gagal. Perilaku tidak berubah. |
| Penghematan ternyata kecil | Jawaban yang valid. Angka dipakai untuk memutuskan apakah Pendekatan 2 layak dibayar. |

## 9. Keputusan yang ditunda

- **Fase 1.5 — cache memori TTL** untuk data referensi (`kategori`, `dompet`, `tagihan`,
  `anggaran`) dengan invalidasi pada tulis. Dilakukan hanya jika pengukuran menunjukkan
  query masih menjadi dominan setelah paralelisasi.
- **Pendekatan 2 — tampil dulu, isi kemudian.** Render tanpa menunggu server, cache lokal
  untuk paint seketika, UI optimis. Dipertimbangkan kembali setelah angka Pendekatan 1
  diketahui.
- **Predikat ramah-index untuk agregat bulanan.** `substring(tanggal from 1 for 7) = 'YYYY-MM'`
  tidak dapat memakai `transaksi_tanggal_id_idx` dan memicu scan penuh. Menggantinya dengan
  `tanggal >= 'YYYY-MM-01' AND tanggal <= 'YYYY-MM-31'` memakai indeks. Belum masuk cakupan
  karena masalahnya volume data, bukan round trip — relevan ketika transaksi memasuki puluhan
  ribu baris.
- **Pindah region fungsi ke Singapore.** Di luar batasan yang ditetapkan pemilik
  (khusus kode saja), tetapi tetap pengali terbesar dan gratis. Direkomendasikan agar
  ditinjau ulang jika angka setelah optimasi ini belum memuaskan.
