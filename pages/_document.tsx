import { resolveDocumentLocale } from "@/lib/documentLocale";
import { GTM_ID } from "@/lib/gtm";
import Document, { Html, Head, Main, NextScript } from "next/document";

const LangSettingDocument = ({ lang, localized }: any) => {
  return (
    <Html lang={lang} translate={!localized ? "no" : undefined}>
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
  const { language, localized } = resolveDocumentLocale(pathname);
  return { ...initialProps, lang: language, localized };
};

export default LangSettingDocument;
