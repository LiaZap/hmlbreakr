# Tabelas do Breaker — guia para QA

> Referência das ~46 tabelas do banco: o que cada uma serve, relações, regras de
> soft-delete/auditoria e **checklist do que verificar**. Gerado a partir do schema real.

## Como ler este doc (arquitetura em 30s)

O Breaker está numa migração **strangler-fig**: a fonte da verdade histórica é um
**blob JSON** no campo `Client.data`. As tabelas se dividem em duas famílias:

| Família | Onde | O que é | QA edita direto? |
|---|---|---|---|
| **Núcleo normalizado** | `src/db/schema.js` (20 tabelas) | **Projeção** do blob — reconstruída pelo `coreSync` a cada save (dual-write F2) e no `npm run db:backfill`. Têm `legacyId` (id do item no blob). | ❌ Não — são regeneradas. Edição vai pelo blob/app. |
| **Legadas / BPO** | `src/db/schema-bpo.js` (26 tabelas) | Escritas **direto** pelo app (fonte da verdade dos seus domínios financeiros). | ✅ Sim (via app) |

> Backend hoje é **100% Drizzle** (Prisma aposentado).

## Convenções que valem pra (quase) todas as tabelas
- **Delete é LÓGICO:** tabelas editáveis têm `isDeleted`/`deletedAt`/`deletedBy` (ou `active` nas BPO). Deletar **marca**, não some — a linha permanece. *Exceção:* filhos de agregado (ex: IngredientComponent, itens de ficha) são delete físico no rebuild.
- **FK clientId→Client = ON DELETE RESTRICT:** não dá pra apagar um cliente que tem filhos.
- **Auditoria:** `createdAt` / `updatedAt` / `modifiedBy` em toda tabela. `modifiedBy='sync:F2'` ou `'backfill:F1'` indica que a linha veio da projeção do blob.

## Como verificar integridade (o teste-mestre)
O backfill imprime uma **reconciliação blob ↔ tabelas** por domínio. Tudo deve dar **OK / 0 divergências**:
```bash
cd server && node scripts/backfill-core.js --allow-remote --dry-run   # valida sem gravar
```
Se algum domínio não bater, a projeção divergiu do blob — é bug.

---

## Núcleo operacional (insumos, fichas, menu)

### Category
- **Para que serve:** Catálogo de categorias/tags aplicadas a insumos, fichas técnicas e itens de menu. Evita duplicação e padroniza a navegação no app (ex: "Bebidas", "Sobremesas", "Pré-preparados").
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Construída pelo coreSync lendo `operational.categories` e inferindo de campos `categoria`/`category` nas fichas, insumos e menu engineering.
- **Colunas-chave:** 
  - `id` (UUID gerado) / `clientId` (FK→Client)
  - `name` (texto único por escopo)
  - `scope` ('ingredient' | 'sheet' | 'menu')
  - `isSystem` (true = padrão do app; false = custom do cliente)
  - `active` (visibilidade em UX)
- **Relações:** Referenciada por `categoryId` em Ingredient, TechnicalSheet, MenuItem (ON DELETE SET NULL). ON DELETE RESTRICT não é declarado aqui, mas deletar categoria ativa pode quebrar UI.
- **Delete/auditoria:** Soft-delete (`isDeleted`, `deletedAt`, `deletedBy`). Unique parcial `(clientId, scope, name)` só em linhas vivas (`WHERE isDeleted=false`) — permite reusar nome após exclusão. Auditoria completa (`createdAt`, `updatedAt`, `modifiedBy`).
- **✅ Checklist QA:**
  - Deletar categoria → `isDeleted=true`, desaparece de listas, mas linha permanece na tabela
  - Contar `COUNT(*) WHERE scope='ingredient' AND isDeleted=false` deve bater com categorias únicas no blob (`op.categories.insumos`)
  - Recriar com mesmo nome após soft-delete deve permitir novo UUID (unique é parcial)
  - Nenhuma categoria deve ter `clientId IS NULL`

### Ingredient
- **Para que serve:** Cadastro de insumos (matérias-primas e preparados). Armazena custo unitário, unidades, rendimento, e marcar como "preparado" (sub-receita própria) com custo total da preparação.
- **Fonte:** PROJEÇÃO do blob. Lê `operational.insumos[]`, mapeando campos legados (nomePT/EN) + novos. Cada insumo vira Ingredient com `legacyId` → id original no blob. Sub-receitas marcadas com `isPrepared=true` ganham IngredientComponent filhos.
- **Colunas-chave:**
  - `id` / `clientId` / `legacyId` (id original no blob, estável)
  - `name` / `category` (label denormalizado; verdade = `categoryId`)
  - `unit` (unidade de medida: un, kg, L, g, ml)
  - `packPrice`, `packQty`, `packUnit` (embalagem: preço, qtd, unidade de compra)
  - `unitCost` (custo unitário derivado = packPrice / packQty)
  - `isPrepared` (true = sub-receita; tem filhos em IngredientComponent)
  - `preparedTotalCost` (custo total da sub-receita montada)
  - `sourceUpdatedAt` (epoch — data real de edição no blob, usado p/ "desatualizados")
- **Relações:** `categoryId`→Category (ON DELETE SET NULL). Raiz polimórfica de IngredientComponent (quando `isPrepared=true`). Referenciada por TechnicalSheetItem (`ingredientId`) e IngredientComponent (`componentIngredientId`).
- **Delete/auditoria:** Soft-delete (`isDeleted`, `deletedAt`, `deletedBy`). Unique parcial `(clientId, legacyId)` só em vivos. Auditoria completa. Unique em legacyId permite idempotência no backfill.
- **✅ Checklist QA:**
  - `unitCost` deve = `packPrice` ÷ `packQty` (quando ambos ≠ null)
  - Deletar insumo → `isDeleted=true`, some de listas, linhas em TechnicalSheetItem que referenciam não deletam (FK SET NULL)
  - Insumo preparado (`isPrepared=true`) deve ter ≥1 filho em IngredientComponent (ou estar em construção)
  - `sourceUpdatedAt` ≠ null → ficha pode aparecer em card "Desatualizadas"; atualizar insumo deve ressetar isso (F2 hook)
  - Contagem de vivos (`WHERE isDeleted=false`) ≤ blob insumos originais (histórico preservado com isDeleted=true)

### IngredientComponent
- **Para que serve:** Linha de um insumo preparado (sub-receita) ou de um item de ficha preparado. Árvore recursiva: compõe-se de insumos base + mais IngredientComponent aninhados (sub de sub). Denormaliza snapshot completo do insumo para reconstrução fiel.
- **Fonte:** PROJEÇÃO do blob. Lê `insumo.subIngredients[]` (recursivo) ou `fichaItem.subIngredients[]`. Emitidos pelo coreSync função `emitComponents()` que caminha a árvore. Sem `legacyId` de raiz = delete físico interno (sem soft-delete).
- **Colunas-chave:**
  - `id` / `ingredientId` | `technicalSheetItemId` (FK polimórfica — exatamente uma, outras null; cascata)
  - `parentComponentId` (self-FK para nível aninhado; null = raiz)
  - `componentIngredientId` (link ao Ingredient base, se existir; SET NULL se insumo deletado)
  - `name` / `qty` / `unit` / `unitCost` / `lineCost` (linha = qty × unitCost)
  - `isPrepared` (true = este componente também é sub-receita, pode ter filhos)
  - `position` (ordem na lista, começando 1)
- **Relações:** Polimórfica (exatamente um de `ingredientId` ou `technicalSheetItemId`). Self-FK em `parentComponentId` (índice, sem constraint visível, adicionada via SQL bruto). `componentIngredientId`→Ingredient (SET NULL). ON DELETE CASCADE das raizes (sheet ou item deletam cascata).
- **Delete/auditoria:** SEM soft-delete (TIER 3 = delete físico). Auditoria de criação (`createdAt`, `modifiedBy`), sem `updatedAt` (rebuild é delete físico + reinsert — não update).
- **✅ Checklist QA:**
  - `lineCost` deve = `qty` × `unitCost` (6 casas decimais)
  - Deletar insumo pai (Ingredient) → filhos IngredientComponent permanecem (FK SET NULL, não cascata)
  - Deletar TechnicalSheetItem → cascata física de todos os filhos (se `technicalSheetItemId` não null)
  - Árvore recursiva: parent null → raiz; parent não null → caminho até raiz existe
  - Nenhum componente pode estar órfão (sem `ingredientId` E sem `technicalSheetItemId`)

### TechnicalSheet
- **Para que serve:** Ficha técnica de um prato/preparação. Pode ser simples (com itens) ou modular (com módulos→opções). Armazena rendimento, custo total, preço de venda, tempo de preparo, e foto do prato. Raiz para cálculo de CMV.
- **Fonte:** PROJEÇÃO do blob. Lê `operational.fichas[]`, mapeando `isModular` (bool) e gerando `totalCost` denormalizado (soma dos itens ou min/max modular). `sourceUpdatedAt` = lastUpdated do blob (usado p/ card "Desatualizadas").
- **Colunas-chave:**
  - `id` / `clientId` / `legacyId` (id original no blob)
  - `name` / `category` (label de tipo, denormalizado; verdade = `categoryId`)
  - `isModular` (true = estrutura SheetModule→SheetModuleOption; false = itens diretos em TechnicalSheetItem)
  - `yield` / `yieldUnit` (rendimento, ex: "1000" "gr")
  - `sellingPrice` / `totalCost` / `costIngredients` / `costPackaging` (financeiro)
  - `costMin` / `costMax` (modular: range de custo)
  - `prepTimeMinutes` / `prepTime` (texto cru, ex "5 min" — fidelidade ao blob)
  - `finishing` / `utensils` (modo de preparo visual)
  - `sourceCreatedAt` / `sourceUpdatedAt` (epoch — usados p/ relatórios de antiguidade)
- **Relações:** `categoryId`→Category (SET NULL). Raiz para TechnicalSheetItem (cascata), TechnicalSheetStep (cascata), SheetModule (cascata). Referenciada por MenuItem (`sheetId`, SET NULL — item de revenda sem ficha).
- **Delete/auditoria:** Soft-delete (`isDeleted`, `deletedAt`, `deletedBy`). Unique parcial `(clientId, legacyId)` vivo. Auditoria completa. Cascata lógica (soft-delete da ficha, filhos (items/steps/modules) deletam fisicamente).
- **✅ Checklist QA:**
  - Deletar ficha → `isDeleted=true`, some do menu; TechnicalSheetItem/Step/Module filhos: delete físico cascata (FK ON DELETE CASCADE)
  - MenuItem ligado a ficha deletada: `sheetId` vira null, mas MenuItem fica (SET NULL)
  - `totalCost` denormalizado: deve ser recalculado (F3 será responsabilidade) — QA verifica com custo = soma dos itens quando não-modular
  - `sourceUpdatedAt` ≠ null → aparece em "Fichas Desatualizadas"; atualizar ficha no F2 reseta isso
  - Contagem viva (`isDeleted=false`) + deletada = blob fichas original

### TechnicalSheetItem
- **Para que serve:** Linha (ingrediente) de uma ficha técnica simples (não-modular). Snapshot do insumo + uso no contexto da receita (pode divergir: qtd, unit, custo podem ser ajustados). Árvore recursiva se preparado (`isPrepared=true`).
- **Fonte:** PROJEÇÃO do blob. Lê `fichaSimples.insumos[]` (ou `.ingredients` / `.itens` / `.items`), denormalizando preço, qtd, custo. Se `isPrepared=true`, emite IngredientComponent filhos via `emitComponents()`.
- **Colunas-chave:**
  - `id` / `sheetId` (FK→TechnicalSheet RESTRICT, pois é FILHO)
  - `ingredientId` (opcional; FK→Ingredient SET NULL — link ao insumo base, se existir)
  - `description` / `quantity` / `unit` / `unitCost` / `lineCost` (lineCost = quantity × unitCost, 6 decimais)
  - `isPrepared` (true = este item é sub-receita, tem filhos IngredientComponent)
  - `preparedTotalCost` (custo da sub-receita montada)
  - `sourceUpdatedAt` (epoch — data de edição)
- **Relações:** FK OBRIGATÓRIA `sheetId`→TechnicalSheet (CASCADE, não nullable). FK opcional `ingredientId`→Ingredient (SET NULL). Raiz para IngredientComponent recursivo (quando `isPrepared=true`). Sem legacyId→id mapeamento externo (é FILHO, id gerado novo a cada rebuild).
- **Delete/auditoria:** SEM soft-delete (TIER 3 = delete físico). Auditoria (`createdAt`, `modifiedBy`). On DELETE CASCADE da sheet deleta físico todos os itens. IngredientComponent filhos também deletam fisicamente (cascata).
- **✅ Checklist QA:**
  - `lineCost` = `quantity` × `unitCost` (6 casas decimais)
  - Deletar ficha → todos os itens deletam fisicamente (FK CASCADE)
  - Deletar insumo base (Ingredient) → items permanecem (SET NULL, `ingredientId` vira null)
  - Item preparado (`isPrepared=true`) → deve ter ≥1 filho IngredientComponent (ou estar em construção)
  - `legacyId` NÃO é único global — aponta p/ id do item no blob (estável dentro da ficha original)

### TechnicalSheetStep
- **Para que serve:** Um passo/instrução do modo de preparo de uma ficha técnica. Lista ordenada (position) de texto descritivo. Apenas metadado visual/operacional, não afeta cálculo.
- **Fonte:** PROJEÇÃO do blob. Lê `ficha.modoPreparo[]` (array de strings ou objetos). Cada passo vira 1 linha, posição ordinal preservada.
- **Colunas-chave:**
  - `id` / `sheetId` (FK→TechnicalSheet RESTRICT)
  - `position` (ordem, começando 1)
  - `text` (descrição do passo, nunca vazio; linhas vazias são puladas no coreSync)
- **Relações:** FK `sheetId`→TechnicalSheet (CASCADE, não nullable). Sem legacyId mapeamento — é FILHO PURO.
- **Delete/auditoria:** SEM soft-delete (TIER 3). Auditoria mínima (`createdAt`, `modifiedBy`). Deletar sheet → cascata física.
- **✅ Checklist QA:**
  - Deletar ficha → todos os passos deletam fisicamente
  - `position` é sequencial (1, 2, 3, ...) e não vazio
  - Nenhum step pode estar órfão (sheetId IS NULL)
  - Reordenar passos no F2 gera novo rebuild → novas positions (ids mudam, não update)

### SheetModule
- **Para que serve:** Módulo configurável de uma ficha modular (ex: "Molho", "Acompanhamento"). Define grupos de opções que o cliente escolhe à hora do pedido. Nome e obrigatoriedade.
- **Fonte:** PROJEÇÃO do blob. Lê `fichaModular.modules[]`. Cada módulo vira 1 linha. Filhos SheetModuleOption ligam opções (custo manual OU ficha linked para composição).
- **Colunas-chave:**
  - `id` / `sheetId` (FK→TechnicalSheet RESTRICT)
  - `name` / `required` (bool: cliente DEVE escolher opção deste módulo? true = obrigatório)
  - `legacyId` (id do módulo no blob)
- **Relações:** FK `sheetId`→TechnicalSheet (CASCADE). Raiz para SheetModuleOption (filhos, cascata).
- **Delete/auditoria:** SEM soft-delete (TIER 3). Auditoria (`createdAt`, `modifiedBy`). Unique parcial `(sheetId, legacyId)` vivo.
- **✅ Checklist QA:**
  - Deletar ficha modular → cascata física de módulos + opções filhas
  - `required` = true → opção deve existir (não deixar vazio); `required` = false → pode pular
  - Cada módulo deve ter ≥1 opção filha (SheetModuleOption)
  - Nenhum módulo órfão (sheetId IS NULL)

### SheetModuleOption
- **Para que serve:** Opção dentro de um módulo (ex: "Molho de Tomate", "Molho Pesto"). Define custo manual OU aponta para uma ficha linked (composição). Marca se é padrão.
- **Fonte:** PROJEÇÃO do blob. Lê `modulo.options[]`. Cada opção vira 1 linha. `linkedFichaId` → busca em `sheetMap` (mapa de fichas reconstruídas) para encontrar `linkedSheetId` novo.
- **Colunas-chave:**
  - `id` / `moduleId` (FK→SheetModule RESTRICT)
  - `name` / `cost` (numérico: custo manual se linkedSheet=null)
  - `isDefault` (true = selecionada por padrão no pedido)
  - `linkedSheetId` (FK→TechnicalSheet SET NULL — composição; null = custo manual)
  - `legacyId` (id da opção no blob)
- **Relações:** FK `moduleId`→SheetModule (CASCADE). FK opcional `linkedSheetId`→TechnicalSheet (SET NULL — permite referência cruzada de fichas).
- **Delete/auditoria:** SEM soft-delete (TIER 3). Auditoria (`createdAt`, `modifiedBy`). Unique parcial `(moduleId, legacyId)` vivo.
- **✅ Checklist QA:**
  - Deletar módulo → cascata física de opções
  - `cost` não null OU `linkedSheetId` não null (nunca ambos null, nunca ambos populados simultaneously — lógica: custo MANUAL XOR linked)
  - Se `linkedSheetId` populado → ficha linked pode ser deletada (SET NULL, opção fica com custo=null, quebra UI — QA verifica comportamento)
  - `isDefault` = true → apenas uma opção por módulo (ou UX permite múltiplas? validar com app)
  - Nenhuma opção órfã (moduleId IS NULL)

### MenuItem
- **Para que serve:** Item do cardápio (menu engineering). Liga-se a uma ficha técnica (ou null, se revenda sem ficha própria). Armazena preço de venda, estimativa de vendas, e custo (para CMV quando ficha ausente).
- **Fonte:** PROJEÇÃO do blob. Lê `menuEngineering[]`, mapeando `fichaId` → `sheetId` via `sheetMap`. `legacyId` preserva id original do menu no blob.
- **Colunas-chave:**
  - `id` / `clientId` / `legacyId`
  - `name` / `category` (label denormalizado; verdade = `categoryId`)
  - `sheetId` (FK→TechnicalSheet SET NULL — nullable: item de revenda)
  - `price` (preço de venda)
  - `cost` (custo manual, usado p/ CMV se `sheetId IS NULL`)
  - `salesEstimate` (média mensal estimada)
- **Relações:** FK `categoryId`→Category (SET NULL). FK `sheetId`→TechnicalSheet (SET NULL — permite revenda sem ficha própria).
- **Delete/auditoria:** Soft-delete (`isDeleted`, `deletedAt`, `deletedBy`). Unique parcial `(clientId, legacyId)` vivo. Auditoria completa.
- **✅ Checklist QA:**
  - Deletar item → `isDeleted=true`, some da lista, linha permanece
  - Deletar ficha ligada → MenuItem fica (`sheetId` SET NULL), mas precisa ter `cost` manual p/ CMV (QA verifica se `cost` está preenchido em revenda)
  - Item sem ficha (`sheetId IS NULL`) → DEVE ter `cost` não-null (senão CMV quebra)
  - `salesEstimate` é estimativa — pode ser 0 ou null
  - Contagem viva + deletada = blob menuEngineering original

---

## Faturamento, custos e perfil

### RevenueEntry
- **Para que serve:** Armazena faturamento mensal do cliente (entrada histórica de receita); base para análise de receita ao longo dos períodos.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída pelo coreSync a partir de `Client.data.formData.revenue_history` (F2 dual-write); leitura via coreRead para servir a GET /client/:hash.
- **Colunas-chave:**
  - `clientId` (FK): referência ao cliente proprietário.
  - `year`, `month` (1-12): período mensal identificador (YYYY-MM).
  - `amount` (numeric 18,2): faturamento em reais do mês.
  - `source` (padrão 'onboarding'): origem ('onboarding' = manual, 'integration' = integração futura).
- **Relações:** clientId→Client ON DELETE RESTRICT (SQL bruto); unique(clientId, year, month) — não há duas entradas para o mesmo mês.
- **Delete/auditoria:** NÃO tem soft-delete (é FATO mutável append-only; correção via update/source). Tem createdAt/updatedAt/modifiedBy (auditoria).
- **✅ Checklist QA:**
  - Inserir/editar mês: unique(clientId, year, month) respeitado; ao editar, amount atualiza via PUT sem duplicar período.
  - Deletar entrada: não desaparece da tabela (sem is_deleted), mas pode ser apagada fisicamente ou ter amount=0 (verificar política do backend).
  - Reconstrução: `npm run db:backfill` lê `Client.data.formData.revenue_history[{month: "MM/YYYY", amount: "R$ 199.000,00"}]` → monta RevenueEntry. Contagem = contagem no blob.
  - coreRead injeta em GET (flag Client.readInsumosFromTables): revenue_history reconstruído em formData.revenue_history.

### DailyRevenue
- **Para que serve:** Faturamento diário granular (entrada por data); detalha receita em nível operacional (quando habilitado).
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída do blob `Client.data.formData.daily_revenue` (chave: 'YYYY-MM-DD' → amount numérico).
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `date` (date): YYYY-MM-DD (chave do período).
  - `amount` (numeric 18,2): faturamento em reais naquele dia.
  - `source` (padrão 'manual'): origem ('manual' = app, 'integration' futuro).
- **Relações:** clientId→Client ON DELETE RESTRICT; unique(clientId, date).
- **Delete/auditoria:** NÃO tem soft-delete (FATO). Tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Inserir/editar por data: unique(clientId, date) respeitado; sem duplicar data.
  - Reconstrução: blob `daily_revenue: { "2025-06-15": 5000.50, ... }` → monta DailyRevenue. Ordem por date no retorno.
  - coreRead retorna em formData.daily_revenue (recomposto como objeto {date→amount numérico}).

### CompanyProfile
- **Para que serve:** Perfil 1:1 do restaurante (razão social, categoria, regime fiscal, dados do dono) e identidade de negócio.
- **Fonte:** LEGADA/BPO (escrita direto pelo app). Espelho da seção `data.restaurant`, `data.user`, `data.profile`, `data.identity`, `data.user_info` do blob, armazenado de forma desnormalizada.
- **Colunas-chave:**
  - `clientId` (FK): cliente único (unique constraint); vinculação 1:1.
  - `restaurantName`, `restaurantCategory`: nome e tipo de estabelecimento.
  - `cuisineType`: tipo de culinária (← `identity.cuisine_type`).
  - `ownerName`, `ownerEmail`, `ownerPhone`, `ownerCpf`: dados do proprietário (CPF é PII — mascarar em logs).
  - `taxRegime`: 'Simples Nacional', 'Lucro Presumido', etc.
  - `isMei` (boolean): enquadramento fiscal.
  - `businessLogo`, `ownerPhoto`: URLs (base64 fica no blob, não migra).
- **Relações:** clientId→Client ON DELETE RESTRICT; unique(clientId).
- **Delete/auditoria:** Tem soft-delete (isDeleted/deletedAt/deletedBy); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: ao deletar, is_deleted=true, permanece na tabela. Listas devem filtrar where isDeleted=false.
  - Dados sensíveis: ownerCpf/ownerEmail/ownerPhone devem ser mascarados em logs/exports (PII).
  - Fotos base64: businessLogo e ownerPhoto no banco armazenam URLs apenas; o blob retém base64 como fallback (coreRead conjuga fallback se URL vazia).
  - Reconstrução: coreRead lê CompanyProfile → injeta em blob.data.restaurant, data.user, data.profile, data.identity, data.user_info; restaurantPhoto não migra (fallback blob).

### FixedCostItem
- **Para que serve:** Armazena custos fixos recorrentes (aluguel, utilidades, serviços, sistemas, marketing) refletindo estrutura do formData do onboarding (espelho fiel).
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída pelo coreSync desde `Client.data.formData` (location_costs, utilities, recurring_services, operational_fixed, admin_systems, marketing_structure, monthly_services, other_fixed_costs).
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `costGroup` (text): chave do grupo ('location_costs', 'utilities', 'recurring_services', 'operational_fixed', 'admin_systems', 'marketing_structure', 'monthly_services', 'other_fixed_costs').
  - `costKey` (text, nullable): chave do item em grupos-objeto ('energy', 'water', 'software_pdv'); NULL em grupos-array.
  - `label` (text): nome do item em grupos-array ('Internet Backup', 'Limpeza Mensal'); NULL em grupos-objeto.
  - `rawValue` (text): valor ORIGINAL exato (string) — espelho fiel do blob ('meta', 'R$ 500,00', '2000', etc.).
  - `amount` (numeric 18,2): parsed numérico (NULL se não-numérico, ex "meta").
  - `position` (integer): ordem em arrays (monthly_services/other_fixed_costs).
- **Relações:** clientId→Client ON DELETE RESTRICT; index(clientId, costGroup).
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Espelho fiel: rawValue deve ser string EXATA do blob (não parse); amount é derivado (null se texto não-numérico). Verificar "meta"→amount=null, "500"→amount=500.00.
  - Grupos-objeto vs. array: costKey NOT NULL e label NULL = objeto; costKey NULL e label NOT NULL = array. Posição = NULL (objetos) ou integer (arrays).
  - Soft-delete: ao marcar is_deleted=true, some das listas (formData), mas linha permanece auditável.
  - Reconstrução: coreRead lê FixedCostItem → reconstrói formData (grupos-objeto como {costKey: rawValue}; grupos-array como [{name: label, value: rawValue}]).
  - Contagem estrutura: número de linhas por costGroup deve casar com blob (exceto deleted).

### Employee
- **Para que serve:** Registra funcionários para modelo de custo de folha de pagamento (onboarding); vincula a dados operacionais do BPO quando possível.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.employees[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável no blob (casar funcionário).
  - `bpoEmployeeId` (text, FK→BpoEmployee SET NULL): vinculação best-effort por nome para operacional (BPO).
  - `name`, `cpf`, `role` (cargo): identificação.
  - `regime` (CLT | PJ | Freela): tipo contratual.
  - `baseSalary`, `bonus`, `transportValue`, `transportQty`, `workDays`, `foodCost`: componentes de custos.
- **Relações:** clientId→Client ON DELETE RESTRICT; legacyId unik(clientId, legacyId) — caseamento onboarding; bpoEmployeeId→BpoEmployee SET NULL (loose link).
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: ao deletar, is_deleted=true, some das listas formData.employees, permanece auditável.
  - Reconstrução: coreRead injeta employees[] em formData (numeros parseados: baseSalary→base_salary em "R$ x.xxx,xx").
  - Link BPO: bpoEmployeeId preenchido por match de nome ao backfill; verificar se match ainda válido (employee pode ter sido deletado no BPO).
  - Contagem: formData.employees[] contagem = FixedCostItem WHERE costGroup != (arrays/objetos de custo) — Employee é lista separada.

### Partner
- **Para que serve:** Registra sócios da empresa (pró-labore, dados bancários); completa dados de donos/quotistas no onboarding.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.partners[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável no blob.
  - `bpoPartnerId` (text, FK→BpoPartner SET NULL): vinculação loose-link ao BPO.
  - `name`, `cpf`, `role`: identificação sócio.
  - `proLabore` (numeric 18,2): pró-labore mensal.
  - `personalAccountBank`, `personalAccountAgency`, `personalAccountNumber`: dados bancários.
  - `photoUrl` (text): URL de foto MinIO (base64 fica blob como fallback).
- **Relações:** clientId→Client ON DELETE RESTRICT; index(clientId); bpoPartnerId→BpoPartner SET NULL.
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: ao deletar, is_deleted=true, some dos partners[], permanece auditável.
  - Foto: photoUrl armazena URL (MinIO); coreRead faz fallback ao base64 do blob caso URL vazia.
  - CPF: dados sensíveis — mascarar em logs.
  - Reconstrução: coreRead injeta partners[] em formData; nome normalizado para match foto base64 do blob.

### Equipment
- **Para que serve:** Registra ativos (equipamentos de cozinha, máquinas) para cálculo de depreciação mensal (custo fixo).
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.equipment[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável blob.
  - `name`: descrição do equipamento.
  - `value` (numeric 18,2): valor inicial (para depreciação).
  - `lifespanYears` (numeric 5,2): anos de vida útil (padrão 5); depreciação = value / (lifespanYears × 12).
- **Relações:** clientId→Client ON DELETE RESTRICT; index(clientId).
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: is_deleted=true remove do equipamento[].
  - Depreciação: verificar cálculo mensal = value / (lifespanYears × 12) em financialCalc; lifespanYears padrão=5 se vazio.
  - Reconstrução: coreRead injeta equipment[] em formData; value em "R$ x.xxx,xx", lifespan como string numérica.

### Vehicle
- **Para que serve:** Registra veículos da frota para cálculo de custos (parcelas, manutenção, seguro, IPVA).
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.vehicles[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável blob.
  - `description`: descrição do veículo (modelo, placa).
  - `installment`, `maintenanceMonthly`, `insuranceAnnual`, `ipvaAnnual`: custos associados (numeric 18,2).
- **Relações:** clientId→Client ON DELETE RESTRICT; index(clientId).
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: is_deleted=true remove do vehicles[].
  - Cálculo mensal: installment é mensal; insuranceAnnual/ipvaAnnual dividem por 12 em financialCalc; maintenanceMonthly somado direto.
  - Reconstrução: coreRead injeta vehicles[] em formData; valores em "R$ x.xxx,xx".

### CardMachine
- **Para que serve:** Registra máquinas de cartão (débito/crédito) e suas taxas, vinculando a PaymentMethod do BPO para cálculo de fees.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.fees_cards[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável blob.
  - `provider` (text): provedor ('Rede', 'Stone', 'Outra', etc.).
  - `customProvider` (text): nome customizado quando provider='Outra'.
  - `debitRate`, `creditRate` (numeric 5,2): percentuais de taxa (ex 1.50 = 1,50%).
  - `debitPaymentMethodId`, `creditPaymentMethodId` (text, FKs→PaymentMethod SET NULL): vincular a métodos pagamento BPO.
- **Relações:** clientId→Client ON DELETE RESTRICT; debitPaymentMethodId→PaymentMethod SET NULL; creditPaymentMethodId→PaymentMethod SET NULL (ambas SQL bruto, cross-ORM).
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: is_deleted=true remove do fees_cards[].
  - Taxa: debitRate/creditRate parseados em percentual; verificar cálculo fee = (debit_sales × debitRate/100) + (credit_sales × creditRate/100).
  - Reconstrução: coreRead injeta fees_cards[] em formData; rates em "1,50" (PT-BR).
  - Vinculação BPO: debit/creditPaymentMethodId ligam ao operacional; se PaymentMethod deletado, FK vira NULL.

### Marketplace
- **Para que serve:** Registra integrações de marketplace (iFood, Rappi, etc.) e suas comissões/fees, vinculando a PaymentMethod do BPO.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída desde `Client.data.formData.fees_marketplaces[]`.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `legacyId` (text): id estável blob.
  - `provider` (text): 'iFood', 'Rappi', 'Outra', etc.
  - `customProvider` (text): nome customizado quando provider='Outra'.
  - `commission`, `salesPercentage` (numeric 5,2): percentuais de comissão/taxa vendas.
  - `monthlyFee` (numeric 18,2): taxa mensal fixa (ex: taxa de ativação).
  - `paymentMethodId` (text, FK→PaymentMethod SET NULL): vincula a método pagamento BPO.
- **Relações:** clientId→Client ON DELETE RESTRICT; paymentMethodId→PaymentMethod SET NULL.
- **Delete/auditoria:** Tem soft-delete (isDeleted); tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Soft-delete: is_deleted=true remove do fees_marketplaces[].
  - Taxa: commission e salesPercentage parseados em percentual; monthlyFee em valor. Verificar cálculo fee = (marketplace_sales × (commission + salesPercentage)/100) + monthlyFee.
  - Reconstrução: coreRead injeta fees_marketplaces[] em formData; percentuais em "2,50", monthlyFee em "R$ 50,00".
  - Vinculação BPO: paymentMethodId liga ao operacional; se deletado, FK vira NULL.

### MetricSnapshot
- **Para que serve:** Snapshot de métricas-chave (CMV, marketplace fee, custos fixos, card fee, etc.) consolidadas por período (YYYY-MM); base para relatórios e análise de rentabilidade.
- **Fonte:** PROJEÇÃO do blob (regenerada — não editar direto). Reconstruída pelo financialCalc/coreSync ao calcular período.
- **Colunas-chave:**
  - `clientId` (FK): cliente proprietário.
  - `periodKey` (text): 'YYYY-MM' (chave temporal).
  - `cmv` (numeric 18,4): Custo de Mercadoria Vendida (cálculo).
  - `marketplaceFee`, `fixedCosts`, `cardFee`, `advances`, `loans` (numeric 18,4): drivers consolidados.
  - `drivers` (jsonb): raw exato (futuros drivers não-desnormalizados, auditoria).
- **Relações:** clientId→Client ON DELETE RESTRICT; unique(clientId, periodKey).
- **Delete/auditoria:** NÃO tem soft-delete (FATO). Tem createdAt/updatedAt/modifiedBy.
- **✅ Checklist QA:**
  - Reconstrução: ao calcular período (F1 financialCalc), coreSync popula MetricSnapshot com drivers atuais (marketplace/fixedCosts/cmv/cardFee/advances/loans).
  - drivers jsonb: contém drivers brutos/futuros não desnormalizados; permite auditoria/extensão sem migração.
  - Unique: um snapshot por (cliente, período); atualizar período existente = UPDATE, não INSERT.
  - Drivers consolidados: cmv = sum(MenuItem.cost × qty_vendida); marketplaceFee = sum(Marketplace.monthlyFee + commission×sales); fixedCosts = sum(FixedCostItem.amount) + depreciation(Equipment) + depreciação(Vehicle); cardFee = sum(CardMachine taxa×sales).

---

## Plataforma, auth e sistema

### Client
- **Para que serve:** Dados mestres do restaurante/negócio (conta). Armazena credenciais, status de subscrição, e o BLOB JSON (Client.data) que é a FONTE DA VERDADE histórica de toda a operação: insumos, fichas, menu, cardápio, faturamento e custos.
- **Fonte:** LEGADA/BPO (escrita direto pelo app). Client.data é JSON e não passa por Drizzle — o coreSync (serviço background) projeta o blob nas 20 tabelas Drizzle a cada F2 dual-write.
- **Colunas-chave:** 
  - `id` (text, PK)
  - `name` (text, nome do restaurante/negócio)
  - `data` (text, blob JSON — a verdade de tudo)
  - `active` (boolean, cliente bloqueado/desbloqueado)
  - `subscriptionStatus`, `subscriptionPlan`, `trialEndsAt`, `currentPeriodEnd` (lifecycle de assinatura)
  - `bpoEnabled`, `bpoActivatedAt` (módulo de BPO ativado?)
  - `blockedByAdmin`, `blockedReason` (suspenso por compliance)
  - `read*FromTables` flags (insumos/fichas/menu/faturamento/custos lidos de tabelas Drizzle ou ainda só do blob?)
- **Relações:** 1-N com TeamMember (clientId), BpoEmployee, BpoPartner, Payable, Receivable, BankAccount, etc. (FK clientId → Client ON DELETE RESTRICT — nunca se apaga cliente com filhos).
- **Delete/auditoria:** Não tem soft-delete (usa `active` flag em vez disso). Tem `createdAt`, `updatedAt`. Sem coluna `modifiedBy` (é Prisma legado).
- **✅ Checklist QA:**
  - Ao ativar BPO, `bpoEnabled=true` e `bpoActivatedAt` preenchido; ao desativar, `bpoEnabled=false`.
  - Teste bloqueio por admin: `blockedByAdmin=true` ⇒ cliente não consegue logar; `blockedReason` contém motivo.
  - Contagem de linhas nas 20 tabelas do núcleo (Category, Ingredient, etc.) = contagem de itens no blob do cliente (validar no backfill/coreSync).
  - Flag `readFichasFromTables=true` ⇒ app lê TechnicalSheet via Drizzle, não de Client.data (teste dual-write via F2).

### TeamMember
- **Para que serve:** Usuários do time (gerentes, assistentes, delivery) do restaurante. Controle de acesso ao app (login/senha ou Clerk).
- **Fonte:** LEGADA/BPO (escrita direto pelo app).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `name`, `email` (identificação)
  - `role` (default 'Gerente' — Gerente, Assistente, Delivery, etc.)
  - `password` (hash, nullable se usar Clerk)
  - `clerkUserId` (OAuth Clerk, nullable se senha local)
  - `active` (boolean, soft-active)
  - `createdAt`, `updatedAt`
- **Relações:** FK clientId→Client ON DELETE RESTRICT. Unique constraint em (clerkUserId) where clerkUserId is not null; unique em email.
- **Delete/auditoria:** Não tem soft-delete coluna (usa `active` flag). Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - Ao criar member com email, validar unique; ao deletar (ativo→inativo), `active=false` mas linha fica no DB.
  - Se usar Clerk, `clerkUserId` populado e `password=null`; se senha local, `clerkUserId=null` e `password` hashed.
  - Teste remoção de time member: cliente com N members — apagar um ⇒ `active=false`, contagem de ativos diminui.
  - Listar members vivos: `WHERE clientId = ? AND active = true`.

### AdminUser
- **Para que serve:** Usuários super-admin (suporte Breaker, monitoramento). Globais, não por cliente.
- **Fonte:** LEGADA/BPO (escrita direto pelo app/backoffice).
- **Colunas-chave:**
  - `id` (text, PK)
  - `name`, `email` (credenciais)
  - `role` (função: 'RAY' = ray.ai?, 'Support', etc.)
  - `clerkUserId` (OAuth, nullable)
  - `password` (hash, nullable se Clerk)
  - `permissions` (array of text, default `["RAY"]`)
  - `active` (boolean)
  - `invitedBy`, `invitedAt` (provenance)
  - `lastLoginAt` (auditoria de uso)
- **Relações:** Nenhuma FK.
- **Delete/auditoria:** Não tem soft-delete (usa `active`). Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - Email unique; ao convidar novo admin, `invitedBy` e `invitedAt` preenchidos.
  - `active=false` ⇒ login bloqueado (verificar na tela de login).
  - Alteração de `permissions` via backoffice; validar que role/permissions são lidos em toda operação sensível (aprovação de pagável, bloqueio de cliente, etc.).

### Agency
- **Para que serve:** Agências (revendedores / parceiros SaaS que gerenciam múltiplos clientes).
- **Fonte:** LEGADA/BPO (escrita direto pelo app).
- **Colunas-chave:**
  - `id` (serial, PK — não text, é integer!)
  - `name`, `hash` (identificação)
  - `email`, `password` (credenciais)
  - `stripeCustomerId`, `stripeSubscriptionId` (cobrança por agência)
  - `plan` (default 'basic' — quais valores? basic/pro/enterprise?)
  - `active` (boolean)
  - `resetToken`, `resetTokenAt` (password reset)
- **Relações:** 1-N com Client (Client.agencyId → Agency.id). FK é invertida (Client aponta pra agência).
- **Delete/auditoria:** Não tem soft-delete (usa `active`). Tem `createdAt`, sem `updatedAt`.
- **✅ Checklist QA:**
  - Email e hash unique.
  - Ao criar client novo, agência pode atribuir Client.agencyId; cliente vê opção de agência na conta.
  - Teste bloqueio de agência: `active=false` ⇒ todos os clientes da agência ficam com acesso restrito? (verificar se há validação em login).
  - Stripe hook: ao receber evento de subscription update, atualizar `plan` e `stripeSubscriptionId`.

### Broadcast
- **Para que serve:** Mensagens globais do sistema (pop-ups, banners, notificações para clientes).
- **Fonte:** LEGADA/BPO (escrita direto pelo backoffice/admin).
- **Colunas-chave:**
  - `id` (text, PK)
  - `title`, `message` (conteúdo)
  - `imageUrl` (opcional, URL da imagem)
  - `type` (default 'popup' — popup/banner/toast?)
  - `targetCategory` (filtro: nil = todos, ou 'bpo'/'premium'/etc.)
  - `active` (boolean, mostrar/esconder)
  - `expiresAt` (quando some de lista)
- **Relações:** Nenhuma FK.
- **Delete/auditoria:** Não tem soft-delete (usa `active`). Tem `createdAt`, `updatedAt`.
- **✅ Checklist QA:**
  - Teste agendamento: criar broadcast com `expiresAt` futuro, depois com data passada ⇒ deve desaparecer.
  - `active=false` ⇒ não aparece pro cliente mesmo dentro do period.
  - Filter por `targetCategory`: broadcast com `targetCategory='bpo'` só aparece pra clientes com `Client.bpoEnabled=true`.

### AuditLog
- **Para que serve:** Registro IMUTÁVEL de todas as ações do sistema (append-only). Auditoria, compliance, troubleshooting.
- **Fonte:** LEGADA/BPO (escrita direto pelo app em muitos pontos; nunca atualizado ou deletado).
- **Colunas-chave:**
  - `id` (text, PK)
  - `action` (ex: 'CREATE_PAYABLE', 'UPDATE_CLIENT', 'DELETE_INGREDIENT')
  - `entityType` (ex: 'Payable', 'Client', 'Ingredient')
  - `entityId` (qual linha foi afetada?)
  - `actorType` (ex: 'TeamMember', 'AdminUser', 'System')
  - `actorId` (quem fez? id do TeamMember ou AdminUser)
  - `actorLabel` (nome legível do ator, denormalizado)
  - `summary` (descrição curta: "Criou pagável de R$ 1.234,56 para ACME LTDA")
  - `metadata` (JSON string com dados extras — delta/before-after?)
  - `category` (agrupamento: 'payroll'/'payment'/'menu'/etc.?)
  - `createdAt` (when)
- **Relações:** Nenhuma FK (fita append-only, histórica).
- **Delete/auditoria:** Append-only — NUNCA soft-delete, NUNCA update. Tem ONLY `createdAt`, sem `updatedAt`.
- **✅ Checklist QA:**
  - Toda ação de negócio (criar pagável, aprovar receivable, mudar insumo) ⇒ row em AuditLog com action apropriado.
  - `actorLabel` match com nome real (TeamMember.name ou AdminUser.name) no moment da ação — não muda se nome do ator mudar depois.
  - Teste: deletar pagável (soft-delete) ⇒ AuditLog com `action='SOFT_DELETE_PAYABLE'`, `entityType='Payable'`, `entityId=<id_payable>`.
  - Relatório de auditoria: filtrar por `category`, `action`, `entityType`, range de datas.

### StripeEvent
- **Para que serve:** Webhook events do Stripe (subscrição, cobrança, refund). Processados uma vez, histórico imutável.
- **Fonte:** LEGADA/BPO (escrita direto pelo webhook handler).
- **Colunas-chave:**
  - `id` (text, PK — Stripe event ID ou UUID?)
  - `type` (ex: 'customer.subscription.updated', 'invoice.payment_succeeded')
  - `clientId` (nullable — nem todo evento tem cliente, ex: agency subscription)
  - `payload` (JSON string completo do evento Stripe)
  - `processedAt` (when recebido/processado)
- **Relações:** FK clientId→Client (nullable, ON DELETE RESTRICT ou SET NULL?).
- **Delete/auditoria:** Append-only (webhook history). Sem soft-delete, sem `updatedAt`.
- **✅ Checklist QA:**
  - Teste webhook: Stripe send `customer.subscription.updated` ⇒ row criada com `type='customer.subscription.updated'`, `payload` contém JSON completo.
  - Idempotência: se webhook reenviar mesmo evento (retry), DB não duplica (ex: constraint em Stripe event ID).
  - `clientId` populado se event tem `customerId`; else null (ex: agency-level events).
  - Teste error handling: processamento do webhook falha ⇒ log em AuditLog, StripeEvent fica com `processedAt` (registrada tentativa).

### ClientDataSnapshot
- **Para que serve:** Backup/histórico do blob JSON (Client.data). Resgate de versão anterior, validação de integridade.
- **Fonte:** LEGADA/BPO (escrita automática ao salvar Cliente.data — F2 coreSync ou hook manual).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `data` (text, JSON snapshot do Client.data naquela hora)
  - `size` (integer, tamanho em bytes)
  - `reason` (ex: 'auto_save', 'manual_backup', 'admin_restore_point')
  - `createdAt` (when capturado)
- **Relações:** FK clientId→Client ON DELETE RESTRICT (snapshots pendem do cliente).
- **Delete/auditoria:** Append-only para backup, mas pode haver limpeza de old snapshots (ex: manter últimos 30). Sem soft-delete, sem `updatedAt`.
- **✅ Checklist QA:**
  - Ao salvar cliente (F2 save do blob), snapshot automático criado com `reason='auto_save'`.
  - `size` = bytes do JSON (não contém whitespace extra?).
  - Teste restore: admin escolhe snapshot antigo, blob recuperado ⇒ nova snapshot com `reason='admin_restore'` é criada também (auditoria).
  - Query: últimos 10 snapshots do cliente = `WHERE clientId = ? ORDER BY createdAt DESC LIMIT 10`.

### WhatsappMessage
- **Para que serve:** Mensagens WhatsApp recebidas via webhook (API de integrações externas). OCR/parsing de vouchers, faturas, etc. para criação automática de Payable/Receivable.
- **Fonte:** LEGADA/BPO (escrita via webhook handler de WhatsApp API).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client, nullable — admitir broadcast de msgs sem cliente?)
  - `fromNumber` (telefone +55..., quem mandou)
  - `senderName` (nome do contato, denormalizado)
  - `messageType` (default 'text' — text/image/audio/document?)
  - `textContent` (conteúdo de texto)
  - `mediaUrl` (link da mídia se type != text)
  - `conversationStep` (ex: 'awaiting_voucher', 'parsed_voucher', 'created_payable')
  - `conversationData` (JSON string de estado da conversa/extração)
  - `validatedAt`, `validatedBy` (quando um humano validou/corrigiu a extração)
  - `createdPayableId`, `createdReceivableId` (FK→Payable/Receivable, se a msg gerou entrada)
  - `status` (default 'pending' — pending/validated/rejected/archived)
  - `rawJson` (snapshot completo do webhook Whatsapp)
- **Relações:** FK clientId→Client (nullable), createdPayableId→Payable, createdReceivableId→Receivable (ambas nullable).
- **Delete/auditoria:** Append-only para msgs (nem se deleta msg recebida). Tem `createdAt`, `updatedAt`. Sem soft-delete.
- **✅ Checklist QA:**
  - Webhook recebe imagem → row criada com `messageType='image'`, `mediaUrl` preenchido, `status='pending'`.
  - Validação manual: operador corrige extração ⇒ `validatedAt` e `validatedBy` preenchidos, `status='validated'`.
  - Se gerou Payable: `createdPayableId` populado, link bidirecional (Payable.whatsappMessageId apontando pra msg?).
  - Teste conversa: msg 1 (voucher) → status 'pending'; msg 2 (confirmação) → `conversationData` contem histórico; `conversationStep` avança.

### BpoTask
- **Para que serve:** Tarefas/tickets do módulo BPO (folha de pagamento, reconciliação, etc.). Rastreamento de ações administrativas.
- **Fonte:** LEGADA/BPO (escrita direto pelo app/admin).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `type` (ex: 'verify_payroll', 'reconcile_account', 'approve_payment')
  - `severity` (default 'normal' — normal/high/critical)
  - `title`, `description` (o quê fazer)
  - `relatedType`, `relatedId` (ex: relatedType='Payable', relatedId=<id_payable> — contexto)
  - `status` (default 'open' — open/in_progress/resolved/closed)
  - `dueAt` (deadline)
  - `resolvedAt` (when completada)
  - `assignedTo` (TeamMember.id de quem ficou responsável)
- **Relações:** FK clientId→Client, assignedTo→TeamMember (ambas nullable/ON DELETE RESTRICT).
- **Delete/auditoria:** Não tem soft-delete. Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - Ao ativar BPO de um cliente, tarefas de onboarding criadas automaticamente (ex: `type='verify_payroll'`).
  - Teste atribuição: `assignedTo=<tm_id>` ⇒ TeamMember vê task na sua fila.
  - Resolver task: `status='open'` → 'resolved', `resolvedAt` preenchido.
  - Query de overdue: `WHERE clientId = ? AND status = 'open' AND dueAt < NOW()`.

### PdvIntegration
- **Para que serve:** Configuração de integrações com sistemas PDV externos (Tyan, iFood, etc.). Síncroniza transações de venda.
- **Fonte:** LEGADA/BPO (escrita direto pelo app ao configurar integração).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `provider` (ex: 'tyan', 'ifood', 'stone', 'vr_pag')
  - `authConfig` (JSON string com credenciais/API keys — CRIPTOGRAFADO?)
  - `active` (boolean, habilitar/desabilitar sync)
  - `lastSyncAt` (when última sincronização bem-sucedida)
  - `lastSyncStatus` (ex: 'success', 'error', 'partial')
  - `lastSyncError` (mensagem de erro se falhou)
- **Relações:** FK clientId→Client ON DELETE RESTRICT.
- **Delete/auditoria:** Não tem soft-delete (ativa/desativa via `active` flag). Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - Ao criar integração PDV, `authConfig` salvo (VALIDAR: é criptografado no DB ou em env vars externo?).
  - `active=false` ⇒ sync job não roda pra esse provider.
  - Teste sync: worker roda job → `lastSyncAt` atualizado, `lastSyncStatus='success'`, novas Receivable criadas se vendas detectadas.
  - Erro de sync: `lastSyncStatus='error'`, `lastSyncError` contém mensagem para debug (ex: "401 Unauthorized").

### BpoEmployee
- **Para que serve:** Cadastro de funcionários do restaurante (gerentes, chefs, entregadores). Base para folha de pagamento BPO.
- **Fonte:** LEGADA/BPO (escrita direto pelo app).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `name`, `cpf` (ID, CPF unique por cliente)
  - `email`, `phone` (contato)
  - `role` (ex: 'Chef', 'Gerente', 'Entregador')
  - `bankCode`, `agency`, `account`, `pixKey` (dados bancários para pagamento)
  - `isFreelancer`, `isMotoboy` (flags de tipo contratação)
  - `baseSalary`, `commissionPct` (numeric, valores para folha)
  - `tipsAmount`, `overtimeAmount` (acumuladores de bônus)
  - `active` (boolean)
  - `hiredAt` (data de admissão)
- **Relações:** FK clientId→Client ON DELETE RESTRICT. Unique em (clientId, cpf) onde cpf != null.
- **Delete/auditoria:** Não tem soft-delete coluna (usa `active`). Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - CPF unique por cliente; ao criar 2 employees com mesmo CPF ⇒ erro ou atualiza existente?
  - Teste folha: `baseSalary=3000`, `commissionPct=5` ⇒ folha calcula salário + comissão.
  - `active=false` ⇒ não aparece em listas de pagamento, mas histórico permanece.
  - Dados bancários: ao atualizar bank/agency/account, valida formato? (ou aceita string livre?).

### BpoPartner
- **Para que serve:** Sócios/partners do restaurante. Base para cálculo de "pró-labore" (distribuição de lucros).
- **Fonte:** LEGADA/BPO (escrita direto pelo app).
- **Colunas-chave:**
  - `id` (text, PK)
  - `clientId` (FK → Client)
  - `name`, `cpf` (ID)
  - `email`, `phone` (contato)
  - `prolaboreAmount` (numeric, valor fixo mensal de retirada)
  - `personalAccountBank`, `personalAccountAgency`, `personalAccountNumber` (dados de conta pessoal)
  - `active` (boolean)
- **Relações:** FK clientId→Client ON DELETE RESTRICT. Unique em (clientId, cpf).
- **Delete/auditoria:** Não tem soft-delete coluna (usa `active`). Tem `createdAt`, `updatedAt`. Sem `modifiedBy`.
- **✅ Checklist QA:**
  - CPF unique por cliente; ao criar 2 partners com mesmo CPF ⇒ erro.
  - `prolaboreAmount` aparece em folha mensal; atualizar valor ⇒ reflete na próxima geração.
  - `active=false` ⇒ não paga mais pró-labore (mas histórico permanece).
  - Dados bancários: permite null (pagamento manual) ou obrigatório?

---

## BPO Financeiro

### Payable
- **Para que serve:** Registra contas a pagar — despesas (fornecedores, serviços, etc.) que o cliente tem obrigação de quitar em uma data futura.
- **Fonte:** LEGADA/BPO (escrita direto pelo app; não regenerada pelo coreSync).
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT; identifica o cliente.
  - `supplierId`: FK→Supplier (opcional); vincula a um fornecedor cadastrado.
  - `amount`: Valor total (numeric 18,2); nunca muda, apenas `remainingAmount` decresce.
  - `remainingAmount`: Valor pendente de pagamento; decrementa via PaymentTransaction.
  - `dueDate`: Data de vencimento.
  - `status`: 'pending' | 'paid' | 'overdue' | 'canceled'; muda conforme pagamento.
  - `recurrenceId`: FK→Recurrence (opcional); para contas recorrentes, gera filhas via `parentId`.
- **Relações:** 
  - clientId→Client (RESTRICT)
  - supplierId→Supplier
  - categoryId→FinancialCategory (opcional)
  - recurrenceId→Recurrence (opcional)
  - PaymentTransaction.payableId (um-para-muitos: cada transação de pagamento)
- **Delete/auditoria:** Soft-delete (sem coluna `is_deleted` visível no schema; `active` não aparece). Tem `createdAt`/`updatedAt`. Sem `modifiedBy` aparente — BPO usa `approvedBy`/`rejectedAt` para rastreabilidade de aprovação.
- **✅ Checklist QA:**
  1. Criar payable com status='pending'; `remainingAmount` = `amount`. Pagar parcialmente → `remainingAmount` decrementa, status continua 'pending'.
  2. Pagar 100% → status muda para 'paid', `remainingAmount` = 0.
  3. Recorrente: criar payable com `recurrenceId`; sistema gera filhas (check parentId); ao deletar mãe (soft), filhas orphaned?
  4. Aprovação: se `requiresApproval=true`, `approvedAt` e `approvedBy` devem estar preenchidos antes de transacionar pagamento.

### Receivable
- **Para que serve:** Registra contas a receber — receitas (vendas a crédito, serviços prestados, etc.) que o cliente tem direito de cobrar em data futura.
- **Fonte:** LEGADA/BPO (escrita direto; integração c/ PDV possível via `pdvSaleId`).
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `amount`: Valor total (numeric 18,2).
  - `remainingAmount`: Valor ainda a receber; decrementa via PaymentTransaction.
  - `dueDate`: Data de vencimento/receita prevista.
  - `payerName`: Nome do cliente/pagador (text; pode divergir de campo estruturado).
  - `status`: 'pending' | 'received' | 'overdue' | 'canceled'.
  - `recurrenceId`: FK→Recurrence (opcional); p/ receitas recorrentes.
  - `pdvSaleId`: Código/ID da venda no PDV integrado (rastreabilidade cross-sistema).
- **Relações:**
  - clientId→Client (RESTRICT)
  - paymentMethodId→PaymentMethod (opcional)
  - categoryId→FinancialCategory (opcional)
  - recurrenceId→Recurrence (opcional)
  - PaymentTransaction.receivableId (um-para-muitos)
- **Delete/auditoria:** Sem soft-delete explícito; `createdAt`/`updatedAt` sim. Sem `modifiedBy` visível.
- **✅ Checklist QA:**
  1. Criar receivable com status='pending'; `remainingAmount` = `amount`. Receber parcialmente → `remainingAmount` decrementa, status='pending'. Receber 100% → status='received', `remainingAmount`=0.
  2. PDV integrado: criar receivable com `pdvSaleId` preenchido; importação bidirecional (confere sync).
  3. Recorrente: criar com `recurrenceId`; verifica se filhas (parentId) são geradas + orpanamento ao deletar mãe.
  4. Deletar receivable → ainda aparece no histórico ou some? (determinar se há soft-delete não declarado).

### PaymentTransaction
- **Para que serve:** Registra um pagamento realizado — débito de Payable OU crédito de Receivable — com rastreamento de conta bancária e data.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `payableId`: FK→Payable (opcional, exclusivo); se preenchido, é pagamento de conta a pagar.
  - `receivableId`: FK→Receivable (opcional, exclusivo); se preenchido, é recebimento de conta a receber.
  - `amount`: Valor transacionado (numeric 18,2); pode ser < saldo pendente (parcial).
  - `paidAt`: Data/hora da transação (timestamp); chave de auditoria temporal.
  - `bankAccountId`: FK→BankAccount RESTRICT; rastreia de qual conta saiu/entrou o dinheiro.
  - `isPartial`: Flag bool; true se `amount` < `remainingAmount` da payable/receivable.
  - `notes`: Campo livre para anotações do operador.
- **Relações:**
  - payableId→Payable (opcional, mutualmente exclusivo com receivableId)
  - receivableId→Receivable (opcional, mutualmente exclusivo com payableId)
  - bankAccountId→BankAccount (RESTRICT)
- **Delete/auditoria:** Sem soft-delete (fato imutável). Só `createdAt`; sem `updatedAt` (append-only).
- **✅ Checklist QA:**
  1. Criar transação com payableId + amount < remainingAmount → `isPartial=true`; verificar que payable.remainingAmount decresce corretamente.
  2. Múltiplas transações na mesma payable (mesmo `paidAt` ou datas diferentes) → soma deve ≤ amount original.
  3. Transação com receivableId funciona análogo: receivable.remainingAmount decrementa, status→'received' quando zerado.
  4. BankAccount.currentBalance reflete transação? (correlação com BankTransaction se houver).

### BankAccount
- **Para que serve:** Representa uma conta bancária do cliente (corrente, poupança, etc.) — depósito centralizador de movimentação de caixa.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `bankCode`: Código do banco (ex: '001' = Banco do Brasil).
  - `bankName`: Nome do banco (ex: 'Banco do Brasil').
  - `agency`: Número da agência (text; pode ter dígito).
  - `account`: Número da conta (text).
  - `type`: 'corrente' | 'poupança' | outro.
  - `currentBalance`: Saldo atual (numeric 18,2); pode ser manual ou integrado (OpenFinance).
  - `isManual`: true = saldo editável; false = sincronizado (OpenFinance).
  - `openFinanceConnected`: Flag bool; true se integrado c/ OpenFinance.
  - `lastSyncAt`: Timestamp da última sincronização (OpenFinance).
- **Relações:**
  - clientId→Client (RESTRICT)
  - PaymentTransaction.bankAccountId (um-para-muitos)
  - BankTransaction.bankAccountId (um-para-muitos)
  - BankTransfer.fromAccountId / toAccountId (múltiplas)
- **Delete/auditoria:** Soft-delete: `active` (boolean, default true). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar BankAccount manual (`isManual=true`); editar `currentBalance` → reflete sem sync externo. OpenFinance integrada (`openFinanceConnected=true`) → `currentBalance` atualiza apenas em `lastSyncAt`, UI bloqueia edição manual.
  2. Deletar BankAccount (`active=false`) → Payable/Receivable/Transaction ainda referenciam? FKs permitem (sem DELETE CASCADE).
  3. BankTransaction/BankTransfer referenciam a conta → correlação de saldo (transações somam para currentBalance?).
  4. Múltiplas contas: pagamento sai de A, transferência A→B, recebimento em B → saldos coerentes?

### BankTransaction
- **Para que serve:** Registra uma movimentação bruta de banco (extrato bancário, manual ou integrado) — débito/crédito de caixa com rastreamento de reconciliação.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `bankAccountId`: FK→BankAccount RESTRICT; em qual conta ocorreu.
  - `externalId`: ID do banco (ex: id da transação no Open Finance); pode ser null (manual).
  - `amount`: Valor da movimentação (numeric 18,2).
  - `date`: Data do lançamento (timestamp).
  - `description`: Descrição do lançamento (ex: 'Saque 500,00' ou 'Boleto Bancário').
  - `type`: 'debit' | 'credit' (ou variações).
  - `reconciledType`: Tipo de entidade reconciliada (ex: 'Payable', 'Receivable', 'BankTransfer') — null se não reconciliado.
  - `reconciledId`: ID da entidade reconciliada (payableId, receivableId, bankTransferId, etc.) — null se não reconciliado.
  - `source`: 'manual' | 'integration' (indicador de origem).
- **Relações:**
  - bankAccountId→BankAccount (RESTRICT)
  - reconciledId → polimórfica (Payable, Receivable, BankTransfer por tipo em `reconciledType`).
- **Delete/auditoria:** Sem soft-delete. Só `createdAt`; append-only.
- **✅ Checklist QA:**
  1. Importar extrato (source='integration') com externalId; manuais (source='manual') não têm externalId.
  2. Reconciliar manualmente: BankTransaction.reconciledType='Payable', reconciledId=payableId → UI marca como "reconciliado"; refazer reconciliação? (sobrescreve?).
  3. Multi-transação: mesma BankTransaction não pode referenciar 2 Payables (1:1 lógico em reconciledId).
  4. Deletar Payable → BankTransaction.reconciledId fica órfão? (sem ON DELETE SET NULL aparente).

### BankTransfer
- **Para que serve:** Registra uma transferência de valores entre 2 contas bancárias do cliente (A→B), incluindo taxas.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `fromAccountId`: FK→BankAccount; conta de origem.
  - `toAccountId`: FK→BankAccount; conta de destino.
  - `amount`: Valor transferido (numeric 18,2).
  - `date`: Data da transferência (timestamp).
  - `fee`: Taxa bancária (numeric 18,2, default 0).
  - `description`: Anotação (ex: 'Transferência operacional').
- **Relações:**
  - clientId→Client (RESTRICT)
  - fromAccountId→BankAccount
  - toAccountId→BankAccount
- **Delete/auditoria:** Sem soft-delete. Só `createdAt`; append-only.
- **✅ Checklist QA:**
  1. Criar BankTransfer: fromAccount.currentBalance -= (amount + fee); toAccount.currentBalance += amount. Reversão de transação?
  2. Fee > 0 → caixa perde valor total (amount + fee), recebe amount; terceira conta ou write-off?
  3. Transferência A→A (mesma conta) → validação bloqueia ou permite?
  4. BankTransaction com reconciledType='BankTransfer' → dois lançamentos (um debit em A, um credit em B) ou um só?

### Supplier
- **Para que serve:** Cadastro de fornecedores — entidades que fornecem bens/serviços ao cliente (insumos, ingredientes, serviços gerais).
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `cnpj`: CNPJ do fornecedor (text, obrigatório); PII — mascarar em logs. Unique (clientId, cnpj).
  - `name`: Razão social ou nome fantasia.
  - `email`: Contato de e-mail.
  - `phone`: Telefone.
  - `pixKey`: Chave PIX (opcional).
  - `bankCode` / `agency` / `account`: Dados bancários para pagamento.
  - `defaultCategoryId`: FK→FinancialCategory (opcional); categoria padrão de despesa.
  - `defaultBankAccountId`: FK→BankAccount (opcional); conta padrão de pagamento.
  - `notes`: Anotações livres.
- **Relações:**
  - clientId→Client (RESTRICT)
  - defaultCategoryId→FinancialCategory
  - defaultBankAccountId→BankAccount
  - Payable.supplierId (um-para-muitos)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar supplier com CNPJ único (clientId, cnpj); duplicado no mesmo cliente → erro de unique. Deletar → `active=false`, mas CNPJ fica "bloqueado"? (pode reusar após delete?).
  2. Deletar supplier com Payables associadas → soft-delete, referências intactas; UI continua mostrando Payables de supplier deletado?
  3. defaultCategoryId / defaultBankAccountId → pré-preenchem novos Payables deste supplier; vazio → deixa campo aberto no form.
  4. Verificar PII (CNPJ, dados bancários) — não aparecer em logs, apenas mascarados.

### FinancialCategory
- **Para que serve:** Categorização de movimentações financeiras (despesas, receitas) — estrutura hierárquica de contas contábeis (aluguel, energia, fornecedores, etc.).
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `name`: Nome da categoria (ex: 'Fornecedores', 'Aluguel').
  - `type`: 'income' | 'expense' | 'asset' | 'liability' (classificação contábil).
  - `parentId`: FK→FinancialCategory (opcional, self-referência); para subcategorias.
  - `dreGroup`: Código de grupo contábil (opcional; DRE = Demonstração de Resultado).
  - `color`: Cor hexadecimal (visual).
- **Relações:**
  - clientId→Client (RESTRICT)
  - parentId→FinancialCategory (self, optional)
  - Payable.categoryId (um-para-muitos)
  - Receivable.categoryId (um-para-muitos)
  - ReconciliationRule.categoryId (um-para-muitos)
  - Supplier.defaultCategoryId (um-para-muitos)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar categoria com parentId → subcategoria; hierarquia até N níveis. Deletar pai → filhos (subcategorias) ficam orphaned? Ou soft-delete em cascata?
  2. Payable/Receivable referenciam categoria; deletar categoria → referências intactas (sem cascade).
  3. DRE: dreGroup preenchido → categoria aparece em relatório de DRE; vazio → coluna livre.
  4. Type (income/expense) → impacta lógica de sinal (receita positiva, despesa negativa) em dashboards?

### PaymentMethod
- **Para que serve:** Define métodos de pagamento/recebimento (dinheiro, cartão, transferência, etc.) com configuração de taxas e prazos de liquidação.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `name`: Rótulo (ex: 'Cartão Crédito Itaú', 'PIX', 'Dinheiro').
  - `type`: 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'cash' | outro.
  - `feePercent`: Taxa percentual cobrada (numeric 5,2; ex: 2.99 = 2.99%).
  - `settlementDays`: Dias até liquidação (integer; 0 = imediato, 30 = em 30 dias).
- **Relações:**
  - clientId→Client (RESTRICT)
  - Receivable.paymentMethodId (um-para-muitos)
  - CardMachine.debitPaymentMethodId / creditPaymentMethodId (um-para-muitos, via schema.js)
  - Marketplace.paymentMethodId (um-para-muitos, via schema.js)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar PaymentMethod com feePercent; Receivable referencia → liquidação calcula justo (juros não reduzem amount?).
  2. settlementDays=30 → previsão de caixa antecipa justo? (integridade com forecast).
  3. Deletar PaymentMethod → Receivables associadas ficam orphaned ou auto-setadas a null?
  4. CardMachine cria 2 PaymentMethods (débito + crédito) automaticamente; editar uma → outra sincroniza (feePercent)?

### Loan
- **Para que serve:** Registra empréstimos contraídos pelo cliente (banco, fornecedor, etc.) com cronograma de amortização e rastreamento de pagamento.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `bankName`: Nome da instituição credora (ex: 'Banco Itaú').
  - `contractNumber`: Número do contrato (texto livre).
  - `principal`: Capital emprestado (numeric 18,2).
  - `interestRateMonthly`: Taxa de juros mensal (numeric 7,4; ex: 2.5 = 2.5% a.m.).
  - `totalInstallments`: Número total de parcelas.
  - `paidInstallments`: Quantas parcelas já pagas (integer).
  - `installmentValue`: Valor de cada parcela (numeric 18,2).
  - `totalToPay` / `totalInterest` / `currentBalance`: Denormalizados (total com juros, apenas juros, saldo devido).
  - `status`: 'active' | 'paid' | 'overdue' | 'suspended'.
  - `startDate`: Data do 1º vencimento (timestamp).
- **Relações:**
  - clientId→Client (RESTRICT)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar Loan; calcular totalInterest = principal × (1 + interestRateMonthly/100)^totalInstallments - principal; conferir totalToPay = principal + totalInterest.
  2. Pagar parcela → paidInstallments++, currentBalance -= installmentValue. Validação: paidInstallments ≤ totalInstallments.
  3. Pagamento antecipado (múltiplas parcelas de uma vez) → paidInstallments salta; currentBalance atualiza proportional.
  4. status='paid' apenas se paidInstallments = totalInstallments; status='overdue' se lastPaymentDate < expectedDate.
  5. Deletar Loan (`active=false`) → histórico de parcelas conservado? (sem soft-delete de Payables automático?).

### ReceivableAdvance
- **Para que serve:** Antecipação de recebíveis — operação financeira que oferece desconto para recebimento imediato (ex: fatura no pré-datado fica 3% mais cara, você recebe hoje 97%).
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `paymentMethodId`: FK→PaymentMethod (opcional); forma de recebimento original.
  - `description`: Descrição (ex: 'Antecipação iFood novembro').
  - `monthlyRate`: Taxa mensal (numeric 7,4; ex: 3.5 = 3.5% a.m.).
  - `averageValue`: Valor médio de recebíveis (numeric 18,2).
  - `daysAdvanced`: Quantos dias adiantados (integer; ex: 30).
  - `dailyRate`: Taxa diária calculada (numeric 9,6; derivada de monthlyRate).
  - `totalDiscount`: Desconto total cobrado (numeric 18,2; = averageValue × dailyRate × daysAdvanced).
  - `finalValue`: Valor líquido recebido (= averageValue - totalDiscount).
- **Relações:**
  - clientId→Client (RESTRICT)
  - paymentMethodId→PaymentMethod (opcional)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar ReceivableAdvance com monthlyRate; sistema calcula dailyRate = monthlyRate / 30 (ou 365?). Conferir fórmula de conversão.
  2. totalDiscount = averageValue × dailyRate × daysAdvanced; finalValue = averageValue - totalDiscount. Validação dos cálculos.
  3. Múltiplas advances ativas → soma de descontos não ultrapassa limite de caixa? (validação de negócio).
  4. Deletar advance (`active=false`) → impacta forecast de caixa?

### ReconciliationRule
- **Para que serve:** Regra de reconciliação automática de BankTransaction — mapeia descrição de lançamento bancário a Payable/Receivable/Supplier/Categoria para automação de matching.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `clientId`: FK→Client RESTRICT.
  - `keyword`: Texto a procurar na descrição da BankTransaction (ex: 'LIGHT ENERGIA').
  - `matchType`: 'contains' | 'exact' | 'startsWith' | 'regex'.
  - `supplierId`: FK→Supplier (opcional); se keyword bater, vincula a este fornecedor.
  - `payerName`: Texto alternativo (opcional); overrides supplier lookup por nome.
  - `categoryId`: FK→FinancialCategory (opcional); categoria padrão.
  - `bankAccountId`: FK→BankAccount (opcional); relevante só se multi-conta.
- **Relações:**
  - clientId→Client (RESTRICT)
  - supplierId→Supplier (optional)
  - categoryId→FinancialCategory (optional)
  - bankAccountId→BankAccount (optional)
- **Delete/auditoria:** Soft-delete: `active` (boolean). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar rule: keyword='LIGHT', matchType='contains', supplierId=xxx, categoryId=yyy. Importar BankTransaction com description='LIGHT ENERGIA PAGA' → sistema auto-match? Cria Payable / vincula Supplier/Categoria.
  2. Múltiplas rules: ordem de aplicação (first-match ou merge de todas)? Conflito de categoria vs supplier.
  3. Regex matchType → performance e validação (regex malformado bloqueia?).
  4. Deletar rule → histórico de reconciliações feitas por ela (BankTransaction.reconciledId) não muda; rule fica "inerte".
  5. UI: ativar/desativar rule (`active=false`) sem deletar; logs de execução (quando aplicada, quantas vezes).

### Recurrence
- **Para que serve:** Define padrão de recorrência temporal (frequência, intervalo, datas) — used by Payable/Receivable para gerar filhas periódicas.
- **Fonte:** LEGADA/BPO.
- **Colunas-chave:**
  - `id`: PK (text, UUID).
  - `frequency`: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | custom.
  - `intervalCount`: Múltiplo (integer; default 1). Ex: frequency='weekly', intervalCount=2 = a cada 2 semanas.
  - `startDate`: Primeira ocorrência (timestamp).
  - `endDate`: Última ocorrência (timestamp, nullable; null = sem fim).
  - `occurrencesCount`: Número máximo de filhas a gerar (integer, nullable; null = infinito ou até endDate).
- **Relações:**
  - Payable.recurrenceId (um-para-muitos, via FK em Payable)
  - Receivable.recurrenceId (um-para-muitos, via FK em Receivable)
- **Delete/auditoria:** Sem soft-delete (catálogo). Tem `createdAt`/`updatedAt`.
- **✅ Checklist QA:**
  1. Criar Payable com recurrenceId (frequency='monthly', startDate='2026-01-01', endDate='2026-12-31'). Sistema auto-cria 12 filhas (parentId=original)? Conferir ordem de geração.
  2. Editar mãe (Payable) → filhas herdam mudanças (description, categoryId, etc.)? Ou apenas parentId é imutável?
  3. Cancelar recorrência (endDate no passado ou occurrencesCount zerado) → filhas futuras não são geradas; já-geradas continuam.
  4. Deletar recorrência (soft-delete) → Payables mãe/filhas ficam intactas (histórico); UI marca como "recorrência finalizada".
  5. Performance: N ocorrências = N Payables; não há agregação em view (cada filha é fato independente).

---

## Glossário rápido
- **blob** — o JSON em `Client.data` (fonte da verdade atual).
- **projeção** — tabela do núcleo reconstruída do blob (não editar direto).
- **legacyId** — id do item dentro do blob (liga a linha normalizada ao original).
- **isPrepared** — insumo/item que é uma sub-receita (tem componentes).
- **F1/F2/F3/F4** — fases da migração: backfill / dual-write / leitura por flag / cálculo no servidor.

_Doc gerado automaticamente do schema; em dúvida, a verdade é `server/src/db/schema.js` e `schema-bpo.js`._
