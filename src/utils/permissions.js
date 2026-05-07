/**
 * Catálogo de permissões granulares — estilo Stripe.
 *
 * Cada permissão é um string key no formato `categoria.acao`. Roles têm
 * templates predefinidos, mas usuário pode customizar individualmente.
 *
 * - super_admin SEMPRE bypassa hasPermission (retorna true)
 * - users sem field `permissions` no banco caem no template do `role`
 * - role 'custom' = lista vazia, super_admin preenche manualmente
 *
 * Para usar no código:
 *   import { hasPermission } from '@/utils/permissions';
 *   if (hasPermission(currentUser, 'clients.delete')) { ... }
 */

// Catálogo de permissões disponíveis no sistema
export const PERMISSIONS = {
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

// Lista ordenada de categorias para UI
export const PERMISSION_CATEGORIES = [
  'Dashboard',
  'Clientes',
  'Fichas',
  'Comercial',
  'Comunicados',
  'Financeiro',
  'Sistema',
];

// Templates predefinidos por role
export const ROLE_TEMPLATES = {
  // Tudo
  super_admin: Object.keys(PERMISSIONS),

  // Admin: pode tudo, exceto criar/excluir clientes e gerenciar funcionários
  admin: Object.keys(PERMISSIONS).filter(
    (p) => !['clients.create', 'clients.delete', 'admin_users.manage'].includes(p),
  ),

  // Gestor: dashboard, fichas técnicas, engenharia de cardápio
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

  // Comercial: focado em vendas e leads
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

  // Financeiro: focado em DRE/BPO
  financial: [
    'dashboard.view',
    'analytics.view',
    'clients.view',
    'clients.access_financeiro',
    'financeiro.view',
    'financeiro.export',
  ],

  // Vazio — preencher manualmente via checkboxes
  custom: [],
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  gestor: 'Gestor',
  commercial: 'Comercial',
  financial: 'Financeiro',
  custom: 'Customizado',
};

export const ROLE_COLORS = {
  super_admin: '#F5A623',
  admin: '#5B8DEF',
  gestor: '#22D3EE',
  commercial: '#A78BFA',
  financial: '#00B37E',
  custom: '#868686',
};

/**
 * Checa se o usuário tem uma permissão específica.
 * - super_admin sempre passa
 * - se user.permissions estiver definido, usa ele
 * - senão cai no ROLE_TEMPLATES[user.role]
 */
export const hasPermission = (user, permission) => {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const userPerms = Array.isArray(user.permissions) && user.permissions.length > 0
    ? user.permissions
    : (ROLE_TEMPLATES[user.role] || []);
  return userPerms.includes(permission);
};

/**
 * Retorna a lista efetiva de permissões do usuário (resolvendo template
 * do role se necessário). Útil pra UI mostrar contagem.
 */
export const getEffectivePermissions = (user) => {
  if (!user) return [];
  if (user.role === 'super_admin') return Object.keys(PERMISSIONS);
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  return ROLE_TEMPLATES[user.role] || [];
};

/**
 * Valida uma lista de permissões contra o catálogo. Retorna apenas
 * as keys válidas (descarta inventadas pra evitar lixo no banco).
 */
export const sanitizePermissions = (perms) => {
  if (!Array.isArray(perms)) return [];
  const valid = new Set(Object.keys(PERMISSIONS));
  return [...new Set(perms.filter((p) => valid.has(p)))];
};

/**
 * Agrupa permissões por categoria pra renderizar checkboxes.
 */
export const getPermissionsByCategory = () => {
  const grouped = {};
  PERMISSION_CATEGORIES.forEach((cat) => { grouped[cat] = []; });
  Object.entries(PERMISSIONS).forEach(([key, meta]) => {
    if (!grouped[meta.category]) grouped[meta.category] = [];
    grouped[meta.category].push({ key, ...meta });
  });
  return grouped;
};
