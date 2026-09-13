# Keuangan Keluarga

Website pencatatan keuangan keluarga (suami + istri). Mobile-first, 1 dompet **Kas Keluarga**, rupiah bulat.

## Stack

- **SvelteKit 5 + Svelte 5 runes** (`apps/web`) — halaman + API menyatu (server routes `/api/*`)
- **Tailwind CSS v4** — utility compiled, token di `apps/web/src/app.css`
- **Drizzle ORM + postgres.js** (`packages/db`) — skema bersama
- **PostgreSQL (Neon, region Singapore)** — database
- **Bun** — runtime dev + package manager (workspaces)

## Struktur

```
apps/web/            halaman + API + css (yang di-deploy ke Vercel)
  src/routes/        / (login), /app (dashboard, transaksi, anggaran, utang, tagihan, pengguna)
  src/routes/api/    endpoint: login, logout, me, dompet, kategori, transaksi,
                     ringkasan, anggaran, utang, tagihan, users
  src/lib/server/    auth (scrypt+sesi cookie), saldo
packages/db/         skema Drizzle (users, sessions, dompet, kategori,
                     transaksi, anggaran, utang, tagihan, tagihan_bayar)
design/              referensi desain Stitch (read-only)
PRD.md               PRD untuk desain
```

## Jalan lokal

```sh
bun install
# isi apps/web/.env dahulu (lihat .env.example):
#   DATABASE_URL=postgresql://...pooler...?sslmode=require
bun --filter db db:push     # migrasi skema ke Neon (sekali saja / saat skema berubah)
bun --filter web dev        # http://localhost:5173
```

## Deploy (Vercel)

1. Push repo ini ke GitHub.
2. Vercel → New Project → repo ini → Root Directory **`apps/web`**.
3. Environment Variable: **`DATABASE_URL`** (Neon pooled). Hanya itu.
4. Deploy. Runtime sudah dipin `nodejs22.x` di `svelte.config.js`.

## Fitur v1

Catat pemasukan/pengeluaran (saldo anti-minus) · anggaran bulanan + progress · utang/piutang + cicil otomatis · tagihan rutin + bayar otomatis · ringkasan + grafik CSS · akun tiap anggota (admin/user) · ganti password sendiri.
