import React from 'react';

const FichaTecnicaPrint = ({ data }) => {
  if (!data) return null;

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 8mm; size: A4; }
          /* Hide everything in the app */
          body * { visibility: hidden; height: 0; overflow: hidden; margin: 0; padding: 0; }
          /* Show only the print container and its children */
          #ficha-print-container,
          #ficha-print-container * {
            visibility: visible !important;
            height: auto !important;
            overflow: visible !important;
          }
          #ficha-print-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            z-index: 99999 !important;
            background: white !important;
          }
        }
      `}</style>

      <div id="ficha-print-container" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div style={{ maxWidth: '194mm', margin: '0 auto', border: '1px solid black', fontFamily: 'Arial, sans-serif', fontSize: '9pt', color: 'black', background: 'white' }}>

          {/* Header */}
          <div style={{ background: '#D9D9D9', borderBottom: '1px solid black', padding: '6px 10px' }}>
            <h1 style={{ fontSize: '13pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
              FICHA TÉCNICA &ndash; {data.name}
            </h1>
          </div>

          {/* Info Gerais - inline compact */}
          <div style={{ borderBottom: '1px solid black', padding: '4px 8px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '8pt' }}>
            <span><strong>Categoria:</strong> {data.type}</span>
            <span><strong>Preparo:</strong> {data.tempoPreparo || '-'}</span>
            <span><strong>Rendimento:</strong> {data.rendimento}</span>
            <span><strong>Custo:</strong> {data.custoTotal}</span>
            {data.precoVenda && <span><strong>Preço Venda:</strong> {data.precoVenda}</span>}
            {data.utensilios && <span><strong>Utensílios:</strong> {data.utensilios}</span>}
          </div>

          {/* Photo & Ingredients side by side */}
          <div style={{ display: 'flex', borderBottom: '1px solid black', height: '200px' }}>
            {/* Photo */}
            <div style={{ width: '40%', borderRight: '1px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4px' }}>
              {data.fotoPrato ? (
                <img src={data.fotoPrato} alt="Prato" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: '#999', fontWeight: 'bold', textAlign: 'center' }}>FOTO DO PRATO</div>
              )}
            </div>

            {/* Ingredients Table */}
            <div style={{ width: '60%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: '#D9D9D9', padding: '3px', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid black', fontSize: '8pt' }}>
                INGREDIENTES E PORCIONAMENTO
              </div>
              <div style={{ display: 'flex', background: '#EFEFEF', borderBottom: '1px solid black', fontSize: '7pt', fontWeight: 'bold' }}>
                <div style={{ width: '40%', padding: '2px 4px', borderRight: '1px solid #ccc' }}>Ingrediente</div>
                <div style={{ width: '20%', padding: '2px 4px', borderRight: '1px solid #ccc', textAlign: 'center' }}>Qtd (PL)</div>
                <div style={{ width: '20%', padding: '2px 4px', borderRight: '1px solid #ccc', textAlign: 'center' }}>FC</div>
                <div style={{ width: '20%', padding: '2px 4px', textAlign: 'center' }}>Qtd (PB)</div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {data.ingredients && data.ingredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', borderBottom: '1px solid #ddd', fontSize: '7pt' }}>
                    <div style={{ width: '40%', padding: '1px 4px', borderRight: '1px solid #ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                    <div style={{ width: '20%', padding: '1px 4px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{ing.netQty || ing.qty}{ing.unit}</div>
                    <div style={{ width: '20%', padding: '1px 4px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{ing.fc || '1.00'}</div>
                    <div style={{ width: '20%', padding: '1px 4px', textAlign: 'center' }}>{ing.grossQty || ing.qty}{ing.unit}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Modo de Preparo */}
          <div style={{ borderBottom: '1px solid black' }}>
            <div style={{ background: '#D9D9D9', padding: '3px', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid black', fontSize: '8pt' }}>
              MODO DE PREPARO E MONTAGEM
            </div>
            <div style={{ padding: '4px 8px', fontSize: '8pt' }}>
              {data.modoPreparo && data.modoPreparo.length > 0 ? (
                data.modoPreparo.map((step, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>
                    <strong>{i + 1}.</strong> {step}
                  </div>
                ))
              ) : (
                <div style={{ color: '#999', fontStyle: 'italic' }}>Sem modo de preparo cadastrado.</div>
              )}
            </div>
          </div>

          {/* Finalização */}
          <div style={{ borderBottom: '1px solid black' }}>
            <div style={{ background: '#D9D9D9', padding: '3px', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid black', fontSize: '8pt' }}>
              PADRÃO DE FINALIZAÇÃO E SAÍDA
            </div>
            <div style={{ padding: '4px 8px', fontSize: '8pt', minHeight: '30px' }}>
              {data.finalizacao || <span style={{ color: '#999', fontStyle: 'italic' }}>Sem instruções de finalização.</span>}
            </div>
          </div>

          {/* Onboarding Checklist - compact */}
          <div>
            <div style={{ background: '#D9D9D9', padding: '3px', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid black', fontSize: '8pt' }}>
              ETAPAS DO ONBOARDING (TREINAMENTO)
            </div>
            <div style={{ display: 'flex', padding: '4px', gap: '4px' }}>
              {['1. TEÓRICA\nLeitura e Entendimento', '2. SHADOWING\nObservação da Execução', '3. PRÁTICA\nExecução Assistida', '4. VALIDAÇÃO\nAprovação Chef', '5. AUTONOMIA\nLiberado p/ Produção'].map((text, i) => {
                const [title, desc] = text.split('\n');
                return (
                  <div key={i} style={{ flex: 1, border: '1px solid black', padding: '4px', textAlign: 'center', fontSize: '6.5pt', borderRadius: '2px' }}>
                    <div style={{ fontWeight: 'bold' }}>{title}</div>
                    <div>{desc}</div>
                    <div style={{ width: '12px', height: '12px', border: '1px solid black', margin: '3px auto 0' }} />
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default FichaTecnicaPrint;
