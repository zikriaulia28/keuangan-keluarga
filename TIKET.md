# Tiket cleanup — over-engineering

Hasil `ponytail-audit` (repo-wide) + `ponytail-review` (diff b410c31).
Semua temuan diverifikasi terhadap kode. **Nol perubahan sudah diterapkan** — ini daftar saja.

Cara baca: `T<n>` = tiket, `L<line>` = lokasi, tag = `delete` / `shrink` / `stdlib` / `native` / `yagni`.

Syarat lulus semua tiket: `bun --filter web check` → 0 error, dan tidak ada perubahan yang terlihat oleh pengguna.

---

## Batch A — Kode mati (nol risiko, −40 baris)

Sudah 0 kemunculan di seluruh `src/`. Sisa dari redesign sebelum ikon dihapus. Hapus outright, tidak ada pengganti.

| Tiket | Lokasi | Temuan |
|---|---|---|
| T1 | `app/anggaran/+page.svelte` | `delete:` array `NAMA_BULAN` 12 string. `Intl.DateTimeFormat('id-ID',{month:'long'})`, `stdlib:` |
| T2 | `app/tagihan/+page.svelte:15` | `delete:` `NAMA_BULAN` — salinan T1. Hapus baris 15-18 |
| T3 | `app/tagihan/+page.svelte:19` | `delete:` `NAMA_BULAN_PENDEK` — array 13 string, ganti ke `Intl` |
| T4 | `app/anggaran/+page.svelte:34`<br>`app/tagihan/+page.svelte:54` | `delete:` `labelBulan()` — mati setelah T1-T3, hanya memanggil `NAMA_BULAN` |
| T5 | `app/tagihan/+page.server.ts:10` | `delete:` `bulanBerjalan()` — salinan identik dari `lib/server/dashboard.ts:16` yang sudah `export`. `shrink:` hapus, import yang ada |

**Nilai:** −40 baris. Tidak ada risiko. Tidak ada yang perlu diuji.

---

## Batch B — Duplikasi helper (risiko rendah, −75 baris)

Salinan literal, bukan "mirip". Bukti: `rg -n "function X"` menunjukkan definisi kembar.

| Tiket | Lokasi | Temuan |
|---|---|---|
| T6 | `app/{transaksi,utang,dompet,pengguna}/+page.svelte`<br>:40 :64 :55 :45 | `shrink:` `fmtTanggal()` ×4, 5 baris identik, beda hanya nama parameter (`tgl` vs `t`). Jadikan satu helper di `$lib/format.svelte`. −15 baris |
| T7 | `app/{+page,anggaran,tagihan}/+page.svelte`<br>:55 :29 :49 | `shrink:` `geser()`/`geserBulan()` ×3 di client — `lib/server/dashboard.ts:22` sudah jadi satu-satunya definisi server. Perlu versi client-shared karena `$lib/server` tidak bisa di-import ke komponen. −15 baris |
| T8 | `app/{anggaran,dompet,utang,pengguna,tagihan,transaksi}/+page.svelte` | `shrink:` `pesan()` ×6, 46 baris. 4 dari 6 memetakan kode error yang sama persis (`FORBIDDEN`, `NOT_FOUND`, `INSUFFICIENT_BALANCE`, `INVALID_WALLET`). Satu fungsi global + peta per halaman. −24 baris |
| T9 | `app/+page.svelte:117-118`<br>`app/transaksi/+page.svelte:132` | `delete:` `encodeURIComponent()` pada nilai `YYYY-MM`. String itu hanya digit dan `-`, jadi encoding-nya no-op. 3 call site, 0 baris |

**Nilai:** −54 baris setelah T6-T8. T9 nol baris tapi menghapus kebohongan.

**Catatan T8:** ini sentuh 6 file sekaligus. Residual error mapping per halaman tetap perlu (tiap halaman punya kode unik), jadi ini bukan "hapus semua" — tetapkan setiap halaman punya peta lokal kecil, hanya taruh yang identik di global.

---

## Batch C — Layer ganda (perlu keputusan Anda, −40 baris)

| Tiket | Lokasi | Temuan |
|---|---|---|
| T10 | `app/tagihan/+page.svelte:136-151` | `yagni:` 16 baris menarik `/api/transaksi?limit=500` lalu mencocokkan teks `catatan === \`Tagihan X YYYY-MM\`` untuk membangun `via`. `+page.server.ts:44-52` **sudah** menghitung `via` yang sama via JOIN `tagihan_bayar.transaksi_id`. Hapus blok client, pakai `data.via` yang sudah dikirim |
| T11 | `api/ringkasan/+server.ts` | `yagni:` endpoint 12 baris, satu caller (`app/transaksi/+page.svelte:132`) yang butuh 2 angka. Halaman itu sudah punya `+page.server.ts` yang bisa mengembalikan `statMasuk`/`statKeluar` — dan memang sudahLt dúvidas, tapi aman: file-nya sudah di-load. Hapus route, pindahkan 2 field ke return load |
| T12 | `api/**/+server.ts` ×10 | `delete:` `const BULAN` / `const TGL` — 10 definisi regex identik, 1 baris each. Satu `const TGL_BULAN` di `$lib/server/validasi.ts`. −10 baris |
| T13 | `app/{+,transaksi,tagihan,dompet,pengguna}/+page.server.ts` | `shrink:` 5 file mengulang 3 baris identik: `currentUser` + `redirect(302,'/')` + parse `bulan` + regex `BULAN`. Satu `+layout.server.ts`_HOOK menghapus semua. −15 baris. **Pakai `hooks.server.ts`, bukan `+layout.server.ts`** — layout load tidak jalan untuk navigasi client-side, hook selalu jalan |
| T14 | `lib/server/saldo.ts:7` | `shrink:` `saldoDompet()` dan `saldoSemuaDompet()` dua implementasi query saldo. Yang kedua bisa melayani yang pertama: `(await saldoSemuaDompet(db)).get(id) ?? 0`. Hapus 15 baris. Caller yang ada (6 lokasi) tidak berubah |

**Nilai:** −52 baris. T10 dan T14 paling aman; T11/T13 mengubah arsitektur routing sehingga perluetest manual setelahnya.

---

## Batch D — Keputusan produk (bukan refactor, perlu Anda)

Tidak dihitung di net. Dua hal ini är feature, bukan kompleksitas — saya tidak akan|hapus tanpa izin.

| Tiket | Lokasi | Isu |
|---|---|---|
| T15 | `static/sw.js` + `lib/server/push.ts` + `api/push/*` + `api/cron/*` | Jalur notifikasi push lengkap: 31 + 110 + 3 file route + `web-push` dependency + `VAPID_*` dari env. `PRODUCT.md` sendiri menandai push sebagai *"open product decision: apakah masih user-facing atau jadi mekanisme internal saja"*. Kalau diputuskan keluar: −170 baris, **−1 dependency**, hapus `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` dari deployment |
| T16 | `app/lainnya/+page.svelte` (70 baris) | Halaman aggregator yang saya buat minggu ini. Dompet/Anggaran/Pengguna bisa masuk sidebar desktop langsung, dan di mobile cukup 6 item di nav bawah — halaman ini tidak wajib ada. Saya admit ini出生 dari asumsi "7 item tidak muat", dan REVIEW Anda memang membuktikan nav 7 item bisa muat setelah saya perkecil label ke `text-[10px]` |

---

## Total

| Batch | Baris | Risiko |
|---|---|---|
| A — kode mati | −40 | nol |
| B — duplikasi | −54 | rendah |
| C — layer ganda | −52 | sedang, T10/T14 aman |
| **net (A+B+C)** | **−146** | |
| D — opsional | −240 | perlu keputusan produk |

Angka repo-wide sebelumnya −197 sekarang −146 setelah verifikasi ulang: sebagian temuan awalturned out sudah dibersihkan subagent sebelumnya (`ikonKategori`, `ikonDompet`, `ikonTagihan`, `inisial` — 0 kemunculan, sudah tidak ada). Angka yang saya laporkan di audit tidak menghitung ulang setelah itu, jadi ini yang akurat.

---

## Saran urutan

**A dulu.** Nol risiko, −40 baris, tidak ada yang perlu dites ulang selain `check`. Setelah itu berhenti dan pakai aplikasinya beberapa hari — kalau tidak ada masalah, lanjutkan B. C dan D menunggu keputusan Anda.
