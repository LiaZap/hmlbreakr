/**
 * fix-italico-clerk.js — diagnostica + REPARA o user do Italico no Clerk.
 *
 * O erro "Nao foi possivel encontrar o usuario" no widget <SignIn>
 * geralmente NAO significa que o user nao existe — significa que ele
 * existe mas o Clerk Production esta recusando sign-in por uma destas
 * razoes:
 *
 *   1. Email primary nao esta `verified` (criacao via API nao marca como
 *      verified automaticamente)
 *   2. User esta `banned` ou `locked`
 *   3. Sign-in restrictions (allowlist mode) bloqueando o email
 *   4. Senha nao esta `enabled` pra esse user
 *
 * O que o script faz:
 *   1. Lista user por email + mostra todos os detalhes
 *   2. Se email_address.verification.status !== 'verified' → marca verified
 *      via PATCH /v1/email_addresses/:id { verified: true }
 *   3. Se banned ou locked → desbanir / desbloquear
 *   4. Reseta a senha via PUT /v1/users/:id
 *   5. Garante clerkUserId linkado no Prisma
 *
 * Uso:
 *   node scripts/fix-italico-clerk.js
 */
require('dotenv').config();
const { createClerkClient } = require('@clerk/backend');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const HASH = 'seeditalico00000000000';
const LOGIN_EMAIL = 'giuseppe@italico.com.br';
const LOGIN_PASSWORD = '$Fispal123';

(async () => {
  const sk = process.env.CLERK_SECRET_KEY;
  if (!sk) { console.error('❌ CLERK_SECRET_KEY ausente.'); process.exit(1); }

  const instance = sk.startsWith('sk_live_') ? 'PRODUCTION' : sk.startsWith('sk_test_') ? 'DEVELOPMENT' : 'UNKNOWN';
  console.log(`\n[clerk] Instancia: ${instance}\n`);

  const clerk = createClerkClient({ secretKey: sk });

  // ── 1. Encontrar user ──────────────────────────────────────────────
  const list = await clerk.users.getUserList({ emailAddress: [LOGIN_EMAIL] });
  if (list.totalCount === 0) {
    console.error(`❌ Email ${LOGIN_EMAIL} NAO existe na instancia ${instance}.`);
    console.error('   Rode antes: node scripts/set-italico-password.js\n');
    process.exit(1);
  }

  const user = list.data[0];
  console.log(`📋 User encontrado: ${user.id}`);
  console.log(`   First/Last:       ${user.firstName || '(vazio)'} / ${user.lastName || '(vazio)'}`);
  console.log(`   Password enabled: ${user.passwordEnabled}`);
  console.log(`   Banned:           ${user.banned}`);
  console.log(`   Locked:           ${user.locked}`);
  console.log(`   Created:          ${new Date(user.createdAt).toISOString()}`);
  console.log(`   Last sign in:     ${user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : 'NUNCA'}\n`);

  // ── 2. Verificar email_address ─────────────────────────────────────
  const primaryEmailId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find(e => e.id === primaryEmailId) || user.emailAddresses[0];
  const verStatus = primary?.verification?.status;
  console.log(`📧 Primary email ID: ${primary.id}`);
  console.log(`   Verification:    ${verStatus}`);

  if (verStatus !== 'verified') {
    console.log(`   → Marcando email como verified via API direta...`);
    // SDK nao expoe esse metodo diretamente; vamos via fetch
    const res = await fetch(`https://api.clerk.com/v1/email_addresses/${primary.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sk}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verified: true }),
    });
    if (res.ok) {
      console.log('   ✅ Email marcado como verified');
    } else {
      const err = await res.text();
      console.log(`   ⚠️  Falha ao marcar verified (status ${res.status}): ${err.slice(0, 200)}`);
      console.log('   Continuando mesmo assim — pode nao ser bloqueante.');
    }
  } else {
    console.log('   ✅ Email ja esta verified');
  }

  // ── 3. Desbanir / desbloquear ──────────────────────────────────────
  if (user.banned) {
    console.log('🔓 Desbanindo user...');
    await fetch(`https://api.clerk.com/v1/users/${user.id}/unban`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sk}` },
    });
    console.log('   ✅ Desbanido');
  }
  if (user.locked) {
    console.log('🔓 Desbloqueando user...');
    await fetch(`https://api.clerk.com/v1/users/${user.id}/unlock`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sk}` },
    });
    console.log('   ✅ Desbloqueado');
  }

  // ── 4. Resetar senha (garantia) ────────────────────────────────────
  console.log('🔑 Resetando senha pra "$Fispal123"...');
  await clerk.users.updateUser(user.id, {
    password: LOGIN_PASSWORD,
    skipPasswordChecks: true,
  });
  console.log('   ✅ Senha aplicada');

  // ── 5. Garantir linkagem no Prisma ─────────────────────────────────
  const client = await prisma.client.findUnique({ where: { hash: HASH } });
  if (client && client.clerkUserId !== user.id) {
    await prisma.client.update({
      where: { id: client.id },
      data: { clerkUserId: user.id, email: LOGIN_EMAIL },
    });
    console.log(`🔗 client.clerkUserId atualizado (${user.id})`);
  } else if (client) {
    console.log(`🔗 client.clerkUserId ja linkado corretamente`);
  } else {
    console.log(`⚠️  Cliente Italico nao encontrado no banco — pode ignorar (so afeta o BPO)`);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('   Reparos aplicados — tente logar agora');
  console.log('══════════════════════════════════════════');
  console.log(`   URL:   https://app.breakr.com.br`);
  console.log(`   Email: ${LOGIN_EMAIL}`);
  console.log(`   Senha: ${LOGIN_PASSWORD}`);
  console.log('══════════════════════════════════════════');
  console.log('\n💡 Se ainda falhar, verifique no Clerk Dashboard:');
  console.log('   Configure → Restrictions → "Sign-up modes" deve estar "Public"');
  console.log('   (allowlist ou blocklist podem bloquear sign-in)\n');

  await prisma.$disconnect();
})().catch(err => {
  console.error('❌', err.message);
  if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
