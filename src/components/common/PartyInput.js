import React from 'react';
import ComboInput from './ComboInput';

// Free text with a searchable dropdown of the party list. A name that is not in the list is created on save.
export default function PartyInput({ value, onChange, parties, id, disabled }) {
  return <ComboInput id={id} value={value} onChange={onChange} items={parties} disabled={disabled} placeholder="Who paid / received" noun="party" />;
}
