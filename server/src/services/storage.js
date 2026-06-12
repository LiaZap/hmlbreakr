/**
 * storage — abstração de object storage (MinIO / S3-compatível) para imagens.
 *
 * Contexto F5: as imagens (logo do restaurante, foto do dono, foto de prato das
 * fichas, foto de sócio) vivem como base64 dentro do blob Client.data (até ~2,7MB
 * cada). Para aposentar o blob é preciso movê-las para object storage e guardar
 * só a URL nas tabelas. Este serviço faz o upload e devolve a URL pública.
 *
 * GRACIOSO: se o MinIO não estiver configurado (sem MINIO_ENDPOINT/keys), o
 * serviço vira no-op — `uploadDataUrl` devolve null e o sistema segue lendo a
 * imagem do blob (fallback do coreRead). Assim dev/local funciona sem MinIO.
 *
 * Idempotente: a chave do objeto é derivada do hash do conteúdo, então subir a
 * mesma imagem duas vezes não duplica (mesma key) e é barato.
 *
 * ENV:
 *   MINIO_ENDPOINT       host do MinIO (ex: minio.hml.exemplo.com ou localhost)
 *   MINIO_PORT           porta (default 9000)
 *   MINIO_USE_SSL        'true' p/ https (default false)
 *   MINIO_ACCESS_KEY     access key
 *   MINIO_SECRET_KEY     secret key
 *   MINIO_BUCKET         bucket (default 'breaker-images')
 *   MINIO_PUBLIC_BASE_URL base pública p/ montar a URL final
 *                         (ex: https://minio.hml.exemplo.com/breaker-images).
 *                         Se ausente, monta a partir de endpoint/port/bucket.
 */
const crypto = require('crypto');

let Minio = null;
try { Minio = require('minio'); } catch { /* dependência opcional */ }

const BUCKET = process.env.MINIO_BUCKET || 'breaker-images';
const EXT_BY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
};

let _client = null;
let _bucketReady = false;

function isConfigured() {
  return !!(Minio && process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY);
}

function getClient() {
  if (!isConfigured()) return null;
  if (_client) return _client;
  _client = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: String(process.env.MINIO_USE_SSL).toLowerCase() === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  });
  return _client;
}

async function ensureBucket(client) {
  if (_bucketReady) return;
  const exists = await client.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await client.makeBucket(BUCKET);
    // Política public-read (imagens são servidas direto por URL).
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      }],
    };
    await client.setBucketPolicy(BUCKET, JSON.stringify(policy)).catch(() => {});
  }
  _bucketReady = true;
}

function publicUrl(key) {
  const base = process.env.MINIO_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, '')}/${key}`;
  const proto = String(process.env.MINIO_USE_SSL).toLowerCase() === 'true' ? 'https' : 'http';
  const port = Number(process.env.MINIO_PORT) || 9000;
  return `${proto}://${process.env.MINIO_ENDPOINT}:${port}/${BUCKET}/${key}`;
}

/**
 * Sobe uma imagem (data URL base64) pro object storage e devolve a URL pública.
 * - Se `value` já for uma URL http(s), devolve como está (nada a fazer).
 * - Se for data URL base64, faz upload e devolve a URL.
 * - Se MinIO não configurado ou valor inválido, devolve null (fallback do blob).
 *
 * @param {string} value     data:image/...;base64,... | http(s)://...
 * @param {string} keyPrefix prefixo da chave (ex: `clients/<clientId>/logo`)
 * @returns {Promise<string|null>}
 */
async function uploadDataUrl(value, keyPrefix = 'img') {
  if (!value || typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) return value; // já é URL
  const m = value.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
  if (!m) return null; // não é imagem base64 reconhecível
  const client = getClient();
  if (!client) return null; // sem MinIO → mantém base64 no blob (fallback)

  const mime = m[1].toLowerCase();
  const buffer = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  const ext = EXT_BY_MIME[mime] || 'bin';
  const key = `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${hash}.${ext}`;

  await ensureBucket(client);
  await client.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mime });
  return publicUrl(key);
}

module.exports = { uploadDataUrl, isConfigured, BUCKET };
