import { supportedLocales } from "./constants";

export function navigateToUserLocalePage() {
  const userLocale = navigator.language.substring(0, 2);

  const localEntry = Object.entries(supportedLocales).find(
    (entry) => userLocale == entry[0]
  );
  const docLocale = localEntry ? localEntry[0] : "en";

  const docsUrl =
    docLocale === "ja"
      ? "https://blog.devkey.jp/posts/twitch-follower-checker/"
      : `https://twitch-follower-checker.devkey.jp/${docLocale}/how_to_use/`;

  window.open(docsUrl, "_blank", "noopener,noreferrer");
}
