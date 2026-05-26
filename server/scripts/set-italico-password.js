/**
 * set-italico-password.js — define/atualiza a senha de login do cliente
 * seed "Itálico | Gastronomia Italiana" sem precisar re-rodar o seed
 * inteiro (que apaga e recria todas as transacoes/payables/etc).
 *
 * Util quando o cliente ja existe no banco de prod e voce so quer dar
 * a ele uma senha bcrypt pra login via email/senha.
 *
 * Uso:
 *   node scripts/set-italico-password.js
 *
 * Email/senha sao constantes no topo. Idempotente — pode rodar quantas
 * vezes precisar (cada execucao gera um hash novo do mesmo plaintext).
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const HASH = 'seeditalico00000000000';
const LOGIN_EMAIL = 'giuseppe@italico.com.br';
const LOGIN_PASSWORD = '$Fispal123'; // definida pelo Gustavo pra demo FISPAL

(async () => {
  try {
    const client = await prisma.client.findUnique({ where: { hash: HASH } });
    if (!client) {
      console.error('❌ Cliente Italico nao encontrado. Rode primeiro:');
      console.error('   node scripts/seed-italico.js\n');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(LOGIN_PASSWORD, 10);
    await prisma.client.update({
      where: { id: client.id },
      data: { email: LOGIN_EMAIL, password: passwordHash },
    });

    console.log('\n✅ Senha do Italico atualizada.\n');
    console.log(`   Email: ${LOGIN_EMAIL}`);
    console.log(`   Senha: ${LOGIN_PASSWORD}\n`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
