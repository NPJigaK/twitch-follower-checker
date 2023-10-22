import "./globals.css";
import type { AppProps } from "next/app";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import ReactGA from "react-ga4";
import { debugLogger } from "@/lib/debugLogger";

export const logPageView = () => {
  debugLogger(`Logging pageview for ${window.location.pathname}`);
  ReactGA.set({ page: window.location.pathname });
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
};

export const initGA = () => {
  debugLogger("init GA");
  ReactGA.initialize("G-EPBVRTSKFD");
};

export default function App({ Component, pageProps }: AppProps): ReactElement {
  const router = useRouter();

  useEffect(() => {
    if (window.location.hostname === "localhost") {
      debugLogger("Running on localhost. Skip initGA.");
      return;
    }
    initGA();
    // `routeChangeComplete` won't run for the first page load unless the query string is
    // hydrated later on, so here we log a page view if this is the first render and
    // there's no query string
    if (!router.asPath.includes("?")) {
      logPageView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Listen for page changes after a navigation or when the query changes
    router.events.on("routeChangeComplete", logPageView);
    return () => {
      router.events.off("routeChangeComplete", logPageView);
    };
  }, [router.events]);

  return <Component {...pageProps} />;
}
