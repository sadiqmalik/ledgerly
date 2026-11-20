import React from 'react';
import { formatMoney } from '../../utils/money';
import MoneyInput from './MoneyInput';

const defaultRenderField = ({ id, label, children }) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    {children}
  </div>
);

export default function QuantityPriceFields({
  idPrefix,
  quantity,
  unitPrice,
  onQuantityChange,
  onUnitPriceChange,
  currency,
  totalMinor,
  disabled = false,
  inputClassName = '',
  layoutClassName = '',
  renderField = defaultRenderField,
  quantityRef,
  unitPriceRef,
  autoFocusField = '',
}) {
  const quantityId = `${idPrefix}-qty`;
  const unitPriceId = `${idPrefix}-unit-price`;
  const totalId = `${idPrefix}-total`;
  const totalText = totalMinor == null ? '' : formatMoney(totalMinor);
  const cls = inputClassName || undefined;

  return (
    <div className={layoutClassName}>
      {renderField({
        id: quantityId,
        label: 'Quantity',
        children: (
          <input
            id={quantityId}
            ref={quantityRef}
            className={cls}
            inputMode="decimal"
            value={quantity}
            onChange={e => onQuantityChange(e.target.value)}
            disabled={disabled}
            autoFocus={autoFocusField === 'quantity'}
            placeholder="1"
          />
        ),
      })}
      {renderField({
        id: unitPriceId,
        label: `Unit price${currency ? ` (${currency})` : ''}`,
        children: (
          <MoneyInput
            id={unitPriceId}
            ref={unitPriceRef}
            className={cls}
            value={unitPrice}
            onChange={onUnitPriceChange}
            disabled={disabled}
            autoFocus={autoFocusField === 'unitPrice'}
            placeholder="0.00"
          />
        ),
      })}
      {renderField({
        id: totalId,
        label: `Total${currency ? ` (${currency})` : ''}`,
        children: (
          <input
            id={totalId}
            className={cls}
            value={totalText}
            readOnly
            disabled={disabled}
            aria-readonly="true"
            placeholder="0.00"
          />
        ),
      })}
    </div>
  );
}
