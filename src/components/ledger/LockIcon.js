import React from 'react';

// Small padlock for rows and chips dated in a closed year.
export default function LockIcon({ year, className = '' }) {
  const text = `Year ${year} is closed`;
  return (
    <svg role="img" aria-label={text} viewBox="0 0 16 16" width="12" height="12" className={`inline-block shrink-0 text-muted-foreground ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <title>{text}</title>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}
