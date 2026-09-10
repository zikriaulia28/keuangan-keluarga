import { eq } from 'drizzle-orm';
import { db, dompet, kategori, users } from 'db';

// Akun default: ganti password setelah masuk (Halaman Pengguna).
const AKUN = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'istri', password: 'istri123', role: 'user' },
] as const;

const KATEGORI: { nama: string; tipe: 'masuk' | 'keluar' }[] = [
  { nama: 'Gaji', tipe: 'masuk' },
  { nama: 'Bonus', tipe: 'masuk' },
  { nama: 'Lainnya', tipe: 'masuk' },
  { nama: 'Terima Piutang', tipe: 'masuk' },
  { nama: 'Belanja', tipe: 'keluar' },
  { nama: 'Listrik', tipe: 'keluar' },
  { nama: 'Air', tipe: 'keluar' },
  { nama: 'Sekolah', tipe: 'keluar' },
  { nama: 'Transport', tipe: 'keluar' },
  { nama: 'Kesehatan', tipe: 'keluar' },
  { nama: 'Hiburan', tipe: 'keluar' },
  { nama: 'Bayar Utang', tipe: 'keluar' },
  { nama: 'Lainnya', tipe: 'keluar' },
];

for (const a of AKUN) {
  const ada = (await db.select().from(users).where(eq(users.username, a.username)).limit(1))[0];
  if (!ada) {
    await db.insert(users).values({
      username: a.username,
      passwordHash: await Bun.password.hash(a.password),
      role: a.role,
    });
    console.log(`user ${a.username} dibuat`);
  } else {
    console.log(`user ${a.username} sudah ada`);
  }
}

const dk = (await db.select().from(dompet).limit(1))[0];
if (!dk) {
  await db.insert(dompet).values({ nama: 'Kas Keluarga' });
  console.log('dompet Kas Keluarga dibuat');
} else {
  console.log('dompet sudah ada');
}

for (const k of KATEGORI) {
  const list = await db.select().from(kategori).where(eq(kategori.nama, k.nama)).limit(10);
  if (!list.some((r) => r.tipe === k.tipe)) await db.insert(kategori).values(k);
}
console.log('seed ok — GANTI password admin & istri setelah masuk');
