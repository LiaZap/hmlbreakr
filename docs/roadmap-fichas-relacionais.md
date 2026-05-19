# Roadmap — Migrar fichas/insumos de JSON para tabelas relacionais

**Status:** planejado — fazer em um respiro entre features, antes da base de
clientes ficar grande.
**Criado:** 2026-05-19

---

## Contexto

Hoje todos os dados de um cliente vivem em **um único campo JSON**
(`Client.data`), incluindo `operational.fichas`, `operational.insumos` e
`menuEngineering`. Cada save reescreve o blob inteiro (~1 MB).

Essa arquitetura foi a causa-raiz dos incidentes de perda de dados (Garapas
2026-05-11, Chef Burguer): um sync com estado parcial/antigo sobrescrevia o
blob todo.

## Por que NÃO é urgente

As proteções abaixo (entregues em 2026-05-19) fecham o risco prático de
perda de dados **sem depender desta migração**:

- Snapshot automático antes de cada save (`ClientDataSnapshot`)
- Backup diário do banco (30 dias) — `backupScheduler`
- Auditoria de todo sync (tamanho antes/depois, shrink, preservedKeys)
- **Wipe-guard** (`378a580`) — sync não zera listas críticas populadas
- **Trava otimista de versão** (`62f838e`) — sync de estado desatualizado
  não encolhe listas críticas

Com isso, a migração relacional virou **melhoria de arquitetura**, não
emergência. Não bloqueia vender nem operar o SaaS na escala atual.

## Quando vira problema (gatilhos para priorizar)

- Milhares de clientes ativos simultâneos, ou cliente com dataset enorme
  (centenas de fichas) → performance do blob aperta.
- Necessidade de analytics cross-cliente pesado (hoje carrega blob a blob).
- Edição multiusuário de verdade, com merge fino por campo.

**Alerta:** a migração é mais fácil/segura com poucos clientes. Não deixar
para quando a base estiver muito grande.

## Plano — strangler fig, por fases (cada uma testável e reversível)

| Fase | O quê | Risco |
|------|-------|-------|
| 0 — Design | Models Prisma (`Ficha`, `Insumo`, `FichaIngrediente`) + ADR | Zero |
| 1 — Tabelas + dual-write | Cria as tabelas (migration). Grava nas tabelas E no JSON. Leitura ainda do JSON | Baixo |
| 2 — Backfill | Script migra fichas/insumos de todos os clientes do JSON → tabelas (snapshot/backup antes) | Médio |
| 3 — Vira a leitura | Dashboard passa a ler das tabelas. JSON vira backup | Médio-alto |
| 4 — Desliga o JSON | Para de gravar fichas/insumos no JSON | Baixo |

## Superfície de impacto (estimativa)

Frontend: `FichaTecnica.jsx`, `MatrizPreco.jsx`, `EngenhariaMenu.jsx`,
`SimuladorPrecificacao.jsx`, `DashboardContext.jsx` (cálculos de CMV/MC/P/E).
Backend: novos models + migrations, endpoints CRUD de fichas/insumos,
`onboardingSync.js`. Dados: `operational.fichas` / `operational.insumos` /
`menuEngineering` de cada cliente em produção.

## Recomendação

Fazer como projeto próprio, fase por fase, com aprovação a cada fase —
nunca de forma reativa/apressada (migração de modelo de dados pela metade
= perda de dados catastrófica). Começar pela Fase 0 (design), que não toca
em nada de produção.
