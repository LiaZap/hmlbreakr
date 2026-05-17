/**
 * CommandPalette — Item 5.1: Cmd+K Global Search
 *
 * Paleta de comandos global do painel admin Breakr — inspirada em Linear, Notion, GitHub.
 * Aberta via Cmd+K (Mac) ou Ctrl+K (Win/Linux), permite buscar e executar
 * ações de qualquer lugar do painel sem precisar navegar manualmente.
 *
 * Categorias:
 *  - Clientes        → matched por nome/email com scoring (starts-with > contains)
 *  - Ações rápidas   → comandos pré-definidos (filtros, modais, exports)
 *  - Páginas         → tabs do AdminPanel (dashboard, clientes, comercial, comunicados)
 *  - Insights        → atalhos contextuais quando a query menciona termos-chave
 *
 * Props:
 *  - clients   : array de clientes carregados no AdminPanel
 *  - adminRole : papel atual (filtra ações que requerem permissão)
 *  - onAction  : callback (action, payload) => void — pai roteia o comando
 *  - open      : (opcional) controle externo do estado aberto/fechado
 *  - onClose   : (opcional) callback quando paleta fecha
 *
 * Keyboard:
 *  - Cmd/Ctrl+K  abre/fecha
 *  - ↑↓          navega entre resultados
 *  - Enter       executa selecionado
 *  - Esc         fecha
 *
 * Pure UI: o componente não navega/modifica estado global — só dispara onAction.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars

// ─────────────── Helpers ───────────────
const norm = (s) => String(s || '').toLowerCase().trim();

const scoreClient = (client, q) => {
  if (!q) return 0;
  const name = norm(client.name);
  const email = norm(client.data?.user?.email || client.email);
  const cuisine = norm(client.data?.identity?.cuisineType || client.data?.identity?.businessType);
  if (!name && !email) return -1;
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800;
  if (name.includes(q)) return 600;
  if (email.startsWith(q)) return 500;
  if (email.includes(q)) return 300;
  if (cuisine.includes(q)) return 150;
  return -1;
};

const matches = (label, q) => {
  if (!q) return true;
  return norm(label).includes(q);
};

// Avatar (inicial) para clientes sem logo
const Avatar = ({ client }) => {
  const logo = client.data?.identity?.logoUrl || client.data?.user?.photo;
  const initial = (client.name || '?').charAt(0).toUpperCase();
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-white/10"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold bg-gradient-to-br from-orange-500/30 to-orange-700/20 text-orange-200 border border-orange-500/20">
      {initial}
    </div>
  );
};

// ─────────────── Static commands ───────────────
const PAGES = [
  { id: 'page-dashboard',   label: 'Aba Dashboard',   icon: '📊', tab: 'dashboard'  },
  { id: 'page-clients',     label: 'Aba Clientes',    icon: '📁', tab: 'clients'    },
  { id: 'page-commercial',  label: 'Aba Comercial',   icon: '📈', tab: 'commercial' },
  { id: 'page-broadcasts',  label: 'Aba Comunicados', icon: '📢', tab: 'broadcasts' },
  { id: 'page-financial',   label: 'Aba Financeiro',  icon: '💰', tab: 'financial', roles: ['super_admin', 'admin', 'financial'] },
];

const QUICK_ACTIONS = [
  { id: 'act-risk',          label: 'Ver clientes em risco',           icon: '⚠️',  action: 'apply_filter',    payload: { tab: 'clients', filter: 'risk'      } },
  { id: 'act-top10',         label: 'Top 10 mais lucrativos',          icon: '🏆',  action: 'apply_filter',    payload: { tab: 'clients', filter: 'top10'     } },
  { id: 'act-export-month',  label: 'Exportar relatório do mês',       icon: '📤',  action: 'trigger_export',  payload: { type: 'monthly_report'              } },
  { id: 'act-broadcast',     label: 'Enviar broadcast (novo)',         icon: '📣',  action: 'open_modal',      payload: { modal: 'broadcast_new'              }, roles: ['super_admin', 'admin'] },
  { id: 'act-new-client',    label: 'Adicionar novo cliente',          icon: '➕',  action: 'open_modal',      payload: { modal: 'new_client'                 }, roles: ['super_admin', 'admin'] },
  { id: 'act-inactive',      label: 'Clientes inativos (30+ dias)',    icon: '😴',  action: 'apply_filter',    payload: { tab: 'clients', filter: 'inactive'  } },
  { id: 'act-no-revenue',    label: 'Clientes sem receita cadastrada', icon: '🚫',  action: 'apply_filter',    payload: { tab: 'clients', filter: 'no_revenue'} },
  { id: 'act-cf-high',       label: 'Custo fixo acima da média',       icon: '🔥',  action: 'apply_filter',    payload: { tab: 'clients', filter: 'cf_high'   } },
  { id: 'act-margin-hunter', label: 'Abrir Caçador de Margem',         icon: '🎯',  action: 'open_modal',      payload: { modal: 'margin_hunter'              } },
  { id: 'act-dre',           label: 'DRE consolidada do portfólio',    icon: '📑',  action: 'open_modal',      payload: { modal: 'portfolio_dre'              } },
];

// Insights são sugestões contextuais quando a query bate em palavras-chave
// — disparam para a mesma quick action, mas com label dinâmico do termo buscado
const INSIGHT_KEYWORDS = [
  { kw: ['lucro', 'lucrativ', 'faturament'], action: 'apply_filter', payload: { tab: 'clients', filter: 'top10' },     icon: '💎', tpl: (q) => `Top lucrativos relacionados a "${q}"` },
  { kw: ['margem', 'margens'],               action: 'open_modal',   payload: { modal: 'margin_hunter' },                icon: '🎯', tpl: ()  => `Abrir Caçador de Margem`                   },
  { kw: ['risco', 'churn', 'inativ'],        action: 'apply_filter', payload: { tab: 'clients', filter: 'risk' },        icon: '⚠️', tpl: ()  => `Listar clientes em risco`                   },
  { kw: ['ficha', 'fichas'],                 action: 'search_global',payload: { scope: 'fichas' },                       icon: '🔍', tpl: (q) => `Buscar fichas com "${q}" no nome`           },
  { kw: ['insumo', 'insumos'],               action: 'search_global',payload: { scope: 'insumos' },                      icon: '💎', tpl: (q) => `Insumos relacionados a "${q}"`              },
  { kw: ['pizza','hamburg','sushi','japones','massa','pasta','doce','cafe','saud','vegano','marmita'],
    action: 'search_global', payload: { scope: 'cuisine' },          icon: '⚡', tpl: (q) => `Comparar margens entre clientes que fazem ${q}` },
  { kw: ['cardapio', 'cardápio', 'menu'],    action: 'search_global',payload: { scope: 'menu' },                         icon: '📊', tpl: (q) => `Ver clientes com "${q}" no cardápio`        },
];

// ─────────────── Component ───────────────
const CommandPalette = ({
  clients = [],
  adminRole = 'admin',
  onAction = () => {},
  open: openProp,
  onClose,
}) => {
  // Suporta controle externo (open prop) OU interno (estado local)
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof openProp === 'boolean';
  const open = isControlled ? openProp : internalOpen;

  const close = () => {
    if (!isControlled) setInternalOpen(false);
    if (onClose) onClose();
  };
  const openPalette = () => {
    if (!isControlled) setInternalOpen(true);
  };

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ─────────── Atalho global Cmd/Ctrl+K ───────────
  useEffect(() => {
    const onKeyDown = (e) => {
      // Abrir/fechar com Cmd+K ou Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) {
          close();
        } else {
          openPalette();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isControlled]);

  // ─────────── Foco automático no input ao abrir ───────────
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Aguarda render do modal
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ─────────── Filtra ações por role ───────────
  const allowedAction = (item) => {
    if (!item.roles) return true;
    return item.roles.includes(adminRole);
  };

  // ─────────── Resultados ───────────
  const results = useMemo(() => {
    const q = norm(query);

    // Clientes — top 6 por score
    const clientResults = clients
      .map((c) => ({ client: c, score: scoreClient(c, q) }))
      .filter((r) => r.score > 0 || (!q && true))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ client }) => ({
        kind: 'client',
        id: `client-${client.id || client.hash}`,
        client,
      }));

    // Ações rápidas — filtra por role e por substring
    const actionResults = QUICK_ACTIONS
      .filter(allowedAction)
      .filter((a) => matches(a.label, q))
      .slice(0, 6)
      .map((a) => ({ kind: 'action', id: a.id, ...a }));

    // Páginas — filtra por role e por substring
    const pageResults = PAGES
      .filter(allowedAction)
      .filter((p) => matches(p.label, q))
      .map((p) => ({ kind: 'page', id: p.id, ...p }));

    // Insights — só quando há query, e apenas se bate em palavra-chave
    const insightResults = !q ? [] : INSIGHT_KEYWORDS
      .filter((ins) => ins.kw.some((k) => q.includes(k)))
      .slice(0, 4)
      .map((ins, i) => ({
        kind: 'insight',
        id: `insight-${i}`,
        label: ins.tpl(query),
        icon: ins.icon,
        action: ins.action,
        payload: { ...ins.payload, q: query },
      }));

    return { clientResults, actionResults, pageResults, insightResults };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, clients, adminRole]);

  // Lista flat (na ordem de exibição) para navegação por teclado
  const flatList = useMemo(() => [
    ...results.clientResults,
    ...results.insightResults,
    ...results.actionResults,
    ...results.pageResults,
  ], [results]);

  const totalCount = flatList.length;

  // Reseta cursor quando results mudam
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // ─────────── Executa item selecionado ───────────
  const execute = (item) => {
    if (!item) return;
    if (item.kind === 'client') {
      onAction('open_client', { hash: item.client.hash, id: item.client.id, client: item.client });
    } else if (item.kind === 'action' || item.kind === 'insight') {
      onAction(item.action, item.payload);
    } else if (item.kind === 'page') {
      onAction('navigate', { tab: item.tab });
    }
    close();
  };

  // ─────────── Keyboard dentro do modal ───────────
  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (totalCount === 0 ? 0 : (i + 1) % totalCount));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (totalCount === 0 ? 0 : (i - 1 + totalCount) % totalCount));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatList[activeIdx];
      if (item) execute(item);
    }
  };

  // ─────────── Scroll item ativo into view ───────────
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  // ─────────── Render helpers ───────────
  const SectionHeader = ({ children, count }) => (
    <div className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase text-white/40 flex items-center justify-between">
      <span>{children}</span>
      {typeof count === 'number' && <span className="text-white/30">({count})</span>}
    </div>
  );

  const renderItem = (item, idx) => {
    const active = idx === activeIdx;
    const baseCls = `flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-sm ${
      active ? 'bg-orange-500/20 text-white' : 'text-white/85 hover:bg-white/5'
    }`;

    if (item.kind === 'client') {
      const cuisine = item.client.data?.identity?.cuisineType
                   || item.client.data?.identity?.businessType
                   || '—';
      return (
        <div
          key={item.id}
          data-idx={idx}
          className={baseCls}
          onClick={() => execute(item)}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <Avatar client={item.client} />
          <span className="flex-1 truncate font-medium">{item.client.name || 'Sem nome'}</span>
          <span className="text-xs text-white/40 flex-shrink-0 ml-2 truncate max-w-[90px] sm:max-w-[150px]">{cuisine}</span>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        data-idx={idx}
        className={baseCls}
        onClick={() => execute(item)}
        onMouseEnter={() => setActiveIdx(idx)}
      >
        <span className="text-base flex-shrink-0 w-7 text-center">{item.icon}</span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.kind === 'insight' && (
          <span className="text-[10px] text-orange-300/70 uppercase tracking-wider flex-shrink-0">Insight</span>
        )}
      </div>
    );
  };

  // Rastreia índice acumulado conforme renderizamos as seções
  let cursor = -1;
  const nextIdx = () => { cursor += 1; return cursor; };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmdk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            key="cmdk-modal"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-[92vw] sm:max-w-[600px] bg-[#1a1d23] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Paleta de comandos"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <span className="text-white/40 text-xs font-bold tracking-wide select-none">⌘K</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar clientes, ações, páginas..."
                className="flex-1 bg-transparent outline-none text-white placeholder-white/30 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="text-white/40 hover:text-white text-xs px-2 py-1 rounded"
                  aria-label="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Results list */}
            <div ref={listRef} className="flex-1 overflow-y-auto max-h-[55vh] py-1">
              {totalCount === 0 && (
                <div className="px-4 py-10 text-center text-white/40 text-sm">
                  Nenhum resultado para <span className="text-white/60">&ldquo;{query}&rdquo;</span>
                </div>
              )}

              {results.clientResults.length > 0 && (
                <>
                  <SectionHeader count={results.clientResults.length}>Clientes</SectionHeader>
                  {results.clientResults.map((it) => renderItem(it, nextIdx()))}
                </>
              )}

              {results.insightResults.length > 0 && (
                <>
                  <SectionHeader count={results.insightResults.length}>Insights</SectionHeader>
                  {results.insightResults.map((it) => renderItem(it, nextIdx()))}
                </>
              )}

              {results.actionResults.length > 0 && (
                <>
                  <SectionHeader count={results.actionResults.length}>
                    {query ? 'Ações' : 'Ações sugeridas'}
                  </SectionHeader>
                  {results.actionResults.map((it) => renderItem(it, nextIdx()))}
                </>
              )}

              {results.pageResults.length > 0 && (
                <>
                  <SectionHeader count={results.pageResults.length}>Páginas</SectionHeader>
                  {results.pageResults.map((it) => renderItem(it, nextIdx()))}
                </>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-white/10 bg-black/20 text-[11px] text-white/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60">↑↓</kbd> navegar</span>
                <span><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60">Enter</kbd> selecionar</span>
                <span><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60">Esc</kbd> fechar</span>
              </div>
              <span className="text-orange-400/60">Breakr ⚡</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
