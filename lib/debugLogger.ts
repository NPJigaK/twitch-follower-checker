const isDebugMode = (): boolean => window.location.hash.includes("debug");

export const debugLogger = (...messages: any[]): void => {
  if (isDebugMode()) {
    console.log(...messages);
  }
};
