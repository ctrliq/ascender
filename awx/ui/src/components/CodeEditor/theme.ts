import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * The editor's colours. Every one of them is a CSS variable with a fallback,
 * and the fallbacks are ace's twilight palette, which is what the editor used
 * to be hard-wired to. A theme that wants a different editor sets the
 * variables on .cm-editor rather than overriding rules with !important, which
 * is what src/themes/*.css do.
 */
const color = (name: string, fallback: string) =>
  `var(--ascender-code--${name}, ${fallback})`;

const BACKGROUND = color('BackgroundColor', '#141414');
const FOREGROUND = color('Color', '#f8f8f8');
const GUTTER_BACKGROUND = color('gutter--BackgroundColor', '#232323');
const GUTTER_FOREGROUND = color('gutter--Color', '#e2e2e2');
const GUTTER_ACTIVE = color(
  'gutter--active--BackgroundColor',
  'rgba(255, 255, 255, 0.031)'
);
const ACTIVE_LINE = color(
  'activeLine--BackgroundColor',
  'rgba(255, 255, 255, 0.031)'
);
const SELECTION = color(
  'selection--BackgroundColor',
  'rgba(221, 240, 255, 0.2)'
);
const CURSOR = color('cursor--Color', '#a7a7a7');
const MATCH = color('searchMatch--BackgroundColor', 'rgba(205, 168, 105, 0.4)');

const KEYWORD = color('keyword--Color', '#cda869');
const STRING = color('string--Color', '#8f9d6a');
const NUMBER = color('number--Color', '#cf6a4c');
const COMMENT = color('comment--Color', '#5f5a60');
const VARIABLE = color('variable--Color', '#7587a6');
const FUNCTION = color('function--Color', '#dad085');
const TYPE = color('type--Color', '#9b859d');

export const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: BACKGROUND,
      color: FOREGROUND,
      fontSize: '16px',
    },
    '.cm-content': {
      caretColor: CURSOR,
      fontFamily: 'var(--pf-t--global--font--family--mono, monospace)',
      // the breathing room ace kept above the first and below the last line
      paddingTop: '4px',
      paddingBottom: '4px',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: CURSOR },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: SELECTION },
    '.cm-activeLine': { backgroundColor: ACTIVE_LINE },
    '.cm-gutters': {
      backgroundColor: GUTTER_BACKGROUND,
      color: GUTTER_FOREGROUND,
      border: 'none',
    },
    '.cm-activeLineGutter': { backgroundColor: GUTTER_ACTIVE },
    '.cm-scroller': { scrollbarWidth: 'thin' },
    '.cm-panels': {
      backgroundColor: GUTTER_BACKGROUND,
      color: GUTTER_FOREGROUND,
    },
    '.cm-panels input, .cm-panels button': { fontSize: '14px' },
    '.cm-searchMatch': { backgroundColor: MATCH },
    '.cm-searchMatch.cm-searchMatch-selected': {
      outline: `1px solid ${KEYWORD}`,
    },
  },
  { dark: true }
);

export const editorHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: COMMENT,
    fontStyle: 'italic',
  },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: KEYWORD },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.content],
    color: STRING,
  },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: NUMBER },
  {
    tag: [tags.variableName, tags.propertyName, tags.attributeName],
    color: VARIABLE,
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: FUNCTION,
  },
  { tag: [tags.typeName, tags.className, tags.tagName], color: TYPE },
  { tag: [tags.meta, tags.processingInstruction], color: COMMENT },
  { tag: tags.invalid, color: FOREGROUND, backgroundColor: NUMBER },
]);
