import { debugLogger } from "./debugLogger";

declare global {
  interface Window {
    dataLayer: Record<string, any>[];
  }
}

export const GTM_ID = "GTM-NDPCVWBM";

export const pageview = (url: string): void => {
  debugLogger(`Logging pageview for ${url}`);
  window.dataLayer.push({
    event: "pageview",
    page: url,
  });
};
