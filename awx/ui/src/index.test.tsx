import React from 'react';
import App from './App';

const mockRender = vi.fn();
vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: mockRender })),
}));
vi.mock('util/webWorker', () => ({ default: vi.fn() }));

describe('index.jsx', () => {
  it('renders ok', async () => {
    const { createRoot } = await import('react-dom/client');
    const div = document.createElement('div');
    div.setAttribute('id', 'app');
    document.body.appendChild(div);
    await import('.');
    expect(createRoot).toHaveBeenCalledWith(div);
    expect(mockRender).toHaveBeenCalledWith(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
});
