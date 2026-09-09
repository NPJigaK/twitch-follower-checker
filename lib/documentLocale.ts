import { supportedLocales } from "./constants";

const defaultDocumentLanguage = "en-US";

type DocumentLocale = Readonly<{
  language: string;
  localized: boolean;
}>;

export function resolveDocumentLocale(path: string): DocumentLocale {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const firstSegment = /^\/([^/]+)/.exec(pathname)?.[1];
  const language = firstSegment
    ? supportedLocales[firstSegment as keyof typeof supportedLocales]
    : undefined;

  return {
    language: language ?? defaultDocumentLanguage,
    localized: language !== undefined,
  };
}

export function syncDocumentLocale(path: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const { language, localized } = resolveDocumentLocale(path);
  document.documentElement.lang = language;
  if (localized) {
    document.documentElement.removeAttribute("translate");
  } else {
    document.documentElement.setAttribute("translate", "no");
  }
}
