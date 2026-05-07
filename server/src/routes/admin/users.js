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

const router = express.Router();
const prisma = new PrismaClient();

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// Sanitiza objeto admin pra resposta (omite senha)
const safeAdmin = (a) => {
  if (!a) return null;
  const { password, ...rest } = a;
  return { ...rest, hasPassword: !!password };
};

// LIST — todos os admins ativos (e inativos opcional via ?showInactive=1)
router.get('/', async (req, res) => {
  try {
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

    res.status(201).json({ ...safeAdmin(item), ...(tempPassword ? { tempPassword } : {}) });
  } catch (err) {
    console.error('[admin users create]', err);
    res.status(500).json({ error: 'Erro ao criar admin' });
  }
});

// UPDATE — edita name/role/active/photo/permissions (não muda email/senha aqui)
router.put('/:id', async (req, res) => {
  try {
    const { name, role, active, photo, permissions } = req.body;
    const existing = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role inválido — use ${VALID_ROLES.join(' | ')}` });
    }
    const item = await prisma.adminUser.update({
      where: { id: req.params.id },
      data: {
        ...(name != null ? { name: String(name).trim() } : {}),
        ...(role ? { role } : {}),
        ...(active != null ? { active: !!active } : {}),
        ...(photo !== undefined ? { photo: photo || null } : {}),
        ...(Array.isArray(permissions) ? { permissions: sanitizePermissions(permissions) } : {}),
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
    res.json({ success: true });
  } catch (err) {
    console.error('[admin users delete]', err);
    res.status(500).json({ error: 'Erro ao excluir admin' });
  }
});

module.exports = router;
