//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';
import ReactDOM from 'react-dom';
import './setupCSP';
import '@patternfly/react-core/dist/styles/base.css';
import './border.css';
import './ascender.css';

import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('app') || document.createElement('div')
);
