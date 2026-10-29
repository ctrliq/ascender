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
  'rgba(221, 240, 255, 0.25)'
);
/* Every other copy of what is selected, which is a different thing from the
   selection itself and reads over the text rather than behind it. */
const SELECTION_MATCH = color(
  'selectionMatch--BackgroundColor',
  'rgba(255, 255, 255, 0.16)'
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

/**
 * The height of one line in the editor, in pixels. Everything that sizes an
 * editor by rows multiplies by this, and the theme below pins a line to it, so
 * a box asked for fifty rows shows fifty lines rather than as many as the font
 * happens to fit.
 */
export const LINE_HEIGHT = 24;

/**
 * The gap above the first line, and the only padding the editor has.
 *
 * It is zero so that the box is symmetric. A height in rows is the rows and
 * nothing else, so the last line ends flush with the bottom edge; anything
 * above the first line would therefore be padding at one end and not the
 * other. There is no matching bottom gap to balance it with: on the content it
 * would sit after the last line of the value rather than the last line on
 * screen, so a box showing four of a hundred lines spent it on the top of the
 * fifth, and on the editor, outside the scroller, it painted editor background
 * under the gutter and broke that column short of the border.
 */
export const PADDING_TOP = 0;

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
      paddingTop: `${PADDING_TOP}px`,
    },
    // Every height the editor is given is a row count times LINE_HEIGHT, so
    // that number has to be what a line actually measures. Left to the font
    // it came out 22.4px against a stated 24, and a fifty row box showed
    // fifty four lines. Stated here, the two cannot drift apart.
    // The gutter lays a box out per line of its own, off the inherited line
    // height rather than the content's, so stating it once was not enough: the
    // numbers drifted shorter than the lines they label and a four line box
    // showed a fifth number against four lines.
    '.cm-line, .cm-gutterElement': {
      lineHeight: `${LINE_HEIGHT}px`,
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: CURSOR },
    /*
     * The selection is drawn rather than left to the browser, and CodeMirror
     * colours the drawn layer from its own dark base: dark grey while the
     * editor has the cursor, which in a light theme is a black block over
     * black text. Its focused rule is written deep, so this one is written to
     * the same depth: at equal specificity a theme beats the base, and the
     * colour a theme asks for is the one that shows.
     */
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection':
      { background: SELECTION },
    /* The search extension paints these a solid green of its own, which sits
       over the text rather than behind it and buries it in every theme. */
    '.cm-selectionMatch': { backgroundColor: SELECTION_MATCH },
    '.cm-searchMatch .cm-selectionMatch': { backgroundColor: 'transparent' },
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
    // The editor is built with { dark: true } below, which is what CodeMirror
    // reads to style anything this theme does not. Its dark base paints the
    // search panel's buttons with a near black gradient, and a gradient covers
    // the background colour rather than being overridden by it, so in a light
    // theme they came out black on a light panel. Stated here so the buttons
    // follow the editor's own surface in every theme.
    '.cm-panels .cm-button': {
      backgroundImage: 'none',
      backgroundColor: BACKGROUND,
      color: FOREGROUND,
      border: `1px solid ${GUTTER_ACTIVE}`,
      borderRadius: '3px',
    },
    '.cm-panels input[type="text"]': {
      backgroundColor: BACKGROUND,
      color: FOREGROUND,
      border: `1px solid ${GUTTER_ACTIVE}`,
      borderRadius: '3px',
    },
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
