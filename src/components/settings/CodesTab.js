import React from 'react';
import AccessCodesPanel from '../admin/AccessCodesPanel';

// A ledger Admin's own access codes (view only codes for the ledgers they administer).
export default function CodesTab() {
  return <AccessCodesPanel scoped />;
}
