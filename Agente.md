# Agente.md - Regras de Comportamento dos Agentes IA

## Objetivo
Este arquivo define como os agentes IA devem se comportar ao criar, modificar ou revisar codigo no projeto Breakr. Todo agente DEVE ler este arquivo antes de executar qualquer tarefa.

## Regras que o Agente NUNCA Deve Quebrar

### Banco de Dados
1. **NUNCA** usar SQLite — sempre PostgreSQL 16 via Docker
2. **NUNCA** fazer DELETE fisico (`prisma.model.delete`) — sempre soft delete
3. **NUNCA** criar model sem `createdAt DateTime @default(now())` e `updatedAt DateTime @updatedAt`
4. **NUNCA** criar model sem `@@index` nos campos de busca frequente
5. **NUNCA** usar CASCADE em FK de dados criticos — usar SetNull ou Restrict
6. **NUNCA** usar Float para valores monetarios — sempre `Decimal @db.Decimal(18, 2)`
7. **NUNCA** alterar schema.prisma sem gerar migration correspondente
8. **NUNCA** fazer query BPO sem filtrar por `clientId` (multi-tenant isolation)

### Codigo
9. **NUNCA** duplicar logica de negocio — centralizar em `server/src/services/`
10. **NUNCA** criar endpoint sem validacao de entrada
11. **NUNCA** expor dados sem verificar permissao (`hasPermission` de `utils/permissions.js`)
12. **NUNCA** ignorar tratamento de erro em operacoes de banco
13. **NUNCA** commitar secrets, .env ou credenciais
14. **NUNCA** alterar permissoes no server sem atualizar o espelho no frontend (e vice-versa)

### Estrutura
15. **NUNCA** criar arquivos na raiz — usar pastas corretas (`src/`, `server/`, `scripts/`)
16. **NUNCA** criar arquivo com mais de 500 linhas — quebrar em modulos
17. **NUNCA** colocar logica de negocio diretamente nos arquivos de rota — usar services

## Como o Agente Deve Criar Models Prisma

Template obrigatorio para todo novo model:

```prisma
model NomeDoModel {
  id        String   @id @default(uuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // ... campos especificos do model ...

  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([clientId])
}
```

Para models com ciclo de vida por status:
```prisma
model NomeDoModel {
  id        String   @id @default(uuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // ... campos especificos ...

  status    String   @default("pending") // pending | active | completed | cancelled
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([clientId, status])
}
```

## Como o Agente Deve Implementar Exclusao

```javascript
// CORRETO — Soft delete com campo active
await prisma.supplier.update({
  where: { id },
  data: { active: false },
});

// CORRETO — Soft delete com status
await prisma.payable.update({
  where: { id },
  data: { status: 'cancelled' },
});

// TODA query deve filtrar registros inativos
const suppliers = await prisma.supplier.findMany({
  where: { clientId, active: true },
  orderBy: { createdAt: 'desc' },
});

// PROIBIDO — DELETE fisico
// await prisma.supplier.delete({ where: { id } });
// await prisma.payable.deleteMany({ where: { clientId } });
```

## Como o Agente Deve Criar Rotas BPO

Template para nova rota BPO:

```javascript
// server/src/routes/bpo/novo-recurso.js
const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');

const router = Router();
const prisma = new PrismaClient();

// GET - Listar (sempre filtrar por clientId e active/status)
router.get('/:clientId/novo-recurso', async (req, res) => {
  try {
    const { clientId } = req.params;
    const items = await prisma.novoRecurso.findMany({
      where: { clientId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) {
    console.error('Erro ao listar:', err.message);
    res.status(500).json({ error: 'Erro ao listar registros' });
  }
});

// POST - Criar (validar entrada)
router.post('/:clientId/novo-recurso', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { campo1, campo2 } = req.body;

    if (!campo1 || !campo2) {
      return res.status(400).json({ error: 'Campos obrigatorios ausentes' });
    }

    const item = await prisma.novoRecurso.create({
      data: { clientId, campo1, campo2 },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('Erro ao criar:', err.message);
    res.status(500).json({ error: 'Erro ao criar registro' });
  }
});

// PUT - Atualizar
router.put('/:clientId/novo-recurso/:id', async (req, res) => {
  try {
    const { clientId, id } = req.params;
    // Verificar que pertence ao client (multi-tenant)
    const existing = await prisma.novoRecurso.findFirst({
      where: { id, clientId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Registro nao encontrado' });
    }
    const item = await prisma.novoRecurso.update({
      where: { id },
      data: { ...req.body },
    });
    res.json(item);
  } catch (err) {
    console.error('Erro ao atualizar:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar registro' });
  }
});

// DELETE - Soft delete (NUNCA fisico)
router.delete('/:clientId/novo-recurso/:id', async (req, res) => {
  try {
    const { clientId, id } = req.params;
    const existing = await prisma.novoRecurso.findFirst({
      where: { id, clientId, active: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Registro nao encontrado' });
    }
    await prisma.novoRecurso.update({
      where: { id },
      data: { active: false },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir:', err.message);
    res.status(500).json({ error: 'Erro ao excluir registro' });
  }
});

module.exports = router;
```

## Como o Agente Deve Verificar Permissoes

```javascript
// Em rotas administrativas
const { hasPermission } = require('../../utils/permissions');

router.get('/recurso-admin', async (req, res) => {
  // req.adminUser vem do middleware adminAuth
  if (!hasPermission(req.adminUser, 'clients.view')) {
    return res.status(403).json({ error: 'Sem permissao' });
  }
  // ... logica ...
});
```

Ao adicionar nova permissao:
1. Adicionar em `server/src/utils/permissions.js` (catalogo + templates)
2. Adicionar em `src/utils/permissions.js` (espelho frontend)
3. Testar ambos os lados

## Como o Agente Deve Criar Componentes Frontend

```jsx
// src/components/bpo/novo-componente/NovoComponente.jsx
import { useState, useEffect } from 'react';

export default function NovoComponente({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/bpo/${clientId}/novo-recurso`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <div className="animate-pulse">Carregando...</div>;

  return (
    <div className="p-4">
      {/* Conteudo */}
    </div>
  );
}
```

## Checklist do Agente Antes de Finalizar Qualquer Tarefa

### Backend
- [ ] Todo model novo tem `createdAt`, `updatedAt` e `@@index`?
- [ ] Toda query BPO filtra por `clientId`?
- [ ] Todo delete e logico (active: false ou status: cancelled)?
- [ ] Toda entrada do usuario e validada?
- [ ] RBAC verificado com `hasPermission` onde necessario?
- [ ] Valores monetarios usam `Decimal(18,2)`?
- [ ] Logica de negocio esta nos services, nao nas rotas?
- [ ] Tratamento de erro em todo try/catch?

### Frontend
- [ ] Componente usa `fetch` para chamar API (nao axios no frontend)?
- [ ] Loading state implementado?
- [ ] Erro tratado e mostrado ao usuario?
- [ ] Acoes criticas usam modal de confirmacao com block de 3s?
- [ ] Permissoes frontend sincronizadas com backend?
- [ ] Tailwind CSS usado (sem CSS inline)?

### Geral
- [ ] Nenhum secret/env foi exposto?
- [ ] Arquivo nao ultrapassou 500 linhas?
- [ ] Migration gerada se schema mudou?
- [ ] Build passa sem erros?

## Roteamento de Agentes por Tipo de Tarefa

| Tarefa | Agente | O que Faz |
|--------|--------|-----------|
| Criar model Prisma | `coder` | Gera model com todas colunas e indexes obrigatorios |
| CRUD de entidade BPO | `coder` | Implementa rota + componente com soft delete |
| Regra de negocio | `system-architect` + `coder` | Arquiteta no service, coder implementa |
| Calculo financeiro | `coder` | Implementa em `services/financialCalc.js` |
| Nova permissao RBAC | `coder` | Atualiza server + frontend permissions.js |
| Componente React | `coder` | Implementa com Tailwind, loading state, modal block |
| Revisar codigo | `reviewer` | Verifica todas as regras deste arquivo |
| Testar | `tester` | Testa soft delete, multi-tenancy, RBAC, validacao |
| Seguranca | `security-auditor` | Verifica RBAC, injection, exposicao de dados |
| Deploy | `coder` | Verifica build, migrations, variaveis de ambiente |
