/**
 * diagnose-clerk-instance.js — verifica em qual instancia Clerk (Dev/Prod)
 * o CLERK_SECRET_KEY do ambiente atual aponta, e se um email especifico
 * existe nessa instancia.
 *
 * Util quando o widget <SignIn> retorna 'Nao foi possivel encontrar o
 * usuario' mas o user aparece criado no Clerk Dashboard — geralmente
 * indica mismatch entre frontend (VITE_CLERK_PUBLISHABLE_KEY) e backend
 * (CLERK_SECRET_KEY).
 *
 * Uso:
 *   node scripts/diagnose-clerk-instance.js [email]
 *
 * Default email: giuseppe@italico.com.br
 */
require('dotenv').config();
const { createClerkClient } = require('@clerk/backend');

const email = process.argv[2] || 'giuseppe@italico.com.br';

(async () => {
  const sk = process.env.CLERK_SECRET_KEY;
  if (!sk) {
    console.error('❌ CLERK_SECRET_KEY ausente.');
    process.exit(1);
  }

  const isProd = sk.startsWith('sk_live_');
  const isDev = sk.startsWith('sk_test_');
  const instance = isProd ? 'PRODUCTION (sk_live_)' : isDev ? 'DEVELOPMENT (sk_test_)' : 'UNKNOWN';

  console.log('\n══════════════════════════════════════════');
  console.log('   Diagnostico Clerk');
  console.log('══════════════════════════════════════════');
  console.log(`Backend CLERK_SECRET_KEY: ${instance}`);
  console.log(`Prefixo (mascarado):       ${sk.slice(0, 12)}...${sk.slice(-6)}`);
  console.log(`Email procurado:           ${email}`);
  console.log('══════════════════════════════════════════\n');

  try {
    const clerk = createClerkClient({ secretKey: sk });
    const list = await clerk.users.getUserList({ emailAddress: [email] });

    if (list.totalCount === 0) {
      console.log(`❌ Email NAO encontrado na instancia ${instance}.\n`);
      console.log('Causas possiveis:');
      console.log('  1. User foi criado em outra instancia (Dev vs Prod)');
      console.log('  2. Email diferente do esperado (typo / caso)');
      console.log('  3. User foi deletado depois de criado\n');
    } else {
      const u = list.data[0];
      console.log(`✅ Email encontrado:`);
      console.log(`   User ID:        ${u.id}`);
      console.log(`   First/Last:     ${u.firstName || '(vazio)'} / ${u.lastName || '(vazio)'}`);
      console.log(`   Email verified: ${u.emailAddresses?.[0]?.verification?.status || 'desconhecido'}`);
      console.log(`   Password set:   ${u.passwordEnabled ? 'sim' : 'NAO'}`);
      console.log(`   Banned:         ${u.banned ? 'SIM' : 'nao'}`);
      console.log(`   Locked:         ${u.locked ? 'SIM' : 'nao'}`);
      console.log(`   Created:        ${new Date(u.createdAt).toISOString()}`);
      console.log(`   Last sign in:   ${u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : 'nunca'}\n`);

      console.log('Verifique no frontend:');
      console.log(`  - VITE_CLERK_PUBLISHABLE_KEY deve comecar com ${isProd ? 'pk_live_' : 'pk_test_'}`);
      console.log(`  - As duas keys precisam ser da MESMA instancia\n`);
    }
  } catch (err) {
    console.error('❌ Erro consultando Clerk:', err.message);
    if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
    process.exit(1);
  }
})();
