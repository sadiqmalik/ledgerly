import React from 'react';
import Donut, { PALETTE } from './Donut';
import BarChart from './BarChart';
import ColumnGraph from './ColumnGraph';

export { PALETTE };

// view: 'pie', 'bars' or 'graph'. The caller only renders it when the view is not 'list'.
export default function Chart({ view, ...props }) {
  if (view === 'bars') return <BarChart {...props} />;
  if (view === 'graph') return <ColumnGraph {...props} />;
  return <Donut {...props} />;
}
