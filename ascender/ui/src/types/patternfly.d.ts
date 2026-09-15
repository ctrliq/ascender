import type { LinkProps } from 'react-router';

/**
 * PatternFly's Button, Card and a few others render as whatever `component`
 * says and forward the rest of their props to it. When that component is the
 * router's Link, `to` goes with it, which their prop types do not describe.
 *
 * Declared here rather than cast at each call site, because the pattern is the
 * repository's normal way of rendering a link that looks like a button.
 */
declare module '@patternfly/react-core' {
  interface ButtonProps {
    to?: LinkProps['to'];
  }
}
