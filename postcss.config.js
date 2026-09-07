module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      // Keep the pre-update CSS compatibility floor without changing Next.js's
      // separate default JavaScript compilation targets.
      overrideBrowserslist: [
        "defaults",
        "Chrome >= 109",
        "Edge >= 120",
        "Firefox >= 115",
        "Safari >= 16.6",
        "iOS >= 15.6",
        "Opera >= 105",
        "Samsung >= 22",
      ],
    },
  },
}
