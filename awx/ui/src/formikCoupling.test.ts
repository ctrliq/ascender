import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/**
 * How many screens reach for formik themselves, rather than through the shared
 * field components.
 *
 * The roadmap asks for one form family ported off formik, to prove an exit
 * exists before an unmaintained 2.4.9 becomes a problem. It cannot be done one
 * family at a time while this number is what it is: a screen that calls
 * useField directly is bound to formik whatever its form component does, so
 * the exit is gated on the field layer, not on any one form.
 *
 * This is a ratchet, not a target. A new screen that goes through FormField,
 * CheckboxField, VariablesField or a Lookup does not move it. One that imports
 * formik itself does, and fails here.
 */
const SCREENS_IMPORTING_FORMIK = 80;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [full];
  });
}

const importsFormik = (file: string) =>
  /from '(formik)'/.test(fs.readFileSync(file, 'utf8'));

describe('the UI’s coupling to formik', () => {
  it('does not grow the number of screens that import it directly', () => {
    const screens = sources(path.join(src, 'screens')).filter(importsFormik);

    expect(
      screens.length,
      `${screens.length} screens import formik directly, up from ${SCREENS_IMPORTING_FORMIK}. ` +
        'Use FormField, CheckboxField, VariablesField or a Lookup instead, so the ' +
        'field layer stays the only thing bound to it.'
    ).toBeLessThanOrEqual(SCREENS_IMPORTING_FORMIK);
  });

  it('keeps the shared field components as the way in', () => {
    const shared = sources(path.join(src, 'components')).filter(importsFormik);

    // they are the adapter: they may bind to formik, and everything else
    // should be reaching them rather than it
    expect(shared.length).toBeGreaterThan(0);
  });
});
