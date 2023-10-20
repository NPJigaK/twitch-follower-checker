import type { DocsThemeConfig } from "nextra-theme-docs";
import { useConfig } from "nextra-theme-docs";

const logo = (
  <svg
    height="20"
    viewBox="0 0 361 70"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
  >
    <image href="/nav-icon.svg" />
    <style jsx>{`
      svg {
        mask-image: linear-gradient(
          60deg,
          black 25%,
          rgba(0, 0, 0, 0.2) 50%,
          black 75%
        );
        mask-size: 400%;
        mask-position: 0%;
      }
      svg:hover {
        mask-position: 100%;
        transition: mask-position 1s ease, -webkit-mask-position 1s ease;
      }
    `}</style>
  </svg>
);

const config: DocsThemeConfig = {
  project: {
    icon: null,
    link: "https://github.com/NPJigaK/twitch-follower-checker",
  },
  docsRepositoryBase:
    "https://github.com/NPJigaK/twitch-follower-checker/tree/main",
  logo,
  head: function useHead() {
    const { title, frontMatter } = useConfig();

    // const { route } = useRouter();
    // const metaTitle = (
    //   route === "/" || !title
    //     ? `${title}`
    //     : `${title} - Twitch Follower Checker`
    // ) as string;

    const socialCard = "/og-image.jpg";
    const metaTitle =
      title || "Twitch Follower Checker - Follows & Unfollows Tracking Free";
    const description =
      frontMatter.description ||
      "The Twitch Follower Checker is a web application that easily allows you to track new followers and unfollows on your Twitch channel.";

    return (
      <>
        <meta name="msapplication-TileColor" content="#fff" />
        <meta name="theme-color" content="#fff" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="keywords"
          content="Twitch, Follower Checker, unfollows, unfollows Checker, Twitch Follower Tracker, Unfollow Tracker, Twitch Analytics, アンフォロー, フォロー解除"
        />

        <title>{metaTitle}</title>
        <meta name="description" content={description} />

        <meta name="apple-mobile-web-app-title" content={metaTitle} />

        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />

        <meta name="og:title" content={metaTitle} />
        <meta name="og:description" content={description} />
        <meta
          name="og:url"
          content="https://twitch-follower-checker.devkey.jp/"
        />
        <meta name="og:image" content={socialCard} />
        <meta name="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:creator" content="@KagiJPN" />
        <meta name="twitter:image" content={socialCard} />
        <meta
          name="twitter:site:domain"
          content="twitch-follower-checker.devkey.jp"
        />
        <meta
          name="twitter:url"
          content="https://twitch-follower-checker.devkey.jp/"
        />

        <link rel="icon" href="/favicon.ico" type="image/vnd.microsoft.icon" />
        <link
          rel="icon"
          href="/favicon.ico"
          type="image/vnd.microsoft.icon"
          media="(prefers-color-scheme: dark)"
        />

        <meta name="msvalidate.01" content="7B9D9DB35830909D0ABC0C6F18DD3B49" />
      </>
    );
  },
  editLink: {
    content: "Edit this page on GitHub →",
  },
  feedback: {
    content: "Question? Give us feedback →",
    labels: "feedback",
  },
  sidebar: {
    defaultMenuCollapseLevel: 4,
    toggleButton: true,
  },
  footer: {
    content: (
      <div className="flex w-full flex-col items-center sm:items-start">
        <div>
          <a
            className="flex items-center gap-1 text-current"
            target="_blank"
            rel="noopener noreferrer"
            title="ToDo Send to the Self-Introduction page."
            href=""
          >
            <span>Powered by devkey</span>
          </a>
        </div>
        <p className="mt-6 text-xs">
          © {new Date().getFullYear()} The devkey Project.
        </p>
      </div>
    ),
  },
  toc: {
    backToTop: true,
  },
};

export default config;
