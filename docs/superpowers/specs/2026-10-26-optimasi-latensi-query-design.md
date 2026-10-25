# Optimasi Latensi Query — Desain

Tanggal: 2026-10-26
Status: **terimplementasi & ter-deploy** — dokumen diperbarui setelah eksekusi agar
mencerminkan apa yang benar-benar terbang (angka before/after ada di ledger
`.superpowers/sdd/2026-10-26-optimasi-latensi-query/progress.md`).
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

### 5.1 Primitive baru: `saldoSemuaDompet`

Lokasi: `apps/web/src/lib/server/saldo.ts`.

> **Koreksi pasca-desain:** desain awal menamai primitive ini `daftarDompetDenganSaldo`
> dan SQL-nya hanya `LEFT JOIN transaksi` — **salah**, karena tabel `transfer` memindahkan
> uang antar dompet dan ikut menentukan saldo. Yang benar-benar diimplementasikan:

```ts
saldoSemuaDompet(database: Db): Promise<Map<number, number>>
```

Mengembalikan `Map<id_dompet, saldo>` (bukan array ber-nama — urutan `ORDER BY nama`
tetap ditentukan pemanggil, persis seperti versi lama). Satu query menggantikan pola
`select dompet` → `for … await saldoDompet`:

```sql
-- dua subquery terpisah, digabung COALESCE; transaksi dan transfer dijumlahkan
-- lewat LEFT JOIN masing-masing lalu dijumlahkan di lapis dompet
```

Dua detail penting yang muncul saat implementasi:

1. **Subquery terpisah untuk `transaksi` dan `transfer`.** Meng-`JOIN` keduanya langsung
   ke `dompet` dengan kondisi `OR` pada transfer menimbulkan produk kartesian dan saldo
   terhitung ganda (catatan di kode: `SALDO_Sampai` di `api/laporan` menjelaskan hal yang
   sama).
2. **`LEFT JOIN` wajib**: dompet tanpa transaksi tetap muncul dengan saldo `0`.

`saldoDompet(database, id)` **tetap dipertahankan** untuk cek satu dompet.

Delapan pemakai yang berpola loop/bertahap dan beralih ke primitive baru:

1. `lib/server/dashboard.ts` → `loadRingkasan`
2. `routes/app/transaksi/+page.server.ts`
3. `routes/app/tagihan/+page.server.ts`
4. `routes/app/dompet/+page.server.ts`
5. `routes/api/dompet/+server.ts` (`GET /api/dompet`)
6. `routes/api/transaksi/[id]/+server.ts` (`PATCH`)
7. `routes/api/utang/[id]/bayar/+server.ts`
8. `routes/api/tagihan/[id]/bayar/+server.ts`

### 5.2 Paralelisasi query per halaman

Semua query yang tidak saling bergantung digabung ke satu `Promise.all` **setelah**
`currentUser` (karena seluruh query butuh sesi valid).

- `loadRingkasan`: 4× agregat bulanan + `perKategori` + saldo dompet + `anggaran` → satu
  `Promise.all` (sebelumnya: 4 paralel → `perKategori` → `daftarDompet` → loop saldo → `ang`).
- `listTagihan`: `list` + `sudah` → satu `Promise.all` (sebelumnya berurutan).
- `GET /api/laporan`: batch utama (12 query) + batch `jumlahLalu*` digabung jadi **satu**
  gelombang — batch pembanding tidak lagi menunggu batch utama (sebelumnya 3 hop).
- Tiap `+page.server.ts`: seluruh query dalam satu `Promise.all`.

Perhop (rantai `await` berurutan), N = jumlah dompet:

| Halaman / endpoint | Sebelum | Sesudah |
|---|---|---|
| `/app` (dashboard) | 6 (+1 per N) | 2 |
| `/app/transaksi` | 4 | 2 |
| `/app/tagihan` | 4 | 2 |
| `GET /api/ringkasan` | 6 (+1 per N) | 2 |
| `GET /api/dompet` | 2 + N | 2 |
| `GET /api/tagihan` | 3 | 2 |
| `GET /api/laporan` | 3 (batch pembanding berurutan) | 2 |
| `GET /api/transaksi` | 2 (sudah paralel) | 2 |

### 5.3 Jalur tulis (API mutasi)

Urutan **validasi saldo sebelum insert dipertahankan** — ini penjaga invariant "saldo
anti-minus" dan tidak boleh dikorbankan. Yang dilakukan hanya menarik seluruh validasi ke
satu lapis paralel.

| Endpoint | Sebelum | Sesudah |
|---|---|---|
| `POST /api/transaksi` | 5 | 3 |
| `PATCH /api/transaksi/[id]` | ~7 | 4 |
| `POST /api/utang/[id]/bayar` | 7 | 5 |
| `POST /api/tagihan/[id]/bayar` | ~8 | 5 |
| `POST /api/transfer` | 4 (cek dompet → saldo berurutan) | 3 |
| `PATCH /api/dompet/[id]` | 5 (cek nama bentrok → cek sisa berurutan) | 4 |

Pola umum: `currentUser` → `Promise.all([...validasi])` → operasi tulis.

`PATCH /api/dompet/[id]` (penambahan pasca-desain, aksi admin): dua cek independen —
nama bentrok dan sisa dompet aktif — digabung satu batch. **Urutan galat dipertahankan
persis**: `WALLET_DUPLICATE` (409) → galat tipe `arsip` (400) → `LAST_WALLET` (400),
dijaga tiga kasus di `scripts/verifikasi-tulis.ts` termasuk jepitan dua-galat-serentak.

Seluruh endpoint tulis (enam di atas) dipasangi instrumen `Server-Timing` lewat wrapper
`mulai()`/`header()` sehingga jalur penolak — yang dipakai pengukuran — ikut terukur.

### 5.4 Daftar file yang disentuh

Perubahan (5.1–5.3, 5.6) — final setelah implementasi:

- `apps/web/src/lib/server/saldo.ts` — tambah `saldoSemuaDompet`
- `apps/web/src/lib/server/dashboard.ts` — `loadRingkasan`, `listTagihan`
- `apps/web/src/routes/app/+page.server.ts`
- `apps/web/src/routes/app/transaksi/+page.server.ts`
- `apps/web/src/routes/app/tagihan/+page.server.ts`
- `apps/web/src/routes/app/dompet/+page.server.ts` (memakai primitive)
- `apps/web/src/routes/api/dompet/+server.ts` (`GET`)
- `apps/web/src/routes/api/dompet/[id]/+server.ts` (`PATCH`, batch dua cek)
- `apps/web/src/routes/api/tagihan/+server.ts` (`GET`)
- `apps/web/src/routes/api/laporan/+server.ts` (batch pembanding digabung + fix `iso()`)
- `apps/web/src/routes/api/transaksi/+server.ts` (`POST`)
- `apps/web/src/routes/api/transaksi/[id]/+server.ts` (`PATCH`)
- `apps/web/src/routes/api/transfer/+server.ts` (`POST`)
- `apps/web/src/routes/api/utang/[id]/bayar/+server.ts`
- `apps/web/src/routes/api/tagihan/[id]/bayar/+server.ts`
- `packages/db/src/index.ts` — `postgres(url, { prepare: false, max: 16 })`

Instrumentasi `Server-Timing` (5.5) akhirnya mencakup **14 berkas**: tiga
`+page.server.ts` (`app`, `app/transaksi`, `app/tagihan`) + lima endpoint baca
(`api/dompet`, `api/ringkasan`, `api/transaksi` GET, `api/tagihan` GET, `api/laporan`)
+ enam endpoint tulis (`api/transaksi` POST, `api/transaksi/[id]`, `api/transfer`,
`api/utang/[id]/bayar`, `api/tagihan/[id]/bayar`, `api/dompet/[id]`).

Tidak disentuh: `lib/server/auth.ts`, `lib/server/push.ts`, skema di
`packages/db/src/schema.ts`, seluruh file `.svelte`, `vercel.json`.

### 5.5 Instrumentasi `Server-Timing`

Setiap `+page.server.ts` dan endpoint panas memasang header:

```
Server-Timing: total;dur=<ms>;desc="<n> hop"
```

Dipakai untuk pengukuran before/after di DevTools → Network → Timing. Instrumentasi
dipasang **terpisah dan lebih dulu** dari optimasi agar baseline valid.

Label hop final (semua endpoint baca = `2 hop`; endpoint tulis = 3/4/5 sesuai §5.3).
Endpoint tulis memakai wrapper agar **semua** jalur — termasuk jalur penolak yang
dipakai pengukuran tanpa-tulisan — ikut terukur:

```ts
export const POST: RequestHandler = async (args) => {
  const t0 = mulai();
  const res = await post(args);
  res.headers.set('server-timing', header(t0, 3));
  return res;
};
```

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

> **Kenyataan eksekusi:** tahap 0 dan tahap 1 digabung dalam satu push pertama
> (`b3d73ff..8796416`, keputusan pemilik "push sekarang lalu ukur") — baseline "sebelum"
> direkam lokal dengan kode lama, lalu diverifikasi ulang terhadap produksi lewat `banding`.
> Tahap 2 dijalankan penuh (bagian 7).

## 7. Verifikasi dan kriteria lolos

Disesuaikan dengan kenyataan di lapangan — empat skrip yang benar-benar ada di
`apps/web/scripts/` (rencana awal menyebut `verifikasi-saldo.ts`, tidak pernah dibuat;
fungsinya tercakup `verifikasi-dashboard` + `banding`):

- `bun run check` (svelte-check) lolos tanpa error baru. **Hasil: 0 error / 27 warning**
  (warning semuanya di file `.svelte` upstream, bukan milik perubahan ini).
- **`bun scripts/verifikasi-dashboard.ts`** — jepitan perilaku `loadRingkasan` +
  `listTagihan` dengan orakel independen (predicate `substring()` alih-alih rentang,
  `saldoDompet` per id). **Hasil: PASS 26 cek**, lulus sebelum dan sesudah refactor.
- **`bun scripts/verifikasi-tulis.ts`** — uji negatif jalur tulis: tiap kasus memakai
  jalur yang ditolak validasi, membandingkan jumlah baris (dan isi tabel `dompet` untuk
  `PATCH /api/dompet`) sebelum/sesudah. **Hasil: PASS 10/10, nol baris baru.**
- **`bun scripts/banding-respon.ts banding`** — diff response JSON terhadap baseline
  (5 endpoint: `/api/dompet`, `/api/ringkasan`, `/api/transaksi`, `/api/tagihan`,
  `/api/laporan`) dijalankan lokal **dan** terhadap produksi. **Hasil: IDENTIK ×5 di
  keduanya.**
- **`bun scripts/ukur-tulis.ts`** — ukur latensi jalur tulis tanpa pernah menulis
  (semua permintaan ditolak validasi); memisahkan `total` (jaringan) vs `dur` (handler).
- **Smoke test manual:** buka 5 halaman, tambah/edit/hapus transaksi, bayar utang, bayar
  tagihan, ganti bulan.
- **Kriteria kecepatan:** `Server-Timing` turun pada setiap halaman yang disentuh.
  **Hasil: lihat §10.**

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
  untuk paint seketika, UI optimis. *Angka Pendekatan 1 kini sudah diketahui (§10);
  keputusan "layak dibayar atau tidak" belum diangkat lagi ke pemilik.*
- **Predikat ramah-index untuk agregat bulanan.** `substring(tanggal from 1 for 7) = 'YYYY-MM'`
  tidak dapat memakai `transaksi_tanggal_id_idx` dan memicu scan penuh. Menggantinya dengan
  `tanggal >= 'YYYY-MM-01' AND tanggal <= 'YYYY-MM-31'` memakai indeks. Belum masuk cakupan
  karena masalahnya volume data, bukan round trip — relevan ketika transaksi memasuki puluhan
  ribu baris.
- **Pindah region fungsi ke Singapore.** Di luar batasan yang ditetapkan pemilik
  (khusus kode saja), tetap pengali terbesar dan gratis. Direkomendasikan agar
  ditinjau ulang jika angka setelah optimasi ini belum memuaskan.
- **Naikkan pool `max: 16` → 24** (dua pengguna membuka Laporan bersamaan, 10
  query/gelombang). Dilewatkan pemilik saat pemilihan terakhir; angka 16 tetap.
- **Smoke test manual** (§7) — milik pemilik, belum dijalankan.

### 9.1 Temuan tambahan: bug zona waktu (sudah diperbaiki)

`saldoAwal` di `/api/laporan` memakai `new Date('YYYY-MM-DDT00:00:00')` (kalender
**lokal**) lalu dibaca dengan `toISOString()` (UTC) — di mesin WIB bound-nya meleset
satu hari (`2026-09-29` vs `2026-09-30`), menghasilkan `saldoAwal` berbeda antara dev
dan produksi. Produksi (Vercel UTC) selalu benar; yang terdampak pengembangan lokal.
**Diperbaiki** di commit `aa2a36a` dengan helper `iso()` yang memang dipakai 4 baris di
atasnya — kini dev di bawah WIB menghasilkan angka identik dengan produksi tanpa perlu
`TZ=UTC`.

## 10. Hasil terukur (produksi, pasca-deploy)

Lantai jaringan (endpoint tanpa DB): **318–370 ms**. Handler 2 hop: **885–920 ms**
→ ±445 ms per round trip `iad1`↔Neon. Putaran pertama pasca-deploy (JIT cold start)
tidak dihitung.

| Halaman / endpoint | Sebelum | Sesudah | Δ |
|---|---|---|---|
| `/app/transaksi` (SSR) | 1678–1738 | **1248–1287** | **± −430 ms** |
| `/app/tagihan` (SSR) | 1444–1489 | **1216–1300** | **± −200 ms** |
| `/app` (SSR) | 1407–1433 | **1213–1255** | **± −180 ms** |
| `/api/tagihan` | 1354–1360 | **1164–1314** | **± −170 ms** |
| `/api/transaksi?limit=500` | 1405–1415 | **1346–1385** | **± −55 ms** |
| `/api/ringkasan`, `/api/dompet` | 1189–1255 | 1157–1410 | ~sama (memang sudah 2 hop) |
| `/api/laporan` | tak diukur di prod | **1163–1222** | — |

Jalur tulis: lihat pengukuran `ukur-tulis` (lokal maupun produksi) — angkanya dicatat di
ledger, bukan di dokumen ini (data historis berubah bila ada transaksi baru).
