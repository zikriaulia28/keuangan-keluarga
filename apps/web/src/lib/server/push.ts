import webpush from 'web-push';
import { db, pushSubscriptions, tagihan, tagihanBayar, kategori, users } from 'db';
import { eq, and, sql } from 'drizzle-orm';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const MAILTO = process.env.VAPID_SUBJECT ?? 'mailto:zikriaulia28@gmail.com';

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(MAILTO, PUBLIC_KEY, PRIVATE_KEY);
}

export function vapidConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return PUBLIC_KEY;
}

export async function simpanSubscription(userId: number, sub: PushSubscriptionJSON) {
  const { endpoint, keys } = sub;
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error('SUBSCRIPTION_INVALID');
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });
}

export async function hapusSubscription(endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

function rupiah(n: number) {
  return `Rp${n.toLocaleString('id-ID')}`;
}

function bulanIndo(bulan: string) {
  const [y, m] = bulan.split('-').map(Number);
  const nama = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${nama[m - 1]} ${y}`;
}

function hariIniJakarta(): { y: number; m: number; d: number; bulan: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(now).split('-').map(Number);
  return { y, m, d, bulan: `${y}-${String(m).padStart(2, '0')}` };
}

export async function cekDanKirimPengingat(): Promise<{ dikirim: number; dihapus: number; detail: string[] }> {
  if (!vapidConfigured()) throw new Error('VAPID keys not configured');

  const { y, m, d, bulan } = hariIniJakarta();
  const maxHari = new Date(y, m, 0).getDate();

  // Ambil semua tagihan + kategori
  const semuaTagihan = await db
    .select({ id: tagihan.id, nama: tagihan.nama, jumlah: tagihan.jumlah, hari: tagihan.hari, kat: kategori.nama })
    .from(tagihan)
    .innerJoin(kategori, eq(tagihan.kategoriId, kategori.id));

  // Ambil yang sudah dibayar bulan ini
  const sudah = await db
    .select({ tagihanId: tagihanBayar.tagihanId })
    .from(tagihanBayar)
    .where(eq(tagihanBayar.bulan, bulan));
  const lunasSet = new Set(sudah.map((s) => s.tagihanId));

  const items: Array<{ nama: string; jumlah: number; selisih: number }> = [];
  for (const t of semuaTagihan) {
    if (lunasSet.has(t.id)) continue;
    const due = Math.min(t.hari, maxHari);
    const selisih = due - d;
    if (selisih > 3) continue; // lebih dari 3 hari ke depan -> lewati
    items.push({ nama: t.nama, jumlah: t.jumlah, selisih });
  }

  if (items.length === 0) return { dikirim: 0, dihapus: 0, detail: ['Tidak ada tagihan jatuh tempo'] };

  const label = (s: number) =>
    s < 0 ? `telat ${-s} hari` : s === 0 ? 'jatuh tempo hari ini' : s === 1 ? 'jatuh tempo besok' : `${s} hari lagi`;

  const baris = items.slice(0, 3).map((i) => `- ${i.nama}: ${label(i.selisih)} (${rupiah(i.jumlah)})`).join('\n');
  const tail = items.length > 3 ? `\n+${items.length - 3} tagihan lainnya` : '';
  const payload = JSON.stringify({
    title: `Pengingat Tagihan — ${bulanIndo(bulan)}`,
    body: baris + tail,
    url: '/app/tagihan',
  });

  const subs = await db.select().from(pushSubscriptions);
  let dikirim = 0;
  let dihapus = 0;
  const detail: string[] = [];

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600 }
      );
      dikirim++;
      detail.push(`OK: ${s.endpoint.slice(0, 40)}...`);
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await hapusSubscription(s.endpoint);
        dihapus++;
        detail.push(`HAPUS 410: ${s.endpoint.slice(0, 40)}...`);
      } else {
        detail.push(`ERR ${status ?? '?'}: ${s.endpoint.slice(0, 40)}...`);
      }
    }
  }
  return { dikirim, dihapus, detail };
}