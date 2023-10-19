import "./globals.css";
import type { AppProps } from "next/app";
import type { ReactElement } from "react";
import { useEffect } from "react";
import ReactGA from "react-ga4";
import { debugLogger } from "@/lib/debugLogger";

declare global {
  interface Window {
    GA_INITIALIZED: boolean;
  }
}

function trackPageView() {
  if (typeof window !== "undefined") {
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      return;
    }
    if (!window.GA_INITIALIZED) {
      ReactGA.initialize("UA-58806132-1");
      window.GA_INITIALIZED = true;
      debugLogger("init GA");
    }
    ReactGA.send("pageview");
  }
}

export default function App({ Component, pageProps }: AppProps): ReactElement {
  useEffect(() => {
    trackPageView();
  });
  return <Component {...pageProps} />;
}
