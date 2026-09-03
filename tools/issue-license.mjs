import crypto from 'node:crypto';
import fs from 'node:fs';

const PRODUCT_ID = 'omnimanager-botillerias';
const TOKEN_PREFIX = 'OMNI-BOT1';

const args = process.argv.slice(2);
const readArg = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};
const hasFlag = name => args.includes(`--${name}`);

const privateKeyPath = readArg('private-key') || process.env.OMNI_LICENSE_PRIVATE_KEY_PATH || '';
const machineId = String(readArg('machine') || '').trim().toUpperCase();
const plan = String(readArg('plan') || '').trim().toLowerCase();
const customer = String(readArg('customer') || '').trim();
const customDays = Number(readArg('days') || 0);
const notBeforeInput = readArg('not-before');

if (hasFlag('help') || !privateKeyPath || !machineId || !plan) {
  console.log(`Uso:\n  node tools/issue-license.mjs --private-key <archivo.pem> --machine OMB-XXXXXXXXXXXX --plan monthly|annual --customer "Cliente" [--days N] [--not-before ISO]\n\nTambién puedes definir OMNI_LICENSE_PRIVATE_KEY_PATH en vez de --private-key.`);
  process.exit(hasFlag('help') ? 0 : 1);
}

if (!/^OMB-[A-F0-9]{12}$/.test(machineId)) throw new Error('Código de PC inválido. Debe tener formato OMB-XXXXXXXXXXXX.');
if (!['monthly', 'annual'].includes(plan)) throw new Error('Plan inválido. Usa monthly o annual.');
if (!fs.existsSync(privateKeyPath)) throw new Error('No se encontró la llave privada indicada.');

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const issuedAt = new Date();
const notBefore = notBeforeInput ? new Date(notBeforeInput) : issuedAt;
if (Number.isNaN(notBefore.getTime())) throw new Error('Fecha --not-before inválida.');

const durationDays = Number.isFinite(customDays) && customDays > 0
  ? Math.round(customDays)
  : plan === 'annual' ? 365 : 30;
const expiresAt = new Date(notBefore.getTime() + durationDays * 24 * 60 * 60 * 1000);

const payload = {
  v: 1,
  product: PRODUCT_ID,
  licenseId: crypto.randomUUID(),
  machineId,
  plan,
  customer,
  issuedAt: issuedAt.toISOString(),
  notBefore: notBefore.toISOString(),
  expiresAt: expiresAt.toISOString()
};

const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const signature = crypto.sign(null, Buffer.from(encodedPayload, 'utf8'), privateKey).toString('base64url');
const token = `${TOKEN_PREFIX}.${encodedPayload}.${signature}`;

console.log(JSON.stringify({
  licenseId: payload.licenseId,
  machineId: payload.machineId,
  plan: payload.plan,
  customer: payload.customer,
  expiresAt: payload.expiresAt,
  token
}, null, 2));
