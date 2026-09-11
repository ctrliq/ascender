import type { Untyped } from 'types/api';
/*
 * The theme an administrator saves in the CUSTOM_THEME setting.
 *
 * The themes that ship with the product live in src/themes and are bundled at
 * build time, so the only way to add one without rebuilding the image is to hand
 * the browser the stylesheet at runtime. That is what this module does.
 *
 * It is deliberately separate from themeRegistry, which discovers the shipped
 * themes at build time. Nothing here is bundler specific, so a custom theme can
 * be reasoned about and tested on its own.
 */

export const CUSTOM_THEME_ID = 'custom';

const STYLE_ELEMENT_ID = 'awx-custom-theme';

let customTheme: Untyped = null;

export function getCustomTheme() {
  return customTheme;
}

/*
 * Install, replace, or remove the administrator's stylesheet.
 *
 * The CSS goes in a style element rather than a link so it costs no extra
 * request, and it is appended to the head so it comes after the bundled themes
 * and wins at equal specificity. Passing an empty string removes it again, which
 * is what happens when an administrator clears the setting.
 *
 * Whether the theme is dark is read the same way config/themeMetaLoader.js reads
 * it for the shipped themes, by looking for the PatternFly dark class, so an
 * uploaded theme and a built in one are judged by the same rule.
 */
export function setCustomTheme(css: Untyped, name: Untyped) {
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing) existing.remove();

  if (!css) {
    customTheme = null;
    return null;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);

  customTheme = {
    id: CUSTOM_THEME_ID,
    name: name || 'Custom',
    dark: /html\.pf-v6-theme-dark\[data-theme/.test(css),
    custom: true,
  };
  return customTheme;
}
