import 'dotenv/config';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
const names = [
  ['ehg', 'EHG', 'EHG Chile SpA'],
  ['superlogistics', 'Superlogistics', 'Superlogistics Chile SpA'],
  ['rental-pro', 'Rental Pro', 'Rental Pro Chile SpA'],
  ['eventure', 'Eventure', 'Eventure SpA'],
  ['rrhi', 'RRHI', 'RRHI Chile SpA'],
  ['gozo', 'Gozo Chile', 'Gozo Chile SpA'],
  ['dce', 'DCE Inversiones', 'DCE Inversiones SpA'],
  ['costa', 'Inversiones Costa', 'Inversiones Costa SpA'],
  ['mantagua', 'Mantagua', 'Inversiones Hoteleras Mantagua'],
  ['mixes', 'Mixes', 'Mixes SpA'],
];
const banks = [
  ['chile', 'Banco de Chile', 'cl_banco_de_chile'],
  ['bci', 'BCI', 'cl_banco_bci'],
  ['bice', 'BICE', 'cl_banco_bice'],
  ['itau', 'Itaú', 'cl_banco_itau'],
];
const configs = [
  ['ehg', 'chile', 'EHG_CHILE'],
  ['superlogistics', 'chile', 'SUPERLOGISTICS_CHILE'],
  ['rental-pro', 'chile', 'RENTAL_PRO_CHILE'],
  ['eventure', 'chile', 'EVENTURE_CHILE'],
  ['rrhi', 'chile', 'RRHI_CHILE'],
  ['gozo', 'chile', 'GOZO_CHILE'],
  ['dce', 'chile', 'DCE_CHILE'],
  ['dce', 'bice', 'DCE_BICE'],
  ['eventure', 'bci', 'EVENTURE_BCI'],
  ['costa', 'bci', 'COSTA_BCI'],
  ['costa', 'chile', 'COSTA_CHILE'],
  ['mantagua', 'itau', 'MANTAGUA_ITAU'],
  ['mixes', 'itau', 'MIXES_ITAU'],
];
async function main() {
  if (process.env.DEMO_MODE === 'true')
    throw new Error('Bootstrap requiere DEMO_MODE=false y una base de producción separada');
  await db.holding.upsert({
    where: { id: 'gozo' },
    create: { id: 'gozo', name: 'Holding Gozo' },
    update: {},
  });
  for (const [id, displayName, legalName] of names)
    await db.company.upsert({
      where: { id },
      create: { id, displayName, legalName, holdingId: 'gozo' },
      update: {},
    });
  for (const [id, name, providerInstitutionId] of banks)
    await db.bankInstitution.upsert({
      where: { id },
      create: { id, name, code: id, providerInstitutionId },
      update: {},
    });
  for (const [companyId, institutionId, suffix] of configs) {
    const id = `${companyId}-${institutionId}`;
    await db.bankConnection.upsert({
      where: { id },
      create: {
        id,
        companyId,
        institutionId,
        provider: 'FINTOC',
        credentialKey: `FINTOC_LINK_${suffix}`,
        errorMessage: 'Pendiente de primera sincronización',
      },
      update: {},
    });
  }
  const email = process.env.ADMIN_EMAIL?.toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 14) throw new Error('ADMIN_PASSWORD requiere al menos 14 caracteres');
    await db.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash: hashPassword(password),
        name: 'Administrador Gozo',
        holdingId: 'gozo',
        role: 'ADMIN',
      },
      update: {},
    });
  }
  console.log(
    'Holding, 10 empresas y 13 conexiones registradas. Faltan credenciales si no están configuradas.',
  );
}
main().finally(() => db.$disconnect());
