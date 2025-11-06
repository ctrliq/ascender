//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';
import ReactDOM from 'react-dom';
import './setupCSP';
import '@patternfly/react-core/dist/styles/base.css';
import './patternfly-overrides.css';
import './border.css';
import '@ctrliq/quantic-tokens/dark-mode.css';
import { inter, satoshi } from '@ctrliq/quantic-fonts';

import App from './App';

satoshi.inject({
  weights: [300, 400, 500, 600],
  styles: ['normal', 'italic'],
});
inter.inject({
  weights: [400, 500, 600],
  styles: ['normal', 'italic'],
});

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('app') || document.createElement('div')
);
