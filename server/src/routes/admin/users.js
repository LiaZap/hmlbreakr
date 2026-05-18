/**
 * Funcionários Breakr — CRUD de admins/operadores do painel.
 *
 * Antes era hardcoded em ADMIN_ACCOUNTS no routes.js. Agora gerenciado via UI:
 * super_admin pode adicionar/editar/desativar admin/commercial/financial users.
 *
 * Login flow: o /admin/login (em routes.js) consulta AdminUser do banco PRIMEIRO,
 * cai em ADMIN_ACCOUNTS legado se não achar.
 *
 * Clerk integration: deixamos clerkUserId opcional. Quando usuário se cadastra
 * via Clerk OAuth (SSO), backend faz match por email e linka clerkUserId.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { VALID_ROLES, sanitizePermissions, ROLE_TEMPLATES } = require('../../utils/permissions');
const { logAudit } = require('../../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// Sanitiza objeto admin pra resposta (omite senha)
const safeAdmin = (a) => {
  if (!a) return null;
  const { password, ...rest } = a;
  return { ...rest, hasPassword: !!password };
};

// Marcador pra reconhecer contas materializadas a partir do ADMIN_ACCOUNTS legado.
// Reusa o campo `invitedBy` (já existe no model AdminUser) — NÃO altera o schema.
const LEGACY_MARKER = 'system-legacy';

/**
 * BAH-085 — Seed BOOTSTRAP dos admins legados na tabela AdminUser.
 *
 * Contexto: os admins históricos (gustavo/contato/gabriela/jeff) viviam APENAS
 * no array hardcoded ADMIN_ACCOUNTS de routes.js — nunca foram para a tabela.
 * A tela "Funcionários Breakr" lê só a tabela, então eles "ficavam pra trás".
 *
 * Esta função materializa as contas de ADMIN_ACCOUNTS APENAS quando a tabela
 * AdminUser está VAZIA (bootstrap de ambiente novo). Se já existe qualquer
 * admin, o sistema já foi configurado — não toca em nada.
 *
 * IMPORTANTE: antes esta função rodava a CADA listagem e materializava por
 * email. Isso "reinventava" contas: se um super_admin corrigia um email
 * placeholder (ex: jeff@breakr.com.br), a próxima listagem recriava a conta
 * antiga. Agora roda só em banco vazio — edições de email são definitivas.
 *
 * Best-effort — qualquer erro é logado e engolido, nunca derruba a listagem.
 *
 * O `require` de routes.js é lazy (dentro da função) de propósito: routes.js
 * faz `require` deste arquivo no topo, então um require circular no topo
 * devolveria exports vazio. Em runtime o módulo já está totalmente carregado.
 */
async function seedLegacyAdmins() {
  // Bootstrap-only: se já existe QUALQUER admin, não materializa nada.
  try {
    const count = await prisma.adminUser.count();
    if (count > 0) return;
  } catch (e) {
    console.error('[seedLegacyAdmins] count falhou — pulando seed', e);
    return;
  }

  let ADMIN_ACCOUNTS;
  try {
    ({ ADMIN_ACCOUNTS } = require('../../routes'));
  } catch (e) {
    console.error('[seedLegacyAdmins] não foi possível carregar ADMIN_ACCOUNTS', e);
    return;
  }
  if (!Array.isArray(ADMIN_ACCOUNTS) || ADMIN_ACCOUNTS.length === 0) return;

  for (const acc of ADMIN_ACCOUNTS) {
    try {
      const email = String(acc.email || '').toLowerCase().trim();
      if (!email || !acc.password) continue;

      // Idempotência: se já existe (foi criado pela UI ou por seed anterior),
      // não mexe — preserva senha trocada, role e permissões atuais.
      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) continue;

      const role = VALID_ROLES.includes(acc.role) ? acc.role : 'admin';
      const hashedPassword = await bcrypt.hash(acc.password, 10);

      await prisma.adminUser.create({
        data: {
          name: (acc.name || email).trim(),
          email,
          password: hashedPassword,
          role,
          permissions: [...(ROLE_TEMPLATES[role] || [])],
          invitedBy: LEGACY_MARKER,
          invitedAt: new Date(),
        },
      });
    } catch (e) {
      // Corrida (duas requisições simultâneas → P2002 unique) ou qualquer outro
      // erro: ignora. Idempotente — a próxima passada já vê o registro existente.
      if (e && e.code === 'P2002') continue;
      console.error('[seedLegacyAdmins] falha ao materializar', acc && acc.email, e);
    }
  }
}

// LIST — todos os admins ativos (e inativos opcional via ?showInactive=1)
router.get('/', async (req, res) => {
  try {
    // BAH-085: materializa admins legados na tabela antes de listar, pra que
    // a tela "Funcionários Breakr" reflita o banco real. Idempotente.
    await seedLegacyAdmins();

    const showInactive = req.query.showInactive === '1';
    const where = showInactive ? {} : { active: true };
    const items = await prisma.adminUser.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json({ items: items.map(safeAdmin), total: items.length });
  } catch (err) {
    console.error('[admin users list]', err);
    res.status(500).json({ error: 'Erro ao listar admins' });
  }
});

// CREATE — convida novo funcionário Breakr
router.post('/', async (req, res) => {
  try {
    const { name, email, role, password, sendInvite, invitedBy, permissions } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name obrigatório' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'email inválido' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role inválido — use ${VALID_ROLES.join(' | ')}` });

    // Email duplicado?
    const existing = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) return res.status(409).json({ error: 'Já existe admin com esse email' });

    // Se senha fornecida, hasheia. Caso contrário gera senha temporária (pra invite por email).
    let hashedPassword = null;
    let tempPassword = null;
    if (password && password.length >= 8) {
      hashedPassword = await bcrypt.hash(password, 10);
    } else if (sendInvite) {
      // Gera senha temporária 12 chars hex — admin troca no primeiro login
      tempPassword = crypto.randomBytes(8).toString('hex');
      hashedPassword = await bcrypt.hash(tempPassword, 10);
    }

    // Permissões: se cliente passou array, valida contra catálogo. Senão usa template do role.
    let finalPermissions;
    if (Array.isArray(permissions)) {
      finalPermissions = sanitizePermissions(permissions);
    } else {
      finalPermissions = [...(ROLE_TEMPLATES[role] || [])];
    }

    const item = await prisma.adminUser.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role,
        permissions: finalPermissions,
        invitedBy: invitedBy || null,
        invitedAt: new Date(),
      },
    });

    // TODO: enviar email de boas-vindas com tempPassword via emailService
    // Por ora retorna a temp password no response pra super_admin copiar manualmente

    logAudit(prisma, {
      action: 'admin_user.create',
      category: 'security',
      entityType: 'admin_user',
      entityId: item.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : (invitedBy || null),
      summary: `Criou o funcionário Breakr "${item.name}"`,
      metadata: { email: item.email, role: item.role, invitedBy: invitedBy || null },
    });

    res.status(201).json({ ...safeAdmin(item), ...(tempPassword ? { tempPassword } : {}) });
  } catch (err) {
    console.error('[admin users create]', err);
    res.status(500).json({ error: 'Erro ao criar admin' });
  }
});

// UPDATE — edita name/email/role/active/photo/permissions (senha só via reset-password)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, role, active, photo, permissions } = req.body;
    const existing = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role inválido — use ${VALID_ROLES.join(' | ')}` });
    }

    // Email: valida formato e unicidade só se for realmente trocar.
    let emailUpdate = {};
    if (email != null && String(email).trim() !== '') {
      const normalized = String(email).toLowerCase().trim();
      if (!isValidEmail(normalized)) {
        return res.status(400).json({ error: 'email inválido' });
      }
      if (normalized !== existing.email) {
        const dup = await prisma.adminUser.findUnique({ where: { email: normalized } });
        if (dup) return res.status(409).json({ error: 'Já existe admin com esse email' });
        emailUpdate = { email: normalized };
      }
    }

    const item = await prisma.adminUser.update({
      where: { id: req.params.id },
      data: {
        ...(name != null ? { name: String(name).trim() } : {}),
        ...emailUpdate,
        ...(role ? { role } : {}),
        ...(active != null ? { active: !!active } : {}),
        ...(photo !== undefined ? { photo: photo || null } : {}),
        ...(Array.isArray(permissions) ? { permissions: sanitizePermissions(permissions) } : {}),
      },
    });
    logAudit(prisma, {
      action: 'admin_user.update',
      category: 'security',
      entityType: 'admin_user',
      entityId: item.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : null,
      summary: `Atualizou o funcionário Breakr "${item.name}"`,
      metadata: {
        email: item.email,
        changedFields: Object.keys(req.body || {}),
        roleBefore: existing.role,
        roleAfter: item.role,
        activeAfter: item.active,
      },
    });
    res.json(safeAdmin(item));
  } catch (err) {
    console.error('[admin users update]', err);
    res.status(500).json({ error: 'Erro ao atualizar admin' });
  }
});

// RESET PASSWORD — gera nova senha temporária OU define específica
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    const existing = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });

    let pwd = newPassword;
    if (!pwd || pwd.length < 8) {
      pwd = crypto.randomBytes(8).toString('hex');
    }
    const hashed = await bcrypt.hash(pwd, 10);
    await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { password: hashed },
    });
    res.json({ success: true, tempPassword: pwd });
  } catch (err) {
    console.error('[admin users reset-pwd]', err);
    res.status(500).json({ error: 'Erro ao resetar senha' });
  }
});

// DELETE — soft delete (active=false)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    // Não permite excluir o último super_admin
    if (existing.role === 'super_admin') {
      const count = await prisma.adminUser.count({ where: { role: 'super_admin', active: true } });
      if (count <= 1) {
        return res.status(409).json({ error: 'Não é possível excluir o último super admin' });
      }
    }
    await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    logAudit(prisma, {
      action: 'admin_user.delete',
      category: 'security',
      entityType: 'admin_user',
      entityId: existing.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : null,
      summary: `Excluiu (soft delete) o funcionário Breakr "${existing.name}"`,
      metadata: { email: existing.email, role: existing.role, softDelete: true },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin users delete]', err);
    res.status(500).json({ error: 'Erro ao excluir admin' });
  }
});

module.exports = router;
// Exportado pra permitir rodar o seed no boot do servidor, se desejado (BAH-085).
module.exports.seedLegacyAdmins = seedLegacyAdmins;
