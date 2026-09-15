//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';
import { createRoot } from 'react-dom/client';
import './setupCSP';
import '@patternfly/react-core/dist/styles/base.css';
import './border.css';

import App from './App';

const container =
  document.getElementById('app') ||
  (() => {
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
