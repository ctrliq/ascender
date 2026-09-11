import { setCustomTheme, getCustomTheme, CUSTOM_THEME_ID } from './customTheme';

const STYLE_ID = 'awx-custom-theme';
const DARK_CSS = 'html.pf-v6-theme-dark[data-theme="custom"] { --x: 1; }';
const LIGHT_CSS = 'html[data-theme="custom"] { --x: 1; }';

afterEach(() => {
  setCustomTheme('', '');
});

describe('setCustomTheme', () => {
  test('installs the stylesheet in the document head', () => {
    setCustomTheme(LIGHT_CSS, 'Solarized');

    const style = document.getElementById(STYLE_ID);
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe(LIGHT_CSS);
    expect(style!.parentNode).toBe(document.head);
  });

  test('registers a theme the registry can offer alongside the shipped ones', () => {
    expect(getCustomTheme()).toBeNull();
    setCustomTheme(LIGHT_CSS, 'Solarized');

    expect(getCustomTheme()).toMatchObject({
      id: CUSTOM_THEME_ID,
      name: 'Solarized',
      custom: true,
    });
  });

  test('falls back to Custom when no name is configured', () => {
    setCustomTheme(LIGHT_CSS, '');
    expect(getCustomTheme().name).toBe('Custom');
  });

  test('reads darkness from the stylesheet, the way the build time loader does', () => {
    setCustomTheme(DARK_CSS, 'Midnight');
    expect(getCustomTheme().dark).toBe(true);

    setCustomTheme(LIGHT_CSS, 'Noon');
    expect(getCustomTheme().dark).toBe(false);
  });

  test('replaces the previous stylesheet rather than stacking them', () => {
    setCustomTheme(LIGHT_CSS, 'First');
    setCustomTheme(DARK_CSS, 'Second');

    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(STYLE_ID)!.textContent).toBe(DARK_CSS);
    expect(getCustomTheme().name).toBe('Second');
  });

  test('clearing the setting removes both the theme and the stylesheet', () => {
    setCustomTheme(LIGHT_CSS, 'Solarized');
    setCustomTheme('', '');

    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(getCustomTheme()).toBeNull();
  });
});
