import type { CSSProp } from 'styled-components';

/*
 * The `css` prop, which babel-plugin-styled-components rewrites at build time
 * into a generated component. It works at runtime and always has, but nothing
 * declares it to the compiler: styled-components v5 shipped a
 * `styled-components/cssprop` types entry for this and v6 does not.
 *
 * Declared here for both the intrinsic elements and React's own attributes, so
 * `<p css="...">` and `<Detail css="..." />` are both understood.
 */
declare module 'react' {
  interface Attributes {
    css?: CSSProp | string;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      css?: CSSProp | string;
    }
  }
}

export {};
