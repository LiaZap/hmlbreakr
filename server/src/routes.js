const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const router = express.Router();
const prisma = new PrismaClient();

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
    name: process.env.ADMIN_NAME || 'Douglas',
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

    const client = await prisma.client.create({
      data: {
        name,
        hash,
        data: JSON.stringify(initialData)
      }
    });

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// List Clients
router.get('/admin/clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      select: { id: true, name: true, hash: true, email: true, createdAt: true, data: true }
    });
    res.json(clients);
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

// Reset Client Password (super_admin only)
router.post('/admin/clients/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role } = req.body;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas o Super Admin pode redefinir senhas.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.client.update({
      where: { id },
      data: { password: hashedPassword }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
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
      } catch (e) {
        console.error("Error parsing existing client data before save:", e);
      }
    }

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
    const { name, password, email, phone, cpf, birthday } = req.body;

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

    if (name && name.trim() !== '') {
      updateData.name = name;
    }

    // Store extra profile fields (phone, cpf, birthday) in the data JSON
    if (isClient && (name || phone || cpf || birthday)) {
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

module.exports = router;

