# Optimasi Latensi Query — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memangkas jumlah round-trip jaringan berantai pada setiap halaman dan endpoint panas, tanpa mengubah satu pun bentuk response, isi data, skema DB, alur auth, atau rendering client.

**Architecture:** Perubahan murni di lapisan data server. Satu primitive baru (`daftarDompetDenganSaldo`) menggantikan pola `select dompet` → `for … await saldo`; semua query independen digabung ke satu `Promise.all` setelah `currentUser`; instrumen `Server-Timing` dipasang lebih dulu agar before/after terukur. Batas pool koneksi dinaikkan karena gelombang paralel kini memakai seluruh pool default.

**Tech Stack:** SvelteKit 2 + Svelte 5, Drizzle ORM, postgres.js, Bun 1.2.12 (runtime + script verifikasi, tanpa framework test tambahan), Vercel (fungsi `iad1`), Neon Postgres (Singapore).

**Spec:** `docs/superpowers/specs/2026-10-26-optimasi-latensi-query-design.md`

> **Status eksekusi (diperbarui setelah run): SELURUH TASK SELESAI & TER-DEPLOY.**
> Eksekusi Native di satu sesi, digabung jadi tiga batch komit lalu di-push bersama:
> `b3d73ff` (Task 1 instrumen) → `8029fd2` (Task 2–4 sebagian: halaman + pool) →
> `10030b9` (Task 5 jalur tulis) → `8796416` (laporan + GET tagihan) → push
> `f46b682..8796416`. Pekerjaan susulan terpilih pemilik: `aa2a36a` (fix zona waktu),
> `ec16a8a` (batch `PATCH /api/dompet`), `f0231c1` (instrumen tulis + `ukur-tulis.ts`)
> → push `8796416..f0231c1`. Deviasi terhadap rencana asli dicatat di
> **"Laporan eksekusi"** paling bawah; hasil ukur di spec §10 dan ledger
> `.superpowers/sdd/2026-10-26-optimasi-latensi-query/progress.md`.
> Checkbox di bawah adalah rencana ASLI — jangan ditandai ulang.

## Global Constraints

- **Khusus kode.** Tidak ada perubahan setting Vercel, tidak pindah host/plan, tidak ada layanan atau dependensi baru (spec §3).
- **Tidak ada perubahan perilaku.** Bentuk JSON, isi, urutan (`ORDER BY nama`), skema DB, alur auth, dan rendering client wajib identik (spec §2, §3).
- **Urutan `validasi-saldo → insert` wajib dipertahankan** di semua endpoint tulis — penjaga invariant "saldo anti-minus" (spec §5.3).
- **`prepare: false` wajib tetap ada** di `packages/db/src/index.ts` (dibutuhkan PgBouncer transaction mode Neon).
- **Repo ini publik.** File baseline berisi data keuangan pribadi dan **tidak boleh sampai ter-commit**. `.gitignore` harus diperbarui sebelum baseline pertama ditulis.
- **Urutan push:** Task 1 men-push instrumen (deploy terpisah, sumber baseline). Task 2–5 **commit lokal saja**. Push berikutnya baru di Task 6 — spesifikasi mewajibkan baseline terekam sebelum optimasi ter-deploy (spec §6).
- **Verifikasi memakai database asli dan wajib hanya-`SELECT`** kecuali skenario uji negatif yang dijalankan pemilik (lihat Review Focus #2).
- Semua perintah dijalankan dari `apps/web` (di situlah `.env` berada; Bun memuat `.env` dari cwd — sudah diverifikasi pada Bun 1.2.12).
- Nilai env `SESSION` diminta ke pemilik (token cookie `session`, berlaku 12 jam). Bila kedaluwarsa di tengah kerja, minta ulang.

## Review Focus

Lima hal yang kemungkinan besar menggigit orang yang memakai software ini, dan test yang menempelkannya ke task pemiliknya:

1. **`INNER JOIN` salah ganti `LEFT JOIN` → dompet tanpa transaksi hilang dari daftar.**
   Test: `scripts/verifikasi-saldo.ts` (Task 2) mengurutkan id hasil agregat dan membandingkannya dengan `SELECT dompet ORDER BY nama` — jumlah dan urutan wajib sama, lalu tiap saldo dibandingkan dengan `saldoDompet(id)`. Gagal kalau ada dompet yang hilang.

2. **Urutan `validasi saldo` tertukar dengan `insert` → saldo bisa minus.**
   Test: tidak ada test otomatis yang aman (jalur sukses menulis data produksi). Verifikasi milik **Task 5**: `bun run check` lolos, inspeksi urutan baris per endpoint, lalu uji negatif manual oleh pemilik — kirim `POST /api/transaksi` dengan `jumlah` jauh melebihi saldo dan pastikan balasannya `INSUFFICIENT_BALANCE` **tanpa baris baru muncul**. *Pemulihan jika gagal: baris uji yang sempat terbuat dihapus lewat UI Transaksi.*

3. **File `.baseline/` (isi: saldo dan transaksi nyata) ikut ter-commit ke repo publik.**
   Test: Task 1 Step 3 menambahkan `apps/web/.baseline/` ke `.gitignore` **sebelum** baseline pertama ditulis, dan Step terakhir tiap task menjalankan `git status --porcelain` yang wajib tidak menampilkan `.baseline/`.

4. **Gelombang ±10 query memenuhi pool `max: 10` → pengguna kedua antre ~200 ms.**
   Test: Task 3 Step 4 menyetel `max: 16` beserta komentar asal angkanya; verifikasi `grep -n "max: 16" packages/db/src/index.ts` menemukan satu baris, dan `bun run check` tetap lolos.

5. **Label `desc="<n> hop"` di header `Server-Timing` tidak diperbarui setelah refactor → angka before/after jadi menyesatkan.**
   Test: tiap task mengubah angka hop di file yang disentuhnya; Task 6 Step 5 membaca header produksi dan mencocokkannya dengan tabel hop di spesifikasi (dashboard 2, transaksi 2, tagihan 2, ringkasan 2, dompet 2, transaksi GET 2).

---

## File Structure

**Dibuat:**

| File | Tanggung jawab |
|---|---|
| `apps/web/src/lib/server/waktu.ts` | Dua fungsi mungil untuk header `Server-Timing`. Tidak ada logika lain. |
| ~~`apps/web/scripts/verifikasi-saldo.ts`~~ | **TIDAK PERNAH DIBUAT** (deviasi): fungsinya tercakup `verifikasi-dashboard` (orakel per id) + `banding` (diff response). |
| `apps/web/scripts/verifikasi-dashboard.ts` | Jepitan perilaku `loadRingkasan`/`listTagihan`, orakel independen. PASS 26 cek. |
| `apps/web/scripts/verifikasi-tulis.ts` | Uji negatif jalur tulis — 10 kasus, nol tulisan, isi `dompet` ikut dijaga. |
| `apps/web/scripts/ukur-tulis.ts` | Ukur latensi jalur tulis via permintaan DITOLAK (aman untuk produksi). |
| `apps/web/scripts/banding-respon.ts` | Rekam/bandingkan/ukur response JSON + timing (`simpan`, `banding`, `ukur`). |
| `apps/web/.baseline/` (ter-ignore) | Hasil `simpan`. Tidak pernah di-commit. |

**Diubah:**

| File | Perubahan |
|---|---|
| `.gitignore` | + `apps/web/.baseline/` |
| `apps/web/src/lib/server/saldo.ts` | + `saldoSemuaDompet` (sebelumnya dalam desain bernama `daftarDompetDenganSaldo`) |
| `apps/web/src/lib/server/dashboard.ts` | `loadRingkasan` & `listTagihan` → satu `Promise.all` |
| `packages/db/src/index.ts` | `max: 16` |
| `apps/web/src/routes/app/+page.server.ts` | instrumen, label hop 6 → 2 |
| `apps/web/src/routes/app/transaksi/+page.server.ts` | paralel, label 4 → 2 |
| `apps/web/src/routes/app/tagihan/+page.server.ts` | paralel, label 4 → 2 |
| `apps/web/src/routes/app/dompet/+page.server.ts` | pakai `saldoSemuaDompet` (di luar rencana awal) |
| `apps/web/src/routes/api/ringkasan/+server.ts` | instrumen, label 6 → 2 |
| `apps/web/src/routes/api/dompet/+server.ts` | pakai primitive, label 3 → 2 |
| `apps/web/src/routes/api/dompet/[id]/+server.ts` | **(susulan)** batch dua cek `PATCH` + instrumen 4 hop |
| `apps/web/src/routes/api/tagihan/+server.ts` | `GET` → `Promise.all` + instrumen 2 hop (label lama: tanpa instrumen) |
| `apps/web/src/routes/api/laporan/+server.ts` | **(di luar rencana)** batch pembanding digabung, instrumen 2 hop, fix `iso()` |
| `apps/web/src/routes/api/transaksi/+server.ts` | `GET` instrumen label 2 (tetap); `POST` → paralel + instrumen 3 hop |
| `apps/web/src/routes/api/transaksi/[id]/+server.ts` | `PATCH` → paralel + instrumen 4 hop |
| `apps/web/src/routes/api/transfer/+server.ts` | **(di luar rencana)** cek dompet + saldo → satu batch, instrumen 3 hop |
| `apps/web/src/routes/api/utang/[id]/bayar/+server.ts` | validasi paralel + instrumen 5 hop |
| `apps/web/src/routes/api/tagihan/[id]/bayar/+server.ts` | validasi paralel + instrumen 5 hop |

---

### Task 1: Setup, instrumen `Server-Timing`, dan rekam baseline

**Files:**
- Create: `apps/web/src/lib/server/waktu.ts`
- Create: `apps/web/scripts/banding-respon.ts`
- Modify: `.gitignore`
- Modify: `apps/web/src/routes/app/+page.server.ts`, `apps/web/src/routes/app/transaksi/+page.server.ts`, `apps/web/src/routes/app/tagihan/+page.server.ts`
- Modify: `apps/web/src/routes/api/ringkasan/+server.ts`, `apps/web/src/routes/api/dompet/+server.ts`, `apps/web/src/routes/api/transaksi/+server.ts`

**Interfaces:**
- Consumes: —
- Produces (dipakai Task 2–6):
  - `mulai(): number` — ambil awal pengukuran (`performance.now()`).
  - `header(t0: number, hop: number): string` — mengembalikan `total;dur=<ms>;desc="<n> hop"`.
  - `bun scripts/banding-respon.ts simpan|banding|ukur` — env `SESSION` (token cookie, wajib), `BASE` (default `http://localhost:5173`), `BULAN` (default bulan berjalan, `YYYY-MM`).

- [ ] **Step 1: Pasang dependensi dan pastikan alur cek type jalan**

```bash
bun install                    # workdir: root repo
bun run check                  # workdir: apps/web
```
Expected: install sukses; `svelte-check` 0 error.

- [ ] **Step 2: Tambahkan `.gitignore` sebelum baseline pertama ditulis**

Tambahkan ke `.gitignore`:

```
apps/web/.baseline/
```

Jalankan `git status --porcelain` — tidak boleh ada entri `.baseline/`.

- [ ] **Step 3: Buat `apps/web/src/lib/server/waktu.ts`**

Dua ekspor saja, tanpa logika lain:

```ts
export function mulai(): number
export function header(t0: number, hop: number): string   // "total;dur=812.4;desc=\"6 hop\""
```

- [ ] **Step 4: Buat `apps/web/scripts/banding-respon.ts`**

Kontrak (isi tubuh diserahkan ke implementer):

- Ambil `SESSION`, `BASE`, `BULAN` dari `process.env`. Tanpa `SESSION` → keluar dengan kode 1 dan pesan penggunaan.
- Empat path diambil dengan `BASE` sebagai prefix: `/api/dompet`, `/api/ringkasan?bulan=$BULAN`, `/api/transaksi?limit=500`, `/api/tagihan?bulan=$BULAN`.
- Kirim header `Cookie: session=$SESSION` di setiap request.
- `simpan` → tulis hasil ke `.baseline/<nama-endpoint>.json` (relatif cwd, yaitu `apps/web/.baseline/` dari akar repo) beserta meta `{ bulan, tanggal }`; `banding` → ambil ulang, deep-equal **yang mengabaikan urutan kunci** terhadap file baseline, cetak `IDENTIK`/`BEDA` per endpoint, keluar 1 bila ada beda; `ukur` → cetak `ms` total dan nilai header `Server-Timing` per endpoint, tanpa menulis file.
- `banding` wajib menolak bila `BULAN` di meta baseline berbeda dengan `BULAN` sekarang (lindungi perbandingan lintas batas bulan).

- [ ] **Step 5: Instrumen enam titik dengan angka hop versi kode sekarang**

Di setiap berkas, catat `const t0 = mulai()` sebelum query pertama dan pasang header tepat sebelum response dikirim:

| Berkas | Nilai `hop` | Cara memasang |
|---|---|---|
| `app/+page.server.ts` | `6` | `setHeaders({ 'server-timing': header(t0, 6) })` — `setHeaders` adalah **properti event `load`**, bukan ekspor `@sveltejs/kit`; destructure dari argumen `async ({ cookies, url, setHeaders })` |
| `app/transaksi/+page.server.ts` | `4` | sama |
| `app/tagihan/+page.server.ts` | `4` | sama |
| `api/ringkasan/+server.ts` | `6` | `json(data, { headers: { 'server-timing': header(t0, 6) } })` |
| `api/dompet/+server.ts` | `3` | sama, + komentar `// 2 + N; N = jumlah dompet` |
| `api/transaksi/+server.ts` (`GET`) | `2` | sama |

- [ ] **Step 6: Verifikasi type**

Run: `bun run check` (workdir `apps/web`)
Expected: 0 error.

- [ ] **Step 7: Rekam baseline JSON secara lokal (kode lama)**

```bash
bun run dev                    # workdir: apps/web, jalankan di background
# tunggu http://localhost:5173 siap
SESSION=<token cookie session> bun scripts/banding-respon.ts simpan   # workdir: apps/web
```
Expected: 4 file muncul di `apps/web/.baseline/`. Lalu `git status --porcelain` tetap bersih dari `.baseline/`.

- [ ] **Step 8: Commit lalu push (deploy instrumen)**

```bash
git add .gitignore apps/web/src/lib/server/waktu.ts apps/web/scripts/banding-respon.ts apps/web/src/routes
git commit -m "chore(perf): instrumen Server-Timing untuk baseline"
git push
```
Expected: build Vercel sukses di `main`.

- [ ] **Step 9: Ukur baseline produksi**

```bash
SESSION=<token cookie session> BASE=https://keuangan-keluarga-chi.vercel.app bun scripts/banding-respon.ts ukur
```
Expected: tabel `ms` + `server-timing` per endpoint. **Catat angkanya di pesan chat, jangan di file yang di-commit.** Ini angka pembanding untuk Task 6.

---

### Task 2: Primitive `daftarDompetDenganSaldo`

**Files:**
- Create: `apps/web/scripts/verifikasi-saldo.ts`
- Modify: `apps/web/src/lib/server/saldo.ts`

**Interfaces:**
- Consumes: `saldoDompet(database: Db, id: number): Promise<number>` (sudah ada, tidak diubah), tabel `dompet` & `transaksi` dari `db`.
- Produces: `daftarDompetDenganSaldo(database: Db): Promise<{ id: number; nama: string; saldo: number }[]>` — dipakai Task 3 (dashboard) dan Task 4 (`transaksi`, `tagihan`, `api/dompet`). Urutan mengikuti `ORDER BY dompet.nama`.

- [ ] **Step 1: Tulis `apps/web/scripts/verifikasi-saldo.ts` (gagal dulu)**

Import dari `../src/lib/server/saldo`. Ambil daftar resmi `db.select().from(dompet).orderBy(dompet.nama)`, lalu bandingkan dengan `daftarDompetDenganSaldo(db)`:

- jumlah dan urutan `id` wajib sama;
- tiap `nama` sama;
- tiap `saldo` wajib **sama persis** dengan `await saldoDompet(db, id)`;
- cetak tabel perbandingan; keluar kode 1 bila ada selisih.

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
bun scripts/verifikasi-saldo.ts     # workdir: apps/web
```
Expected: FAIL — `does not provide an export named 'daftarDompetDenganSaldo'`.

- [ ] **Step 3: Implementasikan di `apps/web/src/lib/server/saldo.ts`**

Signature persis seperti blok Interfaces. Pendekatan: satu query Drizzle `from(dompet).leftJoin(transaksi, eq(transaksi.dompetId, dompet.id)).groupBy(dompet.id, dompet.nama).orderBy(dompet.nama)` dengan agregat `COALESCE(SUM(CASE WHEN tipe = 'masuk' THEN jumlah ELSE -jumlah END), 0)`. `leftJoin` wajib — bukan `innerJoin`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun scripts/verifikasi-saldo.ts`
Expected: PASS, 4 baris output identik, exit 0.

- [ ] **Step 5: `bun run check`** → Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/server/saldo.ts apps/web/scripts/verifikasi-saldo.ts
git commit -m "perf(saldo): agregat semua dompet dalam satu query"
```

---

### Task 3: Paralelisasi `dashboard.ts` + batas pool

**Files:**
- Create: `apps/web/scripts/verifikasi-dashboard.ts`
- Modify: `apps/web/src/lib/server/dashboard.ts:27-86`
- Modify: `packages/db/src/index.ts:9`
- Modify: `apps/web/src/routes/app/+page.server.ts` (label hop 6 → 2)
- Modify: `apps/web/src/routes/api/ringkasan/+server.ts` (label hop 6 → 2)

**Interfaces:**
- Consumes: `daftarDompetDenganSaldo(database: Db)` (Task 2), `header(t0, hop)` (Task 1).
- Produces: bentuk balik `loadRingkasan(bulan)` dan `listTagihan(bulan)` **tidak berubah sama sekali** — Task 4, Task 6, dan client bergantung pada bentuk itu.

- [ ] **Step 1: Tulis `apps/web/scripts/verifikasi-dashboard.ts` sebagai jepitan perilaku**

Import `loadRingkasan` dan `listTagihan` dari `../src/lib/server/dashboard`, serta `saldoDompet` dari `../src/lib/server/saldo`. Ambil bulan dari env `BULAN` (default bulan berjalan).

Ini refactor, jadi test ditulis lebih dulu dan wajib **lulus sebelum kode diubah** (bukan gagal). Untuk `loadRingkasan($BULAN)`:

- `masuk`/`keluar` = `SUM(jumlah)` dihitung ulang lewat query terpisah dengan predicate `tanggal >= 'YYYY-MM-01' AND tanggal <= 'YYYY-MM-31'` (sengaja beda cara dengan kode produksi, supaya jadi orakel independen);
- tiap entri `dompet[].saldo` = `saldoDompet(db, id)`;
- tiap `anggaran[].dipakai` = `SUM` per kategori untuk bulan itu;
- `perKategori` = `GROUP BY kategori.nama` terpisah.

Untuk `listTagihan($BULAN)`: tiap `lunas` wajib sama dengan keberadaan baris `tagihanBayar` untuk `tagihanId` + `bulan` itu.

- [ ] **Step 2: Jalankan — wajib PASS terhadap kode lama**

Run: `bun scripts/verifikasi-dashboard.ts`
Expected: PASS. (Bila gagal di sini, berarti orakelnya yang salah — perbaiki orakelnya, bukan kodenya.)

- [ ] **Step 3: Refactor `dashboard.ts`**

- `loadRingkasan`: pindahkan keempat `jumlahTipe`, `perKategori`, `daftarDompetDenganSaldo`, dan query `anggaran` ke **satu** `Promise.all`. Hapus loop `for … await saldoDompet` dan `db.select(dompet)` terpisah.
- `listTagihan`: `const [list, sudah] = await Promise.all([...])`.
- Struktur kembalian dan pemetaan field tidak berubah.

- [ ] **Step 4: Naikkan batas pool**

`packages/db/src/index.ts:9` → `postgres(url, { prepare: false, max: 16 })`, dengan komentar: `// 16 = 10 untuk satu gelombang dashboard + cadangan pengguna kedua (spesifikasi §5.6). prepare:false wajib untuk PgBouncer transaction mode.`

- [ ] **Step 5: Perbarui label hop** — `app/+page.server.ts`: `6` → `2`; `api/ringkasan/+server.ts`: `6` → `2`.

- [ ] **Step 6: Jalankan ulang — wajib tetap PASS**

Run: `bun scripts/verifikasi-dashboard.ts`
Expected: PASS (sama seperti Step 2).

- [ ] **Step 7: `bun run check`** → Expected: 0 error.

- [ ] **Step 8: Diff response terhadap baseline**

`loadRingkasan` menyumbang `/api/ringkasan`, jadi perubahan Task 3 harus terbukti identik di sini, bukan menumpuk ke Task 4.

```bash
bun run dev                    # background, workdir: apps/web
SESSION=<token cookie session> bun scripts/banding-respon.ts banding
```
Expected: `IDENTIK` untuk keempat endpoint, exit 0. (Empat endpoint baseline: `/api/dompet`, `/api/ringkasan`, `/api/transaksi`, `/api/tagihan`.)

- [ ] **Step 9: Commit (tanpa push)**

```bash
git add apps/web/src/lib/server/dashboard.ts packages/db/src/index.ts apps/web/scripts/verifikasi-dashboard.ts apps/web/src/routes/app/+page.server.ts apps/web/src/routes/api/ringkasan/+server.ts
git commit -m "perf(dashboard): satu gelombang query + pool max 16"
```

---

### Task 4: Paralelisasi halaman `app/*` dan endpoint baca

**Files:**
- Modify: `apps/web/src/routes/app/transaksi/+page.server.ts`
- Modify: `apps/web/src/routes/app/tagihan/+page.server.ts`
- Modify: `apps/web/src/routes/api/dompet/+server.ts`
- Modify: `apps/web/src/routes/api/tagihan/+server.ts` (`GET` saja, baris 9–31)

**Interfaces:**
- Consumes: `daftarDompetDenganSaldo(database: Db)` (Task 2), `header(t0, hop)` (Task 1), baseline dari `banding-respon.ts simpan` (Task 1).
- Produces: bentuk response semua endpoint tidak berubah.

- [ ] **Step 1: `app/transaksi/+page.server.ts` — satu `Promise.all`**

Pindahkan loop `saldoDompet` (`dompetOut`) dan kedua query `sum` ke dalam `Promise.all` yang sudah ada bersama 4 query pertama, memakai `daftarDompetDenganSaldo(db)`. Label hop `4` → `2`.

- [ ] **Step 2: `app/tagihan/+page.server.ts` — satu `Promise.all`**

Masukkan `sudah` (baris 54) dan penggantian loop `dompets` (baris 61) ke `Promise.all` yang sama. Label hop `4` → `2`.

- [ ] **Step 3: `api/dompet/+server.ts` — pakai primitive**

Ganti baris 10–12 jadi `daftarDompetDenganSaldo(db)` lalu petakan ke shape `{ id_dompet, nama_dompet, saldo }`. Label hop `3` → `2`.

- [ ] **Step 4: `api/tagihan/+server.ts` — `list` dan `sudah` paralel**

`const [list, sudah] = await Promise.all([...])`. Tanpa instrumen (di luar daftar spec §5.5).

- [ ] **Step 5: Verifikasi identitas response terhadap baseline**

```bash
bun run dev                    # background, workdir: apps/web
SESSION=<token cookie session> bun scripts/banding-respon.ts banding
```
Expected: `IDENTIK` untuk keempat endpoint, exit 0.

- [ ] **Step 6: `bun run check`** → Expected: 0 error.

- [ ] **Step 7: Commit (tanpa push)**

```bash
git add apps/web/src/routes/app apps/web/src/routes/api/dompet apps/web/src/routes/api/tagihan
git commit -m "perf(baca): gabung query halaman dan endpoint baca ke satu gelombang"
```

---

### Task 5: Jalur tulis

**Files:**
- Modify: `apps/web/src/routes/api/transaksi/+server.ts` (`POST`, baris 95–115)
- Modify: `apps/web/src/routes/api/transaksi/[id]/+server.ts` (`PATCH`, baris 60–83)
- Modify: `apps/web/src/routes/api/utang/[id]/bayar/+server.ts` (baris 29–52)
- Modify: `apps/web/src/routes/api/tagihan/[id]/bayar/+server.ts` (baris 33–55)

**Interfaces:**
- Consumes: `saldoDompet(database, id)` (tetap, untuk cek satu dompet).
- Produces: kode status dan pesan error tiap endpoint tidak berubah (`INSUFFICIENT_BALANCE`, `OVERPAY`, `ALREADY_PAID`, `INVALID_WALLET`, `INVALID_CATEGORY`).

- [ ] **Step 1: `POST /api/transaksi` — validasi paralel**

Satu `Promise.all` berisi `dompet`, `kategori`, dan `saldoDompet(id_dompet)` di antara `currentUser` dan `insert`. Pemeriksaan `body.tipe === 'keluar' && body.jumlah > saldo` tetap dievaluasi **sebelum** `db.insert`. Hop 5 → 3.

- [ ] **Step 2: `PATCH /api/transaksi/[id]` — validasi paralel**

Setelah baris `lama` terbaca, satu `Promise.all` untuk `dompet`, `kategori`, `saldoDompet(body.id_dompet)`, dan (bila dompet berubah) `saldoDompet(lama.dompetId)`. Perhitungan `saldoBaru`/`saldoAsal` tetap sebelum `db.update`. Hop ~7 → 4.

- [ ] **Step 3: `POST /api/utang/[id]/bayar` — validasi paralel**

Setelah `row` dan `sisa` terbaca: `Promise.all` untuk `dompet`, query `kategori` ("Bayar Utang"/"Terima Piutang"), dan `saldoDompet`. Hop 7 → 5.

- [ ] **Step 4: `POST /api/tagihan/[id]/bayar` — validasi paralel**

Setelah `row` dan `ada` terbaca: `Promise.all` untuk `dompet`, `saldoDompet(id_dompet)`. Hop ~8 → 5. Urutan `ALREADY_PAID` → `INVALID_WALLET` → `INSUFFICIENT_BALANCE` → `insert` dipertahankan.

- [ ] **Step 5: `bun run check`** → Expected: 0 error.

- [ ] **Step 6: Inspeksi urutan (pengganti test yang tidak bisa dibuat otomatis)**

Untuk keempat file, konfirmasi pada diff: tidak ada `db.insert`/`db.update` yang berada **sebelum** pemeriksaan saldo pada file yang sama. Kembalikan diff bila ada satu pun melanggar.

- [ ] **Step 7: Commit (tanpa push)**

```bash
git add apps/web/src/routes/api
git commit -m "perf(tulis): paralelkan validasi tanpa mengubah urutan cek saldo"
```

---

### Task 6: Verifikasi akhir, push, dan ukur ulang

**Files:** tidak ada perubahan kode — murni verifikasi dan pengukuran.

**Interfaces:**
- Consumes: seluruh script Task 1–4, baseline produksi dari Task 1 Step 9.

- [ ] **Step 1: Jalankan semua verifikasi otomatis**

```bash
bun scripts/verifikasi-saldo.ts         # workdir: apps/web
bun scripts/verifikasi-dashboard.ts     # workdir: apps/web
bun run check
```
Expected: ketiganya exit 0.

- [ ] **Step 2: Diff response JSON lokal**

```bash
bun run dev                                  # background
SESSION=<token cookie session> bun scripts/banding-respon.ts banding
```
Expected: `IDENTIK` × 4.

- [ ] **Step 3: Uji negatif saldo (jalankan PEMILIK, lihat Review Focus #2)**

`POST /api/transaksi` dengan `jumlah` jauh melebihi saldo dompet → wajib `400 INSUFFICIENT_BALANCE` dan jumlah baris transaksi tidak bertambah. Bila baris sempat terbuat, hapus lewat UI Transaksi.

- [ ] **Step 4: Smoke test (jalankan PEMILIK)**

Buka Dashboard, Transaksi, Anggaran, Utang, Tagihan; tambah lalu hapus satu transaksi; bayar satu utang; bayar satu tagihan; geser bulan.

- [ ] **Step 5: Push dan ukur ulang**

```bash
git status --porcelain        # wajib tidak ada .baseline/
git push
# tunggu build Vercel selesai
SESSION=<token cookie session> BASE=https://keuangan-keluarga-chi.vercel.app bun scripts/banding-respon.ts ukur
```

- [ ] **Step 6: Bandingkan dengan baseline Task 1 Step 9**

Seluruh angka `dur` wajib turun dan seluruh label `desc` wajib cocok dengan tabel di Review Focus #5. Catat hasilnya di chat — inilah bahan keputusan apakah Pendekatan 2 (spec §9) layak dibayar.

---

## Laporan eksekusi (ditulis setelah run — bukan bagian rencana asli)

**Semua task selesai, terverifikasi, dan ter-deploy.** Urutan komit nyata:

| Komit | Isi | Push |
|---|---|---|
| `b3d73ff` | Task 1: instrumen + `banding-respon.ts` + `.gitignore` | bersama `8796416` |
| `8029fd2` | Task 2–4 sebagian: `saldoSemuaDompet`, dashboard, halaman, pool 16 | bersama |
| `10030b9` | Task 5: lima endpoint tulis paralel + `verifikasi-tulis.ts` | bersama |
| `8796416` | laporan batch digabung + GET tagihan paralel | `f46b682..8796416` |
| `aa2a36a` | fix zona waktu `iso()` (spec §9.1) | bersama `f0231c1` |
| `ec16a8a` | batch `PATCH /api/dompet` + 3 kasus harness | bersama |
| `f0231c1` | instrumen 6 endpoint tulis + `ukur-tulis.ts` | `8796416..f0231c1` |

**Deviasi terhadap rencana asli:**

1. **`verifikasi-saldo.ts` tidak pernah dibuat.** Orakel per-id malah jadi bagian dari
   `verifikasi-dashboard.ts` (Task 3 Step 1), dan diff response lewat `banding` —
   keduanya lebih menjanjikan karena memverifikasi perilaku utuh, bukan fungsi terisolir.
2. **Cakupan melebar** (semua disetujui pemilik lewat question): batching `GET /api/laporan`,
   `POST /api/transfer`, `app/dompet`, instrumen seluruh endpoint GET + tulis (spec §5.4),
   batch `PATCH /api/dompet`, dan fix zona waktu `iso()`.
3. **Push dua tahap, bukan satu** di Task 6: pertama `f46b682..8796416` (angka before/after
   halaman), lalu `8796416..f0231c1` (susulan). Hanya `main` yang di-push — branch
   `perf/optimasi-latensi` sengaja tidak di-push agar tidak memicu build preview kedua.
4. **Insiden baseline `laporan`:** `banding` produksi sempat `BEDA` di `saldoAwal`
   (743815 vs 631815) — ternyata zona waktu (spec §9.1), bukan regresi. Baseline
   `.baseline/laporan.json` **direkam ulang dengan kode lama `b3d73ff` di bawah
   `TZ=UTC`** supaya tetap sah sebagai pembanding "sebelum", lalu `banding` IDENTIK ×5
   di lokal dan produksi. Sesudah fix `iso()`, dev di bawah WIB pun IDENTIK ×5 tanpa
   perlu `TZ=UTC`.
5. **Label hop di Task 1 beda dengan tabel rencana.** Tabel Step 5 menulis
   `6/4/4/6/3/2`; yang terpasang `3/3/3/2/2/2` karena merge `67a1c34` (dilakukan
   sebelum Step 5) sudah membawa `origin/main` yang separuh paralel. Nilai terpasang
   adalah yang **benar** (dihitung ulang dari jumlah gelombang nyata); setelah optimasi
   halaman berhenti di `2`. Jangan "dikembalikan" ke angka tabel.
6. **Baseline direkam dua kali:** kelima endpoint API dengan kode lama `b3d73ff`
   (lihat deviasi 4), lalu tiga halaman SSR (`__data.json`) dengan kode lama
   `f46b682` (checkout sementara 4 file → `simpan hal-*` → restore) setelah
   `banding-respon.ts` diperluas pada review akhir.

**Hasil verifikasi final (semua lulus):** `bun run check` 0 error / 27 warning ·
`verifikasi-dashboard` PASS 26 cek · `verifikasi-tulis` PASS 10/10 (nol baris baru) ·
`banding` IDENTIK ×8 (5 API + 3 halaman SSR) lokal **dan** produksi · angka before/after
di spec §10.

**Sisa yang belum dipilih pemilik:** naikkan pool 16 → 24; smoke test manual (spec §7);
keputusan Pendekatan 2 (angka sudah ada di spec §10).

---

## Tindak lanjut review akhir (reviewer segar `f46b682..2b29296`)

Verdict reviewer: **With fixes** — 0 Critical, 4 Important, 4 Minor. Seluruh invarian
utama (bentuk JSON, urutan galat, `validasi → insert`, `prepare:false`, tanpa baseline
ter-commit) lolos pemeriksaan kode. Yang ditindak:

| Temuan | Tindakan |
|---|---|
| **Imp.1** `ukur-tulis`/`verifikasi-tulis` memakai `jumlah: 999_999_999` — bisa menulis bila saldo melampaui angka itu; `ukur-tulis` juga tidak pernah asersi status | Diperbaiki: `jumlah = max(1, saldo + 1)` (penolakan terbangun dari konstruksi, bukan angka tetap) + `ukur-tulis` kini wajib cocok statusnya, keluar 1 kalau tidak (sorot khusus bila status 2xx) |
| **Imp.2** spec §5.2 kolom "Sebelum" memakai state **pra-merge**, bukan base `f46b682`; §5.4 salah menyebut `saldo.ts` & `app/dompet` sebagai file yang diubah | Diperbaiki: tabel dikoreksi + catatan delta nyata (halaman 3 → 2; ringkasan/dompet memang 2 → 2 — sebab itu §10 bilang "~sama"); daftar file dikoreksi |
| **Imp.3** deviasi label hop Task 1 tak tercatat | Dicatat sebagai deviasi #5 di atas |
| **Imp.4** perubahan `+page.server.ts` tanpa cakupan harness (`banding` hanya API) | Diperbaiki: `banding-respon.ts` kini membandingkan `__data.json` 3 halaman SSR + bisa difilter per nama; baseline direkam dari kode lama `f46b682`; **IDENTIK ×8** lokal |
| **Min.5** `.gitignore` hanya `apps/web/.baseline/` — skrip dijalankan dari root repo membuat `/.baseline/` tak ter-ignore | Diperbaiki: pola jadi `.baseline/` (kedalaman apa pun) |
| **Min.6** komentar pool "10 + 6" salah (gelombang dashboard = 11, laporan = 12) | Diperbaiki di `packages/db/src/index.ts` + spec §5.6 |
| **Min.7** `saldoSemuaDompet` ≠ `saldoDompet` pada transfer `asal == tujuan` (tak tercapai via API, ditolak `SAME_WALLET`) | Dicatat sebagai komentar catatan tepi di `saldo.ts` |
| **Min.8** kasus `WALLET_ARCHIVED` absen; `bulanDepan` bisa false-fail bila bulan depan sudah dibayar; orakel `listTagihan` tanpa join `kategori` | Tidak ditindak (catatan): kasus pertama butuh dompet terarsip yang mungkin tak ada, dua lainnya false-fail hanya pada data yang belum ada — bukan cacat perilaku aplikasi |

Temuan di luar range (reviewer sendiri menyetelnya aside, tidak diubah): bug zona waktu
serupa di `app/laporan/+page.svelte` (client) dan default `bulan`/`today` berbasis UTC
di beberapa endpoint — mengubahnya = mengubah nilai respons, dilarang spec §3. Layak
tiket terpisah bila pemilik mau.
