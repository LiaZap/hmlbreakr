# Breakr - Instrucoes para Agentes IA

## Sobre o Projeto

Breakr e uma plataforma SaaS de BPO Financeiro para restaurantes no Brasil. Multi-tenant (Agency > Client), com modulos de onboarding, dashboard administrativo, lancamentos financeiros (contas a pagar/receber), conciliacao bancaria, DRE, emprestimos, antecipacao de recebiveis, integracao WhatsApp e sistema de tarefas BPO.

## Stack Obrigatoria

- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + React Router DOM 7
- **Backend**: Node.js + Express 5 (CommonJS) — porta 3001
- **ORM**: Prisma 5.22 (server) / 7.4 (client)
- **Banco**: PostgreSQL 16 (Docker, porta 5433 local)
- **Auth**: Clerk (frontend SDK + backend SDK)
- **Pagamentos**: Stripe + Asaas
- **AI**: OpenAI GPT-4o-mini (conciliacao bancaria)
- **Email**: Nodemailer + Hostinger SMTP
- **Seguranca**: Helmet + express-rate-limit + bcrypt
- **Principios**: SOLID (alta coesao, baixo acoplamento)

## Regras Absolutas

### Banco de Dados

#### Nunca Fazer
- NUNCA usar SQLite em nenhum ambiente (nem dev, nem teste)
- NUNCA fazer DELETE fisico — todo delete e logico (soft delete ou status cancelled)
- NUNCA criar model Prisma sem `createdAt` e `updatedAt`
- NUNCA criar model sem indexes nos campos de busca frequente
- NUNCA usar CASCADE em FK de dados criticos — usar SetNull ou Restrict
- NUNCA alterar schema.prisma sem gerar migration (`npx prisma migrate dev`)
- NUNCA commitar o arquivo `server/prisma/dev.db`

#### Sempre Fazer
- SEMPRE usar PostgreSQL via Docker (identico a producao)
- SEMPRE usar Prisma ORM para schema e queries
- SEMPRE incluir em todo model novo:
  ```prisma
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  ```
- SEMPRE adicionar `@@index` nos campos usados em WHERE/ORDER BY
- SEMPRE usar `clientId` como filtro em queries BPO (multi-tenant isolation)
- SEMPRE usar UUID como ID (`@id @default(uuid())`)
- SEMPRE usar `Decimal @db.Decimal(18, 2)` para valores monetarios

### Soft Delete / Status

O Breaker usa dois padroes de exclusao logica conforme o model:

**Padrao 1 — Campo `active`** (Supplier, BankAccount, FinancialCategory, BpoEmployee, BpoPartner, PaymentMethod, Loan, ReceivableAdvance, ReconciliationRule, PdvIntegration):
```javascript
// Exclusao
await prisma.supplier.update({
  where: { id },
  data: { active: false },
});

// Toda query deve filtrar
where: { clientId, active: true }
```

**Padrao 2 — Campo `status`** (Payable, Receivable, BpoTask, WhatsappMessage):
```javascript
// Cancelamento (nunca DELETE fisico)
await prisma.payable.update({
  where: { id },
  data: { status: 'cancelled' },
});
```

**PROIBIDO:**
```javascript
// NUNCA fazer isso
await prisma.supplier.delete({ where: { id } });
await prisma.payable.deleteMany({ where: { clientId } });
```

### Codigo

- NUNCA duplicar logica de negocio — centralizar em `server/src/services/`
- NUNCA criar endpoint sem validacao de entrada
- NUNCA expor dados sem verificar permissao (RBAC via `hasPermission`)
- NUNCA ignorar tratamento de erro em operacoes de banco
- NUNCA commitar secrets, .env ou credenciais
- NUNCA criar arquivo com mais de 500 linhas — quebrar em modulos
- NUNCA criar arquivos na raiz — usar pastas corretas

### Multi-Tenancy

TODA query BPO deve filtrar por `clientId`. Sem excecao:
```javascript
// CORRETO
const suppliers = await prisma.supplier.findMany({
  where: { clientId: req.clientId, active: true },
});

// ERRADO — expoe dados de outros clientes
const suppliers = await prisma.supplier.findMany({
  where: { active: true },
});
```

## Docker Local

```yaml
# docker-compose.local.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: breakr_local_db
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: breakr
      POSTGRES_PASSWORD: breakr_local_pass
      POSTGRES_DB: breakr_local
    volumes:
      - breakr_local_data:/var/lib/postgresql/data
volumes:
  breakr_local_data:
```

```bash
# Subir banco
docker compose -f docker-compose.local.yml up -d

# Rodar migrations
cd server && npx prisma migrate dev

# Seed de dados BPO
cd server && npm run seed:bpo
```

## RBAC — Controle de Acesso

### Roles do AdminUser (Painel Administrativo Breakr)

| Role | Nivel | Descricao |
|------|-------|-----------|
| `super_admin` | 0 | Dev team — acesso total, gerencia funcionarios |
| `admin` | 1 | Admin operacional — quase tudo, sem criar/excluir clientes |
| `gestor` | 2 | Gestor de contas — dashboard, clientes, fichas tecnicas |
| `commercial` | 3 | Comercial — leads, clientes, comunicados |
| `financial` | 4 | Financeiro — DRE, relatorios, acesso BPO |
| `custom` | - | Permissoes granulares manuais |

### Verificacao de Permissao (Server-Side)

```javascript
const { hasPermission } = require('../utils/permissions');

// Em todo endpoint protegido
if (!hasPermission(req.adminUser, 'clients.edit')) {
  return res.status(403).json({ error: 'Sem permissao' });
}
```

### Catalogo de Permissoes

Definido em `server/src/utils/permissions.js` e espelhado no frontend `src/utils/permissions.js`.
**IMPORTANTE**: manter os dois arquivos sincronizados manualmente (CJS vs ESM).

Categorias: Dashboard, Clientes, Fichas, Comercial, Comunicados, Financeiro, Sistema.

## Validacao e UX

### Modal de Confirmacao com Block (3 segundos)

Para acoes criticas (salvar lancamentos, excluir registros, aprovar pagamentos):
1. Bloqueia a tela inteira por 3 segundos
2. NAO permite fechar com ESC, clicar fora ou apertar botoes
3. Mostra resumo claro do que vai acontecer
4. Apos 3 segundos, libera os botoes "Confirmar" e "Cancelar"

```jsx
function ModalConfirmacaoBlock({ mensagem, onConfirm, onCancel }) {
  const [bloqueado, setBloqueado] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBloqueado(false), 3000);
    return () => clearTimeout(timer);
  }, []);
}
```

### Validacao de Entrada

Toda entrada do usuario deve ser validada no backend antes de gravar:
- CNPJ/CPF: formato valido
- Valores monetarios: `Decimal`, nunca `Float`
- Datas: formato ISO, validar range
- Strings: sanitizar, limitar tamanho

## Auditoria e Data Protection

### ClientDataSnapshot

Sistema criado apos incidente Garapas (2026-05-11) onde dados foram sobrescritos sem possibilidade de recuperacao.

Regras:
- **Antes de todo save** no `Client.data`: gerar snapshot automatico
- **Detectar saves anomalos**: se o tamanho diminuiu muito, registrar `reason: 'auto-shrink-detected'`
- **Manter N snapshots** mais recentes (default 20) — prune automatico
- **Nunca deletar snapshots manualmente** sem aprovacao de super_admin

### Trilha de Auditoria

Toda acao administrativa deve ser rastreavel:
- **Quem**: user/adminUser que executou
- **O que**: acao realizada
- **Quando**: timestamp exato

### Versionamento

Quando o sistema gera documentos ou relatorios:
1. Salvar cada versao com numero incremental
2. Sempre apresentar ao usuario a ultima versao
3. Manter historico completo

## Estrutura de Pastas

```
Breaker/
  CLAUDE.md                    # Este arquivo
  docker-compose.local.yml     # PostgreSQL local
  package.json                 # Frontend (React + Vite)
  vite.config.js               # Proxy /api -> localhost:3001
  public/                      # Assets estaticos
  dist/                        # Build de producao (gerado)
  src/                         # FRONTEND
    main.jsx                   # Entry point
    App.jsx                    # Router principal
    index.css                  # Tailwind + CSS global
    assets/                    # Imagens, icones
    context/                   # React Context (state)
    utils/                     # Utilitarios frontend
    data/                      # Dados estaticos
    components/
      admin/                   # Painel administrativo (22+ componentes)
      bpo/                     # BPO Financeiro (35+ componentes)
        cadastros/             # Fornecedores, bancos, categorias, funcionarios
        lancamentos/           # Contas a pagar, receber, aprovacoes
        dashboard/             # Dashboard BPO
        imports/               # Hub de importacoes
        relatorios/            # Hub de relatorios
        painel/                # Painel operacional + tarefas
        whatsapp/              # Inbox WhatsApp
      agency/                  # Painel de agencia
      dashboard/               # Dashboard principal
      mobile/                  # Componentes mobile
      ui/                      # Componentes reutilizaveis
  server/                      # BACKEND
    package.json               # Express + Prisma + deps
    .env.example               # Template de variaveis
    src/
      index.js                 # Express server (porta 3001)
      routes.js                # Rotas principais (consolidado)
      routes/
        admin/                 # Endpoints administrativos
          users.js             # CRUD AdminUser
          reports.js           # Relatorios
          snapshots.js         # Data snapshots
          backups.js           # Backup management
          daily-insights.js    # Insights diarios
        bpo/                   # BPO Financeiro V2.0
          banks.js             # Contas bancarias
          payables.js          # Contas a pagar
          receivables.js       # Contas a receber
          reconciliation.js    # Conciliacao bancaria + AI
          imports.js           # Importacao Excel/OFX
          categories.js        # Categorias financeiras
          suppliers.js         # Fornecedores
          employees.js         # Funcionarios
          partners.js          # Socios (pro-labore)
          payment-methods.js   # Meios de pagamento
          loans.js             # Emprestimos
          receivable-advances.js # Antecipacao de recebiveis
          transfers.js         # Transferencias bancarias
          tasks.js             # Tarefas BPO
          ops-panel.js         # Painel operacional
          alerts.js            # Alertas
          reports.js           # Relatorios BPO
          whatsapp.js          # Integracao WhatsApp
          middleware.js        # Middleware BPO
      middleware/
        adminAuth.js           # Autenticacao admin
      services/                # Logica de negocio centralizada
        financialCalc.js       # Calculos DRE, margens, fluxo de caixa
        excelService.js        # Import/export Excel
        emailService.js        # SMTP Hostinger
        stripeService.js       # Stripe subscriptions
        asaasService.js        # Asaas pagamentos
        snapshotService.js     # Data snapshots (protecao)
        backupScheduler.js     # Backup diario (node-cron)
        onboardingSync.js      # Sync onboarding
      utils/
        permissions.js         # RBAC (manter sincronizado com frontend)
    scripts/
      seed-bpo.js              # Seed dados BPO
      gen-samples.js           # Geracao de amostras
      backup.js                # Utilitario de backup
    prisma/
      schema.prisma            # Schema principal (40+ models)
      migrations/              # 18 migrations
```

## Modelos do Banco (Prisma Schema)

### Entidades Principais

| Model | Descricao | Soft Delete |
|-------|-----------|-------------|
| `Agency` | Agencia multi-tenant | `active` |
| `Client` | Restaurante cliente | `active` |
| `AdminUser` | Funcionario Breakr | `active` |
| `TeamMember` | Membro da equipe do cliente | — |
| `Broadcast` | Comunicados in-app | `active` + `expiresAt` |

### BPO Financeiro V2.0

| Model | Descricao | Soft Delete |
|-------|-----------|-------------|
| `Supplier` | Fornecedores | `active` |
| `BankAccount` | Contas bancarias | `active` |
| `FinancialCategory` | Plano de contas (hierarquico) | `active` |
| `PaymentMethod` | Meios de pagamento | `active` |
| `BpoEmployee` | Funcionarios do restaurante | `active` |
| `BpoPartner` | Socios (pro-labore) | `active` |
| `Loan` | Emprestimos/financiamentos | `status` + `active` |
| `ReceivableAdvance` | Antecipacao de recebiveis | `active` |
| `Payable` | Contas a pagar | `status` (pending/scheduled/paid_partial/paid/cancelled) |
| `Receivable` | Contas a receber | `status` (pending/received_partial/received/cancelled) |
| `PaymentTransaction` | Transacoes de pagamento | — (imutavel) |
| `BankTransaction` | Extrato bancario importado | — (imutavel) |
| `BankTransfer` | Transferencias entre contas | — (imutavel) |
| `Recurrence` | Templates de recorrencia | — |
| `ReconciliationRule` | Regras de conciliacao | `active` |
| `BpoTask` | Fila de tarefas operacionais | `status` (open/in_progress/resolved/dismissed) |
| `WhatsappMessage` | Inbox WhatsApp | `status` (pending/validated/discarded) |
| `PdvIntegration` | Integracoes PDV | `active` |
| `ClientDataSnapshot` | Snapshots de protecao | — (nunca deletar) |

### Grupos DRE (FinancialCategory.dreGroup)

- `cmv` — Custo de Mercadoria Vendida
- `despesa_op` — Despesas Operacionais
- `taxa_venda` — Taxas de Venda (marketplace, cartao)
- `imposto` — Impostos
- `pro_labore` — Pro-Labore dos Socios
- `receita` — Receitas
- `outros` — Outros

## Integracao com Servicos Externos

| Servico | Uso | Arquivo |
|---------|-----|---------|
| Clerk | Autenticacao (SSO, login) | Frontend SDK + `@clerk/backend` |
| Stripe | Subscriptions, planos | `services/stripeService.js` |
| Asaas | Gateway pagamento alternativo | `services/asaasService.js` |
| OpenAI | Sugestoes de conciliacao bancaria | `routes/bpo/reconciliation.js` |
| Hostinger SMTP | Envio de emails | `services/emailService.js` |
| Z-API | WhatsApp (Fase 5 — stub) | `routes/bpo/whatsapp.js` |

## Principios SOLID Aplicados

### S - Single Responsibility
Cada rota faz UMA coisa. Logica de negocio nos services, nao nas rotas.

### O - Open/Closed
Extender via novos arquivos de rota em `routes/bpo/`, nao modificar existentes.

### L - Liskov Substitution
Endpoints BPO seguem mesmo contrato (req com clientId, res com JSON padronizado).

### I - Interface Segregation
Rotas separadas por dominio (`payables.js`, `receivables.js`, etc.), nao um arquivo gigante.

### D - Dependency Inversion
Services recebem prisma como dependencia, nao instanciam internamente.

### Na Pratica
- Centralizar calculos financeiros em `services/financialCalc.js`
- Centralizar permissoes em `utils/permissions.js` (server + frontend sincronizados)
- Se uma regra muda, mudar em UM lugar
- NAO duplicar logica entre rotas diferentes

## Disaster Recovery

- NUNCA dropar banco de dados
- ClientDataSnapshot protege contra saves anomalos
- Backup diario automatico via `backupScheduler.js`
- Toda alteracao de schema requer migration versionada
- Manter `server/.env.example` atualizado com novas variaveis

## Deploy (Producao)

**Plataforma**: Easypanel (Docker)
**Fluxo**:
1. `npm run build` (gera `dist/` do frontend)
2. Backend serve `dist/` como static + SPA routing
3. `npm start` no server: roda migrations + inicia Express na porta 3001
4. Health check: `GET /health` retorna status do banco

**Variaveis obrigatorias**: DATABASE_URL, CLERK_SECRET_KEY, STRIPE_SECRET_KEY, SMTP_HOST/USER/PASS, OPENAI_API_KEY

## Build e Teste

```bash
# Frontend
npm run build          # Gera dist/
npm run dev            # Dev server (Vite, porta 5173)

# Backend
cd server
npm run dev            # Nodemon (porta 3001)
npm start              # Producao (migrate + start)
npm run seed:bpo       # Seed dados BPO
npm run seed:samples   # Gerar amostras
```

SEMPRE verificar que o build passa antes de commitar.
SEMPRE testar endpoints alterados via curl ou frontend.

## Processo de Desenvolvimento

1. Subir Docker (`docker compose -f docker-compose.local.yml up -d`)
2. Rodar migrations (`cd server && npx prisma migrate dev`)
3. Iniciar backend (`cd server && npm run dev`)
4. Iniciar frontend (`npm run dev`)
5. Implementar com todas as regras deste arquivo
6. Testar multi-tenancy (filtro por clientId)
7. Verificar RBAC (permissoes por role)
8. Testar build (`npm run build`)

## Checklist do Agente Antes de Finalizar Qualquer Tarefa

- [ ] Todo model novo tem `createdAt` e `updatedAt`?
- [ ] Todo model tem `@@index` nos campos de busca?
- [ ] Toda query BPO filtra por `clientId`?
- [ ] Todo delete e logico (`active: false` ou `status: 'cancelled'`)?
- [ ] Toda acao critica tem modal de confirmacao com block de 3s?
- [ ] Toda entrada do usuario e validada no backend?
- [ ] Toda modificacao sensivel e rastreavel?
- [ ] Logica de negocio esta centralizada nos services?
- [ ] RBAC verificado com `hasPermission`?
- [ ] Permissoes frontend/backend estao sincronizadas?
- [ ] Nenhum secret/env foi exposto?
- [ ] Valores monetarios usam Decimal(18,2)?
- [ ] Arquivo nao ultrapassou 500 linhas?
