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

// Security Middleware
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500 // limit each IP to 500 requests per windowMs
});
app.use('/api', limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for Excel/Data uploads

// Routes
app.use('/api', routes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', database: 'connected' });
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

// Graceful Shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
