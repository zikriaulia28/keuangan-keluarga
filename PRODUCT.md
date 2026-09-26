# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Exactly two people: a married couple sharing one household pot of money.

- **Admin** — the husband. Full access: manages budgets, bill masters, wallets, and user accounts.
- **User** — the wife. Records transactions, debts, and bill payments; changes her own password.

Confirmed primary situation (2026-09-26): the app is opened **immediately after a real-world transaction happens** — coming back from the market, paying the electric bill, receiving cash. That moment is one-handed, on a phone, and the entry is not done yet. The secondary moments are end-of-day reconciliation and reviewing things together on one shared phone.

Both roles are active; the admin is not the only user. There are no other audiences.

## Product Purpose

A shared household ledger for one family. It exists so that two people can see the same cash position without arguing about who spent what, and so that recurring obligations (bills, debts) are paid on time instead of being forgotten.

Success means: a transaction takes seconds to record on a phone, the balance is never wrong, and both partners can answer "how much money do we have and what is due" from the first screen.

## Positioning

A **single shared pot** — not a multi-person budgeting tool, not a bank app, not an expense tracker with social or gamified features. The differentiating mechanism is **automatic coupling**: paying a bill or settling a debt also writes a transaction, so the ledger can never disagree with the obligations list. The balance is anti-minus (an expense can never push a wallet below zero), which is a hard product rule, not a display choice.

Terminology is fixed and Indonesian: **Kas Keluarga** (the app and its main pot), dompet, kategori, masuk/keluar, anggaran, utang/piutang, tagihan, lunas/belum, lewat (over budget).

## Operating Context

- Language of the entire product is Indonesian. Copy is plain and direct, never cute or idiomatic-English.
- Money is always whole rupiah, formatted `Rp 5.000.000`, and **always right-aligned and bold** in lists.
- A month is the primary reporting period; nearly every surface is scoped to a selectable month, and the current month is the default.
- The wife and husband both add entries, so every record carries its author (pencatat) and is attributed, not anonymous.
- Push notifications are a real shipped feature: a daily 08:00 reminder for bills due within 3 days or already overdue.
- Multi-wallet plus inter-wallet transfer is shipped. Moving money between wallets must not change the family's total balance.
- Every error is shown **inline, in place, in Indonesian** — never a browser `alert()`/`confirm()` dialog. Destructive actions use an inline two-step confirmation.
- Every list surface must have loading, empty, and inline-error states.

## Capabilities and Constraints

Confirmed capabilities (all shipped in `apps/web`):

- Login with username + password (scrypt hash, session cookie), logout, session probe.
- Role model: `admin` and `user`; admin-only surfaces are users, budgets, bill masters, and wallet administration.
- Transactions: create, edit, delete, filter by date range and type, text search, cursor pagination, per-wallet balance display, and live "insufficient balance" feedback before submit.
- Wallets: multiple wallets, create, rename, archive/activate, inter-wallet allocation with its own history and cancellation.
- Categories: `masuk` and `keluar` sets; category selection follows the transaction type.
- Monthly budget limits per expense category, with used/limit progress and an over-budget state; admin writes, everyone reads.
- Debts and receivables: direction (we owe / they owe us), counterparty, total, partial payments in installments, due date, notes. A payment auto-records a transaction (out for debt, in for receivable) and can settle a record in stages.
- Recurring bills: master records with a monthly due day, per-month paid/unpaid state, and a one-tap "pay this month" that auto-records the outgoing transaction and marks the bill paid.
- Summary API: income, expense, remainder, previous-month comparison, spending per category, budget usage, wallet balances.
- Users: list, add, delete (with last-admin and self-delete guards), and change-own-password.

Hard constraints:

- SvelteKit 5 + Svelte 5 runes; pages and API live together as server routes under `/api/*`.
- Tailwind CSS v4; all design tokens live in `apps/web/src/app.css`.
- Drizzle ORM + PostgreSQL (Neon, Singapore region) via `packages/db`; schema is shared.
- Deployed to Vercel with root directory `apps/web`; the only required environment variable is `DATABASE_URL`.
- TypeScript throughout; `svelte-check` and `eslint` are the verification commands.
- Explicitly out of scope and not to be designed: PDF/Excel export, receipt photos, multi-language, dark mode.

Open product decisions (not yet decided, recorded rather than invented):

- Whether push notifications remain user-facing or become an internal mechanism only.
- Whether the second member should ever be able to see per-person contribution breakdowns.

## Brand Commitments

- Product name: **Kas Keluarga**. The logo asset is `apps/web/static/logo.png`; it is the only brand mark and must continue to appear on the login screen and in the app's identity area.
- Voice: plain, warm, adult Indonesian. Short sentences. No exclamation-mark enthusiasm, no English UI terms, no emoji.
- Binding visual constraints stated by the user (2026-09-26):
  - **Mobile presentation is the priority.** The phone in one hand is the primary frame; desktop is the secondary case.
  - **Minimal iconography.** The user does not want an icon-heavy interface. Icon use must be sparing and functional, never decorative.
- Content truth is binding: existing factual copy, Indonesian wording, and data semantics are preserved by redesign work. Rewriting product claims or copy requires asking first.

## Evidence on Hand

- `PRD.md` — per-page specification and out-of-scope list. Authoritative for v1 scope.
- `README.md` — stack, structure, local run, deploy.
- `design/` — read-only Stitch reference exports (HTML + `screen.png`) for seven screens, plus `design/family_finance/DESIGN.md` describing the previous design system. These are prior art and inspiration, not current authority.
- `apps/web/src/routes/**` — the running incumbent implementation; the only proof of what actually works.
- Live household data in the user's own Neon database. Real numbers, real counterparties.
- **No** testimonials, customer logos, case studies, press, usage analytics, or pricing exist. Any future surface must not fabricate them, and must not imply the product has been validated beyond its one real household.

## Product Principles

1. **Record first, analyse second.** The fastest path from "I just spent money" to "it is written down" outranks every analytical view. Anything that adds a step to that path is a regression.
2. **One shared truth, attributed.** Both partners see the same ledger; every entry shows who wrote it. No private views, no per-person budgets.
3. **Obligations are first-class.** Bills and debts have their own surfaces and their own states because forgetting them costs real money; they are not just transactions with a category.
4. **The balance never lies.** Anti-minus saldo and automatic coupling from payments to transactions are non-negotiable product rules, not implementation details.
5. **No dead ends and no dialogs.** Loading, empty, and error states are part of the feature. Every action is reversible or explicitly confirmed inline.

## Accessibility & Inclusion

Derived from the confirmed one-handed, on-the-go phone usage rather than from a formal standard:

- Primary actions must sit within thumb reach on a phone, not at the top edge.
- Interactive targets must be comfortably tappable, not hairline tap zones.
- Money and status must never be communicated by colour alone; a word or number carries the same meaning.
- The two partners are the only users, but they are not assumed to be technical readers, so labels stay literal and unjargoned.
