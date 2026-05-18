/**
 * EmployeesAdmin — Funcionários Breakr (admin user management).
 *
 * Acessível só por super_admin. Lista admin/operadores do sistema, permite
 * criar (com senha temp + invite), editar role/active, resetar senha,
 * desativar.
 *
 * Permissões granulares (estilo Stripe):
 * - Cada user tem uma lista de permissions individuais
 * - Roles definem templates iniciais, mas user pode customizar via checkboxes
 * - super_admin sempre passa hasPermission (bypassa lista)
 *
 * Backend: /api/admin/users (CRUD) + /admin/users/:id/reset-password.
 *
 * TODO Clerk: integrar SSO via OAuth pra admin opcionalmente entrar com
 * Google/etc — bastará linkar clerkUserId no AdminUser via callback.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  PERMISSIONS,
  ROLE_TEMPLATES,
  ROLE_LABELS,
  ROLE_COLORS,
  getEffectivePermissions,
  getPermissionsByCategory,
} from '../../utils/permissions';
import { adminFetch } from '../../utils/adminAuth';

const ROLE_ORDER = ['super_admin', 'admin', 'gestor', 'commercial', 'financial', 'custom'];

const EmployeesAdmin = ({ canManage }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tempPasswordFlash, setTempPasswordFlash] = useState(null);

  const fetchItems = useCallback(async () => {
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/users?showInactive=${showInactive ? '1' : '0'}`);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (user) => {
    if (!window.confirm(`Desativar "${user.name}"? Ele não conseguirá mais logar.`)) return;
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
      fetchItems();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  const handleResetPassword = async (user) => {
    if (!window.confirm(`Gerar nova senha temporária pra "${user.name}"?`)) return;
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
      const data = await res.json();
      setTempPasswordFlash({ user: user.name, password: data.tempPassword });
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  const grouped = (items || []).reduce((acc, u) => {
    const key = u.role || 'other';
    (acc[key] = acc[key] || []).push(u);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[22px] font-bold text-white tracking-tight">Funcionários Breakr</h2>
          <p className="text-[12px] text-[#868686] mt-1">
            Gerencie quem tem acesso ao painel administrativo.
            {!canManage && <span className="text-[#FF8A9C] ml-2">(Só super admin pode editar)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-[11px] text-[#868686] cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar inativos
          </label>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[12px] px-4 py-2 rounded-[10px] flex items-center gap-2 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Convidar funcionário
            </button>
          )}
        </div>
      </div>

      {/* Flash de senha temporária */}
      {tempPasswordFlash && (
        <div className="bg-[#F5A623]/10 border border-[#F5A623]/40 rounded-[12px] p-4 flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-white">Nova senha gerada pra {tempPasswordFlash.user}</div>
            <div className="text-[11px] text-[#868686] mt-1">Copie e envie pelo canal seguro. O funcionário deve trocar no primeiro login.</div>
            <code className="block mt-2 bg-[#0F0F11] border border-[#F5A623]/30 rounded px-3 py-2 text-[13px] font-mono text-[#F5A623] select-all">
              {tempPasswordFlash.password}
            </code>
          </div>
          <button onClick={() => setTempPasswordFlash(null)} className="text-[#666] hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {error && (
        <div className="bg-[#FF4560]/10 border border-[#FF4560]/40 rounded-[12px] p-3 text-[12px] text-[#FF8A9C]">
          {error}
          <button onClick={fetchItems} className="ml-3 text-[#F5A623] hover:underline">Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[12px] text-[#666]">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white/[0.03] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <p className="text-[#666] text-[13px] font-medium">Nenhum funcionário cadastrado ainda</p>
          {canManage && (
            <p className="text-[#444] text-[11px] mt-1">Click em "Convidar funcionário" pra adicionar o primeiro.</p>
          )}
        </div>
      ) : (
        // Lista agrupada por role
        <div className="space-y-5">
          {ROLE_ORDER.map(role => {
            const usersInRole = grouped[role] || [];
            if (usersInRole.length === 0) return null;
            return (
              <div key={role}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROLE_COLORS[role] }} />
                  <h3 className="text-[12px] font-bold uppercase tracking-widest" style={{ color: ROLE_COLORS[role] }}>
                    {ROLE_LABELS[role]}
                  </h3>
                  <span className="text-[10px] text-[#666]">({usersInRole.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {usersInRole.map(user => (
                    <UserCard
                      key={user.id}
                      user={user}
                      canManage={canManage}
                      onEdit={() => setEditing(user)}
                      onResetPassword={() => handleResetPassword(user)}
                      onDelete={() => handleDelete(user)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modais */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(tempPassword, name) => {
            setShowCreate(false);
            fetchItems();
            if (tempPassword) setTempPasswordFlash({ user: name, password: tempPassword });
          }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchItems(); }}
        />
      )}
    </div>
  );
};

const UserCard = ({ user, canManage, onEdit, onResetPassword, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const totalPerms = Object.keys(PERMISSIONS).length;
  const effectivePerms = useMemo(() => getEffectivePermissions(user), [user]);
  const permsCount = effectivePerms.length;
  const top5 = effectivePerms.slice(0, 5);

  return (
    <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[14px] p-4 relative">
      <div className="flex items-start gap-3">
        {user.photo ? (
          <img src={user.photo} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#F5A623]/15 text-[#F5A623] flex items-center justify-center text-[14px] font-bold">
            {(user.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white truncate">{user.name}</div>
          <div className="text-[11px] text-[#868686] truncate">{user.email}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {!user.active && (
              <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[9px] font-bold rounded uppercase tracking-wider">
                Inativo
              </span>
            )}
            <span
              className="relative px-1.5 py-0.5 bg-white/[0.05] text-[#A0A0A0] text-[9px] font-bold rounded uppercase tracking-wider cursor-help"
              onMouseEnter={() => setTooltipOpen(true)}
              onMouseLeave={() => setTooltipOpen(false)}
            >
              {user.role === 'super_admin' ? `${totalPerms} permissões` : `${permsCount} de ${totalPerms} permissões`}
              {tooltipOpen && top5.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-[#0F0F11] border border-white/[0.1] rounded-[8px] p-2 min-w-[200px] shadow-2xl normal-case tracking-normal">
                  <div className="text-[10px] text-[#666] mb-1">Permissões ativas:</div>
                  <ul className="space-y-0.5">
                    {top5.map((p) => (
                      <li key={p} className="text-[10px] text-white">
                        - {PERMISSIONS[p]?.label || p}
                      </li>
                    ))}
                    {permsCount > 5 && (
                      <li className="text-[10px] text-[#666]">+ {permsCount - 5} mais...</li>
                    )}
                  </ul>
                </div>
              )}
            </span>
          </div>
          {user.lastLoginAt && (
            <div className="text-[10px] text-[#555] mt-1">
              Último login: {new Date(user.lastLoginAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        {canManage && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-7 h-7 rounded-md hover:bg-white/[0.05] flex items-center justify-center text-[#666] hover:text-white"
              aria-label="Menu de ações"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/></svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-40 bg-[#1B1B1D] border border-white/[0.08] rounded-[10px] shadow-2xl py-1 min-w-[160px]">
                  <button onClick={() => { setMenuOpen(false); onEdit(); }} className="w-full text-left px-3 py-2 text-[12px] text-white hover:bg-white/[0.05]">
                    Editar
                  </button>
                  <button onClick={() => { setMenuOpen(false); onResetPassword(); }} className="w-full text-left px-3 py-2 text-[12px] text-white hover:bg-white/[0.05]">
                    Resetar senha
                  </button>
                  <button onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full text-left px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10">
                    Desativar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Bloco reutilizável de edição de permissões granulares.
 * Lista checkboxes agrupados por categoria. Quando role muda, sugere aplicar template.
 */
const PermissionsEditor = ({ permissions, onChange, role }) => {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => getPermissionsByCategory(), []);
  const totalPerms = Object.keys(PERMISSIONS).length;
  const activeCount = permissions.length;

  const togglePerm = (key) => {
    if (permissions.includes(key)) {
      onChange(permissions.filter((p) => p !== key));
    } else {
      onChange([...permissions, key]);
    }
  };

  const applyTemplate = () => {
    const tpl = ROLE_TEMPLATES[role] || [];
    onChange([...tpl]);
  };

  const toggleAllInCategory = (catKey, allOn) => {
    const keysInCat = grouped[catKey].map((p) => p.key);
    if (allOn) {
      onChange(permissions.filter((p) => !keysInCat.includes(p)));
    } else {
      const merged = new Set([...permissions, ...keysInCat]);
      onChange([...merged]);
    }
  };

  return (
    <div className="border border-white/[0.06] rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[#0F0F11] hover:bg-[#15151A] text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className="transition-transform"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <path d="M9 6l6 6-6 6" stroke="#868686" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-[12px] font-bold text-white">Permissões avançadas</span>
          <span className="text-[10px] text-[#868686]">
            {activeCount} de {totalPerms} ativas
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); applyTemplate(); }}
          className="text-[10px] text-[#F5A623] hover:underline"
        >
          Aplicar template do cargo
        </button>
      </button>
      {open && (
        <div className="bg-[#0A0A0C] border-t border-white/[0.06] p-3 space-y-3 max-h-[320px] overflow-y-auto">
          {Object.entries(grouped).map(([catKey, perms]) => {
            if (!perms.length) return null;
            const activeInCat = perms.filter((p) => permissions.includes(p.key)).length;
            const allOn = activeInCat === perms.length;
            return (
              <div key={catKey} className="bg-[#0F0F11] rounded-[8px] p-2.5 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-bold text-[#F5A623] uppercase tracking-wider">
                    {catKey} <span className="text-[#666] font-normal normal-case">({activeInCat}/{perms.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAllInCategory(catKey, allOn)}
                    className="text-[10px] text-[#868686] hover:text-white"
                  >
                    {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="space-y-1">
                  {perms.map((p) => {
                    const checked = permissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${checked ? 'bg-[#00B37E]/[0.07]' : 'hover:bg-white/[0.03]'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePerm(p.key)}
                          className="accent-[#00B37E]"
                        />
                        {checked ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
                            <path d="M5 12l5 5 9-9" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <span className="w-3 h-3 shrink-0" />
                        )}
                        <span className={`text-[11px] ${checked ? 'text-white' : 'text-[#868686]'}`}>
                          {p.label}
                        </span>
                        <code className="ml-auto text-[9px] text-[#444]">{p.key}</code>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CreateUserModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'admin',
    password: '',
    sendInvite: true,
    permissions: ROLE_TEMPLATES.admin || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Quando role muda, aplica template automaticamente
  const handleRoleChange = (newRole) => {
    setForm((prev) => ({
      ...prev,
      role: newRole,
      permissions: [...(ROLE_TEMPLATES[newRole] || [])],
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Email inválido'); return; }
    if (!form.sendInvite && (!form.password || form.password.length < 8)) {
      setError('Senha precisa ter ao menos 8 caracteres (ou marque "Gerar senha temporária")');
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.sendInvite ? null : form.password,
          sendInvite: form.sendInvite,
          permissions: form.permissions,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao criar');
      const data = await res.json();
      onCreated(data.tempPassword, form.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1B1B1D] border border-white/[0.08] rounded-[18px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-bold text-white mb-1">Convidar funcionário</h3>
        <p className="text-[11px] text-[#868686] mb-4">Adicione um membro da equipe Breakr ao painel administrativo.</p>

        {error && <div className="bg-red-500/10 border border-red-500/40 rounded-md p-2 text-[11px] text-red-400 mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Nome</label>
            <input
              type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Maria Silva"
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Email</label>
            <input
              type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="maria@breakr.com.br"
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Cargo</label>
            <select
              value={form.role} onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            >
              <option value="super_admin">Super Admin (acesso total)</option>
              <option value="admin">Admin (tudo, exceto criar/excluir clientes)</option>
              <option value="gestor">Gestor (dashboard, fichas, engenharia)</option>
              <option value="commercial">Comercial (vendas + leads)</option>
              <option value="financial">Financeiro (DRE + BPO)</option>
              <option value="custom">Customizado (definir permissões)</option>
            </select>
          </div>

          <PermissionsEditor
            permissions={form.permissions}
            onChange={(perms) => setForm({ ...form, permissions: perms })}
            role={form.role}
          />

          <label className="flex items-center gap-2 text-[12px] text-white cursor-pointer pt-2">
            <input type="checkbox" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} />
            Gerar senha temporária (recomendado)
          </label>
          {!form.sendInvite && (
            <div>
              <label className="text-[11px] text-[#868686] block mb-1">Senha</label>
              <input
                type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[12px] text-[#868686] hover:text-white">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[12px] px-4 py-2 rounded-[8px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Criando...' : 'Convidar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditUserModal = ({ user, onClose, onSaved }) => {
  const initialPerms = (Array.isArray(user.permissions) && user.permissions.length > 0)
    ? user.permissions
    : (ROLE_TEMPLATES[user.role] || []);
  const [form, setForm] = useState({
    name: user.name,
    email: user.email || '',
    role: user.role,
    active: user.active,
    permissions: [...initialPerms],
    password: '', // em branco = mantém a senha atual
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleRoleChange = (newRole) => {
    setForm((prev) => ({
      ...prev,
      role: newRole,
      // Sugere o template do novo role, mas user pode customizar depois
      permissions: [...(ROLE_TEMPLATES[newRole] || [])],
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Email inválido');
      return;
    }
    if (form.password && form.password.length < 8) {
      setError('A nova senha precisa ter ao menos 8 caracteres');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: form.active,
        permissions: form.permissions,
      };
      // Só envia senha se o admin digitou uma nova (em branco = mantém).
      if (form.password) payload.password = form.password;
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1B1B1D] border border-white/[0.08] rounded-[18px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-bold text-white mb-4">Editar {user.name}</h3>

        {error && <div className="bg-red-500/10 border border-red-500/40 rounded-md p-2 text-[11px] text-red-400 mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Nome</label>
            <input
              type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Email</label>
            <input
              type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@breakr.com.br"
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            />
            <p className="text-[10px] text-[#666] mt-1">É com este email que o funcionário faz login.</p>
          </div>
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Nova senha</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Deixe em branco para não alterar"
              autoComplete="new-password"
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            />
            <p className="text-[10px] text-[#666] mt-1">Mínimo 8 caracteres. Preencha só se quiser trocar a senha do funcionário.</p>
          </div>
          <div>
            <label className="text-[11px] text-[#868686] block mb-1">Cargo</label>
            <select
              value={form.role} onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]/50"
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="gestor">Gestor</option>
              <option value="commercial">Comercial</option>
              <option value="financial">Financeiro</option>
              <option value="custom">Customizado</option>
            </select>
          </div>

          <PermissionsEditor
            permissions={form.permissions}
            onChange={(perms) => setForm({ ...form, permissions: perms })}
            role={form.role}
          />

          <label className="flex items-center gap-2 text-[12px] text-white cursor-pointer pt-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Ativo (pode logar)
          </label>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[12px] text-[#868686] hover:text-white">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[12px] px-4 py-2 rounded-[8px] disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeesAdmin;
