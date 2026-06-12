# Plano de Migração — Tirar o "castelo de areia" (JSON) de produção

> **Status:** proposta (não executada em produção).
> **Branch:** `refactor/json-to-tables`.
> **Guardrail absoluto deste plano:** nada é deletado de nenhum banco; toda
> validação roda numa **cópia local** espelhada da produção; a produção atual
> (blob `Client.data` + Prisma) continua sendo a fonte da verdade até o corte
> final, com o blob mantido como rede de segurança mesmo depois.
>
> Complementa: [`refactor-json-para-tabelas.md`](./refactor-json-para-tabelas.md)
> (o "como") e [`auditoria-persistencia.md`](./auditoria-persistencia.md) (o
> "o que está onde hoje"). Este documento responde **duas perguntas**:
> 1. As tabelas foram todas criadas e estão conectadas corretamente? (cap. 2–4)
> 2. Qual a melhor forma de migrar sem sentir impacto? (cap. 5–8)

---

## 1. TL;DR

- O **núcleo** (insumos → fichas → itens → módulos → opções; menu; faturamento)
  está **bem modelado** e já foi backfilled e reconciliado no local (39 clientes,
  0 divergências de contagem e de faturamento). **A espinha dorsal está pronta.**
- Mas a migração **ainda é "lossy"** e tem **5 defeitos de relacionamento** que
  precisam ser corrigidos **antes** de ligar o dual-write (F2). Corrigir agora é
  barato (ninguém lê as tabelas novas ainda); corrigir depois do corte é caro.
- A melhor forma de migrar com baixo impacto é **strangler-fig por domínio, com
  feature flag por cliente**, reusando o padrão que **já existe e funciona**:
  `onboardingSync.js` (blob → tabelas, idempotente, não-destrutivo). O blob nunca
  é apagado — vira backup vivo.

**Veredito da pergunta "faltou criar tabela?":** faltam **2 tabelas**
(`Category`, e um lar para o **perfil do dono/usuário**) e **4 ligações**
(Employee↔BpoEmployee, Partner↔BpoPartner, Marketplace/CardMachine↔PaymentMethod,
MenuItem→TechnicalSheet obrigatório?). Além disso, faltam **colunas** em
`TechnicalSheet` e `Ingredient` (receituário e unidade de compra) — sem elas a
normalização perde dados.

---

## 2. Tabelas criadas — inventário e veredito

17 tabelas Drizzle, em 2 migrações. Drizzle é dono só delas; Prisma continua dono
de `Client`, `Payable`, `BpoEmployee`, `PaymentMethod`, etc.

| # | Tabela | Migração | Origem no blob | Veredito |
|---|--------|----------|----------------|----------|
| 1 | `Ingredient` | 0000 | `operational.insumos[]` | ✅ criada — ⚠️ faltam colunas (`packUnit`, `yield`, `isPrepared`) |
| 2 | `TechnicalSheet` | 0000 | `operational.fichas[]` | ✅ criada — ⚠️ faltam colunas do receituário |
| 3 | `TechnicalSheetItem` | 0000 | `fichas[].ingredients[]` | ✅ relação interna correta |
| 4 | `SheetModule` | 0000 | `fichas[].modules[]` | ✅ correta |
| 5 | `SheetModuleOption` | 0000 | `modules[].options[]` | ✅ correta (composição via `linkedSheetId`) |
| 6 | `MenuItem` | 0000 | `menuEngineering[]` | ✅ criada — ⚠️ link com ficha é opcional |
| 7 | `RevenueEntry` | 0000 | `revenue_history` | ✅ correta (unique client+ano+mês) |
| 8 | `DailyRevenue` | 0000 | `daily_revenue` | ✅ correta (unique client+data) |
| 9 | `CompanyProfile` | 0001 | `identity`/`location_costs` | ✅ 1:1 com Client — ⚠️ perde logo/cuisine |
| 10 | `FixedCostItem` | 0001 | custos recorrentes | ✅ criada (EAV) — ⚠️ sem catálogo de chaves |
| 11 | `Employee` | 0001 | `formData.employees[]` | ⚠️ **duplica** `BpoEmployee` sem vínculo |
| 12 | `Partner` | 0001 | `formData.partners[]` | ⚠️ **duplica** `BpoPartner` sem vínculo |
| 13 | `Equipment` | 0001 | `formData.equipment[]` | ✅ criada |
| 14 | `Vehicle` | 0001 | `formData.vehicles[]` | ✅ criada |
| 15 | `CardMachine` | 0001 | `fees_cards` | ⚠️ sobrepõe `PaymentMethod` (card) |
| 16 | `Marketplace` | 0001 | `fees_marketplaces` | ⚠️ sobrepõe `PaymentMethod` (marketplace) |
| 17 | `MetricSnapshot` | 0001 | indicadores por mês | ⚠️ `drivers` como JSON (reintroduz o anti-padrão) |

**Faltando criar (planejadas mas não implementadas):**

| Tabela ausente | Por quê | Hoje vira o quê |
|----------------|---------|-----------------|
| `Category` | `operational.categories` (categorias custom do cliente) | string solta em 3 tabelas; o backfill **nem lê** |
| Perfil do dono (`UserProfile` ou colunas no Client) | `data.user` / `formData.user_info` (nome, foto, role do dono) | **descartado** — backfill ignora 100% |

---

## 3. Relações — o que está certo e o que está errado

### 3.1 Relações internas (núcleo) — ✅ corretas

```
TechnicalSheet ──(cascade)──> TechnicalSheetItem ──(set null)──> Ingredient
      │                                                              ▲
      ├──(cascade)──> SheetModule ──(cascade)──> SheetModuleOption ──┘ (set null, via linkedSheetId)
      │
      └<─(set null)── MenuItem
```

- `TechnicalSheetItem.sheetId → TechnicalSheet` **cascade** — item só existe dentro da ficha. Correto.
- `TechnicalSheetItem.ingredientId → Ingredient` **set null** — a linha guarda `description/unitCost/lineCost` desnormalizados; apagar o insumo não invalida a ficha. Correto.
- `SheetModule → TechnicalSheet` / `SheetModuleOption → SheetModule` **cascade**. Correto.
- `SheetModuleOption.linkedSheetId → TechnicalSheet` **set null** — composição (opção = outra ficha) sem cascatear delete. Bem modelado.
- Uniques de faturamento/snapshot/profile e index por `clientId` em todas: corretos (multi-tenant).

> **Essa parte é a mais difícil de modelar e está logicamente correta.** O risco
> não está no núcleo — está nas bordas (Client, Category, BPO).

### 3.2 Problemas de relacionamento — ❌ corrigir antes da F2

| # | Problema | Gravidade | Correção |
|---|----------|-----------|----------|
| P1 | **FK `clientId → Client` é `ON DELETE CASCADE`** nas 14 tabelas. Apagar um Client fisicamente apagaria toda a operação. **Viola a regra absoluta da base** ("nunca CASCADE para dados críticos"). | 🔴 alta | Trocar para `ON DELETE RESTRICT` em todas. Client deve usar soft delete. |
| P2 | **`Category` não existe.** `category` é string solta em `Ingredient`, `TechnicalSheet`, `MenuItem`. Sem integridade → "Bebidas" vs "bebida"; renomear exige tocar N linhas (fere DRY/SOLID). | 🔴 alta | Criar `Category(id, clientId, name, scope, active, auditoria)` e trocar as 3 colunas string por `categoryId` FK. |
| P3 | **`Employee`/`Partner` duplicam `BpoEmployee`/`BpoPartner`** sem ligação. Campos de conta pessoal são **idênticos**. Mesma pessoa pode virar 2 cadastros → folha divergente. | 🔴 alta | Decidir na F1: unificar, ou adicionar `bpoEmployeeId`/`bpoPartnerId` (FK nullable, set null). |
| P4 | **`Marketplace`/`CardMachine` sobrepõem `PaymentMethod`** (taxa de recebimento modelada em 2 lugares). | 🟡 média | Mapear/ligar ou definir fonte única antes do dual-write. |
| P5 | **`MenuItem.sheetId` opcional** (set null). Item de cardápio sem ficha não reflete CMV real. | 🟡 média | Decisão de negócio: obrigatório+restrict, ou manter opcional e documentar. |
| P6 | **Dessincronia JS↔SQL:** as FK `clientId → Client` só existem no SQL bruto, não no `schema.js`. Quem lê o schema não vê o cascade escondido. | 🟡 média | Declarar/comentar a relação no `schema.js`. |
| P7 | **`legacyId` não é único** → upsert do backfill não é realmente idempotente (reprocessar pode duplicar). | 🟡 média | `UNIQUE (clientId, legacyId) WHERE legacyId IS NOT NULL`. |
| P8 | **Sem `modifiedBy`/`userId` em nenhuma das 17 tabelas.** A base exige registrar quem alterou; sem isso o optimistic locking e o dashboard de erros por usuário não funcionam. | 🟡 média | Adicionar `modifiedBy text` em todas as tabelas editáveis. |
| P9 | **Soft delete inconsistente** (só 4 de 17 têm `isDeleted/deletedAt`; 13 têm só `active`, que é estado de negócio, não deleção). | 🟡 média | Padronizar `isDeleted/deletedAt` (+ `deletedBy`) nas editáveis; manter `active` separado. |
| P10 | **Auditoria incompleta:** `TechnicalSheetItem` sem `createdAt/updatedAt`; `DailyRevenue`/módulos/opções sem `updatedAt`. Sem `updatedAt` não há optimistic locking — exatamente a causa do incidente Garapas. | 🟡 média | Adicionar `createdAt/updatedAt` nessas tabelas. |
| P11 | **`MetricSnapshot.drivers` é JSON** com campos fixos conhecidos — reintroduz o anti-padrão que o refactor combate. | 🔵 baixa | Promover drivers a colunas `numeric`; JSON só para o dinâmico. |

---

## 4. A migração ainda é "lossy" — campos que somem no backfill

Cobertura **estrutural** (nº de linhas) está boa e reconciliada. Cobertura de
**campos** é parcial. Antes de desligar o blob, estes dados **somem**:

| Dado no blob | Onde deveria ir | Gravidade |
|--------------|-----------------|-----------|
| `insumos[].purchaseUnit` (unidade que casa com `packQty`) | coluna `Ingredient.packUnit` | 🔴 alta — sem ela o custo unitário não se reproduz |
| `fichas[].modoPreparo` (passos do preparo) | `TechnicalSheet.prepSteps` ou tabela `TechnicalSheetStep` | 🔴 alta — receituário some |
| `fichas[].fotoPrato` | `TechnicalSheet.dishPhoto` | 🟡 média |
| `fichas[].finalizacao` / `tempoPreparo` / `utensilios` | colunas em `TechnicalSheet` | 🟡 média |
| `fichas[].vendasMes`, `custoInsumos`, `custoEmbalagem` | colunas em `TechnicalSheet` | 🟡 média |
| `fichas[].lastUpdated` (data real da edição) | `updatedAt` real (hoje vira a data do backfill) | 🟡 média — quebra o card "Fichas Desatualizadas" (30+ dias) |
| `fichas[].isImported` / `progress` | colunas em `TechnicalSheet` | 🔵 baixa |
| `insumos[].rendimento`, `isPrepared`, `defaultQty/grossQty` | colunas em `Ingredient` | 🟡 média — quebra insumo preparado/sub-receita |
| `operational.categories` | tabela `Category` (P2) | 🔴 alta — nem é lido |
| `data.user` / `user_info` (perfil do dono) | tabela/colunas próprias | 🟡 média — descartado |
| `identity.business_logo` / `restaurant_name` / `cuisine_type` | `CompanyProfile` | 🟡 média |
| metadados de conversão do item da ficha (`grossQty`, `usageUnit`, `originalUnit`…) | colunas em `TechnicalSheetItem` | 🟡 média |

> Sem fechar esses buracos (colunas + estender `backfill-core.js`), migrar
> JSON→tabelas **perde a parte operacional/receituário da ficha** e a unidade de
> compra do insumo. Esse é o trabalho mínimo da **F0.5** (abaixo).

---

## 5. Estratégia recomendada — strangler-fig por domínio

Princípio: **estrangular o blob aos poucos**, nunca num big-bang. A cada fase o
sistema continua funcionando; se algo falha, o blob ainda é a fonte da verdade.

```
F0   schema criado            ............................. ✅ feito (local)
F0.5 fechar buracos (cap. 3-4) ............................ ⬅️ PRÓXIMO (pré-requisito)
F1   backfill + reconciliação .............................. ✅ provado no local
F2   dual-write (blob + tabelas) ........................... reusa onboardingSync.js
F3   migrar LEITURA por domínio, atrás de flag ............. um domínio por vez
F4   cálculo dos indicadores no servidor (sai do blob) ..... financialCalc → tabelas
F5   aposentar o blob (mantido como backup) ................ corte final
```

### Por que reusar `onboardingSync.js`

Ele **já faz** blob → tabelas BPO de forma **idempotente e não-destrutiva**
(casa por CPF/nome/tag `[onb:<key>]`, nunca apaga). É o molde exato do dual-write
de baixo impacto: o mesmo gancho que hoje sincroniza 4 domínios para o BPO passa
a escrever também nas tabelas Drizzle. **Não inventamos um mecanismo novo —
estendemos um que já roda em produção sem incidente.**

### F2 — Dual-write (escrever nos dois, ler do blob)

- Toda gravação que hoje altera `Client.data` passa a **também** gravar na tabela
  Drizzle correspondente, na **mesma transação** (ou no mesmo gancho do
  `onboardingSync`). O blob continua sendo lido.
- Idempotente via `legacyId` (depois de P7, com unique). Reprocessar é seguro.
- **Impacto percebido: zero** — a UI lê o blob como sempre; as tabelas só recebem
  cópia. Se a escrita na tabela falhar, loga e segue (blob não é bloqueado).

### F3 — Migrar leitura, um domínio por vez, atrás de flag

Ordem recomendada (do mais isolado/seguro para o mais central):

1. **Insumos** (`Ingredient`) — catálogo, baixo acoplamento.
2. **Fichas + itens + módulos** (`TechnicalSheet…`) — depois de insumos.
3. **Menu** (`MenuItem`) — depende de fichas.
4. **Faturamento** (`RevenueEntry`/`DailyRevenue`).
5. **Custos/onboarding** (`CompanyProfile`, `FixedCostItem`, `Employee`…) — por
   último, porque é onde estão as duplicações P3/P4 a resolver.

Cada domínio liga atrás de **feature flag por cliente**: a leitura sai do blob e
passa para a tabela só para os clientes marcados. Valida-se 1 cliente piloto,
depois 10%, depois geral. Reverter = desligar a flag (volta a ler o blob).

### F4 — Cálculo no servidor

`financialCalc.js` hoje recalcula indicadores a partir do blob a cada request. Ao
final da F3, os mesmos cálculos passam a ler as tabelas (e/ou `MetricSnapshot`
com drivers em colunas, P11). O blob deixa de ser fonte de cálculo.

### F5 — Aposentar o blob (sem apagar)

- `Client.data` deixa de ser lido/escrito, mas **permanece no banco** como backup
  histórico. Nada é dropado (regra de disaster recovery da base).
- Opcional e tardio: mover o blob para uma coluna/tabela de arquivo morto. Nunca
  na mesma janela do corte.

---

## 6. Ordem de execução recomendada (checklist)

> Tudo abaixo, até o corte, roda **só no local** espelhado. Produção intocada.

**F0.5 — Corrigir o schema — ✅ CONCLUÍDA no LOCAL (migração `0002_daily_newton_destine`):**
- [x] P1: `clientId → Client` agora `ON DELETE RESTRICT` (14 tabelas + `Category`). Verificado: `pg_constraint.confdeltype='r'`.
- [x] P2: tabela `Category` (scope `ingredient|sheet|menu`) + `categoryId` FK (set null) em `Ingredient`/`TechnicalSheet`/`MenuItem`. `category` text mantido como cache de label (verdade = `categoryId`).
- [x] P7: `UNIQUE (clientId, legacyId) WHERE legacyId IS NOT NULL` + `Category (clientId,scope,name) WHERE isDeleted=false`.
- [x] P8/P9/P10: `modifiedBy` em todas; soft delete completo nas editáveis; `createdAt/updatedAt` nos filhos de ficha e `DailyRevenue`.
- [x] Cap. 4: colunas perdidas em `Ingredient` (`packUnit/yield/yieldUnit/isPrepared/price/refQty/defaultQty/grossQty/sourceUpdatedAt`), `TechnicalSheet` (`costIngredients/costPackaging/salesEstimateMonthly/prepTimeMinutes/utensils/finishing/dishPhoto/isImported/progress/sourceCreatedAt/sourceUpdatedAt`), `TechnicalSheetItem` (conversão), `CompanyProfile` (perfil do dono + `cuisineType/businessLogo`), `MetricSnapshot` (drivers→colunas). Nova tabela `TechnicalSheetStep` (modoPreparo).
- [x] P3: `Employee.bpoEmployeeId`→BpoEmployee e `Partner.bpoPartnerId`→BpoPartner (FK set null, **aditivo, não unifica**). + colunas `cpf`/`role`.
- [x] P4: `CardMachine.{debit,credit}PaymentMethodId` (são **2** PaymentMethod por máquina) e `Marketplace.paymentMethodId` (FK set null). Link populado no F2 (dual-write), não no backfill.
- [x] P5: `MenuItem.sheetId` **mantido nullable** (item de revenda sem ficha é válido; CMV usa `MenuItem.cost`). Documentado.
- [x] Migração gerada com `drizzle-kit generate` + SQL bruto appendado (NUNCA `push`); aplicada com `migrate`. Backfill `--wipe` nos 39 clientes: **0 divergências**.

#### Decisões de modelagem (resolvem achados da revisão adversarial)

- **TIER de auditoria** — *Editáveis* (Ingredient, TechnicalSheet, MenuItem, Category, Employee, Partner, Equipment, Vehicle, CardMachine, Marketplace, CompanyProfile, FixedCostItem) levam soft delete completo. *Fatos* (RevenueEntry, DailyRevenue, MetricSnapshot) **não** levam `isDeleted` — soft delete colidiria com o `UNIQUE` de período (registro "deletado" travaria o re-lançamento do mês); correção é via update/`source`. *Filhos de agregado* (TechnicalSheetItem, SheetModule, SheetModuleOption, TechnicalSheetStep) usam **delete físico** dentro do update da ficha-raiz auditada — sem `isDeleted`.
- **Optimistic locking** — `updatedAt` é relógio **técnico** (token de versão; server actions comparam no `.where`). A data **real** de edição do usuário vive em `sourceUpdatedAt` (alimenta o card "Fichas Desatualizadas"). O `$onUpdate` do `updatedAt` não pode ser usado como data de negócio.
- **Imagens base64** — `data.profile.photo` chega a **2,7 MB** em base64 no blob. **Não** são migradas para colunas (recriaria o "castelo de areia" e infla o dump). Backfill só grava `businessLogo`/`ownerPhoto` se for URL (`urlOnly`); o base64 fica no blob até uma migração futura para object storage. Colunas prontas para receber URL.
- **`_dataVersion`** (contador global do blob) é **abandonado** em favor do `updatedAt` por linha (locking row-level). Não mapeia para tabelas normalizadas.
- **PII do dono** — `ownerCpf`/`ownerBirthday` capturados em `CompanyProfile` (1:1 com Client); CPF deve ser mascarado em logs (padrão `onboardingSync.js`).

#### Runbook da migração 0002 (regra de ouro: `generate → appendar → migrate`)

1. Editar `schema.js` (colunas nativas + Category + categoryId intra-Drizzle + uniques parciais).
2. `npm run db:drizzle:generate` → gera `0002`. **Inspecionar** o `.sql`: só pode haver CREATE/ADD COLUMN/ADD CONSTRAINT categoryId/índices — **nenhum** `ALTER COLUMN TYPE` ou `DROP COLUMN` inesperado.
3. **Appendar** o SQL bruto das FK cross-ORM (idempotente: `DROP CONSTRAINT IF EXISTS` antes de cada `ADD`). Pré-check de órfãos (`LEFT JOIN Client`) = 0 antes do `RESTRICT`.
4. `npm run db:drizzle:migrate`.
5. **NUNCA** re-rodar `generate` por cima do mesmo idx 0002 (apagaria o append). Para regenerar: apague `0002.sql` + `0002_snapshot.json` + a entry do journal e refaça o append.
6. As 19 FK cross-ORM são **raw-only** (invisíveis ao snapshot do Drizzle); **NUNCA** declará-las com `.references()` para tabelas do Prisma — o `generate` duplicaria a constraint.

> **~~Pendência~~ RESOLVIDA (lado Prisma):** migração `20260612000000_restrict_client_fks`
> trocou as **16** FK `clientId → Client` do Prisma de `CASCADE` para `RESTRICT`
> (BpoEmployee, BpoPartner, PaymentMethod, Payable, Receivable, Supplier,
> BankAccount, FinancialCategory, Loan, ReceivableAdvance, ReconciliationRule,
> BankTransfer, BpoTask, PdvIntegration, TeamMember, ClientDataSnapshot).
> Seguro: o app nunca apaga `Client` fisicamente (delete é soft `active=false`,
> [routes.js](../server/src/routes.js)). Agora **nenhuma** FK→Client é CASCADE
> nos dois ORMs (31 RESTRICT + 1 SET NULL p/ WhatsappMessage). Aplicada via
> `prisma migrate deploy` (não `migrate dev`, que veria as tabelas Drizzle como
> drift e tentaria resetar). Cascades intra-agregado (parcelas de Payable/
> Receivable, PaymentTransaction, BankTransaction) mantidos — não são dado de
> cliente solto.

#### Rodada de verificação adversarial → migração `0003_wide_warbird` (perdas que escaparam)

Uma verificação adversarial pós-implementação (3 agentes) achou **perdas que o inspect inicial não revelou** (o cliente-piloto Itálico não tinha esses casos); todas corrigidas com a migração aditiva `0003`:

- **🔴 Insumo preparado perdia a composição.** `operational.insumos[].subIngredients` (sub-receita em **árvore recursiva** — componentes que podem ser eles mesmos preparados) + `rendimentoPreparado`/`rendimentoUnit`/`totalCost` não tinham destino. O backfill gravava `isPrepared=true` mas descartava a receita → casca vazia, custo irreconstruível. **Fix:** tabela `IngredientComponent` (self-FK `parentComponentId` cascade para a árvore; `componentIngredientId` set null linkando ao insumo base; FILHO de agregado, delete físico) + colunas `preparedYield/preparedYieldUnit/preparedTotalCost` em `Ingredient`. Backfill caminha a árvore recursivamente. Resultado: 366 componentes (151 aninhados, 358 linkados), 51 preparados com custo.
- **🟡 `CardMachine.custom_provider` descartado** (14 máquinas "Outra" perdiam o adquirente real). **Fix:** coluna `customProvider` (espelha `Marketplace`).
- **🟡 `ownerRole`/`ownerIsOwner` do dono** (`data.user.role`/`isOwner`, presentes em 39/33 clientes — o 1º review afirmara que `role` não existia; **estava errado**, confirmado via `jsonb_object_keys`). **Fix:** colunas em `CompanyProfile`.
- **🟡 `drizzle.config.js tablesFilter`** não listava `Category`/`TechnicalSheetStep`. **Fix:** adicionadas (+ `IngredientComponent`); manter sincronizado com `schema.js`.

**Drops intencionais documentados (não são perda silenciosa):** imagens base64 (logo/fotos — ficam no blob até object storage), `_dataVersion` (contador global do blob → `updatedAt` por linha), views calculadas (`overview`/`revenue`/`breakEven`/`dre`/`cardComparison` — recomputadas na F4), `data.tips` (estático). Vínculo `paymentMethodId` de cartões/marketplaces é populado na F2 (dual-write via `onboardingSync`), não no backfill.

**F1 — Backfill (estender o já existente) — ✅ CONCLUÍDA no LOCAL:**
- [x] `backfill-core.js` estendido: Category, TechnicalSheetStep, todos os campos do cap. 4, `modifiedBy='backfill:F1'`, vínculo BPO best-effort (cpf-first/nome-único), drivers→colunas.
- [x] `migrate` → `backfill --dry-run` → `--wipe` (39 clientes): **0 divergências**; integridade FK conferida (0 órfãos `categoryId`/`bpoEmployeeId`).
- [x] Cobertura: 382 categorias, 138 passos de preparo, 1402 fichas c/ `sourceUpdatedAt`, 39/39 perfis de dono, 114 vínculos `Employee→BpoEmployee`.

**F2 — Dual-write — ✅ IMPLEMENTADA no LOCAL:**
- [x] Mapeamento extraído para `src/services/coreSync.js` (módulo único, deps injetadas) — usado pelo backfill **e** pelo hook de save (DRY: sem duplicar a lógica).
- [x] Hook em `routes.js` nos 2 ganchos de save (`POST` do `Client.data`): após o `onboardingSync`, chama `syncCoreTables` (best-effort, não bloqueia o save; roda **depois** do BPO sync p/ o vínculo `Employee→BpoEmployee` achar as linhas novas).
- [x] Estratégia = **projeção reconstruída a cada save** (wipe+insert por cliente, idempotente). Blob continua a fonte da verdade; `modifiedBy='sync:F2'`. Smoke test OK; backfill regredido (0 divergências) prova o módulo compartilhado.
- [ ] (próximo) Observar em sombra com edição real pela UI e validar a projeção em produção (após deploy).

**F3 — Leitura por domínio + flag — 🚧 INSUMOS, FICHAS, MENU e FATURAMENTO feitos no LOCAL:**
- [x] **Insumos**: flag `Client.readInsumosFromTables` (default OFF). Reverse mapper em `coreRead.js`. Round-trip `f3-roundtrip-insumos.js` **100% fiel** (1822 insumos, 215 subs). Pré-req: `IngredientComponent` enriquecido (mig. `0004`).
- [x] **Fichas**: flag `Client.readFichasFromTables` (default OFF). `coreRead.reconstructFichas` (TechnicalSheet + items/modules/options/steps; `id=legacyId`; fotoPrato base64 = fallback do blob). Round-trip `f3-roundtrip-fichas.js` **100% fiel** (1402 fichas, 4820 itens). Pré-reqs:
  - `TechnicalSheet` +`yieldUnit`/`prepTime` (migs. `0005`/`0006`) — tempoPreparo é texto livre ("5 min").
  - `TechnicalSheetItem` +snapshot completo + `lineCost` 18,6 (blob tem "R$ 0,675").
  - `IngredientComponent` **polimórfico** (mig. `0007`): pertence a um insumo **ou** a um item de ficha (`technicalSheetItemId`) — item preparado tem sub-receita própria que pode divergir do insumo base.
  - `insumos` (contador) tratado como derivado (`=ingredients.length`; blob às vezes stale → corrigido).
- [x] **Menu**: flag `Client.readMenuFromTables` (default OFF). `coreRead.reconstructMenu` (MenuItem; menuEngineering top-level; `sales` número, `price`/`cost` strings "R$", `id` preserva número/string). Round-trip `f3-roundtrip-menu.js` **100% fiel** (1174 itens). Sem enriquecimento de schema. Itens-seed sem id ganham um id (não perde dado).
- [x] **Faturamento**: flag `Client.readFaturamentoFromTables` (default OFF). `coreRead.reconstructFaturamento` (RevenueEntry+DailyRevenue → `formData.{revenue_history,daily_revenue}`; month "MM/AAAA", amount milhar BR "199.000,00", daily=número). Round-trip `f3-roundtrip-faturamento.js` **100% fiel** (170 entries + 132 diários). Placeholders de mês sem amount são pulados (sem dado). A DRE do front lê daqui — reconstrução fiel mantém o cálculo.
- [x] Injeção única no `GET /client/:hash` ([routes.js](../server/src/routes.js)) atrás das flags, best-effort (fallback ao blob); marca `_insumosSource`/`_fichasSource`/`_menuSource`/`_faturamentoSource`.
- [x] **Validado com a app rodando** (porta 3001): Itálico serve 41 insumos + 19 fichas + 16 menu + faturamento das tabelas, fiéis. Cliente sem flag serve do blob.
- [ ] (próximo) **Custos/onboarding** (Employee/Partner/Equipment/Vehicle/CardMachine/Marketplace/FixedCostItem/CompanyProfile — o domínio mais entrelaçado com a DRE). Depois ligar p/ 10% → 100%. Blob segue fonte do WRITE.

**F4–F5 — Cálculo no servidor e aposentadoria:**
- [ ] `financialCalc` lê tabelas; valida indicadores contra o blob no local.
- [ ] Congelar escrita no blob; manter o dado como backup. **Não dropar.**

---

## 7. Corte em produção e rollback

1. **Backup obrigatório** antes de qualquer passo em PRD (`pg_dump`, política da base).
2. As migrações de schema (F0.5) são **aditivas** (só CREATE/ALTER ADD) → entram
   em produção sem downtime e sem afetar o Prisma/blob.
3. F2 (dual-write) em produção **não muda nada perceptível** — só começa a popular
   tabelas. Roda em paralelo por dias, gerando confiança.
4. O "corte" real é **flag por cliente** na F3 — granular e reversível em segundos.
5. **Rollback de qualquer fase:** desligar a flag → volta a ler o blob (que nunca
   parou de ser escrito até F5). Sem restore, sem perda.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Perda de dados do receituário/insumo na normalização | F0.5 fecha os buracos do cap. 4 **antes** do dual-write |
| Cadastro duplicado de pessoa (Employee/BpoEmployee) | Resolver P3 antes da F1 (vínculo ou unificação) |
| Categorias divergentes | `Category` (P2) antes de migrar a leitura |
| Backfill duplicar ao reprocessar | unique de `legacyId` (P7) antes da F1 |
| Delete físico em cascata de um Client | `RESTRICT` (P1) — feito na F0.5 |
| Divergência blob × tabela durante a transição | dual-write idempotente + reconciliação por domínio no local |
| Corte quebrar um cliente | flag por cliente + rollback instantâneo (blob vivo até F5) |

---

### Conclusão

A espinha dorsal está **criada e logicamente correta**. Para "tirar o castelo de
areia sem sentir impacto", o caminho é: **(1) fechar os 5 defeitos de relação e os
buracos de campo no local (F0.5)**, **(2) reusar o `onboardingSync.js` como
dual-write idempotente (F2)**, e **(3) migrar a leitura por domínio atrás de flag
por cliente (F3)**, mantendo o blob como fonte da verdade e backup vivo até o
último momento. Nenhum passo apaga dado; cada passo é reversível por flag.
