require('dotenv').config();
const { defineConfig } = require('drizzle-kit');

// Config SÓ para introspect (pull) das tabelas do PRISMA → definições Drizzle.
// Saída separada (drizzle-pull/) p/ não tocar nas migrações do núcleo (drizzle/).
// tablesFilter = só as tabelas geridas pelo Prisma (exclui as 20 do núcleo Drizzle).
module.exports = defineConfig({
  dialect: 'postgresql',
  out: './drizzle-pull',
  dbCredentials: { url: process.env.DATABASE_URL },
  tablesFilter: [
    'Agency', 'Client', 'StripeEvent', 'ClientDataSnapshot', 'AdminUser', 'TeamMember',
    'Broadcast', 'AuditLog', 'Supplier', 'BankAccount', 'FinancialCategory', 'BpoEmployee',
    'BpoPartner', 'PaymentMethod', 'Loan', 'ReceivableAdvance', 'Payable', 'Receivable',
    'Recurrence', 'PaymentTransaction', 'BankTransaction', 'ReconciliationRule',
    'BankTransfer', 'BpoTask', 'WhatsappMessage', 'PdvIntegration',
  ],
});
