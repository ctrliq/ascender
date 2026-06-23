import React from 'react';
import App from './App';

const mockRender = jest.fn();
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render: mockRender })),
}));
jest.mock('util/webWorker', () => jest.fn());

describe('index.jsx', () => {
  it('renders ok', () => {
    const { createRoot } = require('react-dom/client');
    const div = document.createElement('div');
    div.setAttribute('id', 'app');
    document.body.appendChild(div);
    require('./index.js'); // eslint-disable-line global-require
    expect(createRoot).toHaveBeenCalledWith(div);
    expect(mockRender).toHaveBeenCalledWith(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
});
