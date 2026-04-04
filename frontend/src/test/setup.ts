import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for Ant Design
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill matchMedia for Ant Design
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Suppress Ant Design deprecation warnings in tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0]);
  if (msg.includes("deprecated") || msg.includes("antd")) return;
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const msg = String(args[0]);
  if (msg.includes("act(...)") || msg.includes("not wrapped")) return;
  originalError(...args);
};

// Polyfill speechSynthesis for SpeakButton
global.SpeechSynthesisUtterance = class {
  text = "";
  lang = "";
  rate = 1;
  constructor(text?: string) { this.text = text || ""; }
} as unknown as typeof SpeechSynthesisUtterance;

Object.defineProperty(window, "speechSynthesis", {
  writable: true,
  value: {
    speak: () => {},
    cancel: () => {},
  },
});
