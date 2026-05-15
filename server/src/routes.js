const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const router = express.Router();
const prisma = new PrismaClient();
const { sendWelcomeEmail, sendCredentialResetEmail, sendPasswordResetEmail } = require('./services/emailService');
const { calculateClientFinancials } = require('./services/financialCalc');
const { syncOnboardingToBpo } = require('./services/onboardingSync');
const { createSnapshot, pruneOldSnapshots } = require('./services/snapshotService');
const { deepMerge } = require('./utils/deepMerge');
const crypto = require('crypto');

// Sub-routers admin (item 4.1)
const dailyInsightsRoutes = require('./routes/admin/daily-insights');
const adminUsersRoutes = require('./routes/admin/users');
const adminReportsRoutes = require('./routes/admin/reports');
const adminSnapshotsRoutes = require('./routes/admin/snapshots');
const adminBackupsRoutes = require('./routes/admin/backups');

// Middleware admin (header-based v1, JWT v2)
const { requireAdmin, requireSuperAdmin } = require('./middleware/adminAuth');

// ========================
// ADMIN ROUTES
// ========================

// Admin accounts configuration
const ADMIN_ACCOUNTS = [
  {
    email: process.env.SUPER_ADMIN_EMAIL || 'gustavo@breakr.com.br',
    password: process.env.SUPER_ADMIN_PASSWORD || '$SUPER-Brkr26@',
    name: 'Gustavo Costa',
    role: 'super_admin'
  },
  {
    email: process.env.ADMIN_EMAIL || 'contato@breakr.com.br',
    password: process.env.ADMIN_PASSWORD || '$ADMIN-Brkr26@',
    name: process.env.ADMIN_NAME || 'Admin',
    role: 'admin'
  },
  {
    email: process.env.COMMERCIAL_EMAIL || 'gabriela@breakr.com.br',
    password: process.env.COMMERCIAL_PASSWORD || '$COM-Brkr26@',
    name: 'Gabriela',
    role: 'commercial'
  },
  {
    email: process.env.FINANCIAL_EMAIL || 'jeff@breakr.com.br',
    password: process.env.FINANCIAL_PASSWORD || '$FIN-Brkr26@',
    name: 'Djefeline',
    role: 'financial'
  }
];

// Admin Login — checa AdminUser do banco PRIMEIRO, fallback pra ADMIN_ACCOUNTS legado
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' });

  // 1. AdminUser do banco (gerenciado via UI)
  try {
    const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && user.active && user.password) {
      const ok = await bcrypt.compare(password, user.password);
      if (ok) {
        // Atualiza lastLoginAt (best-effort)
        prisma.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(e => console.error('lastLoginAt update', e));
        return res.json({
          success: true,
          token: 'mock-admin-token',
          name: user.name,
          role: user.role,
          adminUserId: user.id,
        });
      }
    }
  } catch (e) {
    console.error('[admin login db lookup]', e);
    // Não falha — cai pro legado
  }

  // 2. Legado: ADMIN_ACCOUNTS hardcoded (compat enquanto migra)
  const admin = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
  if (admin) {
    return res.json({ success: true, token: 'mock-admin-token', name: admin.name, role: admin.role });
  }
  return res.status(401).json({ error: 'Credenciais incorretas' });
});

// Create Client
router.post('/admin/clients', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const hash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Default initial data structure
    const initialData = {
        restaurant: { name, category: 'Gastronomia' },
        user: { name: 'Acesso Cliente', role: 'Gerente' },
        operational: { fichas: [], insumos: [] }
    };

    const { email: clientEmail } = req.body;

    const client = await prisma.client.create({
      data: {
        name,
        hash,
        data: JSON.stringify(initialData)
      }
    });

    // Send welcome email if an email was provided at creation
    if (clientEmail) {
      sendWelcomeEmail({ to: clientEmail, clientName: name, hash }).catch(err =>
        console.error('Welcome email error:', err.message)
      );
    }

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// List Clients
//
// Modo padrão (sem query param): retorna uma versão LIGHTWEIGHT — faz strip de
// `operational` (fichas/insumos podem ter centenas de KB) e reduz `formData` a
// flags booleanas. Usado pela tabela de clientes e dashboards do AdminPanel que
// só precisam de nome/status/indicadores agregados (`_financial`).
//
// Modo FULL (`?full=1`): NÃO faz strip — retorna cada cliente com o campo `data`
// = JSON string COMPLETO, exatamente como está no banco (inclui operational e
// revenue_history com valores). Consumido pelas telas de análise admin
// (Análises, Gestão de Clientes, ReportsPage) que precisam dos dados crus pra
// calcular CMV, margens, engenharia de menu, etc. Payload grande — o cliente
// deve buscar UMA vez e reutilizar, não por componente.
// Contrato: `?full=1` → `data` é JSON string completo (não parseado).
router.get('/admin/clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      select: { id: true, name: true, hash: true, email: true, createdAt: true, data: true, bpoEnabled: true, bpoActivatedAt: true }
    });

    // Modo FULL: devolve os clientes com `data` cru (JSON string completo do banco).
    if (req.query.full === '1') {
      return res.json(clients);
    }

    const lightweight = clients.map(c => {
      try {
        const d = JSON.parse(c.data || '{}');
        const fd = d.formData || {};
        // Strip operational (fichas + insumos can be huge), keep only what admin panel needs
        return {
          ...c,
          data: JSON.stringify({
            restaurant: { name: d.restaurant?.name, logo: d.restaurant?.logo },
            user: { name: d.user?.name, photo: d.user?.photo },
            profile: { photo: d.profile?.photo },
            formData: {
              onboarding_completed: fd.onboarding_completed,
              user_info: fd.user_info ? { user_name: fd.user_info.user_name } : undefined,
              identity: fd.identity ? { restaurant_name: fd.identity.restaurant_name, tax_regime: fd.identity.tax_regime } : undefined,
              partners: Array.isArray(fd.partners) ? fd.partners.map(() => ({})) : fd.partners,
              employees: Array.isArray(fd.employees) ? fd.employees.map(() => ({})) : fd.employees,
              location_costs: fd.location_costs ? { rent: fd.location_costs.rent, own: fd.location_costs.own } : undefined,
              utilities: fd.utilities ? { energy: fd.utilities.energy, water: fd.utilities.water } : undefined,
              recurring_services: fd.recurring_services ? true : undefined,
              operational_fixed: fd.operational_fixed ? true : undefined,
              monthly_services: fd.monthly_services ? true : undefined,
              equipment: Array.isArray(fd.equipment) ? fd.equipment.map(() => ({})) : fd.equipment,
              admin_systems: fd.admin_systems ? true : undefined,
              vehicles: fd.vehicles ? true : undefined,
              marketing_structure: fd.marketing_structure ? true : undefined,
              fees_marketplaces: fd.fees_marketplaces ? true : undefined,
              fees_cards: Array.isArray(fd.fees_cards) ? fd.fees_cards.map(() => ({})) : fd.fees_cards,
              other_fixed_costs: fd.other_fixed_costs ? true : undefined,
              revenue_history: fd.revenue_history?.months
                ? { months: fd.revenue_history.months.map(m => ({ month: m.month })) }
                : fd.revenue_history,
            },
            // Financial indicators — cálculo PRECISO usando mesma lógica do DashboardContext
            // Via services/financialCalc.js (inclui TODOS os componentes: location, utilities,
            // recurring, operational, monthly services, admin, marketing, marketplaces, vehicles,
            // equipment depreciation, other fixed costs, partners pro-labore, employees CLT reserves, benefícios)
            _financial: (() => {
              try {
                return calculateClientFinancials(c.data);
              } catch { return null; }
            })()
          })
        };
      } catch { return c; }
    });
    res.json(lightweight);
  } catch {
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// Inspect single client — summary mode (sem raw, mais legível)
router.get('/admin/inspect/:hash', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { hash: req.params.hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const raw = typeof client.data === 'string' ? client.data : JSON.stringify(client.data || {});
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { /* invalid json */ }

    const fichas = parsed?.operational?.fichas || [];
    const insumos = parsed?.operational?.insumos || [];

    // Mapear o peso de cada key para encontrar ONDE os 900KB estão
    const topLevelKeys = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      try {
        const size = JSON.stringify(v).length;
        topLevelKeys[k] = {
          size,
          type: Array.isArray(v) ? 'array' : typeof v,
          length: Array.isArray(v) ? v.length : (typeof v === 'object' && v !== null ? Object.keys(v).length : undefined),
        };
      } catch {
        topLevelKeys[k] = { size: 0, type: 'error' };
      }
    }

    // Se operational existe, mostrar as sub-keys dele também
    const operationalSubKeys = {};
    if (parsed?.operational && typeof parsed.operational === 'object') {
      for (const [k, v] of Object.entries(parsed.operational)) {
        try {
          operationalSubKeys[k] = {
            size: JSON.stringify(v).length,
            type: Array.isArray(v) ? 'array' : typeof v,
            length: Array.isArray(v) ? v.length : (typeof v === 'object' && v !== null ? Object.keys(v).length : undefined),
          };
        } catch {
          operationalSubKeys[k] = { size: 0 };
        }
      }
    }

    // Busca recursiva por objetos que parecem ficha/insumo (tem name + ingredients ou name + price)
    const findSuspiciousLists = (obj, path = '') => {
      const found = [];
      if (!obj || typeof obj !== 'object') return found;
      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
          const first = obj[0];
          if (first && (first.ingredients !== undefined || first.custoTotal !== undefined)) {
            found.push({ path, type: 'possible_fichas', count: obj.length, sample: { id: first.id, name: first.name } });
          } else if (first && (first.price !== undefined || first.custo !== undefined)) {
            found.push({ path, type: 'possible_insumos', count: obj.length, sample: { id: first.id, name: first.name } });
          }
        }
        return found;
      }
      for (const [k, v] of Object.entries(obj)) {
        found.push(...findSuspiciousLists(v, path ? `${path}.${k}` : k));
      }
      return found;
    };

    res.json({
      clientId: client.id,
      hash: client.hash,
      name: client.name,
      email: client.email,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      hasData: !!client.data,
      dataSize: raw.length,
      topLevelKeys,
      operationalSubKeys,
      suspiciousLists: findSuspiciousLists(parsed),
      structure: {
        hasOperational: !!parsed?.operational,
        fichasCount: fichas.length,
        insumosCount: insumos.length,
      },
    });
  } catch (error) {
    console.error('Inspect error:', error);
    res.status(500).json({ error: 'Erro ao inspecionar cliente' });
  }
});

// Inspect raw data (com o JSON inteiro) — pra download de backup manual
router.get('/admin/inspect/:hash/raw', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { hash: req.params.hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const raw = typeof client.data === 'string' ? client.data : JSON.stringify(client.data || {});
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { /* invalid json */ }
    res.setHeader('Content-Disposition', `attachment; filename="client-${client.hash}-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      clientId: client.id,
      hash: client.hash,
      name: client.name,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      data: parsed,
    });
  } catch (error) {
    console.error('Inspect raw error:', error);
    res.status(500).json({ error: 'Erro ao exportar raw' });
  }
});

// Diagnóstico do sync onboarding -> BPO
// Mostra contagens por entidade e quem tá faltando.
// Útil pra verificar se o sync rodou após deploy ou ediçao do cliente.
router.get('/admin/sync-status/:hash', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { hash: req.params.hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const raw = typeof client.data === 'string' ? client.data : JSON.stringify(client.data || {});
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { /* invalid json */ }
    const { diffOnboardingVsBpo } = require('./services/onboardingSync');
    const diff = await diffOnboardingVsBpo(prisma, client.id, parsed.formData || {});
    res.json({
      clientId: client.id,
      clientName: client.name,
      hash: client.hash,
      ...diff,
    });
  } catch (error) {
    console.error('sync-status error:', error);
    res.status(500).json({ error: 'Erro ao calcular sync status' });
  }
});

// Restaurar data de um cliente específico a partir de JSON enviado (admin manual)
// Uso: após extrair JSON do snapshot, enviar aqui para injetar em produção
router.post('/admin/restore-client-data', async (req, res) => {
  try {
    const { clientHash, newData, dryRun = true } = req.body;
    if (!clientHash || !newData) {
      return res.status(400).json({ error: 'clientHash e newData são obrigatórios' });
    }

    const client = await prisma.client.findUnique({ where: { hash: clientHash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado no banco atual' });

    // newData pode ser string JSON ou objeto
    let dataString;
    let parsed;
    try {
      if (typeof newData === 'string') {
        parsed = JSON.parse(newData);
        dataString = newData;
      } else {
        parsed = newData;
        dataString = JSON.stringify(newData);
      }
    } catch {
      return res.status(400).json({ error: 'newData não é JSON válido' });
    }

    const currentData = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;

    const summary = {
      current: {
        dataSize: typeof client.data === 'string' ? client.data.length : JSON.stringify(client.data || {}).length,
        fichas: currentData?.operational?.fichas?.length || 0,
        insumos: currentData?.operational?.insumos?.length || 0,
      },
      new: {
        dataSize: dataString.length,
        fichas: parsed?.operational?.fichas?.length || 0,
        insumos: parsed?.operational?.insumos?.length || 0,
      },
    };

    if (dryRun) {
      return res.json({
        dryRun: true,
        clientName: client.name,
        clientHash,
        summary,
        warning: 'Esta é uma simulação. Para executar, envie com dryRun: false',
      });
    }

    // Executar atualização
    await prisma.client.update({
      where: { id: client.id },
      data: { data: dataString },
    });

    res.json({
      success: true,
      clientName: client.name,
      summary,
      message: 'Dados do cliente restaurados com sucesso',
    });
  } catch (error) {
    console.error('Restore client data error:', error);
    res.status(500).json({ error: 'Erro ao restaurar', details: error.message });
  }
});

// Restauração EM MASSA a partir de um emergency-backup.json
// Usado pra restaurar estado inteiro após restore destrutivo de snapshot
router.post('/admin/bulk-restore', async (req, res) => {
  try {
    const { backup, dryRun = true, excludeHash = null } = req.body;
    if (!backup || !Array.isArray(backup.clients)) {
      return res.status(400).json({ error: 'backup.clients é obrigatório' });
    }

    const results = { updated: [], skipped: [], errors: [], total: backup.clients.length };

    for (const backupClient of backup.clients) {
      try {
        // Opção: excluir um hash específico (ex: Pampa — não queremos sobrescrever a restauração dele)
        if (excludeHash && backupClient.hash === excludeHash) {
          results.skipped.push({ hash: backupClient.hash, reason: 'excluded by request' });
          continue;
        }

        // Verificar se cliente existe no banco atual
        const current = await prisma.client.findUnique({ where: { hash: backupClient.hash } });
        if (!current) {
          results.skipped.push({ hash: backupClient.hash, name: backupClient.name, reason: 'not in current DB' });
          continue;
        }

        // Parse do data
        let newDataString = backupClient.data;
        if (typeof newDataString !== 'string') {
          newDataString = JSON.stringify(newDataString);
        }

        if (!dryRun) {
          await prisma.client.update({
            where: { id: current.id },
            data: { data: newDataString },
          });
        }

        results.updated.push({
          hash: backupClient.hash,
          name: backupClient.name,
          dataSize: newDataString.length,
        });
      } catch (err) {
        results.errors.push({ hash: backupClient.hash, error: err.message });
      }
    }

    res.json({
      dryRun,
      excludeHash,
      backupDate: backup._meta?.exportedAt,
      results,
      message: dryRun
        ? 'Simulação — nenhum dado alterado. Envie com dryRun: false pra executar.'
        : `${results.updated.length} clientes atualizados, ${results.skipped.length} pulados, ${results.errors.length} erros.`,
    });
  } catch (error) {
    console.error('Bulk restore error:', error);
    res.status(500).json({ error: 'Erro ao restaurar em massa', details: error.message });
  }
});

// Detecta clientes potencialmente afetados pelo bug de apagamento
// Critério: dataSize grande (>200KB) mas fichas=0 e insumos=0
router.get('/admin/affected-clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany();
    const affected = [];
    const ok = [];

    for (const c of clients) {
      try {
        const raw = typeof c.data === 'string' ? c.data : JSON.stringify(c.data || '{}');
        const parsed = JSON.parse(raw);
        const fichasCount = parsed?.operational?.fichas?.length || 0;
        const insumosCount = parsed?.operational?.insumos?.length || 0;
        const dataSize = raw.length;

        const info = {
          hash: c.hash,
          name: c.name,
          email: c.email,
          dataSize,
          fichasCount,
          insumosCount,
          updatedAt: c.updatedAt,
        };

        // Suspeito: data grande mas fichas e insumos vazios
        if (dataSize > 200000 && fichasCount === 0 && insumosCount === 0) {
          affected.push(info);
        } else {
          ok.push(info);
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    res.json({
      total: clients.length,
      affected,
      okCount: ok.length,
      message: `${affected.length} clientes potencialmente afetados de ${clients.length} total`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Cria backup imediato via browser (baixa JSON de todos os clientes)
router.get('/admin/emergency-backup', async (req, res) => {
  try {
    const clients = await prisma.client.findMany();
    const payload = {
      _meta: {
        version: '1.2-emergency',
        exportedAt: new Date().toISOString(),
        clientCount: clients.length,
        totalSize: clients.reduce((s, c) => s + (c.data?.length || 0), 0),
      },
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        hash: c.hash,
        email: c.email,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        active: c.active,
        clerkUserId: c.clerkUserId,
        data: c.data, // STRING completa
      })),
    };
    const filename = `backup-emergency-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  } catch (error) {
    console.error('Emergency backup error:', error);
    res.status(500).json({ error: 'Erro ao gerar backup', details: error.message });
  }
});

// Listar backups disponíveis no servidor
router.get('/admin/backups', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const serverDir = path.resolve(__dirname, '..', '..');
    const files = fs.readdirSync(serverDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(serverDir, f));
        return { name: f, size: stat.size, mtime: stat.mtime };
      })
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ backups: files, serverDir });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar backups', details: error.message });
  }
});

// Restaurar fichas/insumos de um backup para um cliente específico
router.post('/admin/restore-operational', async (req, res) => {
  try {
    const { backupFile, clientHash, dryRun = true } = req.body;
    if (!backupFile || !clientHash) {
      return res.status(400).json({ error: 'backupFile e clientHash são obrigatórios' });
    }

    const fs = require('fs');
    const path = require('path');
    const filepath = path.resolve(__dirname, '..', '..', backupFile);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: `Backup não encontrado: ${backupFile}` });
    }

    const backupRaw = fs.readFileSync(filepath, 'utf-8');
    const backup = JSON.parse(backupRaw);

    // Procurar o cliente no backup
    const clientsInBackup = backup.clients || [];
    const backupClient = clientsInBackup.find(c => c.hash === clientHash);
    if (!backupClient) {
      return res.status(404).json({
        error: `Cliente com hash ${clientHash} não encontrado no backup`,
        availableHashes: clientsInBackup.map(c => ({ hash: c.hash, name: c.name })).slice(0, 20),
      });
    }

    // Parse do data do backup
    const backupData = typeof backupClient.data === 'string' ? JSON.parse(backupClient.data) : backupClient.data;
    const fichasFromBackup = backupData?.operational?.fichas || [];
    const insumosFromBackup = backupData?.operational?.insumos || [];

    // Cliente atual no banco
    const currentClient = await prisma.client.findUnique({ where: { hash: clientHash } });
    if (!currentClient) {
      return res.status(404).json({ error: 'Cliente atual não encontrado no banco' });
    }
    const currentData = typeof currentClient.data === 'string' ? JSON.parse(currentClient.data) : currentClient.data;
    const currentFichas = currentData?.operational?.fichas || [];
    const currentInsumos = currentData?.operational?.insumos || [];

    if (dryRun) {
      return res.json({
        dryRun: true,
        clientName: currentClient.name,
        backupFile,
        backupDate: backup._meta?.exportedAt || 'unknown',
        current: { fichasCount: currentFichas.length, insumosCount: currentInsumos.length },
        backup: { fichasCount: fichasFromBackup.length, insumosCount: insumosFromBackup.length },
        willRestore: fichasFromBackup.length > 0 || insumosFromBackup.length > 0,
        message: 'Esta é uma simulação. Para efetuar o restore, passe dryRun: false.',
      });
    }

    // EXECUTAR RESTORE: merge fichas/insumos do backup no data atual
    // Estratégia: se o atual está vazio, usa o do backup. Se atual tem alguns, faz merge por ID único.
    const mergedFichas = [...currentFichas];
    fichasFromBackup.forEach(bf => {
      if (!mergedFichas.some(cf => String(cf.id) === String(bf.id))) {
        mergedFichas.push(bf);
      }
    });
    const mergedInsumos = [...currentInsumos];
    insumosFromBackup.forEach(bi => {
      if (!mergedInsumos.some(ci => String(ci.id) === String(bi.id))) {
        mergedInsumos.push(bi);
      }
    });

    const newData = {
      ...currentData,
      operational: {
        ...(currentData.operational || {}),
        fichas: mergedFichas,
        insumos: mergedInsumos,
      },
    };

    await prisma.client.update({
      where: { id: currentClient.id },
      data: { data: JSON.stringify(newData) },
    });

    res.json({
      success: true,
      clientName: currentClient.name,
      restored: {
        fichas: mergedFichas.length - currentFichas.length,
        insumos: mergedInsumos.length - currentInsumos.length,
      },
      totals: { fichas: mergedFichas.length, insumos: mergedInsumos.length },
    });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Erro ao restaurar', details: error.message });
  }
});

// Full data export for backup (super_admin only)
// Each table is fetched independently so a schema mismatch in one doesn't break the whole export.
router.get('/admin/export', async (req, res) => {
  const result = { _meta: { version: '1.2', exportedAt: new Date().toISOString(), counts: {}, errors: [] }, clients: [], agencies: [], teamMembers: [], broadcasts: [] };

  // Use $queryRawUnsafe as a fallback for tables with schema drift
  const safeFetch = async (label, fetcher, fallbackSql) => {
    try {
      const rows = await fetcher();
      result[label] = rows;
      result._meta.counts[label] = rows.length;
    } catch (err) {
      console.warn(`[export] ${label} findMany failed: ${err.message}. Trying raw SQL fallback...`);
      try {
        const rows = await prisma.$queryRawUnsafe(fallbackSql);
        result[label] = rows;
        result._meta.counts[label] = rows.length;
        result._meta.errors.push(`${label}: used raw SQL fallback due to schema drift`);
      } catch (rawErr) {
        console.error(`[export] ${label} raw fallback failed:`, rawErr.message);
        result._meta.errors.push(`${label}: ${rawErr.message}`);
        result._meta.counts[label] = 0;
      }
    }
  };

  await Promise.all([
    safeFetch('clients', () => prisma.client.findMany(), 'SELECT * FROM "Client"'),
    safeFetch('agencies', () => prisma.agency.findMany(), 'SELECT * FROM "Agency"'),
    safeFetch('teamMembers', () => prisma.teamMember.findMany(), 'SELECT * FROM "TeamMember"'),
    safeFetch('broadcasts', () => prisma.broadcast.findMany(), 'SELECT * FROM "Broadcast"'),
  ]);

  res.json(result);
});

// Delete Client (super_admin only)
router.delete('/admin/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas o Super Admin pode excluir clientes.' });
    }
    await prisma.client.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir cliente' });
  }
});

// Mark onboarding as completed (admin override)
router.post('/admin/clients/:id/mark-complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body; // true or false
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const clientData = JSON.parse(client.data || '{}');
    if (!clientData.formData) clientData.formData = {};
    if (completed) {
      clientData.formData.onboarding_completed = true;
    } else {
      delete clientData.formData.onboarding_completed;
    }
    await prisma.client.update({ where: { id }, data: { data: JSON.stringify(clientData) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao marcar cliente' });
  }
});

// Reset Client Credentials (super_admin only)
router.post('/admin/clients/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, email, role } = req.body;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas o Super Admin pode redefinir credenciais.' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }
    if (!password && !email) {
      return res.status(400).json({ error: 'Informe email ou senha para redefinir.' });
    }

    const updateData = {};
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (email) updateData.email = email;

    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData
    });

    // Send notification email with new password if provided
    const targetEmail = email || updatedClient.email;
    if (password && targetEmail) {
      sendCredentialResetEmail({
        to: targetEmail,
        clientName: updatedClient.name,
        newPassword: password
      }).catch(err => console.error('Credential reset email error:', err.message));
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao redefinir credenciais' });
  }
});

// Resend Welcome Email (super_admin only)
router.post('/admin/clients/:id/resend-welcome', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas o Super Admin pode reenviar o email.' });
    }

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!client.email) return res.status(400).json({ error: 'Cliente não possui email cadastrado.' });

    await sendWelcomeEmail({ to: client.email, clientName: client.name, hash: client.hash });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao reenviar email' });
  }
});

// ========================
// CLIENT AUTH ROUTES
// ========================

// Register (at start of onboarding)
router.post('/client/register', async (req, res) => {
  try {
    const { hash, email, password } = req.body;
    if (!hash || !email || !password) {
      return res.status(400).json({ error: 'Hash, email e senha são obrigatórios' });
    }

    const existing = await prisma.client.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Este email já está em uso' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.client.update({
      where: { hash },
      data: { email, password: hashedPassword }
    });

    // Also create Clerk user so the client can sign in via Clerk login page
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const { createClerkClient } = require('@clerk/backend');
        const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const clerkUser = await clerkSdk.users.createUser({
          emailAddress: [email],
          password
        });
        await prisma.client.update({ where: { hash }, data: { clerkUserId: clerkUser.id } });
      } catch (clerkErr) {
        // If user already exists in Clerk, try to find and link them
        console.error('Clerk create user error (non-fatal):', clerkErr.message);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar credenciais' });
  }
});

// Client Login (Checks both Client and TeamMember)
router.post('/client/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Check if it's an AdminUser do banco (gerenciado via UI)
    try {
      const dbAdmin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (dbAdmin && dbAdmin.active && dbAdmin.password) {
        const ok = await bcrypt.compare(password, dbAdmin.password);
        if (ok) {
          prisma.adminUser.update({
            where: { id: dbAdmin.id },
            data: { lastLoginAt: new Date() },
          }).catch(e => console.error('lastLoginAt update', e));
          return res.json({
            success: true,
            role: 'admin',
            name: dbAdmin.name,
            adminRole: dbAdmin.role,
            token: 'mock-admin-token',
            adminUserId: dbAdmin.id,
          });
        }
      }
    } catch (e) {
      console.error('[client login admin db lookup]', e);
    }

    // Legado: ADMIN_ACCOUNTS hardcoded
    const admin = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
    if (admin) {
      return res.json({
        success: true,
        role: 'admin',
        name: admin.name,
        adminRole: admin.role,
        token: 'mock-admin-token',
      });
    }

    // Checking if the user is a Client (Owner)
    let user = await prisma.client.findUnique({ where: { email } });
    let isOwner = true;

    // If not a Client, check if it's a TeamMember (Manager)
    if (!user) {
      user = await prisma.teamMember.findUnique({ where: { email } });
      isOwner = false;
    }

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    res.json({ success: true, role: 'client', hash: user.hash, name: user.name, isOwner });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Self-registration: create new client account
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    const existing = await prisma.client.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Este email já está cadastrado' });
    }
    const hash = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.client.create({
      data: { name, hash, email, password: hashedPassword, data: '{}' }
    });
    try {
      await sendWelcomeEmail({ to: email, clientName: name, hash });
    } catch (err) {
      console.error('Welcome email error:', err.message);
    }
    res.json({ success: true, hash });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Forgot password: generate reset code and send email
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

    const client = await prisma.client.findUnique({ where: { email } });
    // Always return success to avoid email enumeration
    if (!client || !client.password) {
      return res.json({ success: true });
    }
    const token = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await prisma.client.update({
      where: { email },
      data: { resetToken: token, resetTokenAt: expiry }
    });
    try {
      await sendPasswordResetEmail({ to: email, clientName: client.name, token });
    } catch (err) {
      console.error('Reset email error:', err.message);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Reset password: validate code and set new password
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    const client = await prisma.client.findUnique({ where: { email } });
    if (!client || client.resetToken !== token) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }
    if (!client.resetTokenAt || new Date() > new Date(client.resetTokenAt)) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.client.update({
      where: { email },
      data: { password: hashedPassword, resetToken: null, resetTokenAt: null }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// ========================
// CLIENT ROUTES
// ========================

// Load Data
router.get('/client/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    // Check if the hash matches a Client (Owner)
    let client = await prisma.client.findUnique({ where: { hash } });
    let isOwner = true;
    let teamMember = null;

    // Check if the hash matches a TeamMember (Manager)
    if (!client) {
      teamMember = await prisma.teamMember.findUnique({ 
        where: { hash },
        include: { client: true }
      });
      if (teamMember) {
        client = teamMember.client;
        isOwner = false;
      }
    }

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    let dashboardData = JSON.parse(client.data);

    // If it's a team member, override the `user` property in the payload 
    // to show the manager's name and role instead of the owner's.
    if (!isOwner && teamMember) {
      dashboardData.user = {
        name: teamMember.name,
        initials: teamMember.name.substring(0, 2).toUpperCase(),
        role: teamMember.role,
        isOwner: false,
      };
    } else {
      if (dashboardData.user) {
        dashboardData.user.isOwner = true;
      }
    }

    // Include credential status and profile data for frontend
    dashboardData._hasCredentials = !!(client.email && client.password) || !!client.clerkUserId;
    dashboardData._clientEmail = client.email || null;
    dashboardData._profile = dashboardData.profile || {};

    // Financeiro V2.0 — feature padrão do produto pra todo cliente
    // Inclui agregados de antecipações + empréstimos pra refletir no Dinheiro na Mesa (BAH-030/BAH-031)
    let bpoAdvancesTotal = 0;
    let bpoLoansMonthly = 0;
    let bpoLoansOutstanding = 0;
    try {
      const advances = await prisma.receivableAdvance.findMany({
        where: { clientId: client.id, active: true },
        select: { totalDiscount: true },
      });
      bpoAdvancesTotal = advances.reduce((acc, a) => acc + parseFloat(a.totalDiscount), 0);
    } catch (e) { /* tabela pode nao existir antes da migration */ }
    try {
      const loans = await prisma.loan.findMany({
        where: { clientId: client.id, active: true, status: 'active' },
        select: { installmentValue: true, currentBalance: true },
      });
      bpoLoansMonthly = loans.reduce((acc, l) => acc + parseFloat(l.installmentValue), 0);
      bpoLoansOutstanding = loans.reduce((acc, l) => acc + parseFloat(l.currentBalance), 0);
    } catch (e) { /* */ }

    dashboardData._bpo = {
      enabled: true,
      clientId: client.id,
      hash: client.hash,
      advancesTotal: +bpoAdvancesTotal.toFixed(2),
      loansMonthly: +bpoLoansMonthly.toFixed(2),
      loansOutstanding: +bpoLoansOutstanding.toFixed(2),
    };

    // SEGURANÇA: se request vem de admin visualizando (header x-admin-viewing),
    // stripar dados pessoais sensíveis antes de enviar (email, CPF, telefone, aniversário, foto pessoal)
    // Admin pode VER o dashboard mas não as credenciais/dados privados do dono
    const isAdminViewing = req.headers['x-admin-viewing'] === 'true';
    if (isAdminViewing) {
      dashboardData._clientEmail = null;
      dashboardData._profile = {}; // remove phone, cpf, birthday
      if (dashboardData.profile) {
        dashboardData.profile = { photo: dashboardData.profile.photo || null };
      }
      dashboardData._adminViewing = true; // flag pra frontend reforçar UI
    }

    res.json(dashboardData);
  } catch (error) {
    console.error("Error loading data:", error);
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});

// Sync Data (Save)
router.post('/client/:hash/sync', async (req, res) => {
  try {
    const { hash } = req.params;
    let newData = req.body;

    // Resolve who is saving
    let clientIdToUpdate = null;
    const client = await prisma.client.findUnique({ where: { hash } });
    
    if (client) {
      clientIdToUpdate = client.id;
    } else {
      const teamMember = await prisma.teamMember.findUnique({ where: { hash } });
      if (teamMember) {
        clientIdToUpdate = teamMember.clientId;
      }
    }

    if (!clientIdToUpdate) return res.status(404).json({ error: 'Credenciais inválidas para salvar dados.' });

    // Since a TeamMember sends their overridden user info, we SHOULD NOT overwrite the true Owner's profile inside client.data.
    // If we want to be safe, we fetch the current saved data first and preserve the original `user` section.
    const currentSavedClient = await prisma.client.findUnique({ where: { id: clientIdToUpdate } });
    if (currentSavedClient && currentSavedClient.data) {
      try {
        const parsedData = JSON.parse(currentSavedClient.data);
        if (parsedData.user && (!newData.user || newData.user.isOwner === false)) {
            newData.user = parsedData.user; // preserve owner profile
        }
        // Preserve profile data (phone, cpf, birthday) saved via profile endpoint
        if (parsedData.profile && !newData.profile) {
            newData.profile = parsedData.profile;
        }
      } catch (e) {
        console.error("Error parsing existing client data before save:", e);
      }
    }

    // Remove server-injected metadata fields before saving
    delete newData._clientEmail;
    delete newData._hasCredentials;
    delete newData._profile;

    // Detecção de save anômalo: se novo data é >50% menor que o atual,
    // marca o snapshot como suspeito pra investigação (mas AINDA salva —
    // não bloqueamos o usuário; só facilitamos recovery).
    const newDataStr = JSON.stringify(newData);
    const currentDataStr = currentSavedClient && currentSavedClient.data ? currentSavedClient.data : '';
    const currentSize = Buffer.byteLength(currentDataStr, 'utf8');
    const newSize = Buffer.byteLength(newDataStr, 'utf8');
    const shrinkDetected = currentSize > 0 && newSize < currentSize * 0.5;
    const snapshotReason = shrinkDetected ? 'auto-shrink-detected' : 'auto';

    if (shrinkDetected) {
      console.warn(
        `[sync] SHRINK ANÔMALO clientId=${clientIdToUpdate} current=${currentSize}B new=${newSize}B (-${Math.round((1 - newSize / currentSize) * 100)}%)`
      );
    }

    // Snapshot do data ATUAL antes de sobrescrever. Try/catch separado pra
    // não bloquear o save se snapshot falhar (banco cheio, etc).
    if (currentSavedClient && currentSavedClient.data) {
      try {
        await createSnapshot(prisma, clientIdToUpdate, currentSavedClient.data, snapshotReason);
      } catch (snapErr) {
        console.error('[sync] snapshot pré-save falhou (continuando save):', snapErr.message);
      }
    }

    await prisma.client.update({
      where: { id: clientIdToUpdate },
      data: {
        data: newDataStr
      }
    });

    // Best-effort cleanup — mantém só os 20 snapshots mais recentes
    pruneOldSnapshots(prisma, clientIdToUpdate, 20)
      .catch(err => console.error('[sync] pruneOldSnapshots falhou:', err.message));

    // Espelha sócios/funcionários/payment methods do onboarding pro BPO
    // (best-effort — não bloqueia o save se falhar)
    if (newData.formData) {
      syncOnboardingToBpo(prisma, clientIdToUpdate, newData.formData)
        .catch(err => console.error('[onboardingSync] hook failed:', err));
    }

    res.json({ success: true, shrinkDetected: shrinkDetected || undefined });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao sincronizar dados' });
  }
});

// Sync Data (Partial) — accepts a `patch` object and deep-merges it into client.data on the server.
// Drastically reduces payload size vs. full sync (no more shipping 330KB to mutate one field)
// and avoids the race condition where two concurrent full-syncs clobber each other.
// Arrays in the patch REPLACE existing arrays (see utils/deepMerge.js for semantics).
router.post('/client/:hash/sync-partial', async (req, res) => {
  try {
    const { hash } = req.params;
    const patch = req.body && req.body.patch;

    // Validate payload
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'patch obrigatório (objeto)' });
    }

    // Resolve who is saving (Client or TeamMember)
    let clientIdToUpdate = null;
    const client = await prisma.client.findUnique({ where: { hash } });

    if (client) {
      clientIdToUpdate = client.id;
    } else {
      const teamMember = await prisma.teamMember.findUnique({ where: { hash } });
      if (teamMember) {
        clientIdToUpdate = teamMember.clientId;
      }
    }

    if (!clientIdToUpdate) return res.status(404).json({ error: 'Credenciais inválidas para salvar dados.' });

    // Load current saved state to merge against
    const currentSavedClient = await prisma.client.findUnique({ where: { id: clientIdToUpdate } });
    let currentData = {};
    if (currentSavedClient && currentSavedClient.data) {
      try {
        currentData = JSON.parse(currentSavedClient.data);
      } catch (e) {
        console.error('Error parsing existing client data before partial save:', e);
        currentData = {};
      }
    }

    // Deep-merge patch into current state
    let merged = deepMerge(currentData, patch);

    // Owner-profile preservation (same logic as /sync):
    // A TeamMember may send their own user info in the patch — never overwrite the true Owner's profile.
    if (currentData.user && patch.user && patch.user.isOwner === false) {
      merged.user = currentData.user;
    }
    // Preserve profile if patch didn't touch it (defensive — deepMerge already handles this)
    if (currentData.profile && !patch.profile) {
      merged.profile = currentData.profile;
    }

    // Strip server-injected metadata fields before persisting
    delete merged._clientEmail;
    delete merged._hasCredentials;
    delete merged._profile;

    await prisma.client.update({
      where: { id: clientIdToUpdate },
      data: {
        data: JSON.stringify(merged)
      }
    });

    // BPO hook (best-effort, non-blocking) — only if formData ended up populated
    if (merged.formData && Object.keys(merged.formData).length > 0) {
      syncOnboardingToBpo(prisma, clientIdToUpdate, merged.formData)
        .catch(err => console.error('[onboardingSync] hook failed:', err));
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao sincronizar dados (partial)' });
  }
});

// Update Profile
router.put('/client/:hash/profile', async (req, res) => {
  try {
    const { hash } = req.params;
    const { name, password, email, phone, cpf, birthday, photo, _viewerIsAdmin } = req.body;

    // SEGURANÇA: se request vem de admin visualizando o cliente, bloquear alterações
    // O admin NUNCA deve conseguir alterar dados pessoais do dono (senha, CPF, email, foto, telefone)
    if (_viewerIsAdmin) {
      return res.status(403).json({
        error: 'Admin em modo visualização não pode alterar dados do cliente. Entre em contato com o dono do restaurante.'
      });
    }

    let userToUpdate = null;
    let isClient = true;

    const client = await prisma.client.findUnique({ where: { hash } });
    if (client) {
      userToUpdate = client;
    } else {
      const teamMember = await prisma.teamMember.findUnique({ where: { hash } });
      if (teamMember) {
        userToUpdate = teamMember;
        isClient = false;
      }
    }

    if (!userToUpdate) return res.status(404).json({ error: 'Usuário não encontrado' });

    let updateData = {};

    // Generate new hash if password is provided
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update email on the Client record directly
    if (email && email.trim() !== '' && isClient) {
      updateData.email = email;
    }

    // NOTE: We do NOT update client.name (project name) here — only user profile fields inside data JSON

    // Store extra profile fields (phone, cpf, birthday, photo) in the data JSON
    if (isClient && (name || phone || cpf || birthday || photo)) {
      try {
        const clientData = JSON.parse(userToUpdate.data);
        if (!clientData.profile) clientData.profile = {};
        if (name) {
          clientData.profile.name = name;
          if (clientData.user) {
            clientData.user.name = name;
            clientData.user.initials = name.substring(0, 2).toUpperCase();
          }
        }
        if (phone) clientData.profile.phone = phone;
        if (cpf) clientData.profile.cpf = cpf;
        if (birthday) clientData.profile.birthday = birthday;
        if (photo) {
          clientData.profile.photo = photo;
          if (clientData.user) clientData.user.photo = photo;
        }
        updateData.data = JSON.stringify(clientData);
      } catch (parseError) {
        console.error("Error parsing client data:", parseError);
      }
    }

    if (Object.keys(updateData).length > 0) {
      if (isClient) {
        await prisma.client.update({ where: { hash }, data: updateData });
      } else {
        await prisma.teamMember.update({ where: { hash }, data: updateData });
      }
    }

    res.json({ success: true, message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar o perfil' });
  }
});


// ========================
// TEAM MANAGEMENT ROUTES
// ========================

// List Team Members
router.get('/client/:hash/team', async (req, res) => {
  try {
    const { hash } = req.params;
    const client = await prisma.client.findUnique({ 
      where: { hash },
      include: { teamMembers: true }
    });
    
    // Only the owner can list team members
    if (!client) return res.status(403).json({ error: 'Acesso negado' });

    // Exclude passwords from response
    const safeMembers = client.teamMembers.map(tm => {
      const { password: _password, ...safeTm } = tm;
      return safeTm;
    });

    res.json(safeMembers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar equipe' });
  }
});

// Create Team Member
router.post('/client/:hash/team', async (req, res) => {
  try {
    const { hash } = req.params;
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    const client = await prisma.client.findUnique({ 
      where: { hash },
      include: { teamMembers: true }
    });
    
    // Only owner can create
    if (!client) return res.status(403).json({ error: 'Acesso negado' });

    // Enforce logic rule: max 3 sub-accounts
    if (client.teamMembers.length >= 3) {
      return res.status(400).json({ error: 'Limite de 3 contas atingido' });
    }

    // Check if email already in use globally across both tables
    const existingClient = await prisma.client.findUnique({ where: { email } });
    const existingMember = await prisma.teamMember.findUnique({ where: { email } });
    
    if (existingClient || existingMember) {
      return res.status(409).json({ error: 'Este email já está em uso' });
    }

    // Validate password length (Clerk requires min 8)
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres' });
    }

    const newHash = require('crypto').randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create member in Clerk so they can login via Clerk
    let clerkUserId = null;
    let clerkErrorDetail = null;
    try {
      const { createClerkClient } = require('@clerk/backend');
      const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const [firstName, ...rest] = name.trim().split(' ');
      const lastName = rest.join(' ') || firstName;
      const clerkUser = await clerkSdk.users.createUser({
        emailAddress: [email],
        password,
        firstName,
        lastName,
      });
      clerkUserId = clerkUser.id;
    } catch (clerkErr) {
      console.error('Clerk create user error for TeamMember:', clerkErr.message, clerkErr.errors);
      clerkErrorDetail = clerkErr.errors?.[0]?.message || clerkErr.message;
      // If Clerk user already exists with this email, try to find and link
      try {
        const { createClerkClient } = require('@clerk/backend');
        const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const existing = await clerkSdk.users.getUserList({ emailAddress: [email], limit: 1 });
        if (existing?.data?.[0]) {
          clerkUserId = existing.data[0].id;
          clerkErrorDetail = null; // recovered
        }
      } catch { /* swallow */ }
    }

    // If Clerk creation failed AND no existing user found, reject — otherwise member won't be able to login
    if (!clerkUserId) {
      return res.status(400).json({
        error: clerkErrorDetail || 'Não foi possível criar a conta no sistema de autenticação. Verifique o email e a senha e tente novamente.'
      });
    }

    const newMember = await prisma.teamMember.create({
      data: {
        name,
        email,
        password: hashedPassword,
        hash: newHash,
        clerkUserId,
        clientId: client.id
      }
    });

    const { password: _, ...safeMember } = newMember;
    res.json({ success: true, member: safeMember, clerkSynced: !!clerkUserId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Delete Team Member
router.delete('/client/:hash/team/:memberId', async (req, res) => {
  try {
    const { hash, memberId } = req.params;

    const client = await prisma.client.findUnique({ where: { hash } });
    if (!client) return res.status(403).json({ error: 'Acesso negado' });

    // Ensure the member belongs to this client
    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, clientId: client.id }
    });

    if (!member) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // Delete from Clerk first (best-effort)
    if (member.clerkUserId) {
      try {
        const { createClerkClient } = require('@clerk/backend');
        const clerkSdk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        await clerkSdk.users.deleteUser(member.clerkUserId);
      } catch (clerkErr) {
        console.error('Clerk delete user error (non-fatal):', clerkErr.message);
      }
    }

    await prisma.teamMember.delete({
      where: { id: memberId }
    });

    res.json({ success: true, message: 'Membro removido' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// ========================
// MENU ENGINEERING ROUTES
// ========================
const multer = require('multer');
const { parseMenuExcel } = require('./services/excelService');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/menu/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const insumos = parseMenuExcel(req.file.buffer, req.file.originalname);
    res.json(insumos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar arquivo' });
  }
});

// ========================
// AGENCY ROUTES
// ========================
const { createClientCheckout, createAgencyCheckout, getPortalUrl, validateWebhook } = require('./services/asaasService');

// Agency Signup
router.post('/agency/signup', async (req, res) => {
  try {
    const { name, email, password, plan } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    const existing = await prisma.agency.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Este email já está cadastrado' });
    const hash = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    const agency = await prisma.agency.create({
      data: { name, hash, email, password: hashedPassword, plan: plan || 'basic', active: false }
    });
    res.json({ success: true, hash: agency.hash, agencyId: agency.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar conta de agência' });
  }
});

// Agency Login
router.post('/agency/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    const agency = await prisma.agency.findUnique({ where: { email } });
    if (!agency) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const valid = await bcrypt.compare(password, agency.password);
    if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });
    res.json({ success: true, role: 'agency', hash: agency.hash, name: agency.name, active: agency.active });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Agency Forgot Password
router.post('/agency/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });
    const agency = await prisma.agency.findUnique({ where: { email } });
    if (!agency) return res.json({ success: true });
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.agency.update({ where: { email }, data: { resetToken: token, resetTokenAt: expiry } });
    try {
      const { sendPasswordResetEmail } = require('./services/emailService');
      await sendPasswordResetEmail({ to: email, clientName: agency.name, token });
    } catch (err) { console.error('Reset email error:', err.message); }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Agency Reset Password
router.post('/agency/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    const agency = await prisma.agency.findUnique({ where: { email } });
    if (!agency || agency.resetToken !== token) return res.status(400).json({ error: 'Código inválido ou expirado' });
    if (!agency.resetTokenAt || new Date() > new Date(agency.resetTokenAt)) return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.agency.update({ where: { email }, data: { password: hashedPassword, resetToken: null, resetTokenAt: null } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// Load Agency data + clients
router.get('/agency/:hash', async (req, res) => {
  try {
    const agency = await prisma.agency.findUnique({
      where: { hash: req.params.hash },
      include: {
        clients: {
          select: { id: true, name: true, hash: true, email: true, active: true, stripeSubscriptionId: true, data: true, createdAt: true, updatedAt: true }
        }
      }
    });
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
    const { password: _, resetToken: __, resetTokenAt: ___, ...safeAgency } = agency;
    res.json(safeAgency);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});

// Add client to agency
router.post('/agency/:hash/clients', async (req, res) => {
  try {
    const agency = await prisma.agency.findUnique({ where: { hash: req.params.hash } });
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });

    // Check client limit for basic plan
    if (agency.plan === 'basic') {
      const count = await prisma.client.count({ where: { agencyId: agency.id } });
      if (count >= 10) return res.status(403).json({ error: 'Limite de 10 clientes atingido no plano Basic. Faça upgrade para Ilimitado.' });
    }

    const { name, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const clientHash = crypto.randomBytes(16).toString('hex');
    const client = await prisma.client.create({
      data: { name, hash: clientHash, email: email || null, data: '{}', agencyId: agency.id }
    });

    if (email) {
      try {
        const { sendWelcomeEmail } = require('./services/emailService');
        await sendWelcomeEmail({ to: email, clientName: name, hash: clientHash });
      } catch (err) { console.error('Welcome email error:', err.message); }
    }

    res.json({ success: true, hash: clientHash, id: client.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar cliente' });
  }
});

// Remove client from agency
router.delete('/agency/:hash/clients/:clientId', async (req, res) => {
  try {
    const agency = await prisma.agency.findUnique({ where: { hash: req.params.hash } });
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
    const client = await prisma.client.findFirst({ where: { id: req.params.clientId, agencyId: agency.id } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    await prisma.client.update({ where: { id: client.id }, data: { agencyId: null } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover cliente' });
  }
});

// ========================
// STRIPE ROUTES
// ========================

// Create checkout for client subscription (Asaas)
router.post('/asaas/client-checkout', async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: 'Hash é obrigatório' });
    const client = await prisma.client.findUnique({ where: { hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const result = await createClientCheckout({ clientHash: hash, email: client.email || '', name: client.name });
    res.json({ url: result.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar link de pagamento' });
  }
});

// Create checkout for agency subscription (Asaas)
router.post('/asaas/agency-checkout', async (req, res) => {
  try {
    const { hash, plan } = req.body;
    if (!hash) return res.status(400).json({ error: 'Hash é obrigatório' });
    const agency = await prisma.agency.findUnique({ where: { hash } });
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
    const result = await createAgencyCheckout({ agencyHash: hash, email: agency.email, plan: plan || agency.plan, name: agency.name });
    res.json({ url: result.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar link de pagamento' });
  }
});

// Portal de assinatura — Asaas não tem portal hosted, retorna null por ora
router.post('/asaas/portal', async (req, res) => {
  try {
    const { hash, type } = req.body;
    let asaasCustomerId;
    if (type === 'agency') {
      const agency = await prisma.agency.findUnique({ where: { hash } });
      asaasCustomerId = agency?.stripeCustomerId; // reusing field for Asaas customer id
    } else {
      const client = await prisma.client.findUnique({ where: { hash } });
      asaasCustomerId = client?.stripeCustomerId;
    }
    const url = asaasCustomerId ? await getPortalUrl({ asaasCustomerId }) : null;
    res.json({ url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao abrir portal' });
  }
});

// Asaas Webhook
router.post('/asaas/webhook', express.json(), async (req, res) => {
  if (!validateWebhook(req)) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const { event, payment } = req.body;

    // payment.externalReference = "client:HASH" or "agency:HASH:plan"
    const ref = payment?.externalReference || '';

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      if (ref.startsWith('client:')) {
        const clientHash = ref.split(':')[1];
        await prisma.client.update({
          where: { hash: clientHash },
          data: { active: true, stripeCustomerId: payment.customer }
        });
      } else if (ref.startsWith('agency:')) {
        const parts = ref.split(':');
        const agencyHash = parts[1];
        const plan = parts[2] || 'basic';
        await prisma.agency.update({
          where: { hash: agencyHash },
          data: { active: true, plan, stripeCustomerId: payment.customer }
        });
      }
    } else if (event === 'PAYMENT_OVERDUE' || event === 'PAYMENT_DELETED') {
      if (ref.startsWith('client:')) {
        const clientHash = ref.split(':')[1];
        await prisma.client.update({ where: { hash: clientHash }, data: { active: false } });
      } else if (ref.startsWith('agency:')) {
        const agencyHash = ref.split(':')[1];
        await prisma.agency.update({ where: { hash: agencyHash }, data: { active: false } });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Asaas webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ========================
// CLERK AUTH ROUTES
// ========================

const { createClerkClient, verifyToken: clerkVerifyToken } = require('@clerk/backend');

const getClerkClient = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function verifyClerkToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('No token provided');
  const payload = await clerkVerifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  return payload;
}

// GET /api/clerk/me — returns the client hash for the authenticated Clerk user
// Handles: existing linked users, email-based migration, and new user creation
router.get('/clerk/me', async (req, res) => {
  try {
    const payload = await verifyClerkToken(req);
    const clerkUserId = payload.sub;

    const clerkSdk = getClerkClient();
    const clerkUser = await clerkSdk.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email?.split('@')[0] || 'Novo Cliente';

    // 1. Look up by clerkUserId (already linked as Client/Owner)
    let client = await prisma.client.findUnique({ where: { clerkUserId } });

    // 2. Check if this Clerk user is a TeamMember (Gerente) — they access the owner's client
    if (!client) {
      let teamMember = await prisma.teamMember.findUnique({
        where: { clerkUserId },
        include: { client: true }
      });

      // Fallback: match TeamMember by email if not linked yet
      if (!teamMember && email) {
        teamMember = await prisma.teamMember.findUnique({
          where: { email },
          include: { client: true }
        });
        if (teamMember) {
          await prisma.teamMember.update({ where: { id: teamMember.id }, data: { clerkUserId } });
        }
      }

      if (teamMember?.client) {
        // TeamMember logged in — return the OWNER's client hash + their team member info
        return res.json({
          hash: teamMember.client.hash,
          name: teamMember.name,
          role: teamMember.role,
          isTeamMember: true,
          memberHash: teamMember.hash,
        });
      }
    }

    // 3. Migration: match Client by email and auto-link
    if (!client && email) {
      client = await prisma.client.findUnique({ where: { email } });
      if (client) {
        await prisma.client.update({ where: { id: client.id }, data: { clerkUserId } });
      }
    }

    // 4. New user: create a fresh client record
    if (!client) {
      const hash = crypto.randomBytes(16).toString('hex');
      const initialData = {
        restaurant: { name: fullName, category: 'Gastronomia' },
        user: { name: 'Proprietário', role: 'Proprietário da Conta' },
        operational: { fichas: [], insumos: [] }
      };
      client = await prisma.client.create({
        data: {
          name: fullName,
          hash,
          email,
          clerkUserId,
          data: JSON.stringify(initialData)
        }
      });
    }

    // Save Clerk profile photo to client data if available
    if (clerkUser.imageUrl) {
      try {
        const clientData = JSON.parse(client.data || '{}');
        if (!clientData.user) clientData.user = {};
        clientData.user.photo = clerkUser.imageUrl;
        clientData._clerkPhoto = clerkUser.imageUrl;
        await prisma.client.update({ where: { id: client.id }, data: { data: JSON.stringify(clientData) } });
      } catch (photoErr) {
        console.error('Failed to save Clerk photo (non-fatal):', photoErr.message);
      }
    }

    res.json({ hash: client.hash, name: client.name });
  } catch (error) {
    console.error('Clerk /me error:', error.message);
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
});

// ========================
// BROADCAST ROUTES
// ========================

// Get active broadcasts (for clients)
router.get('/broadcasts/active', async (req, res) => {
  try {
    const now = new Date();
    const broadcasts = await prisma.broadcast.findMany({
      where: {
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar comunicados' });
  }
});

// Admin: List all broadcasts
router.get('/admin/broadcasts', async (req, res) => {
  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar comunicados' });
  }
});

// Admin: Create broadcast
router.post('/admin/broadcasts', async (req, res) => {
  try {
    const { title, message, imageUrl, type, targetCategory, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });

    const broadcast = await prisma.broadcast.create({
      data: {
        title,
        message,
        imageUrl: imageUrl || null,
        type: type || 'popup',
        active: true,
        targetCategory: targetCategory || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }
    });
    res.json(broadcast);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar comunicado' });
  }
});

// Admin: Update broadcast
router.put('/admin/broadcasts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, imageUrl, type, active, targetCategory, expiresAt } = req.body;

    const broadcast = await prisma.broadcast.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(message !== undefined && { message }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(type !== undefined && { type }),
        ...(active !== undefined && { active }),
        ...(targetCategory !== undefined && { targetCategory }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      }
    });
    res.json(broadcast);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar comunicado' });
  }
});

// Admin: Delete broadcast
router.delete('/admin/broadcasts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.broadcast.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar comunicado' });
  }
});

// Mount admin sub-routers (after definitions acima)
// — /admin/users exige super_admin (gestão de funcionários da Breakr)
// — /admin/reports exige admin (envio de relatórios e exploração interna)
// — /admin/daily-insights exige admin (briefing diário)
router.use('/admin', requireAdmin, dailyInsightsRoutes);
router.use('/admin/users', requireSuperAdmin, adminUsersRoutes);
router.use('/admin/reports', requireAdmin, adminReportsRoutes);
// — /admin/clients/:clientId/snapshots* exige super_admin (restore é destrutivo)
router.use('/admin', requireSuperAdmin, adminSnapshotsRoutes);
// /admin/backups exige super_admin — backup completo é operação sensível
router.use('/admin/backups', requireSuperAdmin, adminBackupsRoutes);

module.exports = router;

