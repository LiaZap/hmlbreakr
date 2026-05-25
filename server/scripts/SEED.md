# Seed BPO Financeiro — Breaker

Sistema de seed completo pra desbloquear testes E2E do módulo BPO sem digitação manual.

## Setup rápido

```bash
# 1. Postgres rodando (Docker, porta 5433)
docker compose -f ../../docker-compose.local.yml up -d
# 2. Migrations aplicadas
npx prisma migrate deploy
# 3. Seed
npm run seed:bpo
# 4. Samples binarios (xlsx + pdf)
npm run seed:samples
```

---

## Os 3 clientes seed

Cada cliente representa um perfil real diferente. Os hashes são FIXOS pra E2E sempre achar.

### 1. Burger Brothers — operação madura
- **Hash:** `seedburgerbros000000000`
- **URL:** `http://localhost:5173/?hash=seedburgerbros000000000`
- **Categoria:** Hamburgueria, BPO ativado há 6 meses
- **Conteúdo:**
  - 10 fornecedores (carnes, hortifruti, bebidas, embalagens, gás, energia, internet, contador, marketing, manutenção)
  - 3 contas bancárias (Itaú, Bradesco, Nubank) — saldo total ~R$ 65.500
  - 12 categorias financeiras (CMV/Operacional/Receita)
  - 5 funcionários (Cozinha/Salão/Entrega) com CPFs válidos
  - 2 sócios (Bruno, Beatriz) com pró-labore
  - 6 meios de pagamento (iFood, Aiqfome, Crédito, Débito, PIX, Dinheiro)
  - **52 payables**: 10 pagos com PaymentTransaction, 8 pendentes (D+1 a D+30), 5 vencidos, 5 agendados aguardando aprovação, 24 de recorrência mensal (2 séries × 12 parcelas)
  - **25 receivables** misturando iFood/Aiqfome/PIX
  - 5 BankTransactions sem conciliação (pra testar Fluxo 5)

> **Use este cliente para a maioria dos testes E2E** — tem dados de todos os tipos.

### 2. Pizzaria da Esquina — recém-cadastrado
- **Hash:** `seedpizzariaesq00000000`
- **URL:** `http://localhost:5173/?hash=seedpizzariaesq00000000`
- **Categoria:** Pizzaria, BPO ativado há 3 dias
- **Conteúdo mínimo:**
  - 3 fornecedores
  - 1 banco (Banco do Brasil), saldo R$ 3.500
  - 5 categorias
  - 1 funcionário, 1 sócio
  - 5 payables pendentes, 3 receivables recebidos

> **Use este cliente para testar o caso "começando do zero"** — UI vazia, primeiros cadastros, fluxo de onboarding BPO.

### 3. Sushi Premium — alto volume
- **Hash:** `seedsushiprem0000000000`
- **URL:** `http://localhost:5173/?hash=seedsushiprem0000000000`
- **Categoria:** Japonês, BPO ativado há 12 meses

### 4. Itálico | Gastronomia Italiana — DEMO FISPAL
- **Hash:** `seeditalico00000000000`
- **URL:** `http://localhost:5173/?hash=seeditalico00000000000`
- **Categoria:** Italiana, BPO ativado há 8 meses
- **Owner:** Giuseppe Ferraro (chef executivo + sócio)
- **Comando:** `npm run seed:italico` (script dedicado, separado dos 3 clientes acima)
- **Conteúdo:**
  - 12 fornecedores italianos (Pasta La Buona, Latteria, Olio Carli, Vinhos Toscana, etc.)
  - 4 contas bancárias (Itaú, BB, Bradesco, Nubank PJ) — saldo total ~R$ 94.640
  - 14 categorias financeiras (CMV com 5 subcategorias italianas + receitas)
  - 6 funcionários (Sous Chef, Cozinheiro, Maître, Garçons, Sommelier)
  - 2 sócios (Giuseppe Ferraro, Sofia Bianchi)
  - 5 meios de pagamento
  - 30 insumos italianos reais (massas, mussarela de búfala, parmesão Reggiano, mascarpone, ossobuco, etc.)
  - 15 fichas técnicas de pratos italianos clássicos:
    Carbonara, Lasanha Bolognese, Risotto ai Funghi, Pizza Margherita,
    Quattro Formaggi, Fettuccine Alfredo, Penne Arrabbiata, Tagliatelle Ragù,
    Osso Buco, Bruschetta, Burrata, Tiramisù, Panna Cotta, Espresso, Chianti
  - 22 payables (pagos, pendentes, vencidos, aguardando aprovação)
  - 12 receivables (iFood, Stone D+30, eventos, reservas)
  - formData completo (16 steps do onboarding)
  - Faturamento histórico 6 meses: R$ 218k → R$ 284k (crescimento ~30%)
  - Daily revenue do mês corrente

> **Use este cliente para a demo do evento FISPAL** — operação premium completa
> com dados realistas de cozinha italiana. Cresce ano após ano, margem saudável.
- **Conteúdo:**
  - 20 fornecedores
  - 5 contas bancárias (Itaú, Bradesco, BB, Nubank, Inter) — saldo total ~R$ 172.000
  - 15 categorias
  - 12 funcionários, 3 sócios
  - 6 meios de pagamento
  - **80 payables** distribuídos entre passado/presente/futuro
  - **60 receivables** com diversos meios
  - 1 BankTransfer entre Itaú→Bradesco (R$ 5.000 + taxa R$ 8,50)
  - 3 ReconciliationRules (PESCA ATACADO, IFOOD REPASSE, TARIFA)

> **Use este cliente para testar performance, paginação, listas grandes, conciliação automática.**

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run seed:bpo` | Cria/recria os 3 clientes seed core (idempotente — apaga e recria) |
| `npm run seed:bpo:clean` | Apaga só os 3 clientes seed core (mantém demais clientes do banco) |
| `npm run seed:italico` | Cria/recria APENAS o cliente Itálico (demo FISPAL — separado do `seed:bpo`) |
| `npm run seed:dashboard` | Popula Client.data dos 3 clientes core com fichas/insumos/formData ricos |
| `npm run seed:samples` | Gera `bulk-fornecedores.xlsx` e `boleto-exemplo.pdf` em `scripts/samples/` |
| `node scripts/seed-bpo.js --only=burger` | Cria só Burger Brothers |
| `node scripts/seed-bpo.js --only=pizzaria` | Cria só Pizzaria |
| `node scripts/seed-bpo.js --only=sushi` | Cria só Sushi |

---

## Samples — `scripts/samples/`

Arquivos pra usar nos imports do BPO. Os textuais são commitados; os binários são gerados via `npm run seed:samples`.

| Arquivo | Tipo | Usar em (E2E) | Conteúdo |
|---|---|---|---|
| `nfe-exemplo.xml` | NF-e modelo 55 | Fluxo 4.1 — Importar XML | Emitente "DISTRIBUIDORA DE BEBIDAS SP LTDA" (CNPJ 11.222.333/0001-81), 2 itens, 2 duplicatas (R$ 750 cada), vNF R$ 1.500, dhEmi 15/04/2026 |
| `boleto-exemplo.txt` | Linha digitável + barcode | Fluxo 4.2 — Boleto | Boleto BB R$ 100, com linha digitável de 47 dígitos clássica de exemplo |
| `boleto-exemplo.pdf` | PDF digital (gerado) | Fluxo 4.4 — PDF Beta | PDF 1 página com texto extraível: CNPJ 11.222.333/0001-81, valor R$ 1.500,00, vencimento 15/05/2026 |
| `bulk-fornecedores.xlsx` | Planilha 10 linhas (gerada) | Cadastros — bulk import | 10 fornecedores realistas com CNPJ válido, banco, conta, categoria default |
| `extrato-exemplo.ofx` | OFX 10 transações | Fluxo 5.1 — Conciliação | 10 lançamentos, 5 que matcham fornecedores do seed (DISTRIBUIDORA DE CARNES, ENEL, CONTABILIDADE, HORTIFRUTI, VIVO) e 5 que não (TARIFA, IOF, TED desconhecido, PIX cliente, IFOOD repasse) |
| `extrato-exemplo.csv` | Mesmo conteúdo do OFX | Fluxo 5.1 — fallback CSV | UTF-8, separador `;`, formato `data;descricao;valor` |

### Onde clicar pra usar cada sample

- **NF-e:** Sidebar BPO → Lançamentos → Importar → "Nota Fiscal Eletrônica" → Selecionar `nfe-exemplo.xml`
- **Boleto código:** Sidebar BPO → Lançamentos → Importar → "Código de Barras" → Colar linha digitável de `boleto-exemplo.txt`
- **Excel bulk:** Sidebar BPO → Lançamentos → Importar → "Planilha Excel" → Tipo "Fornecedores" → Upload `bulk-fornecedores.xlsx`
- **OFX:** Sidebar BPO → Gestão Bancária → Conciliação → "Upload extrato" → Selecionar conta Itaú do seed → Upload `extrato-exemplo.ofx`
- **CSV:** mesmo fluxo do OFX, mas usar `extrato-exemplo.csv`
- **PDF:** endpoint direto `POST /api/bpo/seedburgerbros000000000/imports/pdf` com `-F pdf=@boleto-exemplo.pdf`

---

## Troubleshooting

**"Falha ao conectar no Postgres"**
- Verifique `docker ps` — container `breakr_local_db` deve estar UP na porta 5433
- Se não estiver: `docker compose -f docker-compose.local.yml up -d` (na raiz do projeto)
- `server/.env` deve apontar pra `postgresql://breakr:breakr_local_pass@localhost:5433/breakr_local`

**"column ... does not exist"**
- Migrations dessincronizadas. Rodar `npx prisma migrate deploy` em `server/`.

**"Unique constraint failed on hash"**
- Hashes seed conflitam com clientes manuais que usem o mesmo hash. Rodar `npm run seed:bpo:clean` e tentar novamente; se persistir, alterar `SEED_HASHES` em `seed-bpo.js`.

**Idempotência**
- Rodar `npm run seed:bpo` várias vezes é seguro: o script apaga (cascade incluindo PaymentTransaction/BankTransfer) e recria os 3 clientes seed.
- **NÃO afeta** clientes não-seed (identificados por hash diferente).

---

## Estrutura

```
server/scripts/
├── seed-bpo.js          # script principal
├── gen-samples.js       # gerador de binarios (xlsx + pdf)
├── SEED.md              # este doc
└── samples/
    ├── nfe-exemplo.xml          (commitado)
    ├── boleto-exemplo.txt       (commitado)
    ├── extrato-exemplo.ofx      (commitado)
    ├── extrato-exemplo.csv      (commitado)
    ├── bulk-fornecedores.xlsx   (commitado)
    └── boleto-exemplo.pdf       (gitignored — gerar via npm run seed:samples)
```
