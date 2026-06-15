# EasyPanel — estrutura do HML (Breaker)

Passo a passo pra subir o HML num EasyPanel separado, com 3 serviços no mesmo
**Project**: `app` (Breaker), `db` (Postgres) e `minio` (object storage).

> EasyPanel = PaaS self-hosted (Docker + Traefik). Serviços do mesmo Project se
> enxergam pela **rede interna** usando o hostname `<project>_<service>`. O
> Traefik cuida de domínio + HTTPS (Let's Encrypt) automático.

---

## Visão geral

```
                    Internet (HTTPS via Traefik)
        ┌───────────────┬───────────────────────┐
        │               │                       │
   hml.seudominio   storage-hml.seu...      minio-hml.seu... (console)
        │               │                       │
   ┌────▼────┐     ┌─────▼──────────────────────▼───┐
   │  app    │     │            minio               │
   │ :3001   │     │   :9000 (S3 API) :9001 (UI)    │
   │ Dockerfile    │   minio/minio:latest           │
   └──┬───┬──┘     └────────────────┬───────────────┘
      │   │  (rede interna do project)│
      │   └──────────────────────────┘  upload server-side
      │
   ┌──▼──────────┐
   │  db         │  postgres:17  :5432
   │ (template)  │
   └─────────────┘
```

Project sugerido: **`breakerhml`** (o hostname interno vira `breakerhml_db` / `breakerhml_minio`).

---

## 1. Serviço `db` — Postgres

- **Add Service → Database → Postgres**.
- Service name: `db`
- Image / versão: `postgres:17`
- Database: `breaker_hml`  ·  User: `breaker`  ·  Password: gere uma forte (anote).
- Após criar, abra o serviço → aba **Credentials**: copie o **Internal host** (algo como `breakerhml_db`) e a porta `5432`. É o que vai no `DATABASE_URL` do app.

`DATABASE_URL` resultante:
```
postgres://breaker:SUA_SENHA@breakerhml_db:5432/breaker_hml
```

---

## 2. Serviço `minio` — object storage (imagens / F5)

Não há template nativo; sobe como **App a partir de imagem**.

- **Add Service → App**.
- Service name: `minio`
- **Source → Docker Image**: `minio/minio:latest`
- **Deploy → Command**:
  ```
  server /data --console-address ":9001"
  ```
- **Environment**:
  ```
  MINIO_ROOT_USER=breaker-minio
  MINIO_ROOT_PASSWORD=senha-forte-do-minio
  ```
- **Mounts → Volume**: `minio-data` montado em `/data` (persistência das imagens).
- **Domains** (dois):
  | Domínio | Container Port | Para quê |
  |---|---|---|
  | `storage-hml.seudominio.com` | `9000` | API S3 — serve as imagens públicas |
  | `minio-hml.seudominio.com` | `9001` | Console web (admin do MinIO) |
- O bucket `breaker-images` é criado **automaticamente** no primeiro upload, já com política de leitura pública (ver `src/services/storage.js`).

> **Hostname interno** do MinIO p/ o app: `breakerhml_minio` (porta `9000`).

---

## 3. Serviço `app` — Breaker (a partir do hmlbreakr)

- **Add Service → App**.
- Service name: `app`
- **Source → GitHub**: repo `LiaZap/hmlbreakr`, branch `main`.
- **Build → Dockerfile** (o repo já tem o `Dockerfile`; o `npm start` roda
  `node src/db/migrate.js` e sobe a API — migrações Drizzle aplicam sozinhas).
- **Domains**: `hml.seudominio.com` → Container Port `3001`.
- **Environment** (cole tudo; troque os valores):

```env
NODE_ENV=production
PORT=3001

# Banco (host interno do serviço db)
DATABASE_URL=postgres://breaker:SUA_SENHA@breakerhml_db:5432/breaker_hml

# MinIO — ENDPOINT é o host INTERNO (upload server-side);
# PUBLIC_BASE_URL é o domínio PÚBLICO (o que o navegador carrega).
MINIO_ENDPOINT=breakerhml_minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=breaker-minio
MINIO_SECRET_KEY=senha-forte-do-minio
MINIO_BUCKET=breaker-images
MINIO_PUBLIC_BASE_URL=https://storage-hml.seudominio.com/breaker-images

# App / auth / billing (use chaves de TESTE no HML)
APP_URL=https://hml.seudominio.com
ADMIN_TOKEN=<32+ chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
SUPER_ADMIN_EMAIL=admin@seudominio.com
SUPER_ADMIN_PASSWORD=senha-super-admin
CLERK_SECRET_KEY=sk_test_...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
OPENAI_API_KEY=sk-...   # opcional (conciliação IA)
BACKUP_ENABLED=false
```

> **Frontend (Vite, build-time):** o build do Dockerfile gera o `/dist`. Se o
> front precisar de `VITE_API_URL` / `VITE_CLERK_PUBLISHABLE_KEY`, defina-os
> também no Environment do app **antes do build** (EasyPanel injeta no build).
> ```
> VITE_API_URL=https://hml.seudominio.com
> VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
> ```

---

## 4. Ordem de deploy

1. Suba `db` e `minio` primeiro (precisam estar de pé).
2. Suba `app` (no 1º boot ele aplica as 11 migrações Drizzle — idempotente).
3. Verifique: `https://hml.seudominio.com/health` → `{"database":"connected"}`.

---

## 5. Carregar os dados do PRD (cópia read-only) e popular o núcleo

```bash
# DUMP do PRD (READ-ONLY). Rode da sua máquina, com credenciais de PRD.
pg_dump "postgres://USER:SENHA@HOST_PRD:PORTA/BANCO" \
  --no-owner --no-acl --clean --if-exists --file=prd_dump.sql

# RESTORE no Postgres do HML. Pegue a connection EXTERNA do serviço db no
# EasyPanel (aba Credentials → External), ou rode via console do serviço.
psql "postgres://breaker:SUA_SENHA@HOST_EXTERNO_HML:PORTA/breaker_hml" < prd_dump.sql
```

Depois, no serviço `app` (aba **Console/Terminal** do EasyPanel, dentro do container):
```bash
cd server
node src/db/migrate.js                              # garante 0000–0010 (no-op se já aplicou no boot)
node scripts/backfill-core.js --allow-remote --wipe # reconstrói as 20 tabelas do núcleo a partir do blob
```
> `--allow-remote` (o banco não é localhost) e `--wipe` (idempotente — limpa o núcleo
> do cliente antes de reinserir; sem ele, re-rodar dá UNIQUE em categorias já criadas).

> **Trazer só ALGUNS clientes do PRD** (em vez do dump completo): use
> `node scripts/pull-clients-prd-to-hml.mjs --list` e depois `--hashes=...`/`--recent=N`
> (aditivo, idempotente, PRD read-only). Depois rode o backfill acima.

---

## 6. Checklist

- [ ] `db` (Postgres 17) no ar, senha anotada
- [ ] `minio` no ar, 2 domínios (storage + console), volume `/data`
- [ ] `app` build OK (Dockerfile), domínio + `:3001`, env completo
- [ ] `MINIO_ENDPOINT` = host **interno**; `MINIO_PUBLIC_BASE_URL` = domínio **público** (com `/breaker-images`)
- [ ] `/health` = connected
- [ ] PRD dumpado (read-only) e restaurado no HML
- [ ] migrate (boot do app) + `backfill-core.js --allow-remote --wipe` rodados
- [ ] Segredos do HML são de **teste** e os de produção foram **rotacionados**

---

## Alternativa: serviço único via Compose

Em vez de 3 serviços, dá pra usar **Add Service → Compose** e colar o
[`docker-compose.hml.yml`](../docker-compose.hml.yml) (app + db + minio juntos).
Mais simples de subir, porém o roteamento de domínio/SSL fica mais manual
(precisa configurar os domínios do Traefik por serviço). Pra HML gerenciável,
os **3 serviços separados** (acima) são o caminho recomendado no EasyPanel.
