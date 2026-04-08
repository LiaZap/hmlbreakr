const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const router = express.Router();
const prisma = new PrismaClient();
const { sendWelcomeEmail, sendCredentialResetEmail, sendPasswordResetEmail } = require('./services/emailService');
const crypto = require('crypto');

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
  }
];

// Admin Login
router.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
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

// List Clients — returns lightweight summary (strips fichas/insumos/large arrays)
router.get('/admin/clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      select: { id: true, name: true, hash: true, email: true, createdAt: true, data: true }
    });
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
            }
          })
        };
      } catch { return c; }
    });
    res.json(lightweight);
  } catch {
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
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

    // Check if it's an admin
    const admin = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
    if (admin) {
      return res.json({ success: true, role: 'admin', name: admin.name, adminRole: admin.role });
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
    dashboardData._hasCredentials = !!(client.email && client.password);
    dashboardData._clientEmail = client.email || null;
    dashboardData._profile = dashboardData.profile || {};

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

    await prisma.client.update({
      where: { id: clientIdToUpdate },
      data: {
        data: JSON.stringify(newData)
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao sincronizar dados' });
  }
});

// Update Profile
router.put('/client/:hash/profile', async (req, res) => {
  try {
    const { hash } = req.params;
    const { name, password, email, phone, cpf, birthday, photo } = req.body;

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

    const newHash = require('crypto').randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    const newMember = await prisma.teamMember.create({
      data: {
        name,
        email,
        password: hashedPassword,
        hash: newHash,
        clientId: client.id
      }
    });

    const { password: _, ...safeMember } = newMember;
    res.json({ success: true, member: safeMember });

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
const { createClientCheckout, createAgencyCheckout, createPortalSession, getStripe } = require('./services/stripeService');

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

// Create checkout for client subscription
router.post('/stripe/client-checkout', async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: 'Hash é obrigatório' });
    const client = await prisma.client.findUnique({ where: { hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const session = await createClientCheckout({ clientHash: hash, email: client.email || '', name: client.name });
    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar checkout' });
  }
});

// Create checkout for agency subscription
router.post('/stripe/agency-checkout', async (req, res) => {
  try {
    const { hash, plan } = req.body;
    if (!hash) return res.status(400).json({ error: 'Hash é obrigatório' });
    const agency = await prisma.agency.findUnique({ where: { hash } });
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
    const session = await createAgencyCheckout({ agencyHash: hash, email: agency.email, plan: plan || agency.plan });
    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar checkout' });
  }
});

// Customer portal (manage subscription)
router.post('/stripe/portal', async (req, res) => {
  try {
    const { hash, type } = req.body; // type: 'client' | 'agency'
    let stripeCustomerId;
    if (type === 'agency') {
      const agency = await prisma.agency.findUnique({ where: { hash } });
      stripeCustomerId = agency?.stripeCustomerId;
    } else {
      const client = await prisma.client.findUnique({ where: { hash } });
      stripeCustomerId = client?.stripeCustomerId;
    }
    if (!stripeCustomerId) return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada' });
    const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';
    const session = await createPortalSession({ stripeCustomerId, returnUrl: type === 'agency' ? `${APP_URL}?agency=${hash}` : `${APP_URL}?hash=${hash}` });
    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao abrir portal' });
  }
});

// Stripe Webhook
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { type, clientHash, agencyHash, plan } = session.metadata || {};
      if (type === 'client' && clientHash) {
        await prisma.client.update({
          where: { hash: clientHash },
          data: { active: true, stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription }
        });
      } else if (type === 'agency' && agencyHash) {
        await prisma.agency.update({
          where: { hash: agencyHash },
          data: { active: true, plan: plan || 'basic', stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription }
        });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const clientByStripe = await prisma.client.findFirst({ where: { stripeSubscriptionId: sub.id } });
      if (clientByStripe) await prisma.client.update({ where: { id: clientByStripe.id }, data: { active: false } });
      const agencyByStripe = await prisma.agency.findFirst({ where: { stripeSubscriptionId: sub.id } });
      if (agencyByStripe) await prisma.agency.update({ where: { id: agencyByStripe.id }, data: { active: false } });
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;

