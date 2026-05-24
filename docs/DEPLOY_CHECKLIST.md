# Checklist de Deploy — Breakr Produção

**Para o deploy dos commits `9ff1c25..d3e09bf` (18 commits).**

> ⚠️ **Backend agora aborta startup se faltar env var crítica** (mudança da Fase 3). Sem `ADMIN_TOKEN`, `SMTP_PASS`, e as 4 senhas admin, o container entra em loop de restart. Siga a ordem abaixo.

---

## 📋 Visão geral — 5 fases

| Fase | Onde | Tempo |
|------|------|-------|
| 1. Preparação (gerar valores) | Local / nada | 5 min |
| 2. Hostinger — rotacionar SMTP | painel Hostinger | 5 min |
| 3. Stripe Dashboard — modo Live | dashboard.stripe.com | 15 min |
| 4. Easypanel — env vars + deploy | painel.bahtech.com.br | 10 min |
| 5. Pós-deploy — validar | terminal + browser | 5 min |

**Total: ~40 minutos.** Faça em uma sentada — não pare no meio (algumas etapas dependem da anterior estar concluída).

---

## ✅ FASE 1 — Preparação local (5 min)

### 1.1 — Gerar o `ADMIN_TOKEN`

Roda no terminal local:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia o resultado (64 chars hex). Você vai precisar dele na **Fase 4**.

Cole aqui temporariamente (apague depois):
```
ADMIN_TOKEN=__cole_aqui__
```

### 1.2 — Decidir novas senhas dos 4 admins

Use um gerador (ex: `1password`, `bitwarden`) ou:

```bash
# Gera 4 senhas aleatórias de 20 chars
for i in 1 2 3 4; do node -e "console.log(require('crypto').randomBytes(15).toString('base64'))"; done
```

Anota qual senha vai pra qual admin:

| Email | Variável | Nova senha |
|-------|----------|------------|
| gustavo@breakr.com.br | `SUPER_ADMIN_PASSWORD` | `_______________` |
| contato@breakr.com.br | `ADMIN_PASSWORD` | `_______________` |
| gabriela@breakr.com.br | `COMMERCIAL_PASSWORD` | `_______________` |
| jeff@breakr.com.br | `FINANCIAL_PASSWORD` | `_______________` |

**Envia cada senha pelo canal seguro (Signal/1Password) pra cada admin** — eles vão usar essa pra logar pela primeira vez.

---

## ✅ FASE 2 — Hostinger: rotacionar SMTP (5 min)

A senha SMTP `$Dev-NoReply26_Sistema@` estava commitada no Git. Precisa trocar.

1. Acessa `https://hpanel.hostinger.com`
2. Menu lateral → **Emails**
3. Localiza `no-reply@breakr.com.br`
4. Click no email → **Alterar senha**
5. Gera uma nova senha forte (recomendado: 20+ chars, sem caracteres especiais que quebrem env var — evita `$`, `'`, `"`)
6. **Guarda a senha nova** — você vai usar na Fase 4 como `SMTP_PASS`

Cole aqui temporariamente:
```
SMTP_PASS=__cole_aqui__
```

> ⚠️ Após confirmar que tudo funciona em prod, **delete essas anotações temporárias** (Bloco de Notas).

---

## ✅ FASE 3 — Stripe Dashboard (modo Live) (15 min)

### 3.1 — Switchar pra modo **Live**

1. `https://dashboard.stripe.com`
2. Canto superior direito: toggle **"Test mode"** OFF → fica **"Live mode"**
3. Verifica que o badge no topo está LARANJA ("Live mode" / "Modo ativo")

### 3.2 — Criar produto + price em LIVE

Se ainda não criou em Live (você só tinha em Test):

1. Menu lateral → **Products** → **+ Add product**
2. Preenche:
   - Name: `Breakr Mensal`
   - Description: `Plano mensal Breakr — BPO Financeiro`
   - Pricing model: **Recurring**
   - Price: **R$ XX,XX** (valor real)
   - Billing period: **Monthly**
   - Currency: **BRL**
3. Click **Save product**
4. Na página do produto, **copia o `price_...`** da seção Pricing
5. Cole aqui:
```
STRIPE_PRICE_CLIENT=price_______________
```

### 3.3 — Criar webhook endpoint em LIVE

1. Menu lateral → **Developers** → **Webhooks**
2. **+ Add endpoint**
3. **Endpoint URL**: `https://app.breakr.com.br/api/stripe/webhook`
4. **Description**: `Breakr backend production`
5. **Events to send** — clica **+ Select events** e marca os **9 eventos**:
   - ☑ `checkout.session.completed`
   - ☑ `customer.subscription.created`
   - ☑ `customer.subscription.updated`
   - ☑ `customer.subscription.deleted`
   - ☑ `customer.subscription.trial_will_end`
   - ☑ `invoice.payment_succeeded`
   - ☑ `invoice.payment_failed`
   - ☑ `customer.source.expiring`
   - ☑ `charge.dispute.created`
   - ☑ `charge.refunded`
6. Click **Add endpoint**
7. Na tela do endpoint criado, click **Reveal** na seção **Signing secret**
8. Copia o `whsec_...` (começa com `whsec_`)
9. Cole aqui:
```
STRIPE_WEBHOOK_SECRET=whsec_______________
```

### 3.4 — Pegar a Secret Key (sk_live_...)

1. **Developers** → **API keys**
2. **Standard keys** → **Secret key** → click **Reveal live key**
3. Copia (começa com `sk_live_`)
4. Cole aqui:
```
STRIPE_SECRET_KEY=sk_live_______________
```

> ⚠️ **NUNCA cole `sk_live_...` em código, chat, ou screenshot.** Só no Easypanel. Se vazar, **rotaciona imediatamente** (Roll key na mesma tela).

### 3.5 — Configurar Customer Portal

1. Menu lateral → **Settings** (ícone engrenagem) → **Billing** → **Customer portal**
2. **Activate test link** (se ainda não) → **Save**
3. Em **Settings**:
   - ☑ **Customers can update payment method**
   - ☑ **Customers can update billing information**
   - ☑ **Invoice history**
   - ☑ **Customers can cancel subscriptions** → **At end of billing period** (não imediato — preserva acesso pago)
   - ☑ **Customers can switch plans** (opcional, deixa OFF se só tem 1 plano)
4. **Business information**:
   - Business name: `Breakr`
   - Privacy policy URL: `https://app.breakr.com.br/privacidade`
   - Terms of service URL: (criar `/termos` depois — por enquanto pode deixar vazio ou apontar pra `/privacidade`)
5. **Default return URL**: `https://app.breakr.com.br`
6. **Save changes**

### 3.6 — Ativar Boleto e Pix

1. **Settings** → **Payments** → **Payment methods**
2. Procura **Boleto**:
   - Click **Activate** (se disponível pra sua conta)
   - Stripe pode pedir verificação adicional do CNPJ — siga as instruções
3. Procura **Pix**:
   - Pix Automático (recorrente) pode ainda estar em rollout — verifica se está disponível
   - Se sim, ativa
   - Se não, deixa só `card` + `boleto` por enquanto

> Se precisar incluir Pix depois, edita `server/src/services/stripeService.js:26` e adiciona `'pix'` no array `PAYMENT_METHODS_BR`.

---

## ✅ FASE 4 — Easypanel: env vars + deploy (10 min)

### 4.1 — Acessar o serviço

1. Login no Easypanel (`https://painel.bahtech.com.br` ou seu domínio)
2. Project → **breaker** (ou nome do projeto)
3. Service → **backend** (ou app principal)
4. Aba **Environment**

### 4.2 — Configurar env vars

Adiciona/atualiza **todas** as variáveis abaixo (substitua os valores anotados nas fases anteriores):

```env
# === Auth Admin (Fase 1.1 + 1.2) ===
ADMIN_TOKEN=<gerado_na_fase_1.1>
SUPER_ADMIN_EMAIL=gustavo@breakr.com.br
SUPER_ADMIN_PASSWORD=<gerada_na_fase_1.2>
ADMIN_EMAIL=contato@breakr.com.br
ADMIN_PASSWORD=<gerada_na_fase_1.2>
ADMIN_NAME=Admin
COMMERCIAL_EMAIL=gabriela@breakr.com.br
COMMERCIAL_PASSWORD=<gerada_na_fase_1.2>
FINANCIAL_EMAIL=jeff@breakr.com.br
FINANCIAL_PASSWORD=<gerada_na_fase_1.2>

# === SMTP (Fase 2) ===
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=no-reply@breakr.com.br
SMTP_PASS=<rotacionada_na_fase_2>

# === Stripe (Fase 3) ===
STRIPE_SECRET_KEY=<sk_live_da_fase_3.4>
STRIPE_WEBHOOK_SECRET=<whsec_da_fase_3.3>
# Catálogo de planos (3 planos Breakr [Hub])
STRIPE_PRICE_FISPAL=price_1TMEaBQBLcH7ZdgdFS90OFVT
STRIPE_PRICE_MONTHLY=price_1TYpOpQBLcH7ZdgdAoy49KsD
STRIPE_PRICE_ANNUAL=price_1TYpS0QBLcH7Zdgd22TqOKG0
# Legacy (alias do monthly — manter pra compat)
STRIPE_PRICE_CLIENT=price_1TYpOpQBLcH7ZdgdAoy49KsD

# === URLs e infra ===
APP_URL=https://app.breakr.com.br
FRONTEND_URL=https://app.breakr.com.br
NODE_ENV=production
PORT=3001
DATABASE_URL=<a_que_ja_existia>
CLERK_SECRET_KEY=<a_que_ja_existia>
OPENAI_API_KEY=<a_que_ja_existia>

# === Opcional ===
BACKUP_ENABLED=true
```

> 🔍 **Verifica antes de salvar**: cada `<placeholder>` foi substituído pelo valor real.

3. Click **Save** / **Update**

### 4.3 — Deploy

1. Aba **Deployments** (ou **Source** → **Deploy**)
2. Se está configurado com auto-deploy via GitHub: o push pra `main` já deve ter triggado — verifica o último deploy.
3. Se não: click **Deploy** / **Redeploy** manual.
4. **Observa os logs** em tempo real:
   - ✅ Sucesso: `[backupScheduler] agendado: todo dia 03:00`, depois `Server running on http://localhost:3001`
   - ❌ Falha: vê linhas como `[adminAuth] ADMIN_TOKEN obrigatório` ou `[emailService] SMTP_PASS obrigatório` — falta env var. Volta na 4.2 e revisa.

### 4.4 — Rodar migration Prisma

Migrations rodam automaticamente via `npm start` (script `prisma migrate deploy && node src/index.js`). Procura nos logs:

```
Applied migration 20260520000000_stripe_subscription_fields
```

Se já estava aplicada anteriormente, vai dizer `No pending migrations`.

---

## ✅ FASE 5 — Pós-deploy: validar (5 min)

### 5.1 — Health check

```bash
curl https://app.breakr.com.br/health
```

Esperado:
```json
{"status":"ok","database":"connected"}
```

### 5.2 — Smoke test: endpoints abertos voltam 401

```bash
# Sem token → DEVE retornar 401
curl -s -o /dev/null -w "%{http_code}\n" https://app.breakr.com.br/api/admin/emergency-backup
# 401 ✓

curl -s -o /dev/null -w "%{http_code}\n" https://app.breakr.com.br/api/admin/affected-clients
# 401 ✓
```

Se retornar 200 sem token, **algo está errado** — pode ter usado a versão antiga. Verifica o último commit do deploy.

### 5.3 — Login admin funciona

```bash
curl -X POST https://app.breakr.com.br/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gustavo@breakr.com.br","password":"<SUA_NOVA_SENHA>"}'
```

Esperado: `{"success":true,"token":"...","adminUserId":"...",...}`

Se retornar 401: a senha no Easypanel não bate com a que você enviou. Volta na 4.2 e confirma.

### 5.4 — Webhook Stripe responde

No Stripe Dashboard:
1. **Developers** → **Webhooks** → seu endpoint
2. **Send test webhook** → escolhe `customer.subscription.updated` → **Send test**
3. Verifica: a requisição deve aparecer com status **200 OK**
4. Logs do Easypanel: vê linha `[stripe webhook] received customer.subscription.updated`

### 5.5 — Rota /privacidade carrega

Abre no browser: `https://app.breakr.com.br/privacidade`

Deve renderizar a página completa. Se redirecionar pra login, algo no `App.jsx` short-circuit não foi pro deploy — checa último commit.

### 5.6 — Login no app (frontend)

1. Browser: `https://app.breakr.com.br`
2. Login com nova senha admin (gustavo)
3. Painel admin abre
4. **Clica em "Gestão de Clientes"** → escolhe um cliente → **"Dashboard"**
5. Verifica: dashboard carrega, pill do JourneyMap aparece no header

---

## 🚨 ROLLBACK (se algo der errado)

Se o deploy falhar e quebrar o app:

```bash
# Local — voltar a versão anterior
git revert HEAD~18..HEAD --no-edit
git push origin main
```

Ou no Easypanel:
1. **Deployments** → escolhe o deployment anterior (`a92b9a6`)
2. **Redeploy** desse commit específico

Backend volta a aceitar as senhas antigas (porque os fallbacks `$SUPER-Brkr26@` etc. estavam ativos nesse commit).

---

## 📝 Pós-deploy — Comunicação

Avisa os 4 admins (Gustavo, Contato, Gabriela, Jeff):

> "Olá! Por motivo de segurança, rotacionamos todas as senhas do painel administrativo. Sua nova senha foi enviada por [Signal/canal seguro]. No próximo login, recomendamos trocar para uma senha de sua preferência em Configurações → Segurança."

---

## ✅ Próximos passos pós-deploy

Quando tudo estiver estável (1-2 dias depois):

- [ ] Preencher placeholders da `PoliticaPrivacidade.jsx` (CNPJ, razão social, DPO email)
- [ ] Revisar política com jurídico
- [ ] Criar `privacidade@breakr.com.br` no Hostinger (email do DPO)
- [ ] Adicionar checkbox "li e aceito Política" no OnboardingForm
- [ ] Marcar BAH-016 como CONCLUÍDO no ClickUp
- [ ] Agendar sprint pra Fase 7 hardening restante

---

**Boa sorte! 🚀**

Se algo travar, manda print do log do Easypanel e a gente debuga.
