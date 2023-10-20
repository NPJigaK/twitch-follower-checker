/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://twitch-follower-checker.devkey.jp",
  generateRobotsTxt: true,
  outDir: "./out",
  additionalPaths: async (config) => [
    await config.transform(config, "/na"),
    await config.transform(config, "/ja"),
    await config.transform(config, "/de"),
    await config.transform(config, "/es"),
    await config.transform(config, "/fr"),
    await config.transform(config, "/ko"),
    await config.transform(config, "/pt"),
    await config.transform(config, "/ru"),
  ],
};
