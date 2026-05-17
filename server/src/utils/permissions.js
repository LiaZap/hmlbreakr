/**
 * Catálogo de permissões granulares — espelho server-side de src/utils/permissions.js.
 *
 * IMPORTANTE: mantenha em sincronia com o arquivo do frontend! Não dá pra
 * importar de src/utils porque server e client têm contextos isolados (CJS vs ESM,
 * caminhos diferentes em prod).
 *
 * SINCRONIZADO com o frontend (idêntico em semântica, só difere na sintaxe de
 * módulo CJS vs ESM):
 *   - Catálogo: PERMISSIONS, PERMISSION_CATEGORIES, ROLE_TEMPLATES, VALID_ROLES
 *   - Funções: hasPermission, getEffectivePermissions, sanitizePermissions
 * Itens exclusivos de UI no frontend (ROLE_LABELS, ROLE_COLORS,
 * getPermissionsByCategory) NÃO existem aqui de propósito.
 *
 * Usado em routes/admin/users.js pra validar payloads de POST/PUT.
 */

// Catálogo de permissões disponíveis no sistema
const PERMISSIONS = {
  // Dashboard / Visão
  'dashboard.view': { label: 'Ver Dashboard', category: 'Dashboard' },
  'analytics.view': { label: 'Ver Análises e Insights', category: 'Dashboard' },
  'activity.view': { label: 'Ver Atividade', category: 'Dashboard' },

  // Clientes
  'clients.view': { label: 'Ver lista de clientes', category: 'Clientes' },
  'clients.create': { label: 'Cadastrar novos clientes', category: 'Clientes' },
  'clients.edit': { label: 'Editar clientes existentes', category: 'Clientes' },
  'clients.delete': { label: 'Excluir clientes', category: 'Clientes' },
  'clients.access_dashboard': { label: 'Acessar dashboard do cliente (modo admin)', category: 'Clientes' },
  'clients.access_financeiro': { label: 'Acessar financeiro/BPO do cliente', category: 'Clientes' },
  'clients.reset_password': { label: 'Resetar senha de cliente', category: 'Clientes' },

  // Fichas Técnicas / Cardápio
  'fichas.view': { label: 'Ver fichas técnicas', category: 'Fichas' },
  'fichas.edit': { label: 'Editar fichas técnicas', category: 'Fichas' },
  'engenharia.view': { label: 'Ver Engenharia de Menu', category: 'Fichas' },

  // Comercial
  'commercial.view': { label: 'Ver área comercial', category: 'Comercial' },
  'commercial.manage': { label: 'Gerenciar leads e negociações', category: 'Comercial' },

  // Comunicados
  'broadcasts.view': { label: 'Ver comunicados', category: 'Comunicados' },
  'broadcasts.create': { label: 'Criar comunicados', category: 'Comunicados' },
  'broadcasts.delete': { label: 'Excluir comunicados', category: 'Comunicados' },

  // Financeiro / DRE
  'financeiro.view': { label: 'Ver DRE e relatórios financeiros', category: 'Financeiro' },
  'financeiro.export': { label: 'Exportar relatórios', category: 'Financeiro' },

  // Sistema (super admin only)
  'admin_users.view': { label: 'Ver funcionários Breakr', category: 'Sistema' },
  'admin_users.manage': { label: 'Gerenciar funcionários Breakr', category: 'Sistema' },
};

// Lista ordenada de categorias — dado de catálogo, espelhado no frontend
const PERMISSION_CATEGORIES = [
  'Dashboard',
  'Clientes',
  'Fichas',
  'Comercial',
  'Comunicados',
  'Financeiro',
  'Sistema',
];

// Templates predefinidos por role
const ROLE_TEMPLATES = {
  super_admin: Object.keys(PERMISSIONS),

  admin: Object.keys(PERMISSIONS).filter(
    (p) => !['clients.create', 'clients.delete', 'admin_users.manage'].includes(p),
  ),

  gestor: [
    'dashboard.view',
    'analytics.view',
    'activity.view',
    'clients.view',
    'clients.access_dashboard',
    'fichas.view',
    'fichas.edit',
    'engenharia.view',
  ],

  commercial: [
    'dashboard.view',
    'analytics.view',
    'clients.view',
    'clients.create',
    'clients.edit',
    'commercial.view',
    'commercial.manage',
    'broadcasts.view',
  ],

  financial: [
    'dashboard.view',
    'analytics.view',
    'clients.view',
    'clients.access_financeiro',
    'financeiro.view',
    'financeiro.export',
  ],

  custom: [],
};

const VALID_ROLES = Object.keys(ROLE_TEMPLATES);

/**
 * Checa permissão server-side. super_admin sempre passa.
 */
const hasPermission = (user, permission) => {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const userPerms = Array.isArray(user.permissions) && user.permissions.length > 0
    ? user.permissions
    : (ROLE_TEMPLATES[user.role] || []);
  return userPerms.includes(permission);
};

/**
 * Filtra a lista de permissões mantendo só as válidas do catálogo.
 * Garante que payload do cliente não polua o banco com keys inventadas.
 */
const sanitizePermissions = (perms) => {
  if (!Array.isArray(perms)) return [];
  const valid = new Set(Object.keys(PERMISSIONS));
  return [...new Set(perms.filter((p) => typeof p === 'string' && valid.has(p)))];
};

/**
 * Resolve permissões efetivas do user (template do role se vazio).
 */
const getEffectivePermissions = (user) => {
  if (!user) return [];
  if (user.role === 'super_admin') return Object.keys(PERMISSIONS);
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  return ROLE_TEMPLATES[user.role] || [];
};

module.exports = {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  ROLE_TEMPLATES,
  VALID_ROLES,
  hasPermission,
  sanitizePermissions,
  getEffectivePermissions,
};
