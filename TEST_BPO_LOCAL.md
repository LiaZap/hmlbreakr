# 🧪 Teste Local — Módulo BPO Financeiro V2.0

Guia rápido pra testar o BPO localmente antes de deploy. Tempo estimado: **15 minutos**.

---

## 1. Subir o Postgres local (se não estiver rodando)

```bash
docker compose -f docker-compose.local.yml up -d
docker ps | grep breakr_local_db
```

Deve aparecer `breakr_local_db` rodando na porta `5433`.

## 2. Configurar `.env` local do servidor

Cria/edita `server/.env.local`:

```env
DATABASE_URL="postgresql://breakr:breakr_local_pass@localhost:5433/breakr_local"
PORT=3001

# Vars existentes — mesmas da produção (vai usar mesmo Clerk de teste)
CLERK_SECRET_KEY=sk_test_<sua-chave-aqui>
SUPER_ADMIN_EMAIL=gustavo@breakr.com.br
SUPER_ADMIN_PASSWORD=$SUPER-Brkr26@
```

⚠️ Se já tem `server/.env`, **renomeia ele temporariamente** pra `server/.env.prod-backup` e cria o novo apontando pro local. Pra voltar depois é só renomear de volta.

## 3. Aplicar a migration BPO no banco local

```bash
cd server
npx prisma migrate deploy
```

Isso vai rodar a migration `20260427000000_bpo_v2_phase1` que cria as 10 tabelas BPO + adiciona flag `bpoEnabled` em Client.

**Ou se preferir começar do zero (recriar DB):**

```bash
cd server
npx prisma migrate reset --force   # apaga e recria tudo
```

## 4. Subir o backend

```bash
cd server
npm run dev
```

Deve mostrar `Server running on http://localhost:3001`.

## 5. Subir o frontend (em outro terminal)

```bash
# Na raiz do projeto
npm run dev
```

Vite abre em `http://localhost:5173` (ou outra porta).

## 6. Criar dados de teste

### Criar um cliente

Abre o admin: `http://localhost:5173/admin` (login: `gustavo@breakr.com.br` / senha do .env)

→ **Gestão de Clientes** → **+ Novo Cliente** → cria "Cliente Teste BPO"

### Ativar BPO no cliente

Na linha do cliente, clica no **ícone de banco** (próximo ao olho do dashboard) → confirma → cliente fica com flag `bpoEnabled: true`

### Acessar o módulo BPO

Sidebar do admin → **BPO Financeiro** (badge NOVO) → o BpoApp abre

→ Topo direito: seletor de cliente já mostra "Cliente Teste BPO" → **clica nele**

---

## 7. Roteiro de teste — fluxo completo

### 🔧 Cadastros (preencher na ordem)

1. **Categorias** → `+ Nova Categoria`
   - Nome: "Aluguel" / Tipo: Despesa / Grupo: Despesa Operacional
   - Nome: "Vendas Cartão" / Tipo: Receita / Grupo: Receita
2. **Meios de Pagamento** → clica **"Criar padrão"** → cria 6 (iFood, Aiqfome, Crédito, Débito, PIX, Dinheiro)
3. **Contas Bancárias** → `+ Nova Conta`
   - Banco: Itaú / Agência: 0001 / Conta: 12345-6 / Saldo: 5000
4. **Fornecedores** → `+ Novo Fornecedor`
   - Nome: "Distribuidora ABC" / CNPJ: 12345678000190
5. **Funcionários** → `+ Novo Funcionário`
   - Nome: "João Silva" / CPF: 12345678901 / Cargo: Cozinha / Salário: 2500
6. **Sócios** → `+ Novo Sócio`
   - Nome: "Pedro Souza" / CPF: 98765432100 / Pró-labore: 5000

### 💸 Lançamentos

7. **Contas a Pagar** → `+ Nova Conta a Pagar`
   - Fornecedor: Distribuidora ABC / Valor: 1500 / Vencimento: hoje+5
   - Categoria: Aluguel
   - Marca **"Recorrência"** → mensal, 12 ocorrências → **Criar**
   - Vai aparecer 12 contas no grid

8. Clica em **"Baixar"** numa delas → escolhe valor < total → confirma
   - Vê status virar "Parcial"
   - Clica de novo → completa o saldo → status vira "Pago"

9. **Contas a Receber** → `+ Nova Conta a Receber`
   - Pagador: "iFood" / Valor: 8000 / Vencimento: hoje+30
   - Forma: iFood (vai com taxa 27% e 30 dias automático)
   - Categoria: Vendas Cartão

10. Clica em **"Receber"** → confirma → vê transação registrada

---

## 8. Validar no banco

```bash
# Conecta direto no Postgres local
docker exec -it breakr_local_db psql -U breakr -d breakr_local

# Algumas queries pra validar
\dt                                          -- lista tabelas (deve ter 14: 4 antigas + 10 novas)
SELECT name, "bpoEnabled" FROM "Client";
SELECT COUNT(*) FROM "Supplier";
SELECT COUNT(*) FROM "Payable" WHERE status = 'pending';
SELECT * FROM "PaymentTransaction";
\q                                           -- sai
```

---

## 9. Cenários a validar

✅ **Funcionando:**
- [ ] Cliente sem BPO ativado → BPO Financeiro mostra empty state
- [ ] Seletor de cliente persiste em refresh (localStorage)
- [ ] CRUDs todos com criar/editar/excluir/buscar
- [ ] Recorrência cria N ocorrências corretamente
- [ ] Parcelamento cria N parcelas
- [ ] Pagamento parcial mantém saldo
- [ ] Soft delete em contas com transações vinculadas
- [ ] Validação de CNPJ (14 dígitos) e CPF (11 dígitos)

❌ **NÃO funciona ainda (fases futuras):**
- ❌ Open Finance / conexão de bancos automática (Fase 3)
- ❌ Conciliação bancária com IA (Fase 3)
- ❌ Import NF-e XML (Fase 2)
- ❌ Bot WhatsApp (Fase 5)
- ❌ Relatórios filtráveis (Fase 2)
- ❌ Painel BPO interno com KPIs (Fase 4)

---

## 10. Voltar pra produção

Quando terminar de testar:

```bash
# Para o postgres local (mantém os dados)
docker compose -f docker-compose.local.yml stop

# Volta o .env de produção
mv server/.env.prod-backup server/.env

# Subir frontend conectado em produção
npm run dev   # vai usar VITE_API_URL=https://app.breakr.com.br do .env
```

---

## 11. Quando deploy

1. Push pra GitHub
2. No KVM 8: `/opt/breakr-build/update.sh`
3. Migration roda automaticamente via `npm start` (`prisma migrate deploy && node src/index.js`)
4. Logar como admin → ativar BPO em algum cliente piloto

---

## Troubleshooting

| Problema | Solução |
|---|---|
| `migration failed` | Confere se DB local tá rodando: `docker ps` |
| `Cliente não tem BPO ativado` | Volta no admin e clica no ícone de banco |
| Modal não fecha com ESC | Verifica se browser está focado no modal |
| `_count` undefined | Roda migration de novo: `npx prisma migrate dev` |
| Erro "decimal" no Prisma | Reinicia o backend: já tem decimal field |
| BpoApp em branco | Confere console — provavelmente erro em algum import |
