/**
 * SectionHeader — cabecalho padronizado das secoes de configuracoes.
 *
 * Em mobile (<640px), titulo+descricao e acao empilham (acao abaixo).
 * Em sm+ ficam lado-a-lado com justify-between.
 */
const SectionHeader = ({ title, description, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-5">
    <div className="min-w-0 flex-1">
      <h2 className="text-[18px] font-bold text-white leading-tight">{title}</h2>
      {description && (
        <p className="text-[12px] text-[#868686] mt-1 leading-relaxed">{description}</p>
      )}
    </div>
    {action && <div className="shrink-0 mt-2 sm:mt-0">{action}</div>}
  </div>
);

export default SectionHeader;
