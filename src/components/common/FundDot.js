import React from 'react';

export default function FundDot({ color }) {
  if (!color) return null;
  return <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />;
}
