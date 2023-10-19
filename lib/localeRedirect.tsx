import { useEffect } from "react";
import { useRouter } from "next/router";

export function useLocaleRedirect() {
  const router = useRouter();

  useEffect(() => {
    const userLocale = navigator.language.substring(0, 2);
    const supportedLocales = [
      "en",
      "es",
      "pt",
      "ja",
      "ru",
      "de",
      "fr",
      "ja",
      "ko",
    ]; // サポートされているロケール

    if (supportedLocales.includes(userLocale)) {
      router.push(`https://twitch-follower-checker.devkey.jp/${userLocale}`);
    }
  }, [router]);
}
