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
      // Auto-seleciona primeiro se não houver seleção
      if (!selectedClient && data.length > 0) {
        setSelectedClient(data[0]);
      }
      return data;
    } catch (err) {
      console.error('[BpoContext]', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [selectedClient]);

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
  const bpoUrl = useCallback((path) => {
    if (!selectedClient) throw new Error('Nenhum cliente BPO selecionado');
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
