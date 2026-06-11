/**
 * EditingConflictModal — aviso quando outra sessao editou o cliente.
 *
 * Comportamento NAO BLOQUEANTE:
 *   - Aparece como toast/modal flutuante (nao trava o app)
 *   - Usuario pode "Recarregar" (perde mudancas locais nao salvas) ou
 *     "Continuar mesmo assim" (ignora e segue editando — risco de
 *     sobrescrita).
 *   - O wipe-guard no backend continua protegendo listas (fichas/insumos/
 *     menuEngineering) — o modal e a ULTIMA camada de protecao na UX.
 */
import React from 'react';

const fmtTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const EditingConflictModal = ({ conflict, onDismiss, onReload }) => {
  if (!conflict) return null;
  const editor = conflict.editor || {};
  const editorLabel = editor.label || 'outra sessão';
  const editorAt = fmtTime(editor.at);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 font-jakarta pointer-events-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-auto" />
      <div className="relative w-full max-w-md bg-[#1B1B1D] border border-[#F5A623]/40 rounded-[16px] shadow-2xl overflow-hidden pointer-events-auto">
        {/* Header laranja de alerta */}
        <div className="bg-[#F5A623]/10 border-b border-[#F5A623]/30 px-5 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#F5A623]/20 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[#F5A623] leading-tight">Atenção: edição concorrente</h2>
            <p className="text-[11px] text-[#FFD789] mt-0.5">Outra sessão atualizou os dados deste cliente</p>
          </div>
        </div>

        <div className="p-5">
          <p className="text-[13px] text-[#CFCFCF] leading-relaxed mb-3">
            Detectamos que <strong className="text-white">{editorLabel}</strong> salvou alterações
            {editorAt && <> em <strong className="text-white">{editorAt}</strong></>}, depois que você abriu esta tela.
          </p>
          <p className="text-[12px] text-[#A0A0A0] leading-relaxed mb-4">
            Se você continuar editando e salvar, suas mudanças podem <strong className="text-[#F5A623]">sobrescrever
            o trabalho da outra pessoa</strong>. Recomendamos recarregar pra ver o estado mais recente antes de continuar.
          </p>

          <div className="bg-[#0F0F11] border border-[#2A2A2C] rounded-[10px] p-3 mb-4">
            <p className="text-[11px] text-[#7E7E7E] leading-snug">
              <strong className="text-[#CFCFCF]">Dica:</strong> Se você está editando em mais de uma aba do navegador,
              feche as abas extras e use só uma por vez pra evitar este aviso.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#252527] border border-white/[0.08] text-white text-[13px] font-semibold rounded-[10px] transition-colors"
              title="Vou ignorar o aviso e continuar editando — pode sobrescrever mudancas da outra sessao"
            >
              Continuar mesmo assim
            </button>
            <button
              type="button"
              onClick={onReload}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[13px] rounded-[10px] transition-colors flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Recarregar agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditingConflictModal;
