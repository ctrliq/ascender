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
  fallbackLocales: { default: "en" }, // Updated to use fallbackLocales
};