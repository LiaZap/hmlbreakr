/**
 * set-italico-password.js — garante credenciais de login do cliente seed
 * "Itálico | Gastronomia Italiana" funcionando via Clerk (que e o fluxo
 * padrao do widget <SignIn> no ClientLogin.jsx).
 *
 * O que faz:
 *   1. Gera bcrypt hash da senha
 *   2. Atualiza Client.password no banco (fallback legacy)
 *   3. Cria o user no Clerk com passwordDigest (mesmo hash bcrypt — Clerk
 *      aceita bcrypt nativamente, sem precisar redefinir senha)
 *   4. Linka client.clerkUserId pro user recem criado
 *
 * Idempotente: se o user ja existe no Clerk, apenas atualiza a senha
 * via clerk.users.updateUser({ password }) e religa o clerkUserId.
 *
 * Uso (local ou no container Easypanel):
 *   node scripts/set-italico-password.js
 *
 * Requer no .env:
 *   CLERK_SECRET_KEY (mesma chave usada pelo backend)
 *   DATABASE_URL
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { createClerkClient } = require('@clerk/backend');

const prisma = new PrismaClient();

const HASH = 'seeditalico00000000000';
const LOGIN_EMAIL = 'giuseppe@italico.com.br';
const LOGIN_PASSWORD = '$Fispal123'; // definida pelo Gustavo pra demo FISPAL
const FIRST_NAME = 'Giuseppe';
const LAST_NAME = 'Ferraro';

(async () => {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      console.error('❌ CLERK_SECRET_KEY ausente no ambiente. Verifique .env / Easypanel env vars.');
      process.exit(1);
    }

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    // 1) Encontra cliente no banco
    const client = await prisma.client.findUnique({ where: { hash: HASH } });
    if (!client) {
      console.error('❌ Cliente Italico nao encontrado no banco. Rode primeiro:');
      console.error('   node scripts/seed-italico.js\n');
      process.exit(1);
    }

    // 2) Gera bcrypt hash da senha (10 rounds, padrao do sistema)
    const passwordHash = await bcrypt.hash(LOGIN_PASSWORD, 10);

    // 3) Atualiza Client.password no banco (fallback legacy)
    await prisma.client.update({
      where: { id: client.id },
      data: { email: LOGIN_EMAIL, password: passwordHash },
    });
    console.log('✅ Client.password atualizado no banco');

    // 4) Cria/atualiza no Clerk
    const existing = await clerk.users.getUserList({ emailAddress: [LOGIN_EMAIL] });
    let clerkUser;

    if (existing.totalCount > 0) {
      // Ja existe — atualiza a senha
      clerkUser = existing.data[0];
      await clerk.users.updateUser(clerkUser.id, { password: LOGIN_PASSWORD });
      console.log(`✅ User Clerk ja existia (${clerkUser.id}) — senha atualizada`);
    } else {
      // Cria novo, passando o bcrypt hash diretamente (Clerk suporta)
      clerkUser = await clerk.users.createUser({
        emailAddress: [LOGIN_EMAIL],
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        passwordDigest: passwordHash,
        passwordHasher: 'bcrypt',
      });
      console.log(`✅ User Clerk criado (${clerkUser.id})`);
    }

    // 5) Linka clerkUserId no banco
    await prisma.client.update({
      where: { id: client.id },
      data: { clerkUserId: clerkUser.id },
    });
    console.log('✅ client.clerkUserId linkado');

    console.log('\n══════════════════════════════════════════');
    console.log('   Credenciais prontas pra login Clerk');
    console.log('══════════════════════════════════════════');
    console.log(`   Email: ${LOGIN_EMAIL}`);
    console.log(`   Senha: ${LOGIN_PASSWORD}`);
    console.log('══════════════════════════════════════════\n');
  } catch (err) {
    const details = err.errors ? JSON.stringify(err.errors, null, 2) : err.message;
    console.error('❌ Erro:', details);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
