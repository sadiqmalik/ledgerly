import React, { useEffect, useState } from 'react';
import ProjectList from './ProjectList';
import ProjectDetail from './ProjectDetail';

const parse = () => {
  const m = /^#\/projects\/([^/?]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function Projects() {
  const [id, setId] = useState(parse);
  useEffect(() => {
    const on = () => setId(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return id ? <ProjectDetail key={id} id={id} /> : <ProjectList />;
}
