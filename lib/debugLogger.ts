const isDebugMode = (): boolean => {
  return true;
  // if (typeof window !== "undefined") {
  //   return window.location.hash.includes("debug");
  // }
  // return false;
};
export const debugLogger = (...messages: any[]): void => {
  if (isDebugMode()) {
    console.log(...messages);
  }
};
