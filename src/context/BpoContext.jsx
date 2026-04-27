/**
 * BpoContext — estado compartilhado do módulo BPO Financeiro
 * - Cliente atual selecionado pelo operador
 * - Cache leve de cadastros (atualiza ao salvar)
 *
 * Adicionado em 2026-04-27.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const BpoContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || '';

export const BpoProvider = ({ children }) => {
  const [bpoClients, setBpoClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(() => {
    try {
      const saved = localStorage.getItem('bpo_selected_client');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  // Persist seleção em localStorage
  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem('bpo_selected_client', JSON.stringify(selectedClient));
    } else {
      localStorage.removeItem('bpo_selected_client');
    }
  }, [selectedClient]);

  const fetchBpoClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/bpo/admin/bpo-clients`);
      if (!res.ok) throw new Error('Falha ao listar clientes BPO');
      const data = await res.json();
      setBpoClients(data);
      // Auto-seleciona primeiro APENAS se não houver seleção válida (BUG #5: respeita localStorage)
      setSelectedClient((current) => {
        if (current && data.find((c) => c.id === current.id || c.hash === current.hash)) {
          return current; // mantém o que estava no localStorage
        }
        return data.length > 0 ? data[0] : null;
      });
      return data;
    } catch (err) {
      console.error('[BpoContext]', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleBpoForClient = useCallback(async (clientHash, enabled) => {
    const res = await fetch(`${API_URL}/api/bpo/admin/clients/${clientHash}/bpo-toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Falha ao ativar/desativar BPO');
    await fetchBpoClients();
    return res.json();
  }, [fetchBpoClients]);

  // Helper pra montar URL do cliente atual
  // BUG #1 FIX: retorna null em vez de throw se sem cliente. Componentes devem checar.
  const bpoUrl = useCallback((path) => {
    if (!selectedClient) return null;
    return `${API_URL}/api/bpo/${selectedClient.hash}${path.startsWith('/') ? '' : '/'}${path}`;
  }, [selectedClient]);

  return (
    <BpoContext.Provider value={{
      bpoClients,
      selectedClient,
      setSelectedClient,
      loading,
      fetchBpoClients,
      toggleBpoForClient,
      bpoUrl,
    }}>
      {children}
    </BpoContext.Provider>
  );
};

export const useBpo = () => {
  const ctx = useContext(BpoContext);
  if (!ctx) throw new Error('useBpo deve ser usado dentro de <BpoProvider>');
  return ctx;
};
