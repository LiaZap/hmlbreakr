#!/usr/bin/env node
// @ts-check
/**
 * prod-to-local.mjs — Espelha PRODUÇÃO num Postgres LOCAL (via Docker), pra você
 * aplicar a migração Drizzle + o backfill numa cópia, NUNCA em produção direto.
 *
 * Fluxo seguro:
 *   1) pg_dump da prod (somente leitura)  → backups/prod_<ts>.sql
 *   2) reset do schema local + restore do dump  → cópia idêntica local
 *   3) (depois) npm run db:drizzle:migrate   → cria as tabelas novas no LOCAL
 *   4) (depois) node scripts/backfill-core.js --dry-run --client=<hash>
 *
 * Usa Docker (imagem postgres:17) — não precisa de pg_dump/psql instalados.
 *
 * .env:
 *   PROD_DATABASE_URL   conexão de PRODUÇÃO (direta; se houver pooler, use a direta)
 *   LOCAL_DATABASE_URL  default: postgresql://breakr:breakr_local_pass@localhost:5433/breakr_local
 *
 * Flags: --dump-only | --restore-only | --file=<caminho do .sql>
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
function loadEnv() {
  const env = { ...process.env };
  const p = join(ROOT, '.env');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue;
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in env)) env[m[1]] = v;
  }
  return env;
}
const sh = (cmd) => { console.log(`\n$ ${cmd.replace(/postgres(ql)?:\/\/[^@]*@/g, 'postgres://***@')}`); execSync(cmd, { stdio: 'inherit' }); };
const ts = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
// dentro do container, "localhost" do host vira host.docker.internal
const toContainer = (url) => url.replace(/@(localhost|127\.0\.0\.1)(:|\/)/, '@host.docker.internal$2');

function has(cmd) { try { execSync(cmd, { stdio: 'ignore' }); return true; } catch { return false; } }

function main() {
  const args = process.argv.slice(2);
  const dumpOnly = args.includes('--dump-only');
  const restoreOnly = args.includes('--restore-only');
  const fileArg = (args.find((a) => a.startsWith('--file=')) || '').slice(7);

  const env = loadEnv();
  const PROD = env.PROD_DATABASE_URL; // NUNCA cair no DATABASE_URL (que aponta pro local)
  const LOCAL = env.LOCAL_DATABASE_URL || 'postgresql://breakr:breakr_local_pass@localhost:5433/breakr_local';

  if (!has('docker info')) {
    console.error('ERRO: Docker não está rodando. Abra o Docker Desktop e tente de novo.');
    process.exit(1);
  }
  if (!PROD && !restoreOnly) { console.error('ERRO: defina PROD_DATABASE_URL no .env.'); process.exit(1); }

  // Salvaguarda: prod e local não podem ser o mesmo banco
  if (!restoreOnly && PROD === LOCAL) { console.error('ERRO: PROD e LOCAL são iguais. Abortando.'); process.exit(1); }
  if (!/(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(LOCAL)) {
    console.error(`ERRO: LOCAL_DATABASE_URL não parece local (${LOCAL}). Abortando por segurança.`);
    process.exit(1);
  }

  const dir = join(ROOT, 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = fileArg || join(dir, `prod_${ts()}.sql`);
  const mount = `${dir.replace(/\\/g, '/')}:/b`;
  const fileInContainer = `/b/${file.split(/[\\/]/).pop()}`;
  const IMG = 'postgres:17';

  // 1) DUMP da produção (somente leitura)
  if (!restoreOnly) {
    console.log(`\n[1/2] pg_dump da PRODUÇÃO → ${file}`);
    sh(`docker run --rm -v "${mount}" ${IMG} pg_dump "${PROD}" --no-owner --no-acl --file=${fileInContainer}`);
  }
  if (dumpOnly) { console.log('\n✅ Dump pronto (--dump-only).'); return; }

  // 2) RESET do schema local + RESTORE
  const LOCAL_C = toContainer(LOCAL);
  console.log('\n[2/2] Reset do schema LOCAL + restore do dump');
  sh(`docker run --rm --add-host=host.docker.internal:host-gateway ${IMG} psql "${LOCAL_C}" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`);
  sh(`docker run --rm -v "${mount}" --add-host=host.docker.internal:host-gateway ${IMG} psql "${LOCAL_C}" -v ON_ERROR_STOP=1 -f ${fileInContainer}`);

  console.log('\n✅ Cópia local pronta. Próximo:');
  console.log('   1) DATABASE_URL apontando pro LOCAL');
  console.log('   2) npm run db:drizzle:migrate          # cria as tabelas novas no LOCAL');
  console.log('   3) node scripts/backfill-core.js --inspect --client=<hash>   # confere a forma');
  console.log('   4) node scripts/backfill-core.js --dry-run                   # valida somas');
}

main();
