/**
 * DIAGNÓSTICO — insumos poluindo a Engenharia de Menu
 *
 * A Engenharia de Menu / Matriz de Cardápio deve listar SÓ pratos vendáveis.
 * Quando um cliente reclama que aparecem insumos lá (ex: "Açúcar cristal",
 * "Ovo", "Bacon em Cubos"), este script identifica exatamente o que está
 * errado nos dados daquele cliente.
 *
 * É 100% READ-ONLY — só faz SELECT, nunca altera nada no banco.
 *
 * Roda DENTRO do servidor (kvm8/Portainer), onde o DATABASE_URL resolve.
 * Lê a connection string de process.env.DATABASE_URL (já setada no container)
 * ou de --db=... passado na linha de comando.
 *
 * Uso (no console do container da aplicação):
 *   node scripts/diagnose-client-menu.js --name=tobias
 *   node scripts/diagnose-client-menu.js --hash=abc123...
 *   node scripts/diagnose-client-menu.js --name=tobias --dump
 *
 *   --name=   busca cliente por nome (parcial, case-insensitive)
 *   --hash=   busca cliente por hash exato
 *   --dump    grava o Client.data completo em ./diagnose-<hash>.json
 *             (pra baixar e analisar fora)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const getArg = (k) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const nameArg = getArg('name');
const hashArg = getArg('hash');
const dbArg = getArg('db');
const doDump = args.includes('--dump');

if (dbArg) process.env.DATABASE_URL = dbArg;

if (!nameArg && !hashArg) {
  console.error('Uso: node scripts/diagnose-client-menu.js --name=<nome> | --hash=<hash> [--dump]');
  process.exit(1);
}

const prisma = new PrismaClient();

const norm = (s) => String(s || '').toLowerCase().trim();

// Categoria explicitamente marcada como insumo (não-vendável).
const isInsumoCategory = (c) => norm(c) === 'insumo pronto preparado';

async function main() {
  const where = hashArg
    ? { hash: hashArg }
    : { name: { contains: nameArg, mode: 'insensitive' } };

  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, hash: true, data: true, active: true },
  });

  if (clients.length === 0) {
    console.log('Nenhum cliente encontrado para o filtro informado.');
    return;
  }
  console.log(`\n${clients.length} cliente(s) encontrado(s).\n${'='.repeat(60)}`);

  for (const c of clients) {
    console.log(`\nCLIENTE: ${c.name}  |  hash: ${c.hash}  |  ativo: ${c.active}`);

    let data;
    try {
      data = JSON.parse(c.data || '{}');
    } catch {
      console.log('  ⚠️  Client.data corrompido (JSON inválido) — pulando.');
      continue;
    }

    const fichas = Array.isArray(data?.operational?.fichas) ? data.operational.fichas : [];
    const insumos = Array.isArray(data?.operational?.insumos) ? data.operational.insumos : [];
    const menu = Array.isArray(data?.menuEngineering) ? data.menuEngineering : [];

    console.log(`  Tamanho do data: ${(Buffer.byteLength(c.data || '', 'utf8') / 1024).toFixed(1)} KB`);
    console.log(`  Fichas técnicas : ${fichas.length}`);
    console.log(`  Insumos         : ${insumos.length}`);
    console.log(`  menuEngineering : ${menu.length}  (itens da Matriz de Cardápio)`);

    // Conjuntos de nomes de insumo para cruzamento.
    const insumoNames = new Set(insumos.map((i) => norm(i && i.name)).filter(Boolean));
    const insumoFichaNames = new Set(
      fichas.filter((f) => f && isInsumoCategory(f.type)).map((f) => norm(f.name)).filter(Boolean),
    );

    // GRUPO 1 — DEFINITIVO: a categoria/type marca explicitamente como insumo.
    // Esses NÃO deveriam estar na Engenharia de Menu, sem dúvida.
    const definitivos = menu.filter(
      (m) => m && (isInsumoCategory(m.category) || insumoFichaNames.has(norm(m.name))),
    );

    // GRUPO 2 — A VERIFICAR: o nome bate com um insumo cadastrado, mas a
    // categoria não é de insumo. PODE ser legítimo (revenda — ex: refrigerante
    // em lata é comprado como insumo E vendido como item). Precisa olho humano.
    const definitivosNomes = new Set(definitivos.map((m) => norm(m.name)));
    const aVerificar = menu.filter(
      (m) => m && !definitivosNomes.has(norm(m.name)) && insumoNames.has(norm(m.name)),
    );

    // Fichas com type explicitamente de insumo.
    const fichasInsumo = fichas.filter((f) => f && isInsumoCategory(f.type));

    const printList = (arr, fmt) => {
      arr.slice(0, 50).forEach((x) => console.log('     - ' + fmt(x)));
      if (arr.length > 50) console.log(`     ... +${arr.length - 50} (use --dump pra ver tudo)`);
    };

    console.log(`\n  >> [DEFINITIVO] menuEngineering que SÃO insumo: ${definitivos.length} de ${menu.length}`);
    printList(definitivos, (m) => `"${m.name}" | category: ${m.category || '(sem)'} | sales: ${m.sales} | id: ${m.id || '(sem id)'}`);

    console.log(`\n  >> [A VERIFICAR] menuEngineering com nome de insumo (pode ser revenda): ${aVerificar.length}`);
    printList(aVerificar, (m) => `"${m.name}" | category: ${m.category || '(sem)'} | sales: ${m.sales}`);

    console.log(`\n  >> Fichas técnicas com type de insumo: ${fichasInsumo.length} de ${fichas.length}`);
    printList(fichasInsumo, (f) => `"${f.name}" | type: ${f.type || '(sem)'} | id: ${f.id}`);

    // Veredito
    console.log('');
    if (definitivos.length === 0) {
      console.log('  ✅ Nenhum insumo DEFINITIVO na Engenharia de Menu deste cliente.');
      if (aVerificar.length > 0) {
        console.log(`     (${aVerificar.length} item(ns) a verificar manualmente — podem ser revenda legítima.)`);
      }
    } else {
      console.log(`  ⚠️  ${definitivos.length} insumo(s) DEFINITIVO(s) na Matriz de Cardápio.`);
      console.log('     Causa provável: planilha importada misturando insumos com pratos,');
      console.log('     ou insumos com ficha auto-criada. Limpeza recomendada (script à parte).');
    }

    if (doDump) {
      const out = path.resolve(__dirname, `diagnose-${c.hash}.json`);
      fs.writeFileSync(out, JSON.stringify({
        id: c.id, name: c.name, hash: c.hash,
        counts: { fichas: fichas.length, insumos: insumos.length, menuEngineering: menu.length },
        definitivosMenu: definitivos,
        aVerificarMenu: aVerificar,
        fichasInsumo,
        data,
      }, null, 2));
      console.log(`\n  📄 Dump completo gravado em: ${out}`);
    }
    console.log(`${'-'.repeat(60)}`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro no diagnóstico:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
