const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Trust proxy (required behind Easypanel/Traefik reverse proxy)
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500 // limit each IP to 500 requests per windowMs
});
app.use('/api', limiter);

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api', routes);

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

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Graceful Shutdown
const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
