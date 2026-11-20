import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * A screen's loading state is a bare ContentLoading, never one inside a card.
 *
 * A screen renders its content inside a page section and a card. Put the
 * loading state in a card too and the page arrives in pieces: the card comes up
 * first, empty, with the animation inside it, and the content replaces the
 * animation a moment later. What that reads as is two loads rather than one,
 * and the animation lands in a different place each time, since a card insets
 * its contents from where the page level one sits.
 *
 * The rule holds for a component that renders its own page section, which is
 * what makes it the page rather than something drawn inside one: the settings
 * screens render their detail and edit panels inside a card the shell around
 * them already drew, and their loading state belongs where they are.
 *
 * jsdom applies no stylesheets and lays nothing out, so no render can see any
 * of this. Reading the source is the only thing that catches it, and it is read
 * as a syntax tree rather than as text: a card closed on the same tag it opens
 * with, a loading state given a prop, or a component imported under another
 * name all read wrongly to a count of tags.
 */

const SCREENS = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walks a directory tree and returns every screen source file in it.
 *
 * Args:
 *     dir: The directory to walk, as an absolute path.
 *
 * Returns:
 *     The absolute path of every .tsx file that is not a test, in directory
 *     order.
 */
function screenFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return screenFiles(full);
    }
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.')
      ? [full]
      : [];
  });
}

/** The three components the rule is about, as a file may import them. */
type Role = 'card' | 'loading' | 'section';

/**
 * The local names a file gives the components the rule is about.
 *
 * Read off the imports, so an alias counts as what it aliases: a PatternFly
 * Card imported as PFCard is a card, and ContentLoading is recognised by the
 * module it comes from whatever the file calls it.
 *
 * Args:
 *     file: The parsed source file.
 *
 * Returns:
 *     Each local name mapped to the component it stands for.
 */
function importedRoles(file: ts.SourceFile): Map<string, Role> {
  const roles = new Map<string, Role>();
  file.statements.forEach((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      return;
    }
    const from = statement.moduleSpecifier.text;
    const { name, namedBindings } = statement.importClause;
    if (name && /(^|\/)ContentLoading$/.test(from)) {
      roles.set(name.text, 'loading');
    }
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      namedBindings.elements.forEach((element) => {
        const imported = (element.propertyName ?? element.name).text;
        if (from === '@patternfly/react-core' && imported === 'Card') {
          roles.set(element.name.text, 'card');
        } else if (
          from === '@patternfly/react-core' &&
          imported === 'PageSection'
        ) {
          roles.set(element.name.text, 'section');
        } else if (
          imported === 'default' &&
          /(^|\/)ContentLoading$/.test(from)
        ) {
          roles.set(element.name.text, 'loading');
        }
      });
    }
  });
  return roles;
}

/**
 * Every ContentLoading in a screen that renders a page section and draws it
 * inside a card.
 *
 * Args:
 *     fileName: The name the file is reported under.
 *     source: The whole file.
 *
 * Returns:
 *     One line per offending ContentLoading, naming the file and the line.
 */
function cardedLoadingStates(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const roles = importedRoles(file);
  const roleOf = (tag: ts.JsxTagNameExpression) =>
    ts.isIdentifier(tag) ? roles.get(tag.text) : undefined;

  const loadingStates: ts.JsxOpeningLikeElement[] = [];
  let rendersSection = false;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const role = roleOf(node.tagName);
      if (role === 'loading') {
        loadingStates.push(node);
      } else if (role === 'section') {
        rendersSection = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!rendersSection) {
    return [];
  }

  /* Inside a card is having an element whose opening tag is a card among
     the ancestors; a self closing card holds nothing, so it never is one. */
  const insideCard = (node: ts.Node): boolean => {
    for (let at = node.parent; at; at = at.parent) {
      if (ts.isJsxElement(at) && roleOf(at.openingElement.tagName) === 'card') {
        return true;
      }
    }
    return false;
  };

  return loadingStates.filter(insideCard).map((node) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    return `${fileName}:${line + 1}: ContentLoading inside a Card`;
  });
}

describe('screen loading states', () => {
  test('a screen that renders a page section keeps its loading state out of a card', () => {
    const offenders = screenFiles(SCREENS).flatMap((file) =>
      cardedLoadingStates(
        path.relative(SCREENS, file),
        fs.readFileSync(file, 'utf8')
      )
    );

    expect(offenders).toEqual([]);
  });

  /* The check itself, on sources written to trip a count of tags. */
  describe('the check', () => {
    const imports = `
import { Card as PFCard, PageSection } from '@patternfly/react-core';
import Spinner from 'components/ContentLoading';
`;

    test('finds a loading state with props inside an aliased card', () => {
      expect(
        cardedLoadingStates(
          'Aliased.tsx',
          `${imports}
export default () => (
  <PageSection>
    <PFCard>{busy && <Spinner className="x" />}</PFCard>
  </PageSection>
);`
        )
      ).toEqual(['Aliased.tsx:7: ContentLoading inside a Card']);
    });

    test('does not count a self closing card as one left open', () => {
      expect(
        cardedLoadingStates(
          'SelfClosing.tsx',
          `${imports}
export default () => (
  <PageSection>
    <PFCard />
    <Spinner />
  </PageSection>
);`
        )
      ).toEqual([]);
    });

    test('leaves a file that renders no page section alone', () => {
      expect(
        cardedLoadingStates(
          'Panel.tsx',
          `${imports}
export default () => (
  <PFCard>
    <Spinner />
  </PFCard>
);`
        )
      ).toEqual([]);
    });
  });
});
