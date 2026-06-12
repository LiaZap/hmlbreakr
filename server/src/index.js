// dotenv ANTES de qualquer require que leia env no carregamento (db/client cria o
// Pool com DATABASE_URL; emailService lê SMTP_PASS; adminAuth lê ADMIN_TOKEN).
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { pool } = require('./db/client');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const bpoRoutes = require('./routes/bpo');
const stripeWebhookRouter = require('./routes/stripeWebhook');
const { startBackupScheduler } = require('./services/backupScheduler');
const { createAuditMiddleware } = require('./middleware/auditMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (required behind Easypanel/Traefik reverse proxy)
app.set('trust proxy', 1);

// Security Middleware — CSP cobrindo Clerk (Dev e Prod), Cloudflare
// Turnstile CAPTCHA, Stripe Checkout, e telemetria.
//
// Fontes oficiais Clerk:
//   https://clerk.com/docs/security/clerk-csp
const CLERK_PROD_DOMAIN = 'https://clerk.breakr.com.br';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Clerk SDK exige (script interno usa eval pra parse)
        "https://*.clerk.accounts.dev", CLERK_PROD_DOMAIN,
        "https://*.clerk.com",
        "https://challenges.cloudflare.com", // Turnstile CAPTCHA
        "https://js.stripe.com", // Stripe Checkout
      ],
      scriptSrcElem: [
        "'self'", "'unsafe-inline'",
        "https://*.clerk.accounts.dev", CLERK_PROD_DOMAIN,
        "https://*.clerk.com",
        "https://challenges.cloudflare.com",
        "https://js.stripe.com",
      ],
      connectSrc: [
        "'self'",
        "https://*.clerk.accounts.dev", CLERK_PROD_DOMAIN,
        "https://*.clerk.com", "https://api.clerk.com",
        "https://clerk-telemetry.com", "https://*.clerk-telemetry.com",
        "https://challenges.cloudflare.com",
        "https://api.stripe.com",
      ],
      imgSrc: [
        "'self'", "data:", "blob:",
        "https://*.clerk.com", "https://img.clerk.com",
        "https://*.stripe.com",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      frameSrc: [
        "'self'",
        "https://*.clerk.accounts.dev", CLERK_PROD_DOMAIN,
        "https://*.clerk.com",
        "https://challenges.cloudflare.com", // Turnstile iframe
        "https://js.stripe.com", "https://hooks.stripe.com",
      ],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      formAction: ["'self'", "https://challenges.cloudflare.com"],
    },
  },
}));

// Stripe Webhook — DEVE vir ANTES de express.json e de qualquer middleware
// que parseie o body. A verificação de signature do Stripe é feita sobre o
// body bytes-puros; o próprio router aplica express.raw internamente.
// Também ficamos fora do rate-limiter pra não bloquear retentativas.
app.use('/api/stripe/webhook', stripeWebhookRouter);

// Rate Limiting — limiter GERAL (500 req / 15min / IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500 // limit each IP to 500 requests per windowMs
});
app.use('/api', limiter);

// Rate Limiting DEDICADO pra rotas de credencial (anti brute-force):
//   - 5 tentativas falhas por IP a cada 1 minuto
//   - Logins bem-sucedidos não contam (skipSuccessfulRequests) pra não
//     limitar usuário legítimo que loga várias vezes em sequência
//   - Resposta uniforme tanto pra credencial inválida quanto pro limit
//     atingido (não revela existência de usuário)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto antes de tentar novamente.' },
  skipSuccessfulRequests: true,
});
app.use('/api/admin/login', loginLimiter);
app.use('/api/client/login', loginLimiter);
app.use('/api/agency/login', loginLimiter);
app.use('/api/auth/forgot-password', loginLimiter);
app.use('/api/auth/reset-password', loginLimiter);

// CORS
app.use(cors());
// JSON body: 10MB cobre todos os fluxos atuais (incluindo /admin/restore-client-data
// que recebe Client.data inteiro). Antes era 50MB — vetor de DoS de memória.
// Uploads de arquivo (Excel/PDF/OFX) NÃO passam por aqui — são multipart/form-data
// processados pelo multer com limites próprios em routes/bpo/imports.js.
app.use(express.json({ limit: '10mb' }));

// Auditoria — captura automática de toda mutação (POST/PUT/PATCH/DELETE)
// em /api e /api/bpo. Registra na trilha AuditLog; best-effort, não bloqueia.
app.use('/api', createAuditMiddleware());

// Routes
app.use('/api', routes);
app.use('/api/bpo', bpoRoutes); // BPO Financeiro V2.0

// Health Check - actually test DB connection
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
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
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
