/**
 * useBpoList — hook reusável pra listas BPO
 * Padroniza: fetch + loading + error + retry
 *
 * Uso:
 *   const { items, loading, error, refresh } = useBpoList('/suppliers');
 *   if (error) return <ErrorBanner message={error} onRetry={refresh} />;
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../context/BpoContext';

export const useBpoList = (path, deps = []) => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const url = bpoUrl(path);
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}: ${res.statusText}`);
      }
      const responseData = await res.json();
      setData(responseData);
      setItems(responseData.items || []);
    } catch (err) {
      console.error(`[useBpoList ${path}]`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpoUrl, selectedClient, path, ...deps]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return { items, data, loading, error, refresh: fetchItems };
};
