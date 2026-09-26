---
version: 1
slug: "src-routes-app-page-svelte"
primary_target: "src/routes/app/+page.svelte"
related_targets: ["src/routes/+page.svelte","src/routes/app/+layout.svelte","src/routes/app/transaksi/+page.svelte","src/routes/app/dompet/+page.svelte","src/routes/app/anggaran/+page.svelte","src/routes/app/utang/+page.svelte","src/routes/app/tagihan/+page.svelte","src/routes/app/pengguna/+page.svelte"]
---

# Surface brief — aplikasi Kas Keluarga (7 halaman + login)

## Scope and mode

Mode **Operate**. Full visual-world replacement across every surface: `/` (login), `/app` (dashboard), `/app/transaksi`, `/app/dompet`, `/app/anggaran`, `/app/utang`, `/app/tagihan`, `/app/pengguna`, plus the shared shell.

Frame is **mobile-first at 390px**; desktop is the secondary case and must be a widened expression of the same frame, never a different product. No function, API, data shape, or factual copy is removed. Every existing capability ships.

## Audience, job, action, constraints

Two people, one shared pot. The app is opened **immediately after a real transaction**, one-handed, standing, bright kitchen. Four jobs must be one tap away: catat transaksi, bayar tagihan, cek anggaran & saldo, utang/piutang. Constraints: Indonesian copy, whole rupiah, money right-aligned and bold, inline errors only (never `alert()`), every list needs loading/empty/error states, destructive actions confirm inline in two taps. Binding user constraints: **minimal iconography** and **mobile presentation first**.

## Chosen direction and memorable moment

**Kartu Bersih** (clean cards), user-locked 2026-09-26, code-led. Supersedes the earlier "Sempoa — papan hitung keluarga" direction, which the user rejected as too austere, too line-heavy, too dark, and too old-fashioned.

Memorable moment: `Sisa bulan ini` sits alone in the first card at display scale, the tabbed month load bar sits directly under it, and the one accent colour marks the active navigation pill and every primary action.

## Direction contract

THESIS: a clean card, not a counting frame. One white card owns the answer on a warm off-white ground, the way a banking app earns trust; it refuses the hairline-ruled ledger paper and the instrument metaphor that read as paperwork.

OWN-WORLD: warm off-white ground `#f6f6f4` and pure white cards with one soft offset shadow and no border; **one brand colour** — deep green `#0e7c55` for structure, income, active state, and primary actions; alert red `#c23b22` reserved for destructive actions, overdue, and over-budget only; status is always a literal Indonesian word, never colour alone; money and figures are one sans (Manrope) with tabular figures, right-aligned and bold; cards are the layout, with `.rows`/`.row` hairline separation inside them and never a card inside a card.

STORY: she returns from the market, opens Ringkasan, reads one number, taps Catat, fills four fields, and sees the month bar move. He opens it at night and sees the same card with bills due in red.

FIRST VIEWPORT (390px): month and name on one line with the month stepper; the first card holds `Sisa bulan ini` at display scale with a flat meter showing the share already spent; two supporting cards for Masuk and Keluar; then the combined wallet balance; then hairline-ruled cards for spending per category, budget, bills, and debts. Bottom nav is five items — `Ringkasan · Catat · Tagihan · Utang · Lainnya` — each an inline SVG glyph plus a literal label, the active one a filled green pill. Primary actions sit in the thumb zone, never at the top edge.

FORM: Kartu Bersih / clean card, code-led (no image generation in this environment). Navigation icons are hand-authored inline SVG in `apps/web/src/lib/components/NavIcon.svelte` at one stroke weight (2, viewBox 24, `currentColor`) because Material Symbols costs 316 KB woff2 for the five glyphs the mobile nav actually needs.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
## Unresolved decisions

- Whether push notifications stay user-facing or become an internal mechanism.
- Whether a per-person contribution breakdown is ever wanted. Both are open product questions from init and do not block this build.
