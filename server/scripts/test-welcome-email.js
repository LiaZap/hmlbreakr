/**
 * test-welcome-email.js — dispara o email de boas-vindas (welcome) usando
 * o emailService real, sem precisar criar cliente no banco nem comprar
 * via Stripe. Usa o mesmo SMTP Hostinger configurado no .env do server.
 *
 * Util pra testar copy, layout, logo, renderizacao em diferentes clientes
 * (Gmail web/app, Apple Mail, Outlook) e detectar quebras de HTML.
 *
 * Uso:
 *   cd server
 *   node scripts/test-welcome-email.js seu@email.com
 *   node scripts/test-welcome-email.js seu@email.com "Restaurante Teste"
 *   node scripts/test-welcome-email.js seu@email.com "Pizzaria do Ze" abc123hash
 *
 * Argumentos:
 *   1. to          (obrigatorio) — destinatario do teste
 *   2. clientName  (opcional)    — default: "Restaurante Teste"
 *   3. hash        (opcional)    — default: "test-hash-1234567890"
 *
 * Pre-requisitos no .env do server:
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465
 *   SMTP_USER=no-reply@breakr.com.br
 *   SMTP_PASS=***
 *   APP_URL=https://app.breakr.com.br   (ou http://localhost:5173 em dev)
 *
 * Saida: log de sucesso/erro no console. Email chega em ~30s.
 */
require('dotenv').config();
const { sendWelcomeEmail } = require('../src/services/emailService');

const [, , to, clientName, hash] = process.argv;

if (!to || !to.includes('@')) {
  console.error('\n❌ Uso: node scripts/test-welcome-email.js <email> [nome] [hash]');
  console.error('   Exemplo: node scripts/test-welcome-email.js eu@gmail.com "Pizzaria Teste"\n');
  process.exit(1);
}

const finalName = clientName || 'Restaurante Teste';
const finalHash = hash || 'test-hash-1234567890';

console.log('\n📧 Disparando welcome email de TESTE...');
console.log(`   Para:   ${to}`);
console.log(`   Nome:   ${finalName}`);
console.log(`   Hash:   ${finalHash}`);
console.log(`   Link:   ${process.env.APP_URL || 'https://app.breakr.com.br'}?hash=${finalHash}\n`);

sendWelcomeEmail({ to, clientName: finalName, hash: finalHash })
  .then(() => {
    console.log('✅ Email enviado. Confira a caixa de entrada (e o spam) em ate 1 minuto.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Falha no envio:');
    console.error(`   ${err.message}`);
    if (err.code === 'EAUTH') {
      console.error('\n   Verifique SMTP_USER e SMTP_PASS no .env do server.');
    } else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
      console.error('\n   Verifique SMTP_HOST e SMTP_PORT. Firewall pode estar bloqueando 465/587.');
    }
    process.exit(1);
  });
