# ADR-0001: Núcleo em Drizzle + migração `Client.data` (JSON) → tabelas

- **Status**: Aceito
- **Data**: 2026-06-11
- **Decisores**: Paulo
- **Branch**: `refactor/json-to-tables`

## Contexto

O núcleo do produto (fichas técnicas, insumos, engenharia de cardápio,
faturamento, custos do onboarding) vive todo dentro de **uma coluna**:
`Client.data` — um blob JSON (~330 KB) lido/gravado **inteiro** a cada edição,
com todo o cálculo no frontend. Isso causa:
- race conditions e perda de dados (incidente Garapas, 2026-05-11) — hoje
  remediado por `ClientDataSnapshot` (band-aid, não cura);
- sem integridade (dinheiro como `String "R$ x"`, sem FK/tipo/unicidade);
- sem query no banco (relatórios/admin precisam baixar e parsear o blob).

O módulo BPO V2 já é normalizado em tabelas **Prisma**. A estrutura base da
Bah! Tech padroniza **Drizzle**.

## Decisão

1. **Tabelas NOVAS nascem em Drizzle**, normalizando `Client.data`. Nomes de
   tabela e coluna **sempre em inglês**; dinheiro em `numeric`; soft delete +
   `createdAt/updatedAt`; `legacyId` preserva o id antigo do blob.
2. **Prisma congela**: não cria mais tabelas. É **estrangulado** por domínio
   depois (migração progressiva).
3. **Convivência** no mesmo Postgres: Drizzle é dono só das tabelas novas
   (`__drizzle_migrations`); Prisma das antigas (`_prisma_migrations`).
   - **NUNCA `drizzle-kit push`** (dropparia as tabelas do Prisma). Só
     `generate` (SQL aditivo) + `migrate`. `tablesFilter` isola as novas.
   - FKs cross-ORM (`clientId → "Client"`) adicionadas via SQL nas migrações.
4. **Migração faseada (strangler)**: F0 cria tabelas (aditivo) → F1 backfill
   validado **numa cópia local de produção** → F2 dual-write → F3 migrar leitura
   por domínio → F4 cálculo no servidor → F5 deprecar o blob. Feature flag por
   cliente (piloto: `italico`).

## Alternativas consideradas
- **Migrar TUDO pra Drizzle 1:1 primeiro**: semanas reescrevendo a camada de
  dados sem resolver o problema do JSON. Rejeitado.
- **Trocar ORM + normalizar de uma vez**: risco alto num sistema financeiro em
  produção. Rejeitado.
- **Manter no blob (só endurecer snapshots)**: não resolve a causa-raiz. Rejeitado.

## Consequências

### Positivas
- Integridade real (FK, tipos, `numeric`), edição por entidade (fim da
  sobrescrita do documento inteiro → resolve o Garapas), query no banco.
- Entrega incremental, sem big-bang; produção intocada nas fases iniciais.

### Negativas / Trade-offs
- Dois ORMs convivem temporariamente (disciplina: nunca `push`).
- Backfill exige parser cuidadoso (`"R$ x"` → `numeric`) e validação de somas.
- Esforço de migrar leituras/escritas por domínio (F2–F5).

## Estado atual (F0 + F1 prontos)
- Schema: `server/src/db/schema.js` (17 tabelas) · migrações aditivas
  `server/drizzle/0000_*` e `0001_*`.
- Backfill: `server/scripts/backfill-core.js` (`--inspect/--dry-run/--wipe/--client`).
- Cópia de prod: `server/scripts/prod-to-local.mjs`.
- Plano completo: `docs/refactor-json-para-tabelas.md`.
