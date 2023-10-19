import Document, { Html, Head, Main, NextScript } from "next/document";

const LangSettingDocument = ({ lang }: any) => {
  return (
    <Html lang={lang}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
};

LangSettingDocument.getInitialProps = async (ctx: any) => {
  const supportedLocales = {
    en: "en-US",
    es: "es-ES",
    pt: "pt-BR",
    ru: "ru-RU",
    de: "de-DE",
    fr: "fr-FR",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  const initialProps = await Document.getInitialProps(ctx);
  const { pathname } = ctx;
  const localEntry = Object.entries(supportedLocales).find((entry) =>
    pathname.startsWith(`/${entry[0]}`)
  );
  const lang = localEntry ? localEntry[1] : "en-US";
  return { ...initialProps, lang };
};

export default LangSettingDocument;
