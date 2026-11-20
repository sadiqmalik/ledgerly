import { useEffect, useState } from 'react';

const read = () => {
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  return path.startsWith('/') ? path : '/';
};

// Current hash route: '/', '/ledger' or '/settings'. No router library.
export default function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
