import assert from "node:assert/strict";
import test from "node:test";

import { debugLogger } from "../lib/debugLogger.ts";

test("blocked localStorage cannot make debug logging crash rendering", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalConsoleLog = console.log;
  let logCalls = 0;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hash: "", hostname: "example.com" },
      get localStorage() {
        throw new DOMException("Blocked", "SecurityError");
      },
    },
  });
  console.log = () => {
    logCalls += 1;
  };

  try {
    assert.doesNotThrow(() => debugLogger("render"));
    assert.equal(logCalls, 0);
  } finally {
    console.log = originalConsoleLog;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", originalWindow);
    }
  }
});
