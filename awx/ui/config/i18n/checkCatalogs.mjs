/**
 * Fails when the checked in message catalogues no longer match the strings in
 * the source.
 *
 * Nothing else catches this. A message id is built from the string and from
 * the names of whatever is interpolated into it, so an edit as small as
 * guarding a value can change one: `<Plural value={forks} />` names its
 * placeholder {forks}, and `<Plural value={forks ?? 0} />` names it {0}. The
 * id no longer matches the catalogues, and the string silently falls back to
 * English in every translated locale. Types, lint, tests and the build all
 * pass either way, which is how four of them reached this branch.
 *
 * Only the ids are compared, not the files. The catalogues carry source
 * references with line numbers, so comparing them whole would fail on any
 * change that shifts a line, which is most of them.
 *
 * Extraction runs against a temporary catalogue, so the working tree is left
 * alone whether this passes or fails.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sourceCatalog = join(uiRoot, 'src/locales/en/messages.po');

/**
 * How many entries a catalogue holds under each message id.
 *
 * Counted rather than collected into a set, because one id can hold two
 * entries: lingui keeps a message given an explicit id apart from one whose
 * id it generated from the same text. A set would hide one of such a pair
 * going missing.
 *
 * Args:
 *   po: The contents of a .po file.
 *
 * Returns:
 *   A Map of id to the number of entries carrying it. Obsolete entries (the
 *   ones gettext comments out with `#~`) and the header are left out, and an
 *   id split over several lines is joined back together.
 */
function messageIds(po) {
  const ids = new Map();
  const bump = (id) => ids.set(id, (ids.get(id) ?? 0) + 1);
  const lines = po.split('\n');
  let current = null;

  lines.forEach((line) => {
    if (line.startsWith('#~')) {
      // An entry gettext has retired. It is not in the source any more.
      current = null;
      return;
    }
    if (line.startsWith('msgid ')) {
      current = line.slice('msgid '.length).trim();
      return;
    }
    if (current !== null && line.startsWith('"')) {
      // A continuation of the id above, which gettext splits at newlines.
      current = current.slice(0, -1) + line.trim().slice(1);
      return;
    }
    if (current !== null) {
      // The id ended at the line before this one. `""` is the header.
      if (current !== '""') {
        bump(current);
      }
      current = null;
    }
  });
  if (current !== null && current !== '""') {
    bump(current);
  }
  return ids;
}

const work = mkdtempSync(join(tmpdir(), 'ascender-i18n-'));
try {
  // The real config, with the catalogue redirected somewhere disposable.
  const config = join(work, 'lingui.config.mjs');
  writeFileSync(
    config,
    [
      `import base from ${JSON.stringify(join(uiRoot, 'lingui.config.js'))};`,
      'export default {',
      '  ...base,',
      `  catalogs: base.catalogs.map((catalog) => ({`,
      '    ...catalog,',
      `    path: ${JSON.stringify(join(work, '{locale}/messages'))},`,
      '  })),',
      '};',
      '',
    ].join('\n')
  );

  try {
    execFileSync(
      join(uiRoot, 'node_modules/.bin/lingui'),
      ['extract', '--config', config, '--locale', 'en'],
      { cwd: uiRoot, stdio: 'pipe' }
    );
  } catch (error) {
    // Say what the extractor said. Left to itself node prints the failure as
    // a dump of its stdio buffers, byte by byte.
    const said = [error.stdout, error.stderr]
      .map((buffer) => buffer?.toString().trim())
      .filter(Boolean)
      .join('\n');
    process.stderr.write(
      ['Could not extract the strings.', '', said, ''].join('\n')
    );
    process.exit(1);
  }

  const fromSource = messageIds(
    readFileSync(join(work, 'en/messages.po'), 'utf8')
  );
  const fromCatalog = messageIds(readFileSync(sourceCatalog, 'utf8'));

  const count = (ids, id) => ids.get(id) ?? 0;
  const every = new Set([...fromSource.keys(), ...fromCatalog.keys()]);
  const added = [...every].filter(
    (id) => count(fromSource, id) > count(fromCatalog, id)
  );
  const removed = [...every].filter(
    (id) => count(fromCatalog, id) > count(fromSource, id)
  );

  if (added.length || removed.length) {
    const report = (label, ids) =>
      ids.length
        ? [`  ${label} (${ids.length}):`, ...ids.map((id) => `    ${id}`)]
        : [];
    process.stderr.write(
      [
        'The message catalogues are out of step with the source.',
        '',
        ...report('in the source, missing from the catalogues', added),
        ...report('in the catalogues, no longer in the source', removed),
        '',
        'Run `npm run extract-strings` and commit the result. Check any id',
        'that changed rather than being added or removed: a renamed',
        'placeholder orphans every translation of that string.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const entries = [...fromCatalog.values()].reduce((a, b) => a + b, 0);
  process.stdout.write(`Message catalogues are in step: ${entries} entries.\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
