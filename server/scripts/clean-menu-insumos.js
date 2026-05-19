/**
 * LIMPEZA — remove insumos que entraram errado na Engenharia de Menu
 *
 * Quando um cliente importa uma planilha misturando ingredientes com
 * pratos, os insumos vão parar no `menuEngineering` (Matriz de Cardápio).
 * Este script remove esses itens-insumo do `menuEngineering` SEM tocar em
 * `operational.insumos` nem em `operational.fichas` — só limpa a Matriz.
 *
 * Critério de "é insumo" (remove do menuEngineering):
 *   1. category === 'insumo pronto preparado'  (categoria de insumo explícita)
 *   2. category está em operational.categories.insumos  (categoria de insumo
 *      cadastrada do cliente — ex: Frutas, Carnes, Condimentos...)
 *   3. o nome bate com um insumo de operational.insumos E a categoria NÃO é
 *      de prato — evita remover revenda legítima (ex: refrigerante em lata,
 *      que é comprado como insumo E vendido como item de cardápio).
 *
 * SEGURANÇA:
 *   - Dry-run por padrão: só RELATA o que sairia. Use --apply para gravar.
 *   - Cria um ClientDataSnapshot antes de gravar (reason 'pre-clean-menu').
 *   - Não deleta nada além de entradas do array menuEngineering.
 *
 * Uso (no servidor, onde o DATABASE_URL resolve):
 *   node scripts/clean-menu-insumos.js --name=rancho           # dry-run
 *   node scripts/clean-menu-insumos.js --name=rancho --apply   # grava
 *   node scripts/clean-menu-insumos.js --hash=abc123 --apply
 */

const path = require('path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createSnapshot, pruneOldSnapshots } = require('../src/services/snapshotService');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const getArg = (k) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const nameArg = getArg('name');
const hashArg = getArg('hash');
const apply = args.includes('--apply');

if (!nameArg && !hashArg) {
  console.error('Uso: node scripts/clean-menu-insumos.js --name=<nome> | --hash=<hash> [--apply]');
  process.exit(1);
}

const norm = (s) => String(s || '').toLowerCase().trim();

async function main() {
  console.log(`🧹 Limpeza de insumos na Engenharia de Menu — modo: ${apply ? 'GRAVAÇÃO' : 'DRY-RUN (não grava)'}\n`);

  const where = hashArg ? { hash: hashArg } : { name: { contains: nameArg, mode: 'insensitive' } };
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, hash: true, data: true },
  });

  if (clients.length === 0) {
    console.log('Nenhum cliente encontrado.');
    return;
  }
  if (clients.length > 1) {
    console.log(`⚠️  ${clients.length} clientes casaram o filtro — refine com --hash=. Encontrados:`);
    clients.forEach((c) => console.log(`   - ${c.name} (hash: ${c.hash})`));
    return;
  }

  const c = clients[0];
  console.log(`Cliente: ${c.name}  |  hash: ${c.hash}\n${'='.repeat(60)}`);

  let data;
  try {
    data = JSON.parse(c.data || '{}');
  } catch {
    console.log('❌ Client.data corrompido (JSON inválido). Abortando.');
    return;
  }

  const menu = Array.isArray(data.menuEngineering) ? data.menuEngineering : [];
  const insumos = Array.isArray(data?.operational?.insumos) ? data.operational.insumos : [];
  const insumoCats = Array.isArray(data?.operational?.categories?.insumos)
    ? data.operational.categories.insumos
    : [];

  const fichaCats = Array.isArray(data?.operational?.categories?.fichas)
    ? data.operational.categories.fichas
    : [];
  const insumoNames = new Set(insumos.map((i) => norm(i && i.name)).filter(Boolean));
  const insumoCatSet = new Set(insumoCats.map(norm).filter(Boolean));
  const fichaCatSet = new Set(fichaCats.map(norm).filter(Boolean));

  // Decide se um item do menuEngineering é insumo (deve sair).
  const reasonToRemove = (item) => {
    if (!item) return null;
    const cat = norm(item.category);
    if (cat === 'insumo pronto preparado') return 'categoria: insumo pronto preparado';
    if (cat && insumoCatSet.has(cat)) return `categoria de insumo: "${item.category}"`;
    // Nome de insumo + categoria que NÃO é de prato → provável insumo.
    // (não remove revenda legítima — ex: refrigerante comprado e vendido.)
    if (insumoNames.has(norm(item.name)) && !fichaCatSet.has(cat)) {
      return 'nome de insumo + categoria não é de prato';
    }
    return null;
  };

  const toRemove = [];
  const toKeep = [];
  for (const item of menu) {
    const reason = reasonToRemove(item);
    if (reason) toRemove.push({ item, reason });
    else toKeep.push(item);
  }

  console.log(`menuEngineering atual: ${menu.length} itens`);
  console.log(`  → insumos a REMOVER: ${toRemove.length}`);
  console.log(`  → pratos que FICAM:  ${toKeep.length}\n`);

  console.log('--- SAIRIA (insumos) ---');
  toRemove.slice(0, 200).forEach(({ item, reason }) => {
    console.log(`  ✗ "${item.name}"  | cat: ${item.category || '(sem)'}  | ${reason}`);
  });
  if (toRemove.length > 200) console.log(`  ... +${toRemove.length - 200}`);

  console.log('\n--- FICA (pratos) ---');
  toKeep.slice(0, 200).forEach((item) => {
    console.log(`  ✓ "${item.name}"  | cat: ${item.category || '(sem)'}`);
  });
  if (toKeep.length > 200) console.log(`  ... +${toKeep.length - 200}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('NÃO é tocado: operational.insumos (' + insumos.length + ') e operational.fichas.');

  if (toRemove.length === 0) {
    console.log('\n✅ Nada a remover — menuEngineering já está limpo.');
    return;
  }

  if (!apply) {
    console.log('\n🔍 DRY-RUN — nada gravado. Confira a lista acima e rode de novo com --apply.');
    return;
  }

  // GRAVAÇÃO — snapshot de segurança antes.
  try {
    await createSnapshot(prisma, c.id, c.data, 'pre-clean-menu');
    console.log('\n📸 Snapshot de segurança criado (reason: pre-clean-menu).');
  } catch (snapErr) {
    console.error('⚠️  Falha ao criar snapshot — ABORTANDO por segurança:', snapErr.message);
    return;
  }

  data.menuEngineering = toKeep;
  await prisma.client.update({
    where: { id: c.id },
    data: { data: JSON.stringify(data) },
  });
  pruneOldSnapshots(prisma, c.id, 20).catch(() => {});

  console.log(`✅ Concluído — ${toRemove.length} insumo(s) removido(s) do menuEngineering.`);
  console.log(`   menuEngineering: ${menu.length} → ${toKeep.length} itens.`);
}

main()
  .catch((err) => {
    console.error('❌ Erro na limpeza:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
