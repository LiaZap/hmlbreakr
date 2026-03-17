import MobileFieldInput from './MobileFieldInput';
import MobileDynamicList from './MobileDynamicList';

const MobileStepRenderer = ({ question, formData, onCompositeChange, onGroupChange, onAddItem, onRemoveItem, globalData }) => {
  if (!question) return null;

  if (question.type === 'composite') {
    const stepData = formData[question.id] || {};
    return (
      <div>
        {question.infoText && (
          <div className="mb-4 p-3 bg-[#F5A623]/10 rounded-[12px] border border-[#F5A623]/20">
            <p className="text-[12px] text-[#F5A623]">{question.infoText}</p>
          </div>
        )}
        {question.fields.map(field => (
          <MobileFieldInput
            key={field.id}
            field={field}
            value={stepData[field.id]}
            onChange={(fieldId, val, type) => onCompositeChange(question.id, fieldId, val, type)}
            allValues={stepData}
            globalData={globalData}
          />
        ))}
      </div>
    );
  }

  if (question.type === 'dynamic_list_calc') {
    const items = formData[question.id] || [];
    return (
      <div>
        {question.infoText && (
          <div className="mb-4 p-3 bg-[#F5A623]/10 rounded-[12px] border border-[#F5A623]/20">
            <p className="text-[12px] text-[#F5A623]">{question.infoText}</p>
          </div>
        )}
        <MobileDynamicList
          question={question}
          items={items}
          onAdd={onAddItem}
          onRemove={onRemoveItem}
          onItemChange={onGroupChange}
          globalData={globalData}
        />
      </div>
    );
  }

  return null;
};

export default MobileStepRenderer;
