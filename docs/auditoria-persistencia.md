# Auditoria de Persistência de Dados — Breaker

> Diagnóstico READ-ONLY (2026-06-11). Não propõe correção — só relata.
> Levantamento por varredura paralela do código (schema, migrations, JSON, frontend).

## Resumo

Dois ORMs no **mesmo PostgreSQL**: **Prisma** (31 tabelas: Client/Agency, BPO
Financeiro V2, auth/admin/audit) e **Drizzle** (17 tabelas novas do refactor,
ainda não usadas em runtime). **48 tabelas.** O grosso do produto vive em
**JSON-em-texto**: o blob `Client.data` (~330 KB/cliente) + ~9 colunas `String`
guardando JSON + arquivos `.json` de backup + dados de negócio em `localStorage`.
**Não há n8n** (webhooks Stripe/Asaas/Z-API gravam direto no Postgres).

---

## 1. Schema atual (inventário)

> Colunas + tipos completos em `server/prisma/schema.prisma` e
> `server/src/db/schema.js`. PK sempre `id` (text/uuid).

### Prisma (31) — tabelas antigas

| Tabela | FKs (onDelete) | Índices | Colunas JSON/array |
|---|---|---|---|
| Agency | — (pai de Client) | active; uniq hash,email | — |
| **Client** | agencyId→Agency (Restrict) | agencyId, active, subscriptionStatus, blockedByAdmin; uniq hash,email,clerkUserId | **`data` (blob ~330KB)** |
| StripeEvent | — (clientId solto, sem FK) | type+processedAt; clientId+processedAt | **`payload`** |
| ClientDataSnapshot | clientId→Client (Cascade) | clientId+createdAt | **`data` (cópia do blob)** |
| AdminUser | — (invitedBy/blockedBy soltos) | email, role, active | **`permissions` TEXT[]** |
| TeamMember | clientId→Client (Cascade) | clientId; uniq hash,email,clerkUserId | — |
| Broadcast | — | active, targetCategory | — |
| AuditLog | — (append-only, sem FK) | entityType+entityId+createdAt; action; category; createdAt | **`metadata`** |
| Supplier | clientId→Client (Cascade); defaultCategory/BankAccount (SetNull) | uniq clientId,cnpj; clientId | — |
| BankAccount | clientId→Client (Cascade) | clientId | — |
| FinancialCategory | clientId→Client (Cascade); parentId self (SetNull) | clientId | — |
| BpoEmployee | clientId→Client (Cascade) | uniq clientId,cpf | — |
| BpoPartner | clientId→Client (Cascade) | uniq clientId,cpf | — |
| PaymentMethod | clientId→Client (Cascade) | clientId | — |
| Loan | clientId→Client (Cascade) | clientId, status | — |
| ReceivableAdvance | clientId (Cascade); paymentMethodId (SetNull) | clientId | — |
| **Payable** | clientId (Cascade); supplier/category/recurrence (SetNull); parent self (Cascade) | clientId+status+dueDate | **`attachments`, `taxesRetained`** |
| **Receivable** | clientId (Cascade); category/paymentMethod/recurrence (SetNull); parent (Cascade) | clientId+status+dueDate | **`attachments`** |
| Recurrence | — | startDate | — |
| PaymentTransaction | payable/receivable (Cascade); bankAccount (Restrict) | payableId, receivableId, bankAccount+paidAt | — |
| **BankTransaction** | bankAccountId→BankAccount (Cascade) | bankAccount+date; reconciled | **`rawJson`** |
| ReconciliationRule | clientId (Cascade); supplier/category/bankAccount **soltos sem FK** | clientId+active | — |
| BankTransfer | clientId (Cascade); from/toAccount (Restrict) | clientId+date | — |
| BpoTask | clientId→Client (Cascade) | clientId+status; status+severity+dueAt | — |
| **WhatsappMessage** | clientId→Client (**SetNull** — única) | clientId+status; fromNumber; status+createdAt | **`conversationData`, `rawJson`** |
| **PdvIntegration** | clientId→Client (Cascade) | clientId+active | **`authConfig` (segredo!)** |

### Drizzle (17) — tabelas novas (refactor)

Já com `isDeleted`/`deletedAt`/`active`. Todas FK `clientId → Client` **ON DELETE CASCADE**.
`Ingredient`, `TechnicalSheet`, `TechnicalSheetItem`, `SheetModule`,
`SheetModuleOption`, `MenuItem`, `RevenueEntry`, `DailyRevenue`, `CompanyProfile`,
`FixedCostItem`, `Employee`, `Partner`, `Equipment`, `Vehicle`, `CardMachine`,
`Marketplace`, `MetricSnapshot`. Única coluna JSON: **`MetricSnapshot.drivers` (jsonb)**.

> ⚠️ Compliance vs CLAUDE.md: tabelas **Prisma** sem `is_deleted/deleted_at/modified_by`
> (só `active`) e com **FK CASCADE em dado crítico** (proibido pela base). Drizzle
> segue melhor, mas também CASCADE a partir de Client.

---

## 2. Caça ao JSON — diagnóstico

| Dado | Onde está hoje | JSON ou Tabela? | Deveria ser | Risco de perda |
|---|---|---|---|---|
| **Operação inteira do cliente** (fichas, insumos, menu, custos, faturamento, perfil) | `Client.data` (schema.prisma:55); escreve routes.js:208/1650/1766/538/818; lê routes.js:295/1327, financialCalc.js, front DashboardContext.jsx | **JSON-em-texto** (String, nem jsonb) | ~14 tabelas (Drizzle já criadas) + perfil→colunas do Client | **CRÍTICO** — save sobrescreve o blob inteiro; incidentes Garapas/Pampa/Chef Burguer |
| **Versão de concorrência** `_dataVersion` | dentro do blob (routes.js:1579/1622); /sync-partial nem usa | campo no JSON | coluna `version`/`updatedAt` + UPDATE condicional | **ALTO** — trava cosmética: UPDATE (1650) sem WHERE de versão |
| **Snapshot do blob** | `ClientDataSnapshot.data` (schema.prisma:111); snapshotService.js:39 | String (cópia 330KB) | versionamento sobre tabelas normalizadas | **ALTO** — fora de transação com o update; prune 50 → rajada apaga o bom |
| **Anexos de lançamento** | `Payable/Receivable.attachments` (431/479); payables.js:201/307, whatsapp.js:161 | array-em-texto (String?) | tabela `Anexo` (FK payableId) | **MÉDIO** — update sobrescreve array; sem auditoria |
| **Impostos retidos** `{ir,csll,pis,cofins,iss}` | `Payable.taxesRetained` (432); payables.js:202; sem update | JSON-em-texto | colunas `numeric` na Payable | **MÉDIO/ALTO** — fiscal invisível a query/DRE; sem update |
| **Credenciais do PDV** | `PdvIntegration.authConfig` (638) — stub | JSON-em-texto (segredo em claro) | config tipada + secret manager | **ALTO (segurança)** — apiKey em claro em qualquer dump |
| **Estado da conversa do bot** | `WhatsappMessage.conversationData` (618) — órfão | JSON-em-texto (stub) | colunas tipadas | **BAIXO** hoje |
| **Payload bruto de webhook** | `WhatsappMessage.rawJson` (whatsapp.js:67), `BankTransaction.rawJson` | JSON-em-texto (evidência) | jsonb / tabela WebhookEvent | **BAIXO-MÉDIO** — mistura log+dado, PII, sem retenção |
| **Metadata de auditoria** | `AuditLog.metadata` (191); auditService.js:77 | JSON-em-texto | jsonb | **BAIXO** — append-only |
| **Payload do evento Stripe** | `StripeEvent.payload`; stripeWebhook.js:408 | JSON-em-texto | jsonb + retenção | **BAIXO** — bem modelado (idempotência) |
| **Drivers do snapshot mensal** | `MetricSnapshot.drivers` (db/schema.js:295); backfill-core.js:266 | **jsonb** | colunas numeric | **BAIXO/MÉDIO** — perde tipagem/agregação |
| **Permissões do admin** | `AdminUser.permissions` TEXT[] | array nativo | catálogo de permissões | **BAIXO** — consultável |
| **Backups do banco** (incl. `Client.data`) | `server/backups/backup-auto-YYYY-MM-DD.json` (backupScheduler.js:113); restore routes.js:752 | **arquivo .json** (fonte de restore) | pg_dump fora do servidor | **ALTO** — mesmo servidor; filename por dia sobrescreve; restore reescreve blob |
| **Restore manual do blob** | routes.js:485/536, 556/587; restore-pampa.html, bulk-restore.html | JSON via HTTP → blob | restore por entidade + snapshot pré | **ALTO** — sobrescreve sem snapshot atual; bulk-restore.html sem auth |
| **/sync-partial (deepMerge)** | routes.js:1702-1807; deepMerge.js | JSON-em-texto | proteções do /sync OU tabelas | **ALTO** — deepMerge substitui arrays; sem snapshot/versão/wipe-guard |
| **Conversão comercial** (lead→cliente) | `CommercialFunnel.jsx:36` localStorage | **localStorage** | flag no Client via endpoint + auditoria | **ALTO** — só no navegador; some ao limpar cache; catch vazio |
| **Ações do briefing diário** | `DailyBriefing.jsx` localStorage | **localStorage** | tabela de tarefas (FK admin) | **MÉDIO** — só no navegador |
| **Visões salvas de relatório** | `ReportsPage/SavedFilters.jsx` localStorage | **localStorage** | tabela de visões (FK admin) | **BAIXO/MÉDIO** — preso ao navegador |
| **Foto/prefs do admin + broadcasts dispensados** | `AdminPanel.jsx`, `BroadcastPopup.jsx` localStorage | **localStorage** (foto base64) | colunas no AdminUser / broadcast_dismissals | **BAIXO** — perde ao trocar navegador |
| **Sessão/identidade do admin** | `adminAuth.js` sessionStorage | **sessionStorage** | cookie httpOnly + auth no servidor | **MÉDIO (segurança)** — XSS; servidor confia em header do cliente |
| **Cliente BPO selecionado** (objeto inteiro) | `BpoContext.jsx` localStorage | localStorage (objeto serializado) | guardar só id/hash | **BAIXO** — snapshot stale |

---

## 3. Relações implícitas (array no JSON que deveria ser linha com FK)

- **`Client.data`** → `operational.fichas[]`→TechnicalSheet · `insumos[]`→Ingredient ·
  `menuEngineering[]`→MenuItem · `formData.{employees,partners,equipment,vehicles,fees_cards,fees_marketplaces,monthly_services,other_fixed_costs}[]`→tabelas respectivas ·
  `revenue_history[]`/`daily_revenue{}`→RevenueEntry/DailyRevenue · `metric_snapshots{}`→MetricSnapshot ·
  `restaurant/identity/location`→CompanyProfile/colunas do Client. *(refactor Drizzle já mapeia.)*
- **`Payable/Receivable.attachments[]`** → linhas `Anexo` (FK payableId/receivableId).
- **`Payable.taxesRetained{}`** → colunas de imposto (1:1).
- **`CommercialFunnel` (Set de convertidos)** → linhas de funil (FK Client + AdminUser).
- **`broadcast-dismissed`** → `broadcast_dismissals` (FK broadcast + user).

## 4. Pontos de perda

1. **Sobrescrita do blob inteiro** — `/sync` (routes.js:1653) e `/sync-partial` (deepMerge substitui arrays) → last-write-wins.
2. **Optimistic lock cosmético** — UPDATE sem `WHERE updatedAt/version`; `/sync-partial` ignora versão.
3. **Sem transação** — `createSnapshot` + `update` + `prune` soltos (1644 vs 1650); snapshot pode falhar e o save prossegue.
4. **Prune agressivo** — só 50 snapshots + rajada de saves apaga o snapshot bom (Pampa 56/dia).
5. **Backups** — mesmo servidor; 1 arquivo por dia sobrescreve; restore sem snapshot pré.
6. **Dados de negócio em localStorage** — conversão comercial / briefing somem ao limpar cache; catch vazio.
7. **FKs ausentes** — StripeEvent.clientId, AdminUser.invitedBy/blockedBy, ReconciliationRule.* → órfãos.
8. **FK CASCADE a partir de Client** — apagar 1 Client deleta TODAS as linhas (Prisma e Drizzle) → perda em massa.
9. **Segredo em claro** — `PdvIntegration.authConfig` exposto em dump/backup.
