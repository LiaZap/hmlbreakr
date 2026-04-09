/**
 * Migração de usuários existentes para o Clerk
 *
 * Importa todos os clientes que têm email + senha no banco
 * para o Clerk, preservando a senha bcrypt (sem precisar redefinir).
 *
 * Uso: node scripts/migrate-users-to-clerk.js
 *
 * Requer: CLERK_SECRET_KEY no .env
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createClerkClient } = require('@clerk/backend');

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function migrate() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('❌ CLERK_SECRET_KEY não encontrada no .env');
    process.exit(1);
  }

  console.log('🔍 Buscando clientes com email e senha...\n');

  const clients = await prisma.client.findMany({
    where: {
      email: { not: null },
      password: { not: null },
      clerkUserId: null, // Só migrar quem ainda não tem Clerk
    },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      hash: true,
    }
  });

  console.log(`📋 ${clients.length} clientes para migrar\n`);

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const client of clients) {
    try {
      // Verificar se já existe no Clerk por email
      const existing = await clerk.users.getUserList({ emailAddress: [client.email] });

      let clerkUser;

      if (existing.totalCount > 0) {
        // Já existe no Clerk — apenas linkar
        clerkUser = existing.data[0];
        console.log(`🔗 ${client.email} — já existe no Clerk, linkando...`);
      } else {
        // Criar no Clerk com a senha bcrypt existente
        clerkUser = await clerk.users.createUser({
          emailAddress: [client.email],
          firstName: client.name?.split(' ')[0] || '',
          lastName: client.name?.split(' ').slice(1).join(' ') || '',
          passwordDigest: client.password,
          passwordHasher: 'bcrypt',
          skipPasswordChecks: true,
        });
        console.log(`✅ ${client.email} — criado no Clerk`);
      }

      // Salvar clerkUserId no banco
      await prisma.client.update({
        where: { id: client.id },
        data: { clerkUserId: clerkUser.id }
      });

      success++;
    } catch (err) {
      console.error(`❌ ${client.email} — ${err.message}`);
      errors++;
    }
  }

  console.log('\n════════════════════════════════════');
  console.log(`✅ Migrados: ${success}`);
  console.log(`⏭️  Pulados:  ${skipped}`);
  console.log(`❌ Erros:    ${errors}`);
  console.log('════════════════════════════════════\n');

  await prisma.$disconnect();
}

migrate().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
