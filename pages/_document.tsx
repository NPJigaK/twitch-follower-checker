import { supportedLocales } from "@/lib/constants";
import { GTM_ID } from "@/lib/gtm";
import Document, { Html, Head, Main, NextScript } from "next/document";

const LangSettingDocument = ({ lang, localEntry }: any) => {
  return (
    <Html lang={lang} translate={!localEntry ? "no" : undefined}>
      <Head />
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
};

LangSettingDocument.getInitialProps = async (ctx: any) => {
  const initialProps = await Document.getInitialProps(ctx);
  const { pathname } = ctx;
  const localEntry = Object.entries(supportedLocales).find((entry) =>
    pathname.startsWith(`/${entry[0]}`)
  );
  const lang = localEntry ? localEntry[1] : "en-US";
  return { ...initialProps, lang, localEntry };
};

export default LangSettingDocument;
