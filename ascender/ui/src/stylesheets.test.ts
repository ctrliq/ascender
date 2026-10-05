import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every stylesheet under src/ has to reach the bundle through an import.
 *
 * A component stylesheet nobody imports is invisible: the file reads as though
 * it styles the component, the component renders without it, and no test
 * notices, because jsdom does not apply stylesheets in the first place. That is
 * how the multiple-value lookup came to render its chip holder with no height
 * at all, its stylesheet sitting next to it unimported. This walk is the only
 * thing that catches it, so it is deliberately a file system check rather than
 * a render.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

/**
 * The theme stylesheets are pulled in by import.meta.glob in themeRegistry.ts,
 * which names no single file, so nothing here resolves to them and they are
 * loaded all the same.
 */
const GLOB_IMPORTED = path.join(SRC, 'themes');

/** Matches the specifier of a side effect import and of a named one alike. */
const CSS_IMPORT = /(?:^|\s)(?:import|from)\s+['"]([^'"]+\.css)['"]/g;

/**
 * Walks a directory tree and returns every file whose name ends in one of the
 * given extensions.
 *
 * Args:
 *     dir: The directory to walk, as an absolute path.
 *     extensions: The file extensions to keep, each including its leading dot.
 *
 * Returns:
 *     The absolute path of every matching file, in directory order.
 */
function filesUnder(dir: string, extensions: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(full, extensions);
    }
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/**
 * Resolves the stylesheets a source file imports to absolute paths.
 *
 * Relative specifiers resolve against the importing file, and bare ones against
 * src/, which is how the build's own aliases resolve them. A specifier that
 * lands outside src/ is a dependency's stylesheet and is dropped.
 *
 * Args:
 *     file: The source file to read, as an absolute path.
 *
 * Returns:
 *     The absolute path of every stylesheet the file imports from src/.
 */
function stylesheetsImportedBy(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(CSS_IMPORT)]
    .map(([, specifier]) => specifier ?? '')
    .filter(Boolean)
    .map((specifier) =>
      specifier.startsWith('.')
        ? path.resolve(path.dirname(file), specifier)
        : path.resolve(SRC, specifier)
    )
    .filter((full) => full.startsWith(SRC + path.sep));
}

describe('stylesheets', () => {
  test('every stylesheet under src/ is imported by a source file', () => {
    const imported = new Set(
      filesUnder(SRC, ['.ts', '.tsx']).flatMap(stylesheetsImportedBy)
    );
    const orphans = filesUnder(SRC, ['.css'])
      .filter((file) => !file.startsWith(GLOB_IMPORTED + path.sep))
      .filter((file) => !imported.has(file))
      .map((file) => path.relative(SRC, file));

    expect(orphans).toEqual([]);
  });

  /*
   * The three screens that put a toggle above their details all hold it off the
   * tab bar the same way, and each keeps its own copy of the rule. The themes
   * hold every card body to four pixels of padding at the top with an
   * !important, so a toggle that only pads below sits on the tab bar: this is
   * the check that the three copies stay in step, since nothing else compares
   * them and jsdom applies no stylesheet at all.
   */
  test('every toggle row stands its toggle off the tab bar', () => {
    const rules = filesUnder(SRC, ['.css'])
      .map((file) => [path.relative(SRC, file), fs.readFileSync(file, 'utf8')])
      .filter(([, css]) => (css as string).includes('__toggle-row {'))
      .map(([name, css]) => [
        name,
        ((css as string)
          .split('__toggle-row {')[1]
          ?.split('}')[0]
          ?.match(/padding-block:\s*([^;]+);/) ?? [])[1]?.trim(),
      ]);

    expect(rules.length).toBe(3);
    rules.forEach(([, padding]) => expect(padding).toBe('20px 12px'));
  });
});
