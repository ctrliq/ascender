//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';
import { createRoot } from 'react-dom/client';
import './setupCSP';
import '@patternfly/react-core/dist/styles/base.css';
import './border.css';
import './ascender.css';

import App from './App';

const container = document.getElementById('app') || (() => {
  const el = document.createElement('div');
  el.id = 'app';
  document.body.appendChild(el);
  return el;
})();
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/service-worker.js`)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Service worker registration failed:', err);
      });
  });
}
