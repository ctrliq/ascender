// Vite resolves these at build time; TypeScript needs telling they exist.
// Side-effect imports only, which is how the app uses every one of them.

declare module '*.css';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
