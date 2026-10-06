import 'dotenv/config';
import { z } from 'zod';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
async function main() {
  const input = z
    .object({
      email: z.email(),
      password: z.string().min(14),
      name: z.string().min(1),
      role: z.enum(['ADMIN', 'FINANCE', 'VIEWER']).default('VIEWER'),
      holdingId: z.string().default('gozo'),
    })
    .parse({
      email: process.env.NEW_USER_EMAIL,
      password: process.env.NEW_USER_PASSWORD,
      name: process.env.NEW_USER_NAME,
      role: process.env.NEW_USER_ROLE,
      holdingId: process.env.NEW_USER_HOLDING,
    });
  await db.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      holdingId: input.holdingId,
      passwordHash: hashPassword(input.password),
    },
  });
  console.log('Usuario creado.');
}
main().finally(() => db.$disconnect());
