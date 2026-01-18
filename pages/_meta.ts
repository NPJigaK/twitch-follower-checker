const hideDocs = {
  ja: {
    type: "page",
    title: "ドキュメント",
    display: "hidden",
  },
  ko: {
    type: "page",
    title: "문서",
    display: "hidden",
  },
  de: {
    type: "page",
    title: "Dokumentation",
    display: "hidden",
  },
  es: {
    type: "page",
    title: "Documentación",
    display: "hidden",
  },
  fr: {
    type: "page",
    title: "Documentation",
    display: "hidden",
  },
  pt: {
    type: "page",
    title: "Documentação",
    display: "hidden",
  },
  ru: {
    type: "page",
    title: "Документация",
    display: "hidden",
  },
};

const oldDocsToRedirect = {
  jp: {
    type: "page",
    display: "hidden",
    theme: {
      layout: "raw",
    },
  },
  list: {
    type: "page",
    display: "hidden",
    theme: {
      layout: "raw",
    },
  },
};

const _meta = {
  index: {
    type: "page",
    display: "hidden",
    theme: {
      layout: "raw",
    },
  },
  en: {
    type: "page",
    title: "Documentation",
  },
  ...hideDocs,
  ...oldDocsToRedirect,
  language: {
    title: "lang(doc)",
    type: "menu",
    items: {
      en: {
        title: "English",
        href: "/en",
      },
      ja: {
        title: "日本語",
        href: "https://blog.devkey.jp/posts/twitch-follower-checker/",
        newWindow: true,
      },
      ko: {
        title: "한국어",
        href: "/ko",
      },
      de: {
        title: "Deutsch",
        href: "/de",
      },
      es: {
        title: "español",
        href: "/es",
      },
      fr: {
        title: "français",
        href: "/fr",
      },
      pt: {
        title: "português",
        href: "/pt",
      },
      ru: {
        title: "русский язык",
        href: "/ru",
      },
    },
  },
  "404": {
    type: "page",
    theme: {
      timestamp: false,
      typesetting: "article",
    },
  },
};

export default _meta;
