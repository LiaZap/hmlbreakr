/**
 * useEditingConflictDetector — detecta edicao concorrente do Client.data.
 *
 * Como funciona:
 *   1. Ao montar (cliente abriu o app), salva o `dataVersion` carregado
 *      em memoria como `localVersion`.
 *   2. A cada 30s, faz GET /api/client/:hash/version (endpoint leve).
 *   3. Se a versao remota > localVersion E o lastEditor.at for posterior
 *      ao momento em que esse hook montou, significa que OUTRA sessao
 *      (outra aba, outro device, outro usuario) salvou no meio.
 *   4. Dispara o modal de aviso via callback `onConflict`.
 *
 * Apos o usuario aceitar (recarregar) ou cancelar, o hook reseta o
 * baseline pra evitar disparar de novo no mesmo conflito.
 *
 * Contexto: Pampa Entreveiro (10/06/2026) perdeu campos por causa de
 * multiplas abas/sessoes editando concorrentemente. Esse hook avisa
 * proativamente antes que sobrescrita silenciosa aconteca.
 */
import { useEffect, useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 30 * 1000; // 30s

export function useEditingConflictDetector(hash, currentDataVersion) {
  const [conflict, setConflict] = useState(null);
  const baselineRef = useRef({ version: currentDataVersion || 0, mountedAt: new Date() });
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!hash) return;
    // Reseta baseline quando a versao local muda (usuario salvou)
    baselineRef.current = { version: currentDataVersion || 0, mountedAt: baselineRef.current.mountedAt };
  }, [currentDataVersion, hash]);

  useEffect(() => {
    if (!hash) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/api/client/${hash}/version`, {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();

        const remoteVersion = Number(data.dataVersion) || 0;
        const baseline = baselineRef.current.version;
        const editor = data.lastEditor;

        // Houve save remoto novo desde que essa sessao montou?
        if (remoteVersion > baseline && editor) {
          const editorAt = editor.at ? new Date(editor.at) : null;
          if (editorAt && editorAt > baselineRef.current.mountedAt && !dismissedRef.current) {
            setConflict({
              remoteVersion,
              localVersion: baseline,
              editor,
            });
          }
        }
      } catch {
        /* ignora erros de rede */
      }
    };

    // Primeiro check apos 5s pra dar tempo do app carregar
    const firstTimeout = setTimeout(check, 5000);
    const interval = setInterval(check, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(firstTimeout);
      clearInterval(interval);
    };
  }, [hash]);

  const dismiss = () => {
    dismissedRef.current = true;
    setConflict(null);
  };

  const reload = () => {
    window.location.reload();
  };

  return { conflict, dismiss, reload };
}
