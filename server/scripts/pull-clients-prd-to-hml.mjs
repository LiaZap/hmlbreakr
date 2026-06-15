/**
 * pull-clients-prd-to-hml.mjs — copia ALGUNS clientes do PRD para o HML.
 *
 * PRD = READ-ONLY (só SELECT). Tudo que escreve vai pro HML. Idempotente
 * (ON CONFLICT DO NOTHING) e ADITIVO (não apaga o que já está no HML).
 *
 * Copia, por cliente: a linha Client (com o blob) + todas as tabelas do BPO
 * ligadas a ele (diretas por clientId e indiretas via Payable/Receivable/
 * BankAccount), preservando os ids (pra as FKs baterem). A checagem de FK é
 * desligada durante a carga (session_replication_role=replica — exige superuser
 * no HML; o user `postgres` é).
 *
 * As tabelas NORMALIZADAS (Ingredient, IngredientComponent, fichas…) NÃO são
 * copiadas — são projeção do blob. Rode `npm run db:backfill` depois pra gerá-las.
 *
 * USO (PowerShell):
 *   $env:PRD_DATABASE_URL = "postgres://...PRD..."
 *   $env:HML_DATABASE_URL = "postgres://...HML externo..."
 *   node scripts/pull-clients-prd-to-hml.mjs --list                 # lista os clientes do PRD
 *   node scripts/pull-clients-prd-to-hml.mjs --recent=5             # os 5 mais recentes
 *   node scripts/pull-clients-prd-to-hml.mjs --hashes=h1,h2,h3      # por hash
 *   node scripts/pull-clients-prd-to-hml.mjs --names="Itálico,Cantina"
 *   (adicione --dry pra só mostrar o que copiaria, sem escrever)
 */
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const has = (k) => process.argv.includes(`--${k}`);

const PRD = process.env.PRD_DATABASE_URL;
const HML = process.env.HML_DATABASE_URL;
if (!PRD) { console.error('Defina PRD_DATABASE_URL'); process.exit(2); }

const prd = new Pool({ connectionString: PRD });

// ── --list: só lista os clientes do PRD ─────────────────────────────────────
if (has('list')) {
  const r = await prd.query(`SELECT name, hash, "createdAt" FROM "Client" ORDER BY "createdAt" DESC`);
  console.log(`Clientes no PRD (${r.rowCount}):\n`);
  for (const c of r.rows) console.log(`  ${String(c.createdAt).slice(0,10)}  ${c.hash}  ${c.name}`);
  await prd.end();
  process.exit(0);
}

if (!HML) { console.error('Defina HML_DATABASE_URL'); process.exit(2); }
if (HML === PRD) { console.error('HML == PRD. ABORTADO (nunca escrever no PRD).'); process.exit(2); }

// ── Resolve os clientes selecionados ────────────────────────────────────────
let rows;
if (has('all')) {
  rows = (await prd.query(`SELECT id, name, hash FROM "Client" ORDER BY name`)).rows;
} else if (arg('hashes')) {
  const hashes = arg('hashes').split(',').map((s) => s.trim()).filter(Boolean);
  rows = (await prd.query(`SELECT id, name, hash FROM "Client" WHERE hash = ANY($1::text[])`, [hashes])).rows;
} else if (arg('names')) {
  const names = arg('names').split(',').map((s) => `%${s.trim()}%`).filter((s) => s !== '%%');
  rows = (await prd.query(`SELECT id, name, hash FROM "Client" WHERE name ILIKE ANY($1::text[]) ORDER BY name`, [names])).rows;
} else if (arg('recent')) {
  const n = Math.max(1, parseInt(arg('recent'), 10) || 5);
  rows = (await prd.query(`SELECT id, name, hash FROM "Client" ORDER BY "createdAt" DESC LIMIT $1`, [n])).rows;
} else {
  console.error('Selecione: --list | --all | --recent=N | --hashes=a,b | --names="x,y"');
  await prd.end(); process.exit(2);
}

if (!rows.length) { console.error('Nenhum cliente casou com o seletor.'); await prd.end(); process.exit(1); }
const cids = rows.map((r) => r.id);
console.log(`Clientes selecionados (${rows.length}):`);
for (const r of rows) console.log(`  - ${r.name}  (${r.hash})`);

if (has('dry')) { console.log('\n--dry: nada escrito.'); await prd.end(); process.exit(0); }

// ── Plano de cópia (ordem ~dependência; FK fica desligada de qualquer forma) ──
const PLAN = [
  ['Agency',             `id IN (SELECT "agencyId" FROM "Client" WHERE id = ANY($1::text[]) AND "agencyId" IS NOT NULL)`],
  ['Client',             `id = ANY($1::text[])`],
  ['TeamMember',         `"clientId" = ANY($1::text[])`],
  // ClientDataSnapshot é PULADA de propósito: é histórico de backup do blob
  // (centenas de MB) e não é necessária no HML — o app usa o Client.data atual.
  ['Supplier',           `"clientId" = ANY($1::text[])`],
  ['FinancialCategory',  `"clientId" = ANY($1::text[])`],
  ['PaymentMethod',      `"clientId" = ANY($1::text[])`],
  ['BpoEmployee',        `"clientId" = ANY($1::text[])`],
  ['BpoPartner',         `"clientId" = ANY($1::text[])`],
  ['BankAccount',        `"clientId" = ANY($1::text[])`],
  ['Loan',               `"clientId" = ANY($1::text[])`],
  ['ReceivableAdvance',  `"clientId" = ANY($1::text[])`],
  ['ReconciliationRule', `"clientId" = ANY($1::text[])`],
  ['PdvIntegration',     `"clientId" = ANY($1::text[])`],
  ['BpoTask',            `"clientId" = ANY($1::text[])`],
  ['WhatsappMessage',    `"clientId" = ANY($1::text[])`],
  ['Recurrence',         `id IN (SELECT "recurrenceId" FROM "Payable" WHERE "clientId"=ANY($1::text[]) AND "recurrenceId" IS NOT NULL
                                 UNION SELECT "recurrenceId" FROM "Receivable" WHERE "clientId"=ANY($1::text[]) AND "recurrenceId" IS NOT NULL)`],
  ['Payable',            `"clientId" = ANY($1::text[])`],
  ['Receivable',         `"clientId" = ANY($1::text[])`],
  ['BankTransfer',       `"clientId" = ANY($1::text[])`],
  ['BankTransaction',    `"bankAccountId" IN (SELECT id FROM "BankAccount" WHERE "clientId"=ANY($1::text[]))`],
  ['PaymentTransaction', `"payableId" IN (SELECT id FROM "Payable" WHERE "clientId"=ANY($1::text[]))
                          OR "receivableId" IN (SELECT id FROM "Receivable" WHERE "clientId"=ANY($1::text[]))`],
];

const q = (s) => '"' + s.replace(/"/g, '""') + '"';
const hml = new Pool({ connectionString: HML });
const client = await hml.connect();
let totalIns = 0;
try {
  await client.query('BEGIN');
  let fkOff = false;
  try { await client.query("SET session_replication_role = 'replica'"); fkOff = true; }
  catch { console.warn('  (aviso: não consegui desligar FK — seguindo na ordem de dependência)'); }

  for (const [table, where] of PLAN) {
    const src = await prd.query(`SELECT * FROM ${q(table)} WHERE ${where}`, [cids]);
    if (!src.rowCount) { console.log(`  ${table}: 0`); continue; }
    const cols = src.fields.map((f) => f.name);
    const colList = cols.map(q).join(', ');
    // Insert em LOTE (multi-row) pra cortar round-trips. Chunk sob o limite de
    // ~65535 parâmetros do Postgres.
    let ins = 0;
    const CHUNK = Math.max(1, Math.floor(60000 / cols.length));
    for (let i = 0; i < src.rows.length; i += CHUNK) {
      const batch = src.rows.slice(i, i + CHUNK);
      const vals = [];
      const tuples = batch.map((row) => '(' + cols.map((c) => { vals.push(row[c]); return `$${vals.length}`; }).join(',') + ')');
      const r = await client.query(`INSERT INTO ${q(table)} (${colList}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, vals);
      ins += r.rowCount;
    }
    totalIns += ins;
    console.log(`  ${table}: ${ins}/${src.rowCount} inseridos`);
  }

  if (fkOff) await client.query("SET session_replication_role = 'origin'");
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nFALHOU (rollback):', e.message);
  client.release(); await hml.end(); await prd.end();
  process.exit(1);
}
client.release();
await hml.end(); await prd.end();

console.log(`\n✅ ${rows.length} cliente(s) copiado(s) (${totalIns} linhas novas).`);
console.log('Próximo: reinicie o app no EasyPanel e rode  cd server && npm run db:backfill');
console.log('  (o backfill gera as tabelas normalizadas a partir do blob desses clientes).');
