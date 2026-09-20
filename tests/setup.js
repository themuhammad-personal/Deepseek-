import { afterEach, beforeEach, vi } from "vitest";
import { installChromeMock, resetChromeMock } from "./mocks/chrome.js";

installChromeMock();

if (!globalThis.crypto?.randomUUID) {
  const { webcrypto } = await import("node:crypto");
  globalThis.crypto = webcrypto;
}

if (!globalThis.atob) {
  globalThis.atob = (value) => Buffer.from(String(value), "base64").toString("binary");
}

if (!globalThis.btoa) {
  globalThis.btoa = (value) => Buffer.from(String(value), "binary").toString("base64");
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
}

if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!globalThis.location) {
  globalThis.location = new URL("https://chat.deepseek.com/");
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(el) {
      this.callback([{ isIntersecting: true, target: el }]);
    }
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== "undefined") {
  window.confirm = vi.fn(() => true);
} else if (!globalThis.confirm) {
  globalThis.confirm = vi.fn(() => true);
}

if (!globalThis.DataTransfer) {
  globalThis.DataTransfer = class {
    constructor() {
      const files = [];
      this.items = {
        add(file) {
          files.push(file);
        },
      };
      Object.defineProperty(this, "files", {
        get() {
          return files;
        },
      });
    }
  };
}

if (!globalThis.SpeechSynthesisUtterance) {
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.voice = null;
    }
  };
}

const mockGradient = {
  addColorStop: () => {},
};

const mockCtx = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4) }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
  createRadialGradient: () => mockGradient,
  createLinearGradient: () => mockGradient,
};

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function () {
    return mockCtx;
  };
}

if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
  navigator.mediaDevices = {
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => [{ stop: () => {} }],
      }),
  };
}

if (typeof globalThis.AudioContext === "undefined") {
  globalThis.AudioContext = class {
    createAnalyser() {
      return {
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: (arr) => arr.fill(0),
        getByteTimeDomainData: (arr) => arr.fill(128),
        connect: () => {},
        disconnect: () => {},
      };
    }
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    close() {
      return Promise.resolve();
    }
  };
}

beforeEach(() => {
  resetChromeMock();
  vi.useRealTimers();
});

afterEach(() => {
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  }
  if (typeof window !== "undefined") {
    if ("localStorage" in window) {
      window.localStorage?.clear?.();
      window.sessionStorage?.clear?.();
    }
    if (window.history && typeof window.history.replaceState === "function") {
      try {
        window.history.replaceState(null, "", "/");
      } catch {}
    }
  }
  if (typeof globalThis.gc === "function") {
    try {
      globalThis.gc();
    } catch {}
  }
});

