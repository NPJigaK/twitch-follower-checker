import "./globals.css";
import type { AppProps } from "next/app";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";
import Script from "next/script";
import { GTM_ID, pageview } from "@/lib/gtm";
import { updateDocsHeaderLink } from "@/lib/updateDocsHeaderLink";

export default function App({ Component, pageProps }: AppProps): ReactElement {
  const router = useRouter();

  useEffect(() => {
    // Listen for page changes after a navigation or when the query changes
    router.events.on("routeChangeComplete", pageview);
    return () => {
      router.events.off("routeChangeComplete", pageview);
    };
  }, [router.events]);

  useEffect(() => {
    const handleRouteChange = () => updateDocsHeaderLink();
    handleRouteChange();
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return (
    <>
      {/* Google Tag Manager - Global base code */}
      <Script
        id="gtag-base"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer', '${GTM_ID}');
          `,
        }}
      />
      <Component {...pageProps} />
    </>
  );
}
