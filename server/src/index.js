const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const bpoRoutes = require('./routes/bpo');
const stripeWebhookRouter = require('./routes/stripeWebhook');
const { startBackupScheduler } = require('./services/backupScheduler');
const { createAuditMiddleware } = require('./middleware/auditMiddleware');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Trust proxy (required behind Easypanel/Traefik reverse proxy)
app.set('trust proxy', 1);

// Security Middleware — allow Clerk SDK scripts and connections
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://*.clerk.accounts.dev", "https://*.clerk.com", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", "https://*.clerk.accounts.dev", "https://*.clerk.com", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://*.clerk.com", "https://api.clerk.com"],
      imgSrc: ["'self'", "data:", "https://*.clerk.com", "https://img.clerk.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ["'self'", "https://*.clerk.accounts.dev", "https://*.clerk.com"],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
    },
  },
}));

// Stripe Webhook — DEVE vir ANTES de express.json e de qualquer middleware
// que parseie o body. A verificação de signature do Stripe é feita sobre o
// body bytes-puros; o próprio router aplica express.raw internamente.
// Também ficamos fora do rate-limiter pra não bloquear retentativas.
app.use('/api/stripe/webhook', stripeWebhookRouter);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500 // limit each IP to 500 requests per windowMs
});
app.use('/api', limiter);

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auditoria — captura automática de toda mutação (POST/PUT/PATCH/DELETE)
// em /api e /api/bpo. Registra na trilha AuditLog; best-effort, não bloqueia.
app.use('/api', createAuditMiddleware());

// Routes
app.use('/api', routes);
app.use('/api/bpo', bpoRoutes); // BPO Financeiro V2.0

// Health Check - actually test DB connection
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// Serve Static Assets in Production
const path = require('path');
// Adjust path to point to root 'dist' folder from 'server/src'
const distPath = path.join(__dirname, '../../dist');

app.use(express.static(distPath));

// Handle React Routing (SPA)
// Using RegExp to avoid "Missing parameter name" error in Express 5 / path-to-regexp
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Backup automático diário (node-cron, dentro do processo Node).
// Desabilita com BACKUP_ENABLED=false (dev local).
startBackupScheduler();

// Global error handler
app.use((err, req, res, next) => {
  // Ignore aborted requests (client disconnected before response)
  if (req.aborted || err.code === 'ECONNRESET' || err.type === 'request.aborted' || err.message?.includes('aborted')) {
    return;
  }
  console.error('Unhandled error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Graceful Shutdown
const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
