const isDebugMode = (): boolean => {
  if (typeof window !== "undefined") {
    // Make it server-side compatible.
    if (
      window.location.hash.includes("debug") ||
      window.location.hostname === "localhost"
    ) {
      return true;
    }

    try {
      return window.localStorage.getItem("isDebug") !== null;
    } catch {
      // Debug logging must never prevent the storage-error UI from rendering.
      return false;
    }
  }
  return false;
};
export const debugLogger = (...messages: any[]): void => {
  if (isDebugMode()) {
    console.log(...messages);
  }
};
