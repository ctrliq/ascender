import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
   catalogs:[{
      path: "<rootDir>/locales/{locale}/messages",
      include: ["<rootDir>"],
      exclude: ["**/node_modules/**"]
   }],
   compileNamespace: "cjs",
   fallbackLocales: { "default": "en"},
   format: "po",
   locales: ["en","es","fr","de","it","ko","nl","zh","ja","zu"],
   orderBy: "messageId",
   rootDir: "./src",
   runtimeConfigModule: ["@lingui/core", "i18n"],
   sourceLocale: "en",
   format: formatter({
      lineNumbers: true, // Prevents line breaks at 80 characters
      foldLength: 0 // Dont wrap long lines
   }),
});
