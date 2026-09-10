import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diisi (lihat .env.example)');

const client = postgres(url, { prepare: false });
export const db = drizzle(client, { schema });
export * from './schema';
