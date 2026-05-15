/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import boltIcon from '../../assets/bolt.svg';
import AdminDREModal from './AdminDREModal';
import OperationalAlerts from './OperationalAlerts';
import PortfolioKPIs from './PortfolioKPIs';
import MaturityFunnel from './MaturityFunnel';
import { HealthScoreBadge } from './HealthScoreBadge';
import ActivityFeed from './ActivityFeed';
import CuisineBenchmarks from './CuisineBenchmarks';
import RestaurantComparator from './RestaurantComparator';
import AggregatedMenuInsights from './AggregatedMenuInsights';
import DailyBriefing from './DailyBriefing';
import OpportunityDetector from './OpportunityDetector';
import MarginHunter from './MarginHunter';
import CommandPalette from './CommandPalette';
import EmployeesAdmin from './EmployeesAdmin';
import ReportsPage from './ReportsPage';
import { computeClientHealth } from '../../utils/clientHealth';
import { adminFetch } from '../../utils/adminAuth';
// BPO removido do AdminPanel — agora é feature do produto, acessível direto pelo dono no Dashboard
// import BpoApp from '../bpo/BpoApp';

// Tiny sparkline SVG component
const Sparkline = ({ data = [], color = '#F5A623', width = 60, height = 24 }) => {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#spark-${color.slice(1)})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', commercial: 'Comercial', financial: 'Financeiro' };
const ROLE_COLORS = { super_admin: '#F5A623', admin: '#F5A623', commercial: '#A78BFA', financial: '#5B8DEF' };

const AdminPanel = () => {
  const adminRole = sessionStorage.getItem('breaker-admin-role') || 'admin';
  const isSuperAdmin = adminRole === 'super_admin';
  const isCommercial = adminRole === 'commercial';
  const isFinancial = adminRole === 'financial';
  const canManage = isSuperAdmin || adminRole === 'admin'; // can create/delete clients
  const adminName = sessionStorage.getItem('breaker-admin-name') || (isSuperAdmin ? 'Gustavo Costa' : 'Admin');
  const roleLabel = ROLE_LABELS[adminRole] || 'Admin';
  const roleColor = ROLE_COLORS[adminRole] || '#F5A623';
  const [clients, setClients] = useState([]);
  // Lista COMPLETA (endpoint ?full=1) — inclui operational (fichas/insumos) e
  // revenue_history com valores. Buscada UMA vez e reutilizada pelas telas de
  // análise (aba Análises) e pela aba Gestão de Clientes, que precisam dos
  // dados crus pra calcular CMV, margens, receita real, etc. A lista leve
  // (`clients`) continua sendo usada onde só precisamos de nome/status.
  const [fullClients, setFullClients] = useState([]);
  const [fullClientsLoading, setFullClientsLoading] = useState(true);
  const [newClientName, setNewClientName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [resetModal, setResetModal] = useState(null); // { clientId, clientName, hash, currentEmail }
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [resentId, setResentId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // { id, name }
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [activeTab, setActiveTab] = useState(isCommercial ? 'commercial' : 'dashboard'); // 'clients' | 'broadcasts' | 'commercial'
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastModal, setBroadcastModal] = useState(null); // null | 'new' | broadcast object (edit)
  const [dreModal, setDreModal] = useState(null); // { client, dre } — BAH-026
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'popup', targetCategory: '', imageUrl: '', expiresAt: '' });
  const [financialFilter, setFinancialFilter] = useState('all'); // 'all' | 'cf_high' | 'no_revenue' | 'complete' | 'inactive'
  const [adminPhoto, setAdminPhoto] = useState(() => localStorage.getItem('breakr-admin-photo') || null);
  const photoInputRef = useRef(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState(adminName);
  const [profileNotifications, setProfileNotifications] = useState(() => localStorage.getItem('breakr-admin-notif') !== 'off');
  const [profileLang, setProfileLang] = useState(() => localStorage.getItem('breakr-admin-lang') || 'pt-BR');
  const [profileCopied, setProfileCopied] = useState(false);
  const [cropModal, setCropModal] = useState(null); // { src, zoom, offsetX, offsetY }
  const cropContainerRef = useRef(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState({ column: 'createdAt', order: 'desc' });
  const PAGE_SIZE = 20;

  // Abre dashboard do cliente em nova aba com contexto admin (sessionStorage é isolado por aba)
  // Passa adminView=1 + role + name via URL — App.jsx detecta e seta sessionStorage na aba nova
  // Tambem registra como "cliente recente" no localStorage pra alimentar o ClientQuickSwitcher (BAH-003)
  const openClientAsAdmin = (hash, opts = {}) => {
    const params = new URLSearchParams({
      hash,
      adminView: '1',
      adminRole,
      adminName,
      ...(opts.section ? { section: opts.section } : {}),
    });
    // Registra como recente
    try {
      const recents = JSON.parse(localStorage.getItem('breakr-admin-recents') || '[]');
      const next = [hash, ...recents.filter(h => h !== hash)].slice(0, 8);
      localStorage.setItem('breakr-admin-recents', JSON.stringify(next));
    } catch { /* ignore */ }
    window.open(`${window.location.origin}/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  // BAH-003: estado do ClientQuickSwitcher (busca rapida + recentes na home)
  const [quickSearch, setQuickSearch] = useState('');
  const [recentHashes, setRecentHashes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('breakr-admin-recents') || '[]'); } catch { return []; }
  });
  // Sincroniza recents quando abrir cliente (re-le do localStorage)
  useEffect(() => {
    const onStorage = () => {
      try { setRecentHashes(JSON.parse(localStorage.getItem('breakr-admin-recents') || '[]')); } catch { /* */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    adminFetch('/api/admin/clients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(err => console.error("Failed to fetch clients", err));
    // Lista completa (?full=1) — uma única requisição, reutilizada pelas telas
    // de análise. Payload maior, por isso é separada e cacheada em fullClients.
    adminFetch('/api/admin/clients?full=1')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setFullClients(data);
      })
      .catch(err => console.error("Failed to fetch full clients", err))
      .finally(() => setFullClientsLoading(false));
    fetch('/api/admin/broadcasts')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setBroadcasts(data); })
      .catch(err => console.error("Failed to fetch broadcasts", err));
  }, []);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('A imagem deve ter no máximo 5MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Open crop modal instead of saving directly
      setCropModal({ src: ev.target.result, zoom: 1, offsetX: 0, offsetY: 0, dragging: false });
    };
    reader.readAsDataURL(file);
    // Clear the input value so selecting the same file again triggers onChange
    e.target.value = '';
  };

  const applyCrop = () => {
    if (!cropModal) return;
    const img = new Image();
    img.onload = () => {
      const canvasSize = 256;   // Output 256x256 (para salvar)
      const previewSize = 280;  // Tamanho do container circular no preview
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');

      // Clip into circle
      ctx.beginPath();
      ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Replica o comportamento do CSS object-fit: cover com transform scale/translate
      // O menor lado da imagem cobre o container (previewSize)
      const aspect = img.width / img.height;
      let drawW, drawH;
      if (aspect >= 1) {
        // Imagem mais larga que alta — fit by height
        drawH = previewSize;
        drawW = drawH * aspect;
      } else {
        // Imagem mais alta que larga — fit by width
        drawW = previewSize;
        drawH = drawW / aspect;
      }

      // Aplica zoom (escala)
      drawW *= cropModal.zoom;
      drawH *= cropModal.zoom;

      // Converte offset de pixels do preview para pixels do canvas
      const scale = canvasSize / previewSize;
      const offsetX = cropModal.offsetX * scale;
      const offsetY = cropModal.offsetY * scale;

      // Centraliza + aplica offset (ambos em pixels do canvas)
      const dx = (canvasSize - drawW * scale) / 2 + offsetX;
      const dy = (canvasSize - drawH * scale) / 2 + offsetY;

      ctx.drawImage(img, dx, dy, drawW * scale, drawH * scale);
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      localStorage.setItem('breakr-admin-photo', base64);
      setAdminPhoto(base64);
      setCropModal(null);
    };
    img.src = cropModal.src;
  };

  const removeAdminPhoto = () => {
    localStorage.removeItem('breakr-admin-photo');
    setAdminPhoto(null);
  };

  const openProfileModal = () => {
    setProfileName(adminName);
    setProfileModalOpen(true);
  };

  const saveProfile = () => {
    const nameChanged = profileName.trim() && profileName.trim() !== adminName;
    if (nameChanged) sessionStorage.setItem('breaker-admin-name', profileName.trim());
    localStorage.setItem('breakr-admin-notif', profileNotifications ? 'on' : 'off');
    localStorage.setItem('breakr-admin-lang', profileLang);

    // Request notification permission if user enabled
    if (profileNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    setProfileModalOpen(false);
    // Reload only if name changed (needs to re-initialize adminName)
    if (nameChanged) {
      setTimeout(() => window.location.reload(), 200);
    }
  };

  const getAdminEmail = () => {
    // Infer from role
    const emailMap = { super_admin: 'gustavo@breakr.com.br', admin: 'contato@breakr.com.br', commercial: 'gabriela@breakr.com.br', financial: 'jeff@breakr.com.br' };
    return emailMap[adminRole] || 'admin@breakr.com.br';
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(getAdminEmail());
    setProfileCopied(true);
    setTimeout(() => setProfileCopied(false), 2000);
  };

  const handleCreateClient = () => {
    if (!newClientName.trim()) return;

    fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClientName, email: newClientEmail.trim() || undefined })
    })
    .then(res => res.json())
    .then(newClient => {
      setClients(prev => [...prev, newClient]);
      setNewClientName('');
      setNewClientEmail('');
      setShowModal(false);
      // Browser notification if user enabled
      if (localStorage.getItem('breakr-admin-notif') !== 'off' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Breakr — Novo cliente', {
          body: `${newClient.name} foi cadastrado com sucesso.`,
          icon: '/bolt.svg',
        });
      }
    })
    .catch(() => alert("Erro ao criar cliente"));
  };

  const handleResendWelcome = async (clientId) => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/resend-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: adminRole })
      });
      const data = await res.json();
      if (data.success) {
        setResentId(clientId);
        setTimeout(() => setResentId(null), 2500);
      } else {
        alert(data.error || 'Erro ao reenviar email.');
      }
    } catch {
      alert('Erro de conexão.');
    }
  };

  const copyLink = (hash, id) => {
    const url = `${window.location.origin}/?hash=${hash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteClient = (id, name) => {
    if (!isSuperAdmin) {
      alert('Apenas o Super Admin pode excluir clientes.');
      return;
    }
    if (isCommercial || isFinancial) return;
    setDeleteModal({ id, name });
    setDeleteConfirmText('');
  };

  const confirmDeleteClient = () => {
    if (!deleteModal || deleteConfirmText !== 'EXCLUIR') return;
    const { id } = deleteModal;

    fetch(`/api/admin/clients/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: adminRole })
    })
    .then(res => res.json())
    .then(data => {
       if (data.success) {
          setClients(prev => prev.filter(c => c.id !== id));
          setDeleteModal(null);
       } else {
          alert(data.error || "Erro ao excluir cliente");
       }
    })
    .catch(() => alert("Erro de conexão ao tentar excluir."));
  };

  const handleResetCredentials = async () => {
    if (!resetModal) return;
    if (!resetEmail && !resetPassword) { alert('Preencha ao menos um campo.'); return; }
    if (resetPassword && resetPassword.length < 6) { alert('A senha deve ter no mínimo 6 caracteres.'); return; }
    setResetLoading(true);
    try {
      const payload = { role: adminRole };
      if (resetPassword) payload.password = resetPassword;
      if (resetEmail && resetEmail !== resetModal.currentEmail) payload.email = resetEmail;
      const res = await fetch(`/api/admin/clients/${resetModal.clientId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Credenciais de "${resetModal.clientName}" atualizadas!`);
        if (payload.email) {
          setClients(prev => prev.map(c => c.id === resetModal.clientId ? { ...c, email: payload.email } : c));
        }
        setResetModal(null);
        setResetEmail('');
        setResetPassword('');
      } else {
        alert(data.error || 'Erro ao redefinir.');
      }
    } catch {
      alert('Erro de conexão.');
    }
    setResetLoading(false);
  };

  const handleMarkComplete = async (clientId, currentlyComplete) => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/mark-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentlyComplete })
      });
      const data = await res.json();
      if (data.success) {
        setClients(prev => prev.map(c => {
          if (c.id !== clientId) return c;
          const raw = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
          if (!raw.formData) raw.formData = {};
          if (!currentlyComplete) raw.formData.onboarding_completed = true;
          else delete raw.formData.onboarding_completed;
          return { ...c, data: JSON.stringify(raw) };
        }));
      }
    } catch { alert('Erro de conexão.'); }
  };

  const openNewBroadcast = () => {
    setBroadcastForm({ title: '', message: '', type: 'popup', targetCategory: '', imageUrl: '', expiresAt: '' });
    setBroadcastModal('new');
  };

  const openEditBroadcast = (b) => {
    setBroadcastForm({
      title: b.title || '',
      message: b.message || '',
      type: b.type || 'popup',
      targetCategory: b.targetCategory || '',
      imageUrl: b.imageUrl || '',
      expiresAt: b.expiresAt ? b.expiresAt.substring(0, 16) : ''
    });
    setBroadcastModal(b);
  };

  const handleSaveBroadcast = async () => {
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) { alert('Preencha título e mensagem.'); return; }
    const payload = {
      ...broadcastForm,
      targetCategory: broadcastForm.targetCategory || null,
      imageUrl: broadcastForm.imageUrl || null,
      expiresAt: broadcastForm.expiresAt ? new Date(broadcastForm.expiresAt).toISOString() : null
    };
    try {
      if (broadcastModal === 'new') {
        const res = await fetch('/api/admin/broadcasts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.id) setBroadcasts(prev => [data, ...prev]);
      } else {
        const res = await fetch(`/api/admin/broadcasts/${broadcastModal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.id) setBroadcasts(prev => prev.map(b => b.id === data.id ? data : b));
      }
      setBroadcastModal(null);
    } catch { alert('Erro ao salvar comunicado.'); }
  };

  const handleToggleBroadcast = async (id, currentActive) => {
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !currentActive }) });
      const data = await res.json();
      if (data.id) setBroadcasts(prev => prev.map(b => b.id === data.id ? data : b));
    } catch { alert('Erro ao alterar status.'); }
  };

  const handleDeleteBroadcast = async (id) => {
    if (!window.confirm('Excluir este comunicado?')) return;
    try {
      await fetch(`/api/admin/broadcasts/${id}`, { method: 'DELETE' });
      setBroadcasts(prev => prev.filter(b => b.id !== id));
    } catch { alert('Erro ao excluir.'); }
  };

  // === HELPER FUNCTIONS (declared before filteredClients/metrics to avoid TDZ) ===
  const getInitials = (name) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getColor = (name) => {
    const colors = ['#F5A623', '#00B37E', '#5B8DEF', '#FF6B6B', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getClientPhoto = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;
      if (!raw) return null;
      return raw.restaurant?.logo || raw.user?.photo || raw.formData?.user_info?.photo || null;
    } catch { return null; }
  };

  const getOnboardingProgress = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;
      if (!raw) return 0;
      const d = raw.formData;
      if (!d) return 0;
      if (d.onboarding_completed) return 100;

      const hasData = (v) => {
        if (v === null || v === undefined || v === '' || v === false || v === 0) return false;
        if (Array.isArray(v)) return v.some(item => hasData(item));
        if (typeof v === 'object') return Object.entries(v).some(([k, val]) => !k.startsWith('_') && hasData(val));
        return true;
      };

      const steps = [
        { key: 'user_info',           check: () => hasData(d.user_info?.user_name) },
        { key: 'identity',            check: () => hasData(d.identity?.restaurant_name) || hasData(d.identity?.tax_regime) },
        { key: 'partners',            check: () => Array.isArray(d.partners) && d.partners.some(p => hasData(p?.name)) },
        { key: 'employees',           check: () => Array.isArray(d.employees) && d.employees.some(e => hasData(e?.name)) },
        { key: 'benefits',            check: () => hasData(d.benefits) },
        { key: 'location_costs',      check: () => hasData(d.location_costs?.rent) || hasData(d.location_costs?.own) || hasData(d.location_costs?.rent_value) },
        { key: 'utilities',           check: () => hasData(d.utilities?.energy) || hasData(d.utilities?.water) },
        { key: 'recurring_services',  check: () => hasData(d.recurring_services) },
        { key: 'operational_fixed',   check: () => hasData(d.operational_fixed) },
        { key: 'monthly_services',    check: () => hasData(d.monthly_services) },
        { key: 'equipment',           check: () => Array.isArray(d.equipment) ? d.equipment.some(e => hasData(e?.name)) : hasData(d.equipment) },
        { key: 'admin_systems',       check: () => hasData(d.admin_systems) },
        { key: 'vehicles',            check: () => hasData(d.vehicles) },
        { key: 'marketing_structure', check: () => hasData(d.marketing_structure) },
        { key: 'fees_marketplaces',   check: () => hasData(d.fees_marketplaces) },
        { key: 'fees_cards',          check: () => Array.isArray(d.fees_cards) ? d.fees_cards.some(f => hasData(f?.name || f?.brand)) : hasData(d.fees_cards) },
        { key: 'other_fixed_costs',   check: () => hasData(d.other_fixed_costs) },
        // revenue_history: na lista leve vem como { months: [...] }; na lista
        // completa (?full=1) vem como Array de { month, amount }. Aceita ambos.
        { key: 'revenue_history',     check: () => {
            const rh = d.revenue_history;
            if (Array.isArray(rh)) return rh.length >= 1;
            return hasData(rh?.months) && rh.months.length >= 1;
          } },
      ];
      const filled = steps.filter(s => { try { return s.check(); } catch { return false; } }).length;
      return Math.round((filled / steps.length) * 100);
    } catch { return 0; }
  };

  // Parser de moeda BR — "R$ 12.345,67" / "12345.67" / number -> Number
  const parseRevenueValue = (val) => {
    if (val == null) return 0;
    if (typeof val === 'number') return val;
    let s = String(val).replace(/R\$/g, '').trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  };

  // Extrai receita bruta mais recente do revenue_history.
  // revenue_history é um Array de { month: 'MM/AAAA', amount } (shape canônico
  // do DashboardContext). Na lista leve pode chegar reshapado como
  // { months: [{ month }] } SEM amount — nesse caso não há valor calculável.
  // Pega o mês cronologicamente mais recente.
  const getGrossRevenue = (formData) => {
    if (!formData) return 0;
    const rh = formData.revenue_history;
    const arr = Array.isArray(rh) ? rh : (Array.isArray(rh?.months) ? rh.months : []);
    const valid = arr
      .filter(r => r && r.month && r.amount != null)
      .map(r => ({ month: String(r.month), value: parseRevenueValue(r.amount) }))
      .filter(r => r.value > 0);
    if (valid.length === 0) return 0;
    valid.sort((a, b) => {
      const [ma, ya] = a.month.split('/').map(Number);
      const [mb, yb] = b.month.split('/').map(Number);
      return (yb - ya) || (mb - ma);
    });
    return valid[0].value;
  };

  const getFinancial = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;
      // _financial está no nível root do data (não dentro de formData) e é
      // pré-calculado pelo backend (cfPct, fichas, dre).
      const fin = raw?._financial || raw?.formData?._financial || null;
      // A receita do _financial vinha 0 (calculateRevenue no backend lê
      // revenue_history.months/m.value, mas o shape real é Array {month,amount}).
      // Recalcula a receita bruta direto do revenue_history pra garantir valor real.
      const revenue = getGrossRevenue(raw?.formData);
      if (!fin && revenue === 0) return null;
      return { ...(fin || {}), revenue };
    } catch { return null; }
  };

  // Helper to get client display data — deve ficar ANTES de filteredClients/metrics (TDZ)
  const getClientDisplay = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
      const GENERIC = ['Seu Restaurante', 'Acesso Cliente', 'Usuário', ''];
      const restaurantFromData = raw.formData?.identity?.restaurant_name || raw.restaurant?.name;
      const displayName = (restaurantFromData && !GENERIC.includes(restaurantFromData)) ? restaurantFromData : client.name;
      const rawOwner = raw.formData?.user_info?.user_name || raw.user?.name || '';
      const ownerName = GENERIC.includes(rawOwner) ? '' : rawOwner;
      return { displayName, ownerName, raw };
    } catch {
      return { displayName: client.name || '', ownerName: '', raw: {} };
    }
  };

  // Normaliza texto pra busca (sem acentos, minúsculas, trim)
  const normalizeSearch = (str) => {
    if (!str) return '';
    return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  };

  // Lista "enriquecida": mantém a lista leve como fonte de verdade do CRUD,
  // mas substitui o campo `data` pelo JSON completo (?full=1) quando disponível.
  // Assim a tabela de clientes e os cálculos de receita/health usam dados reais
  // (fichas, insumos, revenue_history com valores) sem perder os clientes
  // criados/removidos que ainda não estão no fullClients.
  const clientsView = (() => {
    if (!fullClients.length) return clients;
    const fullById = new Map(fullClients.map(fc => [fc.id, fc]));
    return clients.map(c => {
      const full = fullById.get(c.id);
      return full ? { ...c, data: full.data } : c;
    });
  })();

  const filteredClients = (() => {
    const q = normalizeSearch(search);
    const filtered = clientsView.filter(c => {
      if (!q) return true;
      // Busca em: name, email, displayName (restaurante), ownerName, hash
      const { displayName, ownerName } = getClientDisplay(c);
      const haystack = [
        c.name,
        c.email,
        displayName,
        ownerName,
        c.hash,
      ].map(normalizeSearch).join(' ');
      const matchesSearch = haystack.includes(q);
      if (!matchesSearch) return false;
      if (financialFilter === 'all') return true;
      const fin = getFinancial(c);
      const progress = getOnboardingProgress(c);
      if (financialFilter === 'cf_high') return fin && fin.cfPct > 33;
      if (financialFilter === 'no_revenue') return !fin || fin.revenue === 0;
      if (financialFilter === 'complete') return progress >= 100;
      if (financialFilter === 'inactive') return progress === 0;
      return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const { column, order } = sortBy;
      let va, vb;
      if (column === 'name') {
        const { displayName: na } = getClientDisplay(a);
        const { displayName: nb } = getClientDisplay(b);
        va = na.toLowerCase(); vb = nb.toLowerCase();
      } else if (column === 'progress') {
        va = getOnboardingProgress(a); vb = getOnboardingProgress(b);
      } else if (column === 'revenue') {
        va = getFinancial(a)?.revenue || 0; vb = getFinancial(b)?.revenue || 0;
      } else {
        // createdAt
        va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime();
      }
      if (va < vb) return order === 'asc' ? -1 : 1;
      if (va > vb) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  })();

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const pagedClients = filteredClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // Reset to page 1 if current page becomes invalid after filtering
  if (currentPage > totalPages && totalPages > 0 && currentPage !== 1) {
    setTimeout(() => setCurrentPage(1), 0);
  }

  const toggleSort = (column) => {
    setSortBy(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ column }) => {
    if (sortBy.column !== column) return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    return sortBy.order === 'asc' ? (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#F5A623]"><path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    ) : (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#F5A623]"><path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    );
  };

  // SaaS metrics — usa clientsView (dados completos quando disponíveis) pra que
  // receita bruta e contagem de fichas sejam reais, não zeradas.
  const metrics = (() => {
    const total = clientsView.length;
    const completedArr = clientsView.filter(c => getOnboardingProgress(c) >= 100);
    const inProgressArr = clientsView.filter(c => { const p = getOnboardingProgress(c); return p > 0 && p < 100; });
    const pendingArr = clientsView.filter(c => getOnboardingProgress(c) === 0);
    const withRevenue = clientsView.filter(c => { const f = getFinancial(c); return f && f.revenue > 0; });
    const cfHighArr = clientsView.filter(c => { const f = getFinancial(c); return f && f.cfPct > 33; });
    const totalRevenue = clientsView.reduce((s, c) => { const f = getFinancial(c); return s + (f?.revenue || 0); }, 0);
    const totalFichas = clientsView.reduce((s, c) => { const f = getFinancial(c); return s + (f?.fichas || 0); }, 0);
    return { total, completed: completedArr.length, inProgress: inProgressArr.length, pending: pendingArr.length, withRevenue: withRevenue.length, cfHigh: cfHighArr.length, totalRevenue, totalFichas };
  })();

  // Sidebar nav items — divididos em grupos pra reduzir scroll
  const sidebarItems = [
    // Grupo Dashboard — sub-páginas separadas (antes empilhadas com scroll)
    { id: 'dashboard', label: 'Visão Geral', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, group: 'dashboard' },
    { id: 'analytics', label: 'Análises', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18M7 12l4-4 4 4 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, group: 'dashboard' },
    { id: 'activity', label: 'Atividade', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 2M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, group: 'dashboard' },
    // Grupo Gestão
    { id: 'clients', label: 'Gestão de Clientes', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, group: 'mgmt' },
    { id: 'commercial', label: 'Comercial', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, group: 'mgmt' },
    { id: 'reports', label: 'Relatórios', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, group: 'mgmt' },
    ...(canManage ? [{ id: 'broadcasts', label: 'Comunicados', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, badge: broadcasts.filter(b => b.active).length, group: 'mgmt' }] : []),
    // Grupo Sistema (super_admin only)
    ...(isSuperAdmin ? [{ id: 'employees', label: 'Funcionários Breakr', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><circle cx="17" cy="11" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M22 21v-1a3 3 0 00-2.5-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, group: 'system' }] : []),
  ];

  return (
    <div className="h-screen bg-[#0A0A0B] font-jakarta text-white flex relative overflow-hidden">
      {/* Ambient background — Breakr signature orange gradients (matches login) */}
      <div className="pointer-events-none fixed top-[-15%] left-[-10%] w-[55%] h-[55%] bg-[#FFC100] blur-[200px] opacity-[0.05] rounded-full" />
      <div className="pointer-events-none fixed bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-[#F5A623] blur-[200px] opacity-[0.05] rounded-full" />
      <div className="pointer-events-none fixed top-[30%] right-[20%] w-[30%] h-[30%] bg-[#FF8A00] blur-[150px] opacity-[0.025] rounded-full" />

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[70]"
          />
        )}
      </AnimatePresence>

      {/* ===== LEFT SIDEBAR — desktop static + mobile drawer ===== */}
      <motion.aside
        initial={false}
        animate={{
          x: mobileSidebarOpen ? 0 : (typeof window !== 'undefined' && window.innerWidth >= 768 ? 0 : '-100%')
        }}
        transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="fixed md:sticky md:translate-x-0 top-0 left-0 w-[260px] md:w-[250px] shrink-0 flex flex-col bg-gradient-to-b from-[#0F0F10] to-[#0A0A0B] border-r border-white/[0.06] h-screen z-[80] md:z-20"
        style={{ transform: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'translateX(0)' : undefined }}
      >
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/[0.04]">
          <div className="relative">
            <div className="absolute inset-0 bg-[#F5A623] blur-[12px] opacity-30 rounded-[12px]" />
            <div className="relative w-[40px] h-[40px] bg-gradient-to-br from-[#1a1a1a] to-black rounded-[12px] flex items-center justify-center border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <img src={boltIcon} alt="Breakr" className="w-[20px]" />
            </div>
          </div>
          <div className="flex-1">
            <h1 className="text-[16px] font-bold text-white leading-tight tracking-tight">Breakr</h1>
            <p className="text-[9px] text-[#555] uppercase tracking-widest font-semibold">Admin Panel</p>
          </div>
          {/* Close button — only on mobile */}
          <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-2 rounded-[8px] text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* User Profile Card — clickable opens modal */}
        <div className="px-3 pt-4 pb-2">
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <button onClick={openProfileModal} className="w-full bg-white/[0.02] border border-white/[0.05] rounded-[14px] p-3 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group text-left">
            <div className="flex items-center gap-2.5">
              <div className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0" style={{ backgroundColor: adminPhoto ? 'transparent' : roleColor + '20' }}>
                {adminPhoto ? (
                  <img src={adminPhoto} alt={adminName} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center font-bold text-[12px]" style={{ color: roleColor }}>{adminName.substring(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-white truncate">{adminName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-[5px] h-[5px] rounded-full animate-pulse" style={{ backgroundColor: roleColor }} />
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: roleColor }}>{roleLabel}</span>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#555] group-hover:text-white transition-colors shrink-0"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
          </button>
        </div>

        {/* Nav Section */}
        <div className="px-3 pt-4">
          <p className="px-3 mb-2 text-[9px] text-[#444] uppercase tracking-widest font-bold">Principal</p>
        </div>
        <nav className="flex-1 px-3">
          {sidebarItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileSidebarOpen(false); }}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] mb-1 transition-all text-left group ${
                  isActive
                    ? 'bg-gradient-to-r from-[#F5A623]/15 to-[#F5A623]/5 text-[#F5A623] shadow-[inset_0_1px_0_rgba(245,166,35,0.1)]'
                    : 'text-[#868686] hover:bg-white/[0.03] hover:text-white'
                }`}
              >
                {isActive && <motion.div layoutId="activeTab" className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F5A623] rounded-r-full" />}
                <span className={`transition-colors ${isActive ? 'text-[#F5A623]' : 'text-[#666] group-hover:text-white'}`}>{item.icon}</span>
                <span className="text-[13px] font-medium">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto bg-[#F5A623] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg shadow-[#F5A623]/20">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Bottom */}
        <div className="px-3 pb-4 mt-auto space-y-2">
          {canManage && (
            <button
              onClick={() => setShowModal(true)}
              className="relative w-full bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black font-semibold text-[13px] px-4 py-3 rounded-[12px] hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.4)] transition-all flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_12px_-4px_rgba(245,166,35,0.3)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="black" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Novo Cliente
            </button>
          )}
          <button
            onClick={() => { sessionStorage.removeItem('breaker-admin'); sessionStorage.removeItem('breaker-admin-role'); sessionStorage.removeItem('breaker-admin-name'); sessionStorage.removeItem('breaker-admin-token'); sessionStorage.removeItem('breaker-admin-user-id'); window.location.href = '/'; }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[#666] hover:bg-white/[0.03] hover:text-white transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="text-[13px] font-medium">Sair</span>
          </button>
        </div>
      </motion.aside>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col h-screen overflow-x-hidden relative z-10">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
            {/* Mobile hamburger */}
            <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 rounded-[10px] text-[#868686] hover:text-white hover:bg-white/[0.04] transition-colors shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>

            {/* Breadcrumbs */}
            <div className="hidden lg:flex items-center gap-2 text-[12px]">
              <span className="text-[#555]">Admin</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#333]"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span className="text-white font-medium capitalize">{
                activeTab === 'dashboard' ? 'Visão Geral'
                : activeTab === 'analytics' ? 'Análises'
                : activeTab === 'activity' ? 'Atividade'
                : activeTab === 'employees' ? 'Funcionários Breakr'
                : activeTab === 'clients' ? 'Clientes'
                : activeTab === 'commercial' ? 'Comercial'
                : activeTab === 'reports' ? 'Relatórios'
                : 'Comunicados'
              }</span>
            </div>

            {/* Search with Cmd+K hint */}
            <div className="flex-1 max-w-md relative ml-auto lg:ml-6">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  // Sincroniza com a busca rápida do dashboard (QuickSwitcher)
                  // pra que a busca de cima funcione independente da aba ativa
                  setQuickSearch(v);
                  // Auto-navega pra aba clientes quando o usuário digita >= 2 chars
                  // de fora da aba clientes (busca global universal)
                  if (v.trim().length >= 2 && activeTab !== 'clients' && activeTab !== 'dashboard') {
                    setActiveTab('clients');
                  }
                }}
                placeholder="Buscar clientes, comunicados..."
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-[10px] pl-10 pr-16 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623]/40 focus:bg-white/[0.05] transition-all placeholder-[#555]"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[#666] bg-white/[0.05] border border-white/[0.08] rounded">⌘K</kbd>
            </div>

            <div className="flex items-center gap-1 relative">
              {/* Notification bell — opens dropdown with recent broadcasts */}
              <button onClick={() => setNotifOpen(v => !v)} className="relative p-2.5 rounded-[10px] text-[#868686] hover:text-white hover:bg-white/[0.04] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {broadcasts.filter(b => b.active).length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#F5A623] ring-2 ring-[#0A0A0B] text-[9px] text-black font-bold flex items-center justify-center">{broadcasts.filter(b => b.active).length}</span>
                )}
              </button>

              {/* Notification dropdown */}
              <AnimatePresence>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-[320px] bg-[#141416] border border-white/[0.08] rounded-[14px] shadow-2xl z-40 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                        <h4 className="text-[13px] font-bold text-white">Notificações</h4>
                        {canManage && (
                          <button onClick={() => { setActiveTab('broadcasts'); setNotifOpen(false); }} className="text-[10px] text-[#F5A623] font-semibold hover:underline">
                            Gerenciar
                          </button>
                        )}
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {broadcasts.filter(b => b.active).length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <div className="w-10 h-10 mx-auto rounded-full bg-white/[0.03] flex items-center justify-center mb-2">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </div>
                            <p className="text-[11px] text-[#666]">Nenhuma notificação ativa</p>
                          </div>
                        ) : (
                          broadcasts.filter(b => b.active).map(b => (
                            <div key={b.id} className="px-4 py-3 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                              <div className="flex items-start gap-2">
                                <div className={`w-[6px] h-[6px] rounded-full mt-1.5 shrink-0 ${b.type === 'banner' ? 'bg-[#5B8DEF]' : 'bg-[#F5A623]'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <p className="text-[12px] font-semibold text-white truncate">{b.title}</p>
                                    <span className="text-[9px] text-[#666] shrink-0">{new Date(b.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                  </div>
                                  <p className="text-[11px] text-[#999] line-clamp-2">{b.message}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-6 py-6 overflow-y-auto">

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === 'dashboard' ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* BAH-003: Quick Client Switcher — escolha rapida de cliente pra trabalhar */}
          {(() => {
            // Helper pra extrair logo do client.data (vem JSON-stringified do backend)
            const getClientLogo = (c) => {
              try {
                const d = typeof c.data === 'string' ? JSON.parse(c.data || '{}') : (c.data || {});
                return d?.restaurant?.logo || null;
              } catch { return null; }
            };

            const recentClients = recentHashes
              .map(h => clients.find(c => c.hash === h))
              .filter(Boolean)
              .slice(0, 5);

            // Busca com scoring: nome com prefixo > nome com palavra > nome contém > email contém
            const q = quickSearch.trim().toLowerCase();
            const filtered = !q ? [] : clients
              .map(c => {
                const name = (c.name || '').toLowerCase();
                const email = (c.email || '').toLowerCase();
                let score = 0;
                if (name.startsWith(q)) score = 100;
                else if (name.match(new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))) score = 80;
                else if (name.includes(q)) score = 50;
                else if (email.startsWith(q)) score = 30;
                else if (email.includes(q)) score = 10;
                return score > 0 ? { client: c, score } : null;
              })
              .filter(Boolean)
              .sort((a, b) => b.score - a.score)
              .map(x => x.client);

            // Avatar component reutilizavel: mostra logo se houver, senao a letra
            const ClientAvatar = ({ client, size = 32 }) => {
              const logo = getClientLogo(client);
              const sizeClass = size === 32 ? 'w-8 h-8' : 'w-6 h-6';
              if (logo) {
                return (
                  <img
                    src={logo}
                    alt={client.name}
                    className={`${sizeClass} rounded-full object-cover shrink-0 bg-white/[0.04]`}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                );
              }
              return (
                <div className={`${sizeClass} rounded-full bg-[#F5A623]/15 text-[#F5A623] flex items-center justify-center text-[11px] font-bold shrink-0`}>
                  {(client.name || '?').charAt(0).toUpperCase()}
                </div>
              );
            };

            return (
              <div className="mb-6 bg-gradient-to-br from-[#1a1410] via-[#141416] to-[#0F0F11] border border-[#F5A623]/20 rounded-[18px] p-5 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-[#F5A623]/10 blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <h3 className="text-[15px] font-bold text-white">Em qual cliente vai trabalhar?</h3>
                      </div>
                      <p className="text-[11px] text-[#868686]">Busque pelo nome ou email pra abrir o financeiro/dashboard direto.</p>
                    </div>
                    {recentClients.length > 0 && (
                      <span className="text-[10px] text-[#666] uppercase tracking-wider font-semibold">{recentClients.length} recentes</span>
                    )}
                  </div>

                  {/* Search input */}
                  <div className="relative mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#868686]"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <input
                      type="text"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                      placeholder="Buscar cliente por nome ou email..."
                      className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[12px] pl-10 pr-3 py-2.5 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623]/50 transition-colors"
                    />
                  </div>

                  {/* Resultados da busca — scroll quando muitos, contagem total no header */}
                  {filtered.length > 0 && (
                    <>
                      <div className="text-[10px] text-[#666] mb-2">
                        <span className="text-[#F5A623] font-semibold">{filtered.length}</span> resultado{filtered.length !== 1 ? 's' : ''}
                        {filtered.length > 8 && <span className="text-[#444]"> (rolar pra ver todos)</span>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 max-h-[320px] overflow-y-auto pr-1 -mr-1">
                        {filtered.map(c => (
                          <div key={c.id} className="flex items-center justify-between gap-2 bg-[#0F0F11] border border-white/[0.06] rounded-[10px] p-2.5 hover:border-[#F5A623]/40 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <ClientAvatar client={c} size={32} />
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-white truncate">{c.name}</div>
                                <div className="text-[10px] text-[#666] truncate">{c.email || '—'}</div>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => openClientAsAdmin(c.hash)}
                                className="text-[10px] px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white font-medium transition-colors"
                                title="Abrir dashboard do cliente"
                              >
                                Dashboard
                              </button>
                              <button
                                onClick={() => openClientAsAdmin(c.hash, { section: 'financeiro' })}
                                className="text-[10px] px-2 py-1 rounded-md bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold transition-colors"
                                title="Abrir financeiro do cliente"
                              >
                                Financeiro →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {quickSearch.trim() && filtered.length === 0 && (
                    <div className="text-[11px] text-[#666] py-3 text-center mb-3">Nenhum cliente encontrado pra "{quickSearch}".</div>
                  )}

                  {/* Atalhos: clientes recentes (chips) — só quando não ta buscando */}
                  {!quickSearch.trim() && recentClients.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recentClients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => openClientAsAdmin(c.hash)}
                          className="group flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-[#F5A623]/40 rounded-full pl-1.5 pr-3 py-1.5 transition-all"
                          title={`Abrir ${c.name}`}
                        >
                          <ClientAvatar client={c} size={24} />
                          <span className="text-[12px] text-white font-medium max-w-[140px] truncate">{c.name}</span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-[#666] group-hover:text-[#F5A623] transition-colors"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      ))}
                    </div>
                  )}
                  {!quickSearch.trim() && recentClients.length === 0 && (
                    <div className="text-[11px] text-[#666] italic">Nenhum cliente acessado ainda. Use a busca acima ou vá pra aba <button onClick={() => setActiveTab('clients')} className="text-[#F5A623] font-semibold hover:underline">Clientes</button>.</div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Hero greeting */}
          <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}
                </span>
                <span className="text-[11px] text-[#555]">{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <h2 className="text-[28px] font-bold text-white tracking-tight">
                {(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })()}, {adminName.split(' ')[0]} 👋
              </h2>
              <p className="text-[13px] text-[#868686] mt-1">Aqui está o resumo do seu negócio hoje.</p>
            </div>
          </div>

          {/* Briefing fixo no topo — sempre visível, prioridade do dia */}
          <DailyBriefing clients={clients} adminName={adminName} />

          {/* Visão Geral — agir AGORA (alertas + KPIs + funil) */}
          <OperationalAlerts
            clients={clients}
            onOpenClient={(hash, page) => openClientAsAdmin(hash, page ? { section: page } : {})}
          />
          <PortfolioKPIs clients={fullClients.length ? fullClients : clients} />
          <MaturityFunnel
            clients={clients}
            onStageClick={(stageId, stuckClients) => {
              console.log('Stage clicked:', stageId, stuckClients.length, 'stuck clients');
            }}
          />

          {/* Métricas clássicas — colapsáveis pra reduzir scroll. Conteúdo
              já está coberto pelo Portfolio KPIs / Operational Alerts acima */}
          <details className="group rounded-[14px] bg-white/[0.02] border border-white/[0.04] open:bg-white/[0.03]">
            <summary className="cursor-pointer flex items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-[#868686] hover:text-white transition-colors list-none">
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="transition-transform group-open:rotate-90">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Visão clássica (cards + status + atividade)
              </span>
              <span className="text-[10px] text-[#555]">opcional</span>
            </summary>
            <div className="p-4 pt-0">
          {/* Metric Cards — premium with sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Clientes Ativos', value: metrics.total, trend: metrics.completed > 0 ? `+${Math.round((metrics.completed / Math.max(metrics.total, 1)) * 100)}%` : null, color: '#F5A623', sparkData: [metrics.pending, metrics.inProgress, metrics.completed, metrics.total], icon: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> },
              { label: 'Receita Mensal', value: `R$ ${metrics.totalRevenue >= 1000 ? `${(metrics.totalRevenue / 1000).toFixed(1)}k` : metrics.totalRevenue.toLocaleString('pt-BR')}`, trend: metrics.withRevenue > 0 ? `${metrics.withRevenue} clientes` : null, color: '#5B8DEF', sparkData: [0, metrics.totalRevenue * 0.3, metrics.totalRevenue * 0.7, metrics.totalRevenue], icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round"/> },
              { label: 'Onboarding Completo', value: `${metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0}%`, trend: `${metrics.completed}/${metrics.total}`, color: '#00B37E', sparkData: [0, metrics.completed * 0.5, metrics.completed * 0.8, metrics.completed], icon: <><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></> },
              { label: 'Alertas CF > 33%', value: metrics.cfHigh, trend: metrics.cfHigh > 0 ? 'crítico' : 'tudo ok', color: metrics.cfHigh > 0 ? '#FF4560' : '#00B37E', sparkData: [metrics.cfHigh, metrics.cfHigh * 0.8, metrics.cfHigh, metrics.cfHigh], icon: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#FF4560" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke="#FF4560" strokeWidth="1.5" strokeLinecap="round"/></> },
            ].map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="relative bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5 overflow-hidden group hover:border-white/[0.12] transition-all">
                {/* Ambient glow */}
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-[0.08] group-hover:opacity-[0.15] transition-opacity" style={{ backgroundColor: m.color }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-[12px] flex items-center justify-center ring-1 ring-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" style={{ backgroundColor: m.color + '10' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">{m.icon}</svg>
                    </div>
                    <Sparkline data={m.sparkData} color={m.color} width={64} height={28} />
                  </div>
                  <p className="text-[10px] text-[#666] uppercase tracking-widest font-bold mb-1.5">{m.label}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-[28px] font-bold text-white leading-none tracking-tight">{m.value}</p>
                    {m.trend && <span className="text-[11px] font-semibold" style={{ color: m.color }}>{m.trend}</span>}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Lower row: Status donut + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Status dos Clientes with fancy progress */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="lg:col-span-2 bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-[15px] font-bold text-white">Status dos Clientes</h3>
                  <p className="text-[11px] text-[#666] mt-0.5">Distribuição do onboarding</p>
                </div>
                <button className="text-[11px] text-[#F5A623] font-medium hover:underline">Ver detalhes</button>
              </div>
              {[
                { label: 'Completo', value: metrics.completed, pct: metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0, color: '#00B37E' },
                { label: 'Em Andamento', value: metrics.inProgress, pct: metrics.total > 0 ? Math.round((metrics.inProgress / metrics.total) * 100) : 0, color: '#F5A623' },
                { label: 'Pendente', value: metrics.pending, pct: metrics.total > 0 ? Math.round((metrics.pending / metrics.total) * 100) : 0, color: '#FF4560' },
              ].map((s, idx) => (
                <div key={s.label} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}60` }} />
                      <span className="text-[12px] font-semibold text-white">{s.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[14px] font-bold text-white">{s.value}</span>
                      <span className="text-[11px] font-medium" style={{ color: s.color }}>{s.pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-[6px] bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.8, delay: 0.3 + idx * 0.1, ease: 'easeOut' }}
                      className="h-full rounded-full relative" style={{ background: `linear-gradient(90deg, ${s.color}80, ${s.color})` }}>
                      <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 12px ${s.color}80` }} />
                    </motion.div>
                  </div>
                </div>
              ))}
              <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#666]"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <p className="text-[11px] text-[#666]">Atualizado agora</p>
              </div>
            </motion.div>

            {/* Recent Activity — enhanced with hover */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="lg:col-span-3 bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[15px] font-bold text-white">Atividades Recentes</h3>
                  <p className="text-[11px] text-[#666] mt-0.5">Últimos clientes cadastrados</p>
                </div>
                <button onClick={() => setActiveTab('clients')} className="text-[11px] text-[#F5A623] font-medium hover:underline flex items-center gap-1">
                  Ver tudo <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              {clients.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </div>
                  <p className="text-[12px] text-[#666]">Nenhum cliente ainda.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {clients.slice(0, 5).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((c, idx) => {
                    const { displayName } = getClientDisplay(c);
                    const progress = getOnboardingProgress(c);
                    const daysSince = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                    const color = getColor(c.name);
                    return (
                      <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + idx * 0.05 }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-white/[0.03] transition-colors cursor-pointer group"
                        onClick={() => openClientAsAdmin(c.hash)}>
                        <div className="relative">
                          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm" style={{ backgroundColor: color + '25', color }}>{getInitials(displayName)}</div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px] rounded-full ring-2 ring-[#121214]" style={{ backgroundColor: progress >= 100 ? '#00B37E' : progress > 0 ? '#F5A623' : '#555' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-[#666]">
                              {daysSince === 0 ? 'Cadastrado hoje' : daysSince === 1 ? 'Cadastrado ontem' : `Cadastrado há ${daysSince}d`}
                            </p>
                            {c.email && <span className="w-[3px] h-[3px] rounded-full bg-[#333]" />}
                            {c.email && <p className="text-[10px] text-[#555] truncate">{c.email}</p>}
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${progress >= 100 ? 'bg-[#00B37E]/15 text-[#00B37E] border border-[#00B37E]/20' : progress > 0 ? 'bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/20' : 'bg-white/[0.03] text-[#666] border border-white/[0.06]'}`}>
                          {progress >= 100 ? 'Completo' : progress > 0 ? `${progress}%` : 'Novo'}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#444] group-hover:text-[#F5A623] transition-colors"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
            </div>
          </details>

          {/* CTA Card at bottom */}
          {metrics.total === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="mt-6 relative bg-gradient-to-r from-[#F5A623]/10 via-[#F5A623]/5 to-transparent border border-[#F5A623]/20 rounded-[18px] p-6 overflow-hidden">
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-[#F5A623] opacity-10 blur-3xl" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-[14px] bg-[#F5A623]/20 flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-[16px] font-bold text-white mb-1">Cadastre seu primeiro cliente</h3>
                  <p className="text-[13px] text-[#868686]">Comece a acompanhar o desempenho dos seus restaurantes.</p>
                </div>
                {canManage && (
                  <button onClick={() => setShowModal(true)} className="bg-[#F5A623] text-black font-semibold text-[13px] px-5 py-2.5 rounded-[10px] hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all whitespace-nowrap">
                    Adicionar Cliente
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>

        ) : activeTab === 'analytics' ? (
        /* ===== ANALYTICS TAB ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-6">
            <h2 className="text-[22px] font-bold text-white tracking-tight">Análises</h2>
            <p className="text-[12px] text-[#868686] mt-1">Insights detalhados e oportunidades de upsell, consultoria e revisão de margem.</p>
          </div>
          {fullClientsLoading ? (
            <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-10 text-center">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
              <p className="text-[12px] text-[#868686]">Carregando dados completos do portfólio…</p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* As telas de análise consomem fullClients (dados completos com
                fichas/insumos/revenue_history). Sem fullClients carregado, não
                há como calcular — cai pra lista leve só pra não quebrar. */}
            <OpportunityDetector
              clients={fullClients}
              onClientClick={(client) => openClientAsAdmin(client.hash)}
            />
            <MarginHunter
              clients={fullClients}
              onClientClick={(client) => openClientAsAdmin(client.hash, { section: 'fichaTecnica' })}
            />
            <AggregatedMenuInsights clients={fullClients} />
            <CuisineBenchmarks
              clients={fullClients}
              onCuisineClick={(cuisineType, restaurants) => {
                console.log('Cuisine clicked:', cuisineType, restaurants.length, 'restaurants');
              }}
            />
            <RestaurantComparator clients={fullClients} />
          </div>
          )}
        </motion.div>

        ) : activeTab === 'activity' ? (
        /* ===== ACTIVITY TAB ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-6">
            <h2 className="text-[22px] font-bold text-white tracking-tight">Atividade</h2>
            <p className="text-[12px] text-[#868686] mt-1">Timeline de eventos do portfolio.</p>
          </div>
          <div className="space-y-4">
            <ActivityFeed
              clients={fullClients.length ? fullClients : clients}
              maxItems={50}
              onClientClick={(hash) => openClientAsAdmin(hash)}
            />
          </div>
        </motion.div>

        ) : activeTab === 'employees' ? (
        /* ===== FUNCIONÁRIOS BREAKR TAB (super_admin only) ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <EmployeesAdmin canManage={isSuperAdmin} />
        </motion.div>

        ) : activeTab === 'clients' ? (
        /* ===== CLIENTS TABLE TAB ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">Base de Clientes</span>
                <span className="text-[11px] text-[#555]">{metrics.total} clientes · {metrics.withRevenue} ativos</span>
              </div>
              <h2 className="text-[28px] font-bold text-white tracking-tight">Gestão de Clientes</h2>
              <p className="text-[13px] text-[#868686] mt-1">Controle e gerenciamento dos seus restaurantes.</p>
            </div>
            {canManage && (
              <button onClick={() => setShowModal(true)} className="bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black font-semibold text-[13px] px-5 py-2.5 rounded-[10px] hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all flex items-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_12px_-4px_rgba(245,166,35,0.3)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="black" strokeWidth="1.5" strokeLinecap="round"/><path d="M20 8v6M23 11h-6" stroke="black" strokeWidth="2" strokeLinecap="round"/><circle cx="8.5" cy="7" r="4" stroke="black" strokeWidth="1.5"/></svg>
                Adicionar Cliente
              </button>
            )}
          </div>

          {/* Filter Bar — polished */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[14px] p-4 mb-5 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#666] uppercase tracking-widest font-bold whitespace-nowrap">Filtrar por</span>
              <select
                value={financialFilter}
                onChange={(e) => setFinancialFilter(e.target.value)}
                className="bg-white/[0.03] border border-white/[0.08] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none focus:border-[#F5A623]/50 transition-colors [color-scheme:dark] cursor-pointer hover:bg-white/[0.05]"
              >
                <option value="all">Todos os Status</option>
                <option value="complete">✓ Completos</option>
                <option value="cf_high">⚠ CF {'>'} 33%</option>
                <option value="no_revenue">○ Sem Faturamento</option>
                <option value="inactive">• Pendentes</option>
              </select>
            </div>
            {financialFilter !== 'all' && (
              <button onClick={() => setFinancialFilter('all')} className="text-[11px] text-[#666] hover:text-white flex items-center gap-1 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Limpar
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 text-[12px] text-[#868686]">
              <span>Exibindo</span>
              <span className="bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-md text-white font-semibold">{filteredClients.length}</span>
              <span>de {clients.length}</span>
            </div>
          </div>

          {/* Table — scrollable on mobile (min-w to preserve columns) */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] overflow-x-auto">
            <div className="min-w-[780px]">
            {/* Table Header — sortable.
                Coluna "Ações" tem largura FIXA (não `auto`): cada linha é seu
                próprio grid, então `auto` dimensionava conforme a quantidade de
                botões da linha (varia por cliente) e desalinhava todas as
                colunas ("fazendo curva" — BAH-095 #1). Largura fixa garante que
                todas as linhas usem o mesmo gabarito de colunas. */}
            <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.8fr_172px] gap-4 px-5 py-3 border-b border-white/[0.06] text-[10px] text-[#555] uppercase tracking-widest font-bold bg-white/[0.01]">
              <button onClick={() => toggleSort('name')} className="text-left flex items-center gap-1.5 hover:text-white transition-colors">
                Cliente <SortIcon column="name" />
              </button>
              <span>Responsável</span>
              <button onClick={() => toggleSort('progress')} className="text-left flex items-center gap-1.5 hover:text-white transition-colors">
                Status <SortIcon column="progress" />
              </button>
              <button onClick={() => toggleSort('createdAt')} className="text-left flex items-center gap-1.5 hover:text-white transition-colors">
                Cadastro <SortIcon column="createdAt" />
              </button>
              <button onClick={() => toggleSort('revenue')} className="text-left flex items-center gap-1.5 hover:text-white transition-colors">
                Indicadores <SortIcon column="revenue" />
              </button>
              <span className="text-right">Ações</span>
            </div>

            {/* Table Rows */}
            {filteredClients.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white/[0.03] flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <p className="text-[#666] text-[13px] font-medium">{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}</p>
                {search && <p className="text-[#444] text-[11px] mt-1">Tente outra busca ou limpe os filtros</p>}
              </div>
            ) : (
              pagedClients.map((client, idx) => {
                const color = getColor(client.name);
                const progress = getOnboardingProgress(client);
                const photo = getClientPhoto(client);
                const { displayName, ownerName } = getClientDisplay(client);
                const fin = getFinancial(client);
                return (
                  <motion.div key={client.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                    className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.8fr_172px] gap-4 px-5 py-3.5 border-b border-white/[0.03] last:border-0 items-center hover:bg-white/[0.02] transition-colors group">
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        {photo ? (
                          <img src={photo} alt={displayName} className="w-[38px] h-[38px] rounded-[10px] object-cover shrink-0 ring-1 ring-white/[0.08]" />
                        ) : (
                          <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-[12px] font-bold shrink-0 ring-1 ring-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" style={{ backgroundColor: color + '25', color }}>
                            {getInitials(displayName)}
                          </div>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] rounded-full ring-2 ring-[#0F0F11]" style={{ backgroundColor: progress >= 100 ? '#00B37E' : progress > 0 ? '#F5A623' : '#555' }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate group-hover:text-[#F5A623] transition-colors">{displayName}</div>
                        {client.email && <div className="text-[10px] text-[#555] truncate">{client.email}</div>}
                      </div>
                    </div>

                    {/* Owner */}
                    <div className="text-[12px] text-[#999] truncate">{ownerName || '—'}</div>

                    {/* Status */}
                    <div>
                      {(() => {
                        const rawClientData = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
                        const isManuallyComplete = !!(rawClientData.formData?.onboarding_completed);
                        return (
                          <button
                            onClick={() => canManage && handleMarkComplete(client.id, isManuallyComplete)}
                            disabled={!canManage}
                            className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${canManage ? 'cursor-pointer hover:underline' : ''} ${
                              progress >= 100 ? 'text-[#00B37E]' : progress > 0 ? 'text-[#F5A623]' : 'text-[#666]'
                            }`}
                            title={canManage ? (isManuallyComplete ? 'Clique para desmarcar como concluído' : 'Clique para marcar como concluído') : ''}
                          >
                            <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: progress >= 100 ? '#00B37E' : progress > 0 ? '#F5A623' : '#444' }} />
                            {progress >= 100 ? 'Ativo' : progress > 0 ? `${progress}%` : 'Inativo'}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Date */}
                    <div className="text-[12px] text-[#999]">{new Date(client.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

                    {/* Financial + Health Score (Fase 2.1) */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        // Computa health do cliente uma vez e mostra badge
                        try {
                          const clientData = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
                          const health = computeClientHealth(clientData);
                          return health ? <HealthScoreBadge health={health} size="sm" /> : null;
                        } catch { return null; }
                      })()}
                      {fin && fin.revenue > 0 ? (
                        <>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${fin.cfPct > 33 ? 'bg-red-500/15 text-red-400' : 'bg-[#00B37E]/15 text-[#00B37E]'}`}>CF {fin.cfPct.toFixed(0)}%</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#1E1E1E] text-[9px] text-[#868686]">R${(fin.revenue/1000).toFixed(0)}k</span>
                        </>
                      ) : (
                        <span className="text-[10px] text-[#444]">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 justify-end">
                      {/* BAH-026: ver DRE Aberto do cliente */}
                      {fin?.dre && (
                        <button
                          onClick={() => setDreModal({ client: { ...client, name: getClientDisplay(client).displayName }, dre: fin.dre })}
                          className="p-2 rounded-[8px] text-[#868686] hover:text-[#F5A623] hover:bg-[#252527] transition-colors"
                          title="Ver DRE Aberto"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                      <button
                        onClick={() => openClientAsAdmin(client.hash)}
                        className="p-2 rounded-[8px] text-[#868686] hover:text-white hover:bg-[#252527] transition-colors"
                        title="Acessar dashboard"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 3h6v6M21 3l-8 8M10 5H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button
                        onClick={() => copyLink(client.hash, client.id)}
                        className={`p-2 rounded-[8px] transition-colors ${copiedId === client.id ? 'text-[#00B37E] bg-[#00B37E]/10' : 'text-[#868686] hover:text-[#F5A623] hover:bg-[#252527]'}`}
                        title="Copiar link"
                      >
                        {copiedId === client.id ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        )}
                      </button>
                      {/* BAH-095 #2: estas ações antes só apareciam quando
                          `client.email` existia — clientes sem email cadastrado
                          ficavam sem nenhuma ação de credencial, de forma
                          inconsistente. Agora aparecem SEMPRE para super_admin.
                          - "Reenviar credenciais": precisa de email; sem email
                            fica desabilitado com tooltip explicando.
                          - "Redefinir credenciais": abre o modal mesmo sem
                            email — é justamente o fluxo pra CADASTRAR o email
                            e definir a senha do cliente. */}
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => client.email && handleResendWelcome(client.id)}
                            disabled={!client.email}
                            className={`p-2 rounded-[8px] transition-colors ${
                              !client.email
                                ? 'text-[#3A3A3A] cursor-not-allowed'
                                : resentId === client.id
                                  ? 'text-[#00B37E] bg-[#00B37E]/10'
                                  : 'text-[#868686] hover:text-white hover:bg-[#252527]'
                            }`}
                            title={client.email ? 'Reenviar email de boas-vindas' : 'Cliente sem email — redefina as credenciais primeiro para cadastrar um email'}
                          >
                            {resentId === client.id && client.email ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                          </button>
                          <button
                            onClick={() => { setResetModal({ clientId: client.id, clientName: client.name, hash: client.hash, currentEmail: client.email }); setResetEmail(client.email || ''); }}
                            className="p-2 rounded-[8px] text-[#868686] hover:text-white hover:bg-[#252527] transition-colors"
                            title={client.email ? 'Redefinir credenciais (bloquear/liberar acesso)' : 'Cadastrar credenciais de acesso'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </button>
                        </>
                      )}
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteClient(client.id, client.name)}
                          className="p-2 rounded-[8px] text-[#555] hover:text-[#FF4560] hover:bg-[#FF4560]/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Excluir"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
            </div>
          </div>

          {/* Pagination */}
          {filteredClients.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 px-2">
              <div className="text-[11px] text-[#666]">
                Página <span className="text-white font-semibold">{currentPage}</span> de <span className="text-white font-semibold">{totalPages}</span> — {filteredClients.length} clientes
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-[8px] text-[#868686] hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
                {/* Page numbers — show first, last, and nearby */}
                {(() => {
                  const pages = [];
                  const showPage = (p) => p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1);
                  let prevShown = 0;
                  for (let p = 1; p <= totalPages; p++) {
                    if (!showPage(p)) continue;
                    if (prevShown && p - prevShown > 1) pages.push(<span key={`dot-${p}`} className="text-[#555] px-1 text-[11px]">···</span>);
                    pages.push(
                      <button key={p} onClick={() => setCurrentPage(p)} className={`min-w-[32px] h-[32px] rounded-[8px] text-[12px] font-semibold transition-colors ${currentPage === p ? 'bg-[#F5A623] text-black' : 'text-[#868686] hover:text-white hover:bg-white/[0.04]'}`}>
                        {p}
                      </button>
                    );
                    prevShown = p;
                  }
                  return pages;
                })()}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-[8px] text-[#868686] hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Metrics — premium */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5 relative overflow-hidden group hover:border-[#00B37E]/20 transition-all">
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[#00B37E] opacity-[0.05] blur-2xl group-hover:opacity-[0.1] transition-opacity" />
              {/* BAH-095 #4: o card antes mostrava "Taxa de Retenção" com a
                  fórmula (total - pendentes) / total — isso NÃO é retenção, é
                  taxa de onboarding iniciado. O sistema não registra evento de
                  cancelamento/churn, então não há base real pra calcular
                  retenção. Card honestamente renomeado pra "Onboarding Iniciado"
                  (métrica real) e retenção marcada como indisponível. */}
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <p className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Onboarding Iniciado</p>
                </div>
                <p className="text-[32px] font-bold text-white leading-none tracking-tight">{metrics.total > 0 ? Math.round(((metrics.total - metrics.pending) / metrics.total) * 100) : 0}%</p>
                <p className="text-[11px] text-[#00B37E] mt-2 font-medium">{metrics.total - metrics.pending} de {metrics.total} começaram</p>
                <p className="text-[10px] text-[#555] mt-1.5 leading-snug">Retenção/churn: <span className="text-[#666] font-medium">indisponível</span> — sem registro de cancelamento.</p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5 relative overflow-hidden group hover:border-[#5B8DEF]/20 transition-all">
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[#5B8DEF] opacity-[0.05] blur-2xl group-hover:opacity-[0.1] transition-opacity" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <p className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Fichas Técnicas</p>
                </div>
                <p className="text-[32px] font-bold text-white leading-none tracking-tight">{metrics.totalFichas}</p>
                <p className="text-[11px] text-[#868686] mt-2 font-medium">Total cadastradas</p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-[#1A1510] via-[#141416] to-[#0F0F11] border border-[#F5A623]/20 rounded-[16px] p-5 relative overflow-hidden group hover:border-[#F5A623]/40 transition-all">
              <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-[#F5A623] opacity-[0.08] blur-2xl group-hover:opacity-[0.15] transition-opacity" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <p className="text-[10px] text-[#F5A623] uppercase tracking-widest font-bold">Receita Total</p>
                </div>
                <p className="text-[32px] font-bold text-white leading-none tracking-tight">R$ {metrics.totalRevenue >= 1000 ? `${(metrics.totalRevenue / 1000).toFixed(1)}k` : metrics.totalRevenue.toLocaleString('pt-BR')}</p>
                <p className="text-[11px] text-[#F5A623] mt-2 font-medium">{metrics.withRevenue} {metrics.withRevenue === 1 ? 'cliente com faturamento' : 'clientes com faturamento'}</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        ) : activeTab === 'commercial' ? (
        /* ===== COMMERCIAL TAB (Gabriela) ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-[#A78BFA] uppercase tracking-widest bg-[#A78BFA]/10 px-2.5 py-1 rounded-full border border-[#A78BFA]/20">Pipeline</span>
            </div>
            <h2 className="text-[28px] font-bold text-white tracking-tight">Comercial</h2>
            <p className="text-[13px] text-[#868686] mt-1">Acompanhe leads, trials e conversões em tempo real.</p>
          </div>
          {/* Pipeline Summary Cards */}
          {(() => {
            const pipeline = { lead: [], trial: [], active: [], churn: [] };
            clients.forEach(c => {
              const progress = getOnboardingProgress(c);
              const fin = getFinancial(c);
              if (progress === 0) {
                pipeline.lead.push(c);
              } else if (progress < 100) {
                pipeline.trial.push(c);
              } else if (fin && fin.revenue > 0) {
                pipeline.active.push(c);
              } else {
                // Complete but no revenue — potential churn risk
                pipeline.churn.push(c);
              }
            });

            const stages = [
              { key: 'lead', label: 'Leads', color: '#868686', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8.5" cy="7" r="4" stroke="#868686" strokeWidth="1.5"/><path d="M20 8v6M23 11h-6" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/></svg> },
              { key: 'trial', label: 'Em Trial', color: '#F5A623', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#F5A623" strokeWidth="1.5"/><path d="M12 6v6l4 2" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round"/></svg> },
              { key: 'active', label: 'Ativos', color: '#00B37E', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="#00B37E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
              { key: 'churn', label: 'Risco Churn', color: '#FF4560', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke="#FF4560" strokeWidth="1.5" strokeLinecap="round"/></svg> },
            ];

            const conversionRate = clients.length > 0 ? Math.round((pipeline.active.length / clients.length) * 100) : 0;

            return (
              <>
                {/* Funnel metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {stages.map(s => (
                    <div key={s.key} className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[14px] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: s.color + '15' }}>{s.icon}</div>
                        <span className="text-[10px] text-[#868686] uppercase tracking-wider font-medium">{s.label}</span>
                      </div>
                      <span className="text-[24px] font-bold text-white">{pipeline[s.key].length}</span>
                    </div>
                  ))}
                </div>

                {/* Conversion bar */}
                <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[14px] p-4 mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-[#868686] font-medium">Funil de Conversão</span>
                    <span className="text-[12px] font-bold" style={{ color: conversionRate >= 50 ? '#00B37E' : conversionRate >= 25 ? '#F5A623' : '#FF4560' }}>{conversionRate}% conversão</span>
                  </div>
                  <div className="flex h-[8px] rounded-full overflow-hidden bg-[#252527]">
                    {stages.map(s => {
                      const pct = clients.length > 0 ? (pipeline[s.key].length / clients.length) * 100 : 0;
                      return pct > 0 ? <div key={s.key} style={{ width: `${pct}%`, backgroundColor: s.color }} className="transition-all duration-500" title={`${s.label}: ${pipeline[s.key].length}`} /> : null;
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    {stages.map(s => (
                      <div key={s.key} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-[10px] text-[#666]">{s.label} ({pipeline[s.key].length})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pipeline Kanban-style columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {stages.map(s => (
                    <div key={s.key}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-[13px] font-semibold text-white">{s.label}</span>
                        <span className="text-[11px] text-[#555] ml-auto">{pipeline[s.key].length}</span>
                      </div>
                      <div className="space-y-2">
                        {pipeline[s.key].length === 0 ? (
                          <div className="text-center py-6 text-[11px] text-[#444] bg-[#1B1B1D] rounded-[12px] border border-dashed border-[#2A2A2C]">Nenhum</div>
                        ) : (
                          pipeline[s.key].map(client => {
                            const raw = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
                            const GENERIC = ['Seu Restaurante', 'Acesso Cliente', 'Usuário', ''];
                            const restaurantFromData = raw.formData?.identity?.restaurant_name || raw.restaurant?.name;
                            const displayName = (restaurantFromData && !GENERIC.includes(restaurantFromData)) ? restaurantFromData : client.name;
                            const fin = getFinancial(client);
                            const daysSince = Math.floor((Date.now() - new Date(client.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                            const progress = getOnboardingProgress(client);
                            const color = getColor(client.name);
                            return (
                              <div key={client.id} className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[12px] p-3 hover:border-[#3A3A3C] transition-all cursor-pointer" onClick={() => openClientAsAdmin(client.hash)}>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: color + '20', color: color }}>
                                    {getInitials(displayName)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[12px] font-semibold text-white truncate">{displayName}</div>
                                    <div className="text-[9px] text-[#666]">{daysSince}d atrás</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {progress > 0 && progress < 100 && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#F5A623]/15 text-[#F5A623] text-[9px] font-medium">{progress}%</span>
                                  )}
                                  {fin && fin.revenue > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#252527] text-[#868686] text-[9px]">R$ {(fin.revenue / 1000).toFixed(0)}k</span>
                                  )}
                                  {daysSince <= 7 && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#A78BFA]/15 text-[#A78BFA] text-[9px] font-medium">Novo</span>
                                  )}
                                  {client.email && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#252527] text-[#555] text-[9px] truncate max-w-[100px]">{client.email}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </motion.div>

        ) : activeTab === 'reports' ? (
        /* ===== REPORTS TAB (BAH-016) ===== */
        <ReportsPage clients={clients} adminName={adminName} adminRole={adminRole} />

        ) : (
        /* ===== BROADCASTS TAB ===== */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">Comunicação</span>
                <span className="text-[11px] text-[#555]">{broadcasts.filter(b => b.active).length} ativos · {broadcasts.length} total</span>
              </div>
              <h2 className="text-[28px] font-bold text-white tracking-tight">Comunicados</h2>
              <p className="text-[13px] text-[#868686] mt-1">Popups e banners exibidos aos clientes no dashboard.</p>
            </div>
            {canManage && (
              <button onClick={openNewBroadcast} className="bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black font-semibold text-[13px] px-5 py-2.5 rounded-[10px] hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all flex items-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_12px_-4px_rgba(245,166,35,0.3)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="black" strokeWidth="2.5" strokeLinecap="round"/></svg>
                Novo Comunicado
              </button>
            )}
          </div>
          {broadcasts.length === 0 ? (
            <div className="text-center py-16 bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-dashed border-white/[0.08] rounded-[20px]">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 bg-[#F5A623]/10 rounded-full blur-2xl" />
                <div className="relative w-full h-full bg-gradient-to-br from-[#F5A623]/20 to-[#F5A623]/5 border border-[#F5A623]/20 rounded-full flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
              <p className="text-white text-[15px] font-semibold mb-1">Nenhum comunicado criado</p>
              <p className="text-[#666] text-[12px] max-w-sm mx-auto mb-5">Crie popups ou banners para avisar seus clientes sobre novidades, atualizações e promoções.</p>
              {canManage && (
                <button onClick={openNewBroadcast} className="bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white text-[12px] font-medium px-4 py-2 rounded-[10px] transition-colors">
                  Criar primeiro comunicado
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {broadcasts.map((b, idx) => (
                <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                  className={`relative bg-gradient-to-br from-[#141416] to-[#0F0F11] border rounded-[16px] p-5 transition-all hover:border-white/[0.12] group ${b.active ? 'border-[#F5A623]/25 shadow-[0_0_0_1px_rgba(245,166,35,0.05)]' : 'border-white/[0.06] opacity-70'}`}>
                  {b.active && <div className="absolute -left-px top-4 bottom-4 w-[3px] bg-gradient-to-b from-[#F5A623] to-[#E5961E] rounded-full" />}
                  <div className="flex items-start gap-4">
                    {/* Type icon */}
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${b.type === 'banner' ? 'bg-blue-500/15' : 'bg-[#F5A623]/15'}`}>
                      {b.type === 'banner' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h8" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[14px] font-semibold text-white truncate">{b.title}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${b.active ? 'bg-[#00B37E]/15 text-[#00B37E]' : 'bg-[#252527] text-[#555]'}`}>
                          {b.active ? 'Ativo' : 'Inativo'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-[#252527] text-[#868686] uppercase tracking-wider">
                          {b.type === 'banner' ? 'Banner' : 'Popup'}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#999] line-clamp-2">{b.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-[#666]">
                        <span>Criado: {new Date(b.createdAt).toLocaleDateString('pt-BR')}</span>
                        {b.expiresAt && <span>Expira: {new Date(b.expiresAt).toLocaleDateString('pt-BR')}</span>}
                        {b.targetCategory && <span className="px-1.5 py-0.5 bg-[#252527] rounded text-[#868686]">{b.targetCategory}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleBroadcast(b.id, b.active)}
                        className={`p-2 rounded-[8px] transition-colors ${b.active ? 'hover:bg-[#F5A623]/10 text-[#F5A623]' : 'hover:bg-[#252527] text-[#555]'}`}
                        title={b.active ? 'Desativar' : 'Ativar'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          {b.active ? (
                            <><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>
                          ) : (
                            <><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
                          )}
                        </svg>
                      </button>
                      <button
                        onClick={() => openEditBroadcast(b)}
                        className="p-2 rounded-[8px] hover:bg-[#252527] text-[#868686] hover:text-white transition-colors"
                        title="Editar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="p-2 rounded-[8px] hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
        )}

        </main>
      </div>

      {/* ===== CROP IMAGE MODAL ===== */}
      <AnimatePresence>
      {cropModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => setCropModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gradient-to-br from-[#141416] to-[#0A0A0B] border border-white/[0.08] rounded-[20px] w-full max-w-[400px] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-white">Ajustar foto</h3>
                <p className="text-[11px] text-[#666]">Arraste para posicionar e use o zoom</p>
              </div>
              <button onClick={() => setCropModal(null)} className="p-2 rounded-[8px] text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Crop area */}
            <div className="p-5 flex flex-col items-center">
              <div
                ref={cropContainerRef}
                className="relative w-[280px] h-[280px] bg-[#0A0A0B] rounded-full overflow-hidden cursor-move select-none ring-4 ring-white/[0.05]"
                onMouseDown={(e) => {
                  const startX = e.clientX - cropModal.offsetX;
                  const startY = e.clientY - cropModal.offsetY;
                  const onMove = (me) => {
                    setCropModal(prev => prev && ({ ...prev, offsetX: me.clientX - startX, offsetY: me.clientY - startY }));
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  const startX = touch.clientX - cropModal.offsetX;
                  const startY = touch.clientY - cropModal.offsetY;
                  const onMove = (te) => {
                    const t = te.touches[0];
                    setCropModal(prev => prev && ({ ...prev, offsetX: t.clientX - startX, offsetY: t.clientY - startY }));
                  };
                  const onEnd = () => {
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                  };
                  window.addEventListener('touchmove', onMove);
                  window.addEventListener('touchend', onEnd);
                }}
              >
                <img
                  src={cropModal.src}
                  alt="Preview"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    transform: `translate(${cropModal.offsetX}px, ${cropModal.offsetY}px) scale(${cropModal.zoom})`,
                    objectFit: 'cover',
                    transformOrigin: 'center center',
                  }}
                  draggable={false}
                />
                {/* Grid overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border-2 border-white/20 rounded-full" />
                </div>
              </div>

              {/* Zoom slider */}
              <div className="w-full mt-5">
                <div className="flex items-center gap-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#666] shrink-0"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M21 21l-4.35-4.35M8 11h6M11 8v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={cropModal.zoom}
                    onChange={(e) => setCropModal(prev => prev && ({ ...prev, zoom: parseFloat(e.target.value) }))}
                    className="flex-1 h-[4px] bg-white/[0.08] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F5A623] [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(245,166,35,0.5)] [&::-webkit-slider-thumb]:cursor-pointer"
                    style={{ background: `linear-gradient(to right, #F5A623 0%, #F5A623 ${((cropModal.zoom - 1) / 2) * 100}%, rgba(255,255,255,0.08) ${((cropModal.zoom - 1) / 2) * 100}%, rgba(255,255,255,0.08) 100%)` }}
                  />
                  <span className="text-[11px] text-[#666] font-mono w-10 text-right">{cropModal.zoom.toFixed(1)}x</span>
                </div>
              </div>

              {/* Reset button */}
              <button onClick={() => setCropModal(prev => prev && ({ ...prev, zoom: 1, offsetX: 0, offsetY: 0 }))}
                className="mt-3 text-[11px] text-[#666] hover:text-white transition-colors flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Resetar posição
              </button>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2 bg-white/[0.01]">
              <button onClick={() => setCropModal(null)} className="flex-1 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-[10px] text-[#868686] text-[13px] font-semibold hover:bg-white/[0.06] hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={applyCrop} className="flex-1 py-2.5 bg-gradient-to-b from-[#F5B638] to-[#E5961E] rounded-[10px] text-black text-[13px] font-bold hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all">
                Aplicar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ===== PROFILE SETTINGS MODAL ===== */}
      <AnimatePresence>
      {profileModalOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setProfileModalOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative bg-gradient-to-br from-[#141416] to-[#0A0A0B] border border-white/[0.08] rounded-[20px] w-full max-w-[480px] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Ambient glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-[0.12] blur-3xl" style={{ backgroundColor: roleColor }} />
            <div className="absolute -bottom-24 -left-24 w-56 h-56 rounded-full opacity-[0.08] blur-3xl" style={{ backgroundColor: roleColor }} />

            {/* Close button */}
            <button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 z-10 p-2 rounded-[10px] text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="relative">
              {/* Header with avatar */}
              <div className="px-6 pt-8 pb-5 text-center border-b border-white/[0.06]">
                <div className="relative inline-block group">
                  <div className="absolute inset-0 rounded-full blur-xl opacity-40" style={{ backgroundColor: roleColor }} />
                  <div className="relative w-[88px] h-[88px] rounded-full overflow-hidden ring-4 ring-white/[0.08] shadow-2xl" style={{ backgroundColor: adminPhoto ? 'transparent' : roleColor + '25' }}>
                    {adminPhoto ? (
                      <img src={adminPhoto} alt={adminName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center font-bold text-[28px]" style={{ color: roleColor }}>{adminName.substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  {/* Camera button */}
                  <button onClick={() => photoInputRef.current?.click()} className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-gradient-to-b from-[#F5B638] to-[#E5961E] flex items-center justify-center text-black shadow-lg ring-4 ring-[#0F0F11] hover:scale-110 transition-transform" title="Alterar foto">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/></svg>
                  </button>
                </div>
                <h3 className="text-[18px] font-bold text-white mt-4 tracking-tight">{profileName || adminName}</h3>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ backgroundColor: roleColor }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: roleColor }}>{roleLabel}</span>
                </div>
                {adminPhoto && (
                  <button onClick={removeAdminPhoto} className="text-[11px] text-[#666] hover:text-[#FF4560] font-medium mt-3 transition-colors">
                    Remover foto
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

                {/* Nome */}
                <div>
                  <label className="block text-[10px] font-bold text-[#666] uppercase tracking-widest mb-2">Nome de Exibição</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623]/40 focus:bg-white/[0.05] transition-all pr-10"
                      placeholder="Seu nome"
                    />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444]"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>

                {/* Email — readonly */}
                <div>
                  <label className="block text-[10px] font-bold text-[#666] uppercase tracking-widest mb-2">E-mail</label>
                  <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-[12px] px-4 py-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#555]"><rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 7l10 6 10-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    <span className="text-[13px] text-[#AAA] flex-1 truncate">{getAdminEmail()}</span>
                    <button onClick={copyEmail} className={`p-1.5 rounded-[6px] transition-colors ${profileCopied ? 'text-[#00B37E] bg-[#00B37E]/10' : 'text-[#666] hover:text-white hover:bg-white/[0.05]'}`} title="Copiar">
                      {profileCopied ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/></svg>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-[#555] mt-1.5">Para alterar o e-mail, entre em contato com o administrador.</p>
                </div>

                {/* Role info card */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-[12px] p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ backgroundColor: roleColor + '15' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={roleColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white">Nível de Acesso</p>
                    <p className="text-[11px]" style={{ color: roleColor }}>{roleLabel}</p>
                  </div>
                  <span className="text-[10px] text-[#555]">
                    {isSuperAdmin ? 'Todas permissões' : canManage ? 'Criar/Editar' : 'Somente leitura'}
                  </span>
                </div>

                {/* Preferences section */}
                <div className="pt-2">
                  <p className="text-[10px] font-bold text-[#666] uppercase tracking-widest mb-3">Preferências</p>

                  {/* Notifications toggle */}
                  <button onClick={() => setProfileNotifications(v => !v)} className="w-full flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-[12px] p-3 hover:border-white/[0.1] transition-colors mb-2">
                    <div className="w-9 h-9 rounded-[10px] bg-[#5B8DEF]/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[12px] font-semibold text-white">Notificações</p>
                      <p className="text-[10px] text-[#666]">Receber alertas de novos clientes e atividades</p>
                    </div>
                    <div className={`relative w-[40px] h-[22px] rounded-full transition-colors ${profileNotifications ? 'bg-[#F5A623]' : 'bg-white/[0.08]'}`}>
                      <div className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-all ${profileNotifications ? 'left-[20px]' : 'left-[2px]'}`} />
                    </div>
                  </button>

                  {/* Language — custom dropdown to avoid browser default styling */}
                  <div className="w-full flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-[12px] p-3 relative">
                    <div className="w-9 h-9 rounded-[10px] bg-[#A78BFA]/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#A78BFA" strokeWidth="1.5"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="#A78BFA" strokeWidth="1.5"/></svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[12px] font-semibold text-white">Idioma</p>
                      <p className="text-[10px] text-[#666]">Idioma da interface</p>
                    </div>
                    <div className="relative">
                      <button onClick={() => setLangDropdownOpen(v => !v)} className="bg-white/[0.05] border border-white/[0.08] rounded-[8px] px-3 py-1.5 text-[11px] text-white outline-none hover:bg-white/[0.08] flex items-center gap-2 font-medium">
                        {(() => {
                          const opts = { 'pt-BR': '🇧🇷 PT-BR', 'en': '🇺🇸 EN', 'es': '🇪🇸 ES' };
                          return opts[profileLang] || opts['pt-BR'];
                        })()}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className={`transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </button>
                      <AnimatePresence>
                      {langDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setLangDropdownOpen(false)} />
                          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-1.5 z-50 bg-[#1B1B1D] border border-white/[0.1] rounded-[10px] shadow-2xl min-w-[120px] overflow-hidden">
                            {[
                              { value: 'pt-BR', label: '🇧🇷 Português (BR)' },
                              { value: 'en', label: '🇺🇸 English' },
                              { value: 'es', label: '🇪🇸 Español' },
                            ].map(opt => (
                              <button key={opt.value}
                                onClick={() => { setProfileLang(opt.value); setLangDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2 ${profileLang === opt.value ? 'bg-[#F5A623]/10 text-[#F5A623]' : 'text-white hover:bg-white/[0.06]'}`}>
                                <span>{opt.label}</span>
                                {profileLang === opt.value && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="ml-auto"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                )}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="pt-2">
                  <p className="text-[10px] font-bold text-[#FF4560] uppercase tracking-widest mb-3">Zona de Perigo</p>
                  <button
                    onClick={() => { sessionStorage.removeItem('breaker-admin'); sessionStorage.removeItem('breaker-admin-role'); sessionStorage.removeItem('breaker-admin-name'); sessionStorage.removeItem('breaker-admin-token'); sessionStorage.removeItem('breaker-admin-user-id'); window.location.href = '/'; }}
                    className="w-full flex items-center gap-3 bg-red-500/5 border border-red-500/15 rounded-[12px] p-3 hover:bg-red-500/10 hover:border-red-500/30 transition-colors group">
                    <div className="w-9 h-9 rounded-[10px] bg-red-500/15 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="#FF4560" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[12px] font-semibold text-white">Encerrar Sessão</p>
                      <p className="text-[10px] text-[#666]">Sair do painel administrativo</p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#555] group-hover:text-red-400 transition-colors"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/[0.06] flex gap-2 bg-white/[0.01]">
                <button onClick={() => setProfileModalOpen(false)} className="flex-1 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-[10px] text-[#868686] text-[13px] font-semibold hover:bg-white/[0.06] hover:text-white transition-colors">
                  Cancelar
                </button>
                <button onClick={saveProfile} className="flex-1 py-2.5 bg-gradient-to-b from-[#F5B638] to-[#E5961E] rounded-[10px] text-black text-[13px] font-bold hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_12px_-4px_rgba(245,166,35,0.3)]">
                  Salvar Alterações
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Broadcast Create/Edit Modal */}
      {broadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setBroadcastModal(null)}>
          <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[20px] p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-bold text-white mb-1">
              {broadcastModal === 'new' ? 'Novo Comunicado' : 'Editar Comunicado'}
            </h3>
            <p className="text-[12px] text-[#868686] mb-5">
              {broadcastModal === 'new' ? 'Crie um popup ou banner para seus clientes' : 'Edite os dados do comunicado'}
            </p>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              {['popup', 'banner'].map(t => (
                <button
                  key={t}
                  onClick={() => setBroadcastForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors border ${
                    broadcastForm.type === t
                      ? t === 'popup' ? 'bg-[#F5A623]/15 border-[#F5A623]/40 text-[#F5A623]' : 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                      : 'bg-[#252527] border-[#2A2A2C] text-[#868686] hover:border-[#444]'
                  }`}
                >
                  {t === 'popup' ? 'Popup' : 'Banner'}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">Titulo</label>
            <input
              type="text"
              value={broadcastForm.title}
              onChange={e => setBroadcastForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Novidade no Breakr!"
              autoFocus
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-3"
            />

            <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">Mensagem</label>
            <textarea
              value={broadcastForm.message}
              onChange={e => setBroadcastForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Escreva a mensagem do comunicado..."
              rows={3}
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-3 resize-none"
            />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">URL da Imagem <span className="text-[#444]">(opcional)</span></label>
                <input
                  type="text"
                  value={broadcastForm.imageUrl}
                  onChange={e => setBroadcastForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">Categoria <span className="text-[#444]">(opcional)</span></label>
                <input
                  type="text"
                  value={broadcastForm.targetCategory}
                  onChange={e => setBroadcastForm(f => ({ ...f, targetCategory: e.target.value }))}
                  placeholder="Ex: restaurante"
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors"
                />
              </div>
            </div>

            <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">Expira em <span className="text-[#444]">(opcional)</span></label>
            <input
              type="datetime-local"
              value={broadcastForm.expiresAt}
              onChange={e => setBroadcastForm(f => ({ ...f, expiresAt: e.target.value }))}
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors mb-5 [color-scheme:dark]"
            />

            <div className="flex gap-3">
              <button onClick={() => setBroadcastModal(null)} className="flex-1 py-3 bg-[#252527] rounded-[12px] text-[#868686] text-[13px] font-semibold hover:bg-[#333] transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveBroadcast} className="flex-1 py-3 bg-[#F5A623] rounded-[12px] text-black text-[13px] font-semibold hover:bg-[#E5961E] transition-colors">
                {broadcastModal === 'new' ? 'Criar Comunicado' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setDeleteModal(null)}>
          <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-white">Excluir Cliente</h3>
                <p className="text-[12px] text-[#868686]">{deleteModal.name}</p>
              </div>
            </div>
            <p className="text-[12px] text-[#999] mb-4">
              Esta ação é <span className="text-red-400 font-semibold">permanente</span> e irá apagar todos os dados deste cliente. Para confirmar, digite <span className="text-white font-bold">EXCLUIR</span> abaixo:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
              placeholder="Digite EXCLUIR"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDeleteClient(); }}
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-red-500/60 transition-colors mb-4 text-center tracking-widest font-mono"
            />
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal(null)} className="flex-1 text-[13px] text-[#868686] font-medium py-2.5 rounded-[10px] hover:bg-[#252527] transition-colors">
                Cancelar
              </button>
              <button
                onClick={confirmDeleteClient}
                disabled={deleteConfirmText !== 'EXCLUIR'}
                className={`flex-1 text-[13px] font-semibold py-2.5 rounded-[10px] transition-all ${
                  deleteConfirmText === 'EXCLUIR'
                    ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
                    : 'bg-[#252527] text-[#555] cursor-not-allowed'
                }`}
              >
                Excluir Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Credentials Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => { setResetModal(null); setResetEmail(''); setResetPassword(''); }}>
          <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-white mb-1">Redefinir Credenciais</h3>
            <p className="text-[12px] text-[#868686] mb-4">Cliente: <span className="text-white">{resetModal.clientName}</span></p>
            <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">E-mail</label>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full bg-[#161616] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-3"
            />
            <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">Nova Senha</label>
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Deixe em branco para manter a atual"
              className="w-full bg-[#161616] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setResetModal(null); setResetEmail(''); setResetPassword(''); }} className="flex-1 bg-[#252527] text-[#868686] font-medium text-[13px] rounded-[10px] py-2.5">Cancelar</button>
              <button onClick={handleResetCredentials} disabled={resetLoading} className="flex-1 bg-[#F5A623] text-black font-bold text-[13px] rounded-[10px] py-2.5 disabled:opacity-50">
                {resetLoading ? 'Salvando...' : 'Redefinir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-[420px] bg-[#1B1B1D] rounded-[20px] p-6 border border-[#2A2A2C] mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-bold mb-1">Novo Cliente</h3>
            <p className="text-[12px] text-[#868686] mb-6">Cadastre um novo restaurante no sistema</p>

            <div className="mb-4">
              <label className="block text-[12px] text-[#868686] mb-2">Nome do Restaurante</label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-white outline-none focus:border-[#F5A623] transition-colors"
                placeholder="Ex: Meu Restaurante"
                autoFocus
              />
            </div>
            <div className="mb-6">
              <label className="block text-[12px] text-[#868686] mb-2">E-mail do Cliente <span className="text-[#555]">(opcional — envia boas-vindas)</span></label>
              <input
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-white outline-none focus:border-[#F5A623] transition-colors"
                placeholder="cliente@email.com"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-[#252527] rounded-[12px] text-[#868686] text-[13px] font-semibold hover:bg-[#333] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                className="flex-1 py-3 bg-[#F5A623] rounded-[12px] text-black text-[13px] font-semibold hover:bg-[#E5961E] transition-colors"
              >
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRE Aberto Modal — BAH-026 */}
      {dreModal && (
        <AdminDREModal
          client={dreModal.client}
          dre={dreModal.dre}
          onClose={() => setDreModal(null)}
        />
      )}

      {/* Fase 5.1: Cmd+K Global Search — atalho global em qualquer aba */}
      <CommandPalette
        clients={clients}
        adminRole={adminRole}
        onAction={(action, payload) => {
          if (action === 'open_client' && payload?.hash) {
            openClientAsAdmin(payload.hash, payload.section ? { section: payload.section } : {});
          } else if (action === 'navigate' && payload?.tab) {
            setActiveTab(payload.tab);
          } else if (action === 'open_modal') {
            if (payload?.modal === 'broadcast') setBroadcastModal('new');
            else if (payload?.modal === 'new_client') setShowModal(true);
          } else if (action === 'apply_filter' && payload?.filter) {
            setActiveTab('clients');
            setFinancialFilter(payload.filter);
          }
        }}
      />
    </div>
  );
};

export default AdminPanel;
