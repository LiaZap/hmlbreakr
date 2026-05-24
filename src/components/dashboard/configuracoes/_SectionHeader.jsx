/**
 * SectionHeader — cabecalho padronizado das secoes de configuracoes.
 */
const SectionHeader = ({ title, description, action }) => (
  <div className="flex items-start justify-between gap-4 mb-5">
    <div className="min-w-0 flex-1">
      <h2 className="text-[18px] font-bold text-white leading-tight">{title}</h2>
      {description && (
        <p className="text-[12px] text-[#868686] mt-1 leading-relaxed">{description}</p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default SectionHeader;
