const isDebugMode = (): boolean => {
  if (typeof window !== "undefined") {
    // Make it server-side compatible.
    return (
      window.location.hash.includes("debug") ||
      window.location.hostname === "localhost" ||
      localStorage.getItem("isDebug") != undefined
    );
  }
  return false;
};
export const debugLogger = (...messages: any[]): void => {
  if (isDebugMode()) {
    console.log(...messages);
  }
};
