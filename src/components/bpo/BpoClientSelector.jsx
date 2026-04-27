/**
 * BpoClientSelector — dropdown que o operador BPO usa pra escolher
 * qual cliente vai trabalhar (item 0 da spec V2.0).
 */

import { useState, useRef, useEffect } from 'react';
import { useBpo } from '../../context/BpoContext';

const BpoClientSelector = () => {
  const { bpoClients, selectedClient, setSelectedClient } = useBpo();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = bpoClients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-input border border-border hover:border-border-focus transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-brand text-black flex items-center justify-center text-[10px] font-bold">
          {selectedClient?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <span className="text-sm text-text-strong font-medium max-w-[200px] truncate">
          {selectedClient?.name || 'Selecionar cliente'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-text-muted">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] bg-bg-card border border-border-strong rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              autoFocus
              className="w-full bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text-strong placeholder:text-text-placeholder outline-none focus:border-border-focus"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">Nenhum cliente encontrado</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-bg-input/50 transition-colors ${
                    selectedClient?.id === c.id ? 'bg-bg-input' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-bg-input flex items-center justify-center text-xs font-bold text-text-strong shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-strong font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-text-subtle">
                      BPO desde {c.bpoActivatedAt ? new Date(c.bpoActivatedAt).toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>
                  {selectedClient?.id === c.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BpoClientSelector;
