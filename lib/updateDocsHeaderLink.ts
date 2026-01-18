const blogDocsUrl = "https://blog.devkey.jp/posts/twitch-follower-checker/";
const englishDocsPath = "/en";
const maxUpdateAttempts = 5;
const retryDelayMs = 150;

function isJapanAccess(): boolean {
  if (typeof Intl === "undefined") {
    return false;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone === "Asia/Tokyo";
}

function findDocsHeaderLink(): HTMLAnchorElement | null {
  const existing = document.querySelector<HTMLAnchorElement>(
    'a[data-docs-link="primary"]'
  );
  if (existing) {
    return existing;
  }

  const candidates = [
    'header a[href="/en"]',
    'header a[href="/en/"]',
    'nav a[href="/en"]',
    'nav a[href="/en/"]',
  ];

  for (const selector of candidates) {
    const link = document.querySelector<HTMLAnchorElement>(selector);
    if (link) {
      link.setAttribute("data-docs-link", "primary");
      return link;
    }
  }

  const headerLinks = document.querySelectorAll<HTMLAnchorElement>(
    "header a, nav a"
  );
  for (let i = 0; i < headerLinks.length; i += 1) {
    const link = headerLinks[i];
    const label = link?.textContent?.trim();
    if (label === "Documentation" || label === "使い方") {
      link.setAttribute("data-docs-link", "primary");
      return link;
    }
  }

  return null;
}

export function updateDocsHeaderLink(attempt = 0): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const link = findDocsHeaderLink();
  if (!link) {
    if (attempt < maxUpdateAttempts) {
      window.setTimeout(() => updateDocsHeaderLink(attempt + 1), retryDelayMs);
    }
    return;
  }

  if (isJapanAccess()) {
    link.textContent = "使い方";
    link.setAttribute("href", blogDocsUrl);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  } else {
    link.textContent = "Documentation";
    link.setAttribute("href", englishDocsPath);
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }
}
