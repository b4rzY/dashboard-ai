import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { gozoDb?: PrismaClient };
export const db = globalDb.gozoDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.gozoDb = db;
