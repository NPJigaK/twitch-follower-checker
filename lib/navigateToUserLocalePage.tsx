import { supportedLocales } from "./constants";

export function navigateToUserLocalePage() {
  const userLocale = navigator.language.substring(0, 2);

  const localEntry = Object.entries(supportedLocales).find(
    (entry) => userLocale == entry[0]
  );
  const docLocale = localEntry ? localEntry[0] : "en";

  window.open(
    `https://twitch-follower-checker.devkey.jp/${docLocale}/how_to_use/`,
    "_blank"
  );
}
