/**
 * Breakr UI Primitives
 * Componentes base compartilhados — usar SEMPRE em vez de copy-paste de divs/botões.
 *
 * Adicionado em 2026-04-27 antes da Fase 0 do BPO Financeiro.
 * Doc: [[Breakr V2.0 - Plano de Acao BPO Financeiro]]
 */

import { useEffect } from 'react';

// ============================================================================
// MODAL
// ============================================================================

/**
 * Modal compartilhado. Substitui os 10 modais copy-paste atuais.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} title
 * @param {string} subtitle (opcional)
 * @param {ReactNode} children
 * @param {ReactNode} footer (opcional, fica fixo no rodapé)
 * @param {'sm' | 'md' | 'lg' | 'xl'} size (default md)
 * @param {boolean} mobileSheet — em mobile vira bottom sheet (default true)
 * @param {boolean} closeOnBackdrop (default true)
 */
export const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  mobileSheet = true,
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size] || 'max-w-lg';

  const containerAlignment = mobileSheet
    ? 'flex items-end md:items-center justify-center'
    : 'flex items-center justify-center';

  const containerRadius = mobileSheet
    ? 'rounded-t-3xl md:rounded-3xl'
    : 'rounded-3xl';

  return (
    <div
      className={`fixed inset-0 z-50 ${containerAlignment} bg-overlay backdrop-blur-sm p-0 md:p-4`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`w-full ${sizeClass} bg-bg-card border border-border-strong ${containerRadius} flex flex-col max-h-[95vh]`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Mobile drag handle */}
        {mobileSheet && (
          <div className="md:hidden w-10 h-1 bg-border rounded-full mx-auto mt-2 mb-1" />
        )}

        {/* Header */}
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-border shrink-0">
            <div className="min-w-0">
              {title && (
                <h2 id="modal-title" className="text-base font-bold text-text-strong">{title}</h2>
              )}
              {subtitle && (
                <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-input hover:bg-bg-input-hover transition-colors shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-5 pt-3 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// BUTTON
// ============================================================================

/**
 * Botão padronizado.
 *
 * @param {'primary' | 'secondary' | 'ghost' | 'danger' | 'link'} variant
 * @param {'sm' | 'md' | 'lg'} size
 * @param {boolean} loading
 * @param {boolean} disabled
 * @param {ReactNode} icon (opcional, à esquerda)
 * @param {ReactNode} iconRight (opcional)
 */
export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  className = '',
  children,
  ...rest
}) => {
  const variantClass = {
    primary: 'bg-brand text-black hover:bg-brand-hover',
    secondary: 'bg-bg-input border border-border text-text-strong hover:bg-bg-input-hover',
    ghost: 'text-text-muted hover:text-text-strong hover:bg-bg-input',
    danger: 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20',
    link: 'text-brand hover:text-brand-hover underline-offset-2 hover:underline',
  }[variant] || '';

  const sizeClass = {
    sm: 'px-2.5 py-1 text-xs gap-1',
    md: 'px-4 py-2 text-sm gap-1.5',
    lg: 'px-5 py-3 text-base gap-2',
  }[size] || 'px-4 py-2 text-sm gap-1.5';

  const radiusClass = variant === 'link' ? '' : 'rounded-md';
  const fontClass = variant === 'primary' ? 'font-bold' : 'font-medium';
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center ${sizeClass} ${variantClass} ${radiusClass} ${fontClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {loading && (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {!loading && icon}
      {children}
      {!loading && iconRight}
    </button>
  );
};

// ============================================================================
// CARD
// ============================================================================

/**
 * Card padrão (bg + border + radius). Substitui `bg-[#1B1B1D] border border-[#2F2F31] rounded-[16px]`.
 */
export const Card = ({ className = '', children, padded = true, hoverable = false, ...rest }) => (
  <div
    className={`bg-bg-card border border-border-strong rounded-2xl ${padded ? 'p-4' : ''} ${hoverable ? 'hover:border-brand/40 transition-colors cursor-pointer' : ''} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

// ============================================================================
// INPUT
// ============================================================================

/**
 * Input padrão com label, helper e error.
 *
 * @param {string} label
 * @param {string} value
 * @param {(v: string) => void} onChange — recebe string direto (não event)
 * @param {string} placeholder
 * @param {string} error (opcional)
 * @param {string} helper (opcional)
 * @param {ReactNode} icon (à esquerda)
 * @param {string} type (default text)
 */
export const Input = ({
  label,
  value,
  onChange,
  placeholder,
  error,
  helper,
  icon,
  type = 'text',
  required = false,
  disabled = false,
  className = '',
  ...rest
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-xs text-text-muted font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
    )}
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          {icon}
        </div>
      )}
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full bg-bg-input border ${error ? 'border-danger' : 'border-border'} rounded-md ${icon ? 'pl-9' : 'pl-3'} pr-3 py-2 text-sm text-text-strong placeholder:text-text-placeholder outline-none focus:border-border-focus disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        {...rest}
      />
    </div>
    {error && <span className="text-xs text-danger">{error}</span>}
    {!error && helper && <span className="text-xs text-text-subtle">{helper}</span>}
  </div>
);

// ============================================================================
// BADGE
// ============================================================================

/**
 * Badge / chip / status pill.
 *
 * @param {'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'} variant
 * @param {'xs' | 'sm' | 'md'} size
 */
export const Badge = ({ variant = 'default', size = 'sm', className = '', children, ...rest }) => {
  const variantClass = {
    default: 'bg-bg-input text-text-muted border-border',
    brand: 'bg-brand-soft text-brand border-brand/30',
    success: 'bg-success-soft text-success border-success/30',
    warning: 'bg-warning-soft text-warning border-warning/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
    info: 'bg-info-soft text-info border-info/30',
  }[variant] || '';

  const sizeClass = {
    xs: 'text-[9px] px-1.5 py-0.5',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size] || 'text-[10px] px-2 py-0.5';

  return (
    <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider rounded-full border ${variantClass} ${sizeClass} ${className}`} {...rest}>
      {children}
    </span>
  );
};

// ============================================================================
// EMPTY STATE
// ============================================================================

/**
 * Empty state — mostra quando lista vazia ou busca sem resultado.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
    {icon && (
      <div className="w-14 h-14 rounded-2xl bg-bg-input flex items-center justify-center mb-3 text-text-muted">
        {icon}
      </div>
    )}
    {title && <div className="text-sm font-medium text-text-strong mb-1">{title}</div>}
    {description && <div className="text-xs text-text-muted leading-relaxed max-w-sm">{description}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ============================================================================
// TOOLTIP (CSS-only, peer-hover)
// ============================================================================

/**
 * Tooltip simples por hover. Pra coisas mais complexas usa @floating-ui.
 */
export const Tooltip = ({ content, children, position = 'top', className = '' }) => {
  const positionClass = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position] || 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  return (
    <span className={`relative inline-flex group ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${positionClass} z-50 px-2 py-1 bg-bg-input border border-border-strong rounded-md text-xs text-text-strong whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl`}
      >
        {content}
      </span>
    </span>
  );
};

// ============================================================================
// TABLE — base pra listas de cadastros / lançamentos BPO
// ============================================================================

export const Table = ({ children, className = '' }) => (
  <div className={`bg-bg-card border border-border-strong rounded-2xl overflow-hidden ${className}`}>
    {/* overflow-x-auto pra scrollar tabela larga em vez de quebrar layout */}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">{children}</table>
    </div>
  </div>
);

export const Th = ({ children, className = '', align = 'left' }) => (
  <th className={`text-${align} text-[10px] uppercase tracking-wider font-semibold text-text-muted px-3 md:px-4 py-3 border-b border-border whitespace-nowrap ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = '', align = 'left' }) => (
  <td className={`text-${align} text-xs md:text-sm text-text px-3 md:px-4 py-3 border-b border-border-subtle ${className}`}>
    {children}
  </td>
);

export const Tr = ({ children, className = '', onClick }) => (
  <tr
    onClick={onClick}
    className={`${onClick ? 'cursor-pointer hover:bg-bg-input/40 transition-colors' : ''} ${className}`}
  >
    {children}
  </tr>
);
