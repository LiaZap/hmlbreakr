# Refatoração: `Client.data` (JSON) → Tabelas

> Branch: `refactor/json-to-tables`. Plano para tirar a operação do restaurante
> do blob JSON e normalizar em tabelas relacionais — "funcionar como um sistema
> deve ser". Sistema em produção (financeiro) → migração **faseada**, sem big-bang.

---

## 1. Diagnóstico — o "castelo de areia"

Hoje **toda a operação de cada restaurante** vive em **uma coluna**: `Client.data`
(`String`, ~330 KB de JSON). O fluxo é:

```
Frontend carrega o blob inteiro → muta em estado React → recalcula TUDO no cliente
   → POST /api/client/:hash/sync com o blob INTEIRO (debounce 600ms)
```

Problemas estruturais:
- **Read/write do documento inteiro** → race condition e perda de dados (incidente
  Garapas 2026-05-11 — metade do `data` sobrescrita). Hoje "remediado" com
  `ClientDataSnapshot` (snapshots do blob) — um band-aid, não a cura.
- **Sem integridade**: nada garante FK, tipo, unicidade. Dinheiro é `String` ("R$ 4,05").
- **Sem query no banco**: relatórios/admin precisam baixar e parsear o blob.
- **Sem edição concorrente segura** (2 abas/2 usuários = sobrescrita).
- **Toda a regra de cálculo no frontend** (DRE, ponto de equilíbrio, CMV).

> Observação: o módulo **BPO V2** (Payable, Receivable, Supplier, BankAccount, …)
> **já é normalizado** em tabelas. A dívida é só o **núcleo do produto** (fichas,
> insumos, menu, faturamento, custos do onboarding) que ainda mora no blob.

## 2. Objetivo

Normalizar `Client.data` em tabelas com integridade, dinheiro em `Decimal`,
edição por entidade (sem sobrescrever o documento inteiro), query no banco e
auditoria — **preservando 100% dos dados** (nada de perda na migração).

> **ORM: as tabelas NOVAS nascem em Drizzle** (decisão do Paulo). Prisma
> **congela** (não recebe novas tabelas/migrate de schema) e é estrangulado por
> domínio depois. Os dois ORMs convivem no MESMO Postgres: Drizzle é dono só das
> tabelas novas; Prisma continua dono das antigas (Client, Payable, …). Ver §4.1.

---

## 3. O que tem dentro do blob (domínios mapeados)

| Caminho no `Client.data` | Domínio | Vira tabela(s) |
|--------------------------|---------|----------------|
| `operational.insumos[]` | Insumos (ingredientes) | `Ingredient` |
| `operational.fichas[]` (simples) | Ficha técnica + itens | `TechnicalSheet` + `TechnicalSheetItem` |
| `operational.fichas[]` (modular) | Ficha modular | `TechnicalSheet` + `SheetModule` + `SheetModuleOption` |
| `operational.categories` | Categorias (insumo/ficha) | `Category` |
| `menuEngineering[]` | Engenharia de cardápio | `MenuItem` |
| `formData.revenue_history[]` | Faturamento mensal | `RevenueEntry` |
| `formData.daily_revenue{}` | Faturamento diário | `DailyRevenue` |
| `formData.identity` / `restaurant` / `location_costs` | Perfil/empresa | `CompanyProfile` |
| `formData.{utilities,recurring_services,operational_fixed,admin_systems,marketing_structure,monthly_services[],other_fixed_costs[]}` | Custos fixos | `FixedCostItem` |
| `formData.employees[]` | Folha/equipe | `Employee` (avaliar unificar c/ `BpoEmployee`) |
| `formData.partners[]` | Sócios/pró-labore | `Partner` (avaliar unificar c/ `BpoPartner`) |
| `formData.equipment[]` | Equipamentos (depreciação) | `Equipment` |
| `formData.vehicles[]` | Frota | `Vehicle` |
| `formData.fees_cards[]` | Máquinas de cartão | `CardMachine` |
| `formData.fees_marketplaces[]` | Marketplaces (iFood…) | `Marketplace` |
| `formData.metric_snapshots{}` | Snapshots de métricas | `MetricSnapshot` (pode manter JSON pequeno) |
| `cards`, `revenue`, `breakEven`, `overview`, `tips` | **Derivados** (calculados) | NÃO persistir — recalcular |

> Os campos `cards/revenue/breakEven/...` são **computados** do resto. Não viram
> tabela: passam a ser calculados (idealmente no servidor, fase posterior).

---

## 4. Schema-alvo (Drizzle)

### 4.1 Convivência Prisma × Drizzle (mesmo Postgres)
- **Drizzle é dono SÓ das tabelas novas** (`server/src/db/schema.js`). Versiona em
  `__drizzle_migrations`.
- **Prisma continua dono das antigas** (Client, Payable, …). Versiona em
  `_prisma_migrations`. **Congelado**: não cria mais tabelas via Prisma.
- As tabelas novas referenciam `"Client"("id")` por FK (adicionada na migração).
- **NUNCA `drizzle-kit push`** (sincroniza e tentaria dropar as tabelas do Prisma).
  Só `generate` (SQL aditivo) + `migrate`. `tablesFilter` no `drizzle.config.js`
  isola as tabelas novas.

> **Implementado**: schema em `server/src/db/schema.js`, migração aditiva em
> `server/drizzle/0000_core_normalization.sql` (só CREATE — não toca no Prisma).
> O esboço abaixo é o modelo conceitual (campos = mesmos da implementação Drizzle).

Princípios: tudo `clientId` (FK → Client, `onDelete: Cascade`), dinheiro em
`numeric(18,2)` (Drizzle) / `Decimal` — NUNCA string/float, `createdAt/updatedAt`,
soft delete onde editável, índice por `clientId`. Preservar o **id original** do
blob (`legacyId`) p/ remapear referências.

```prisma
model Ingredient {              // insumo
  id          String   @id @default(uuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  legacyId    String?            // id antigo no blob (remap)
  name        String
  category    String?
  unit        String?            // un, kg, L, g, ml
  packPrice   Decimal? @db.Decimal(18,2)   // preço da embalagem
  packQty     Decimal? @db.Decimal(18,4)   // qtd na embalagem
  unitCost    Decimal? @db.Decimal(18,6)   // custo unitário derivado
  active      Boolean  @default(true)
  isDeleted   Boolean  @default(false)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([clientId])
}

model TechnicalSheet {          // ficha técnica (simples ou modular)
  id          String   @id @default(uuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  legacyId    String?
  name        String
  category    String?
  isModular   Boolean  @default(false)
  yield       Decimal? @db.Decimal(18,4)    // rendimento
  sellingPrice Decimal? @db.Decimal(18,2)   // precoVenda
  totalCost   Decimal? @db.Decimal(18,2)    // custoTotal (denormalizado)
  costMin     Decimal? @db.Decimal(18,2)    // modular
  costMax     Decimal? @db.Decimal(18,2)    // modular
  items       TechnicalSheetItem[]
  modules     SheetModule[]
  menuItems   MenuItem[]
  active      Boolean  @default(true)
  isDeleted   Boolean  @default(false)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([clientId])
}

model TechnicalSheetItem {      // insumo dentro da ficha simples
  id           String   @id @default(uuid())
  sheetId      String
  sheet        TechnicalSheet @relation(fields: [sheetId], references: [id], onDelete: Cascade)
  ingredientId String?
  ingredient   Ingredient?    @relation(fields: [ingredientId], references: [id], onDelete: SetNull)
  description  String
  quantity     Decimal  @db.Decimal(18,4)
  unit         String?
  unitCost     Decimal  @db.Decimal(18,6)
  lineCost     Decimal  @db.Decimal(18,2)
  @@index([sheetId])
}

model SheetModule {             // módulo da ficha modular (ex: "Tamanho", "Borda")
  id        String   @id @default(uuid())
  sheetId   String
  sheet     TechnicalSheet @relation(fields: [sheetId], references: [id], onDelete: Cascade)
  legacyId  String?
  name      String
  required  Boolean  @default(true)
  options   SheetModuleOption[]
  @@index([sheetId])
}

model SheetModuleOption {       // opção do módulo (custo manual ou ficha vinculada)
  id            String   @id @default(uuid())
  moduleId      String
  module        SheetModule @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  legacyId      String?
  name          String
  cost          Decimal? @db.Decimal(18,2)
  isDefault     Boolean  @default(false)
  linkedSheetId String?         // composição: opção = outra ficha
  linkedSheet   TechnicalSheet? @relation("OptionLinkedSheet", fields: [linkedSheetId], references: [id], onDelete: SetNull)
  @@index([moduleId])
}

model MenuItem {                // engenharia de cardápio
  id           String   @id @default(uuid())
  clientId     String
  client       Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  sheetId      String?
  sheet        TechnicalSheet? @relation(fields: [sheetId], references: [id], onDelete: SetNull)
  name         String
  category     String?
  salesEstimate Decimal? @db.Decimal(18,2) // "sales" (média estimada)
  price        Decimal? @db.Decimal(18,2)
  cost         Decimal? @db.Decimal(18,2)
  isDeleted    Boolean  @default(false)
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([clientId])
}

model RevenueEntry {            // faturamento mensal (revenue_history)
  id        String   @id @default(uuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  year      Int
  month     Int      // 1-12
  amount    Decimal  @db.Decimal(18,2)
  source    String   @default("onboarding") // onboarding | integration
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([clientId, year, month])
}

model DailyRevenue {            // faturamento diário (daily_revenue)
  id        String   @id @default(uuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date
  amount    Decimal  @db.Decimal(18,2)
  source    String   @default("manual")
  @@unique([clientId, date])
}

// + CompanyProfile, FixedCostItem(group/key/amount/recurrence), Employee, Partner,
//   Equipment, Vehicle, CardMachine, Marketplace, MetricSnapshot
//   (campos exatos a confirmar lendo onboardingQuestions.js + componentes)
```

> **A confirmar antes de fechar o schema**: campos exatos de insumo/ficha em
> `FichaTecnica.jsx` / `CriarFichaModularModal.jsx`, e o catálogo completo de
> `formData` em `src/data/onboardingQuestions.js`.

---

## 5. Estratégia de migração (strangler — faseada, sem big-bang)

| Fase | O que | Garantia |
|------|-------|----------|
| **F0** (este branch) | Plano + migração **additive** que CRIA as tabelas novas. `Client.data` continua a fonte da verdade. | Zero impacto em produção |
| **F1 — Backfill** | Script idempotente lê `Client.data` de cada Client → popula as tabelas. `--dry-run` + **validação** (contagens e somas de custo batem com o blob). | Roda em HML primeiro, com backup |
| **F2 — Dual-write** | `/sync` (e/ou novos endpoints CRUD por entidade) gravam **nas tabelas também**. Blob e tabelas convivem. | Reversível |
| **F3 — Migrar leitura** | Por domínio: **insumos/fichas → menu → faturamento → custos**. Frontend passa a consumir endpoints normalizados (CRUD por entidade) em vez do blob inteiro. | Incremental, por domínio |
| **F4 — Cálculo no servidor** (opcional/maior) | Mover DRE/Ponto de Equilíbrio/CMV pro backend. | Fonte única de verdade |
| **F5 — Deprecar blob** | `Client.data` vira read-only / arquivo histórico. | Fim do castelo de areia |

- **Feature flag por cliente** (ex.: migrar `italico` primeiro) — não vira a chave
  pra todos de uma vez.
- Cada entidade ganha **optimistic locking** (`updatedAt`) → resolve de vez a
  edição concorrente que causou o Garapas.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Perda de dados na migração | Backfill idempotente + `--dry-run` + validação (count/sum) · backup antes · `ClientDataSnapshot` preservado · blob mantido como fonte até F5 |
| Dinheiro `String "R$ x"` → `Decimal` | Parser BR robusto (vírgula/ponto) · validar somas pós-backfill |
| Fichas modulares + composição (linkedFicha) | Tabelas filhas (`SheetModule`/`Option`) · preservar `legacyId` e remapear referências numa 2ª passada |
| Concorrência | Optimistic locking por entidade (`updatedAt` no WHERE) |
| Produção (financeiro) | HML primeiro · 1 cliente piloto · feature flag · rollback documentado |
| Sobreposição `employees`/`partners` com `BpoEmployee`/`BpoPartner` | Decidir unificação na F1 (provável: onboarding alimenta os de custo; BPO é o operacional) |

## 7. Princípios (estrutura base)
- Dinheiro = `Decimal`, nunca `String`/`Float`.
- FK + índice por `clientId`; `onDelete: Cascade` em dado do cliente.
- Soft delete + `createdAt/updatedAt` onde editável; `AuditLog` (já existe) em mutações.
- Optimistic locking onde há edição concorrente.

## 8. Próximos passos (ordem recomendada)
1. **Fechar o schema**: ler `onboardingQuestions.js` + `FichaTecnica.jsx` e confirmar campos de `formData`/insumo/ficha.
2. **Migração additive** (`prisma migrate dev --name core_normalization`) — só cria tabelas.
3. **Backfill** `server/scripts/backfill-core.js` com `--dry-run` + validação.
4. **Piloto** em HML com 1 cliente (`italico`) → validar somas (CMV, custos, faturamento) contra o blob.
5. Seguir F2→F5 por domínio.

> Higiene já feita neste branch: removidos 64 arquivos lixo zero-byte da raiz/`server`.
