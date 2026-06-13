# Deploy HML (Homologação) — Breaker

Versão **100% Drizzle** (sem Prisma) + **MinIO** para imagens (F5). Sobe num
EasyPanel separado, a partir do repositório de HML.

> **Guardrails:** produção é **read-only** (só `pg_dump`). NUNCA rodar migração,
> seed ou escrita contra o banco de PRD. O HML é uma **cópia** do PRD.

---

## 1. Componentes

| Serviço | Imagem | Função |
|---|---|---|
| `app` | build via `Dockerfile` | API Express + frontend Vite (servido pelo mesmo container) |
| `db` | `postgres:17` | Banco do HML (cópia do PRD) |
| `minio` | `minio/minio` | Object storage S3-compatível p/ as imagens |

As migrações **Drizzle** rodam sozinhas no boot do app: `npm start` executa
`node src/db/migrate.js` (aplica `server/drizzle/*.sql`, idempotente) **antes** de
subir a API. Não há `prisma migrate`.

---

## 2. Subir no EasyPanel

1. Crie um **projeto HML** novo no EasyPanel.
2. **Postgres**: adicione um serviço Postgres 17. Anote host/porta/usuário/senha/db.
3. **MinIO**: adicione um serviço MinIO. Defina `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`.
   Exponha a porta 9000 (API) atrás de um domínio/HTTPS — essa URL vira o
   `MINIO_PUBLIC_BASE_URL` (com o bucket no final). O bucket `breaker-images` é
   criado automaticamente no primeiro upload (com política de leitura pública).
4. **App**: aponte o serviço para o repositório de HML (build pelo `Dockerfile`).
5. Configure as variáveis de ambiente do app a partir de [`.env.hml.example`](../.env.hml.example):
   - `DATABASE_URL=postgres://USER:SENHA@HOST_DB:5432/breaker_hml`
   - `MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY/BUCKET/MINIO_PUBLIC_BASE_URL`
   - `ADMIN_TOKEN` (≥32 chars), `CLERK_SECRET_KEY`, `SMTP_*`, `STRIPE_*` (chaves de **teste**), `OPENAI_API_KEY`, `APP_URL`.
   - Frontend (build): `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.

> Alternativa standalone (fora do EasyPanel): `docker compose -f docker-compose.hml.yml up -d --build`
> (copie `.env.hml.example` → `.env` antes).

---

## 3. Copiar os dados do PRD para o HML (cópia read-only)

O HML deve ser réplica do PRD. Faça um dump **somente leitura** do PRD e restaure no HML.

```bash
# 1) DUMP do PRD (READ-ONLY — só lê). Use credenciais de PRD.
pg_dump "postgres://USUARIO:SENHA@HOST_PRD:PORTA/BANCO" \
  --no-owner --no-acl --clean --if-exists \
  --file="prd_dump_$(date +%d_%m_%Y_%H_%M).sql"

# 2) RESTORE no HML (NUNCA o contrário).
psql "postgres://USER:SENHA@HOST_DB_HML:5432/breaker_hml" < prd_dump_DD_MM_AAAA_HH_MM.sql
```

O dump do PRD traz as 26 tabelas legadas (Client, Payable, etc.). As 20 tabelas
**normalizadas** do Drizzle (Category, Ingredient, fichas…) NÃO existem no PRD —
serão criadas pela migração no próximo passo.

---

## 4. Migrar o schema (Drizzle) e popular as tabelas normalizadas

```bash
# Aplica as migrações Drizzle no HML. Roda sozinho no boot do app, mas pode
# rodar manualmente (cwd server/):
DATABASE_URL=postgres://...HML... npm run db:migrate
```

O migrador é **idempotente**:
- `0000`–`0008` criam as 20 tabelas do núcleo (não existem no dump do PRD).
- `0009` adota as 26 tabelas legadas com `CREATE TABLE IF NOT EXISTS` → **pula** (já vieram do dump).
- `0010` adiciona `Partner.photoUrl`.

Depois, **reconstrua** as tabelas do núcleo a partir do blob de cada cliente (F2):

```bash
DATABASE_URL=postgres://...HML... npm run db:backfill
```

---

## 5. Imagens (MinIO / F5)

- A partir de agora, **todo save** que contiver imagem base64 sobe a imagem pro
  MinIO e grava a **URL** na tabela (`CompanyProfile.businessLogo/ownerPhoto`,
  `TechnicalSheet.dishPhoto`, `Partner.photoUrl`). A leitura passa a servir a URL;
  o base64 antigo continua no blob como fallback.
- **Backfill em massa** das imagens já existentes (mover o base64 histórico do blob
  pro MinIO) é um passo posterior — ainda não implementado (escopo: "uploads novos").
- Sem `MINIO_*` configurado, o serviço de imagem vira **no-op** (segue lendo do blob).

---

## 6. Flags de leitura por cliente (F3)

As flags `read*FromTables` por cliente continuam **default OFF**. Para validar a
leitura pelas tabelas no HML, ligue por cliente (após o backfill) e compare com o
comportamento do blob. Rollback = desligar a flag (volta a ler do blob).

---

## 7. Checklist final

- [ ] PRD dumpado (read-only) e restaurado no HML
- [ ] `npm run db:migrate` aplicado no HML (10 migrações)
- [ ] `npm run db:backfill` rodado (tabelas do núcleo populadas)
- [ ] MinIO acessível e `MINIO_PUBLIC_BASE_URL` correto
- [ ] `/health` retorna `database: connected`
- [ ] Segredos do HML são de **teste** (Stripe/Clerk) e foram **rotacionados** se vieram de algum `.env` versionado
