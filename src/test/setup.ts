import '@testing-library/jest-dom/vitest';

(globalThis as typeof globalThis & { __APP_VERSION__?: string }).__APP_VERSION__ = 'test';
