module.exports = {
  locales: ["en", "es", "fr"], // Add your supported locales here
  sourceLocale: "en",
  format: "po",
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
  compileNamespace: "es",
  fallbackLocale: "en",
  formatOptions: {
    explicitIdAsDefault: true, // Treat all messages as having explicit IDs
  },
};