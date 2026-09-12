import React from 'react';

/*
 * Prevents styled-components from passing down an unsupported
 * props to children, resulting in console warnings.
 * https://github.com/styled-components/styled-components/issues/439
 */
export default function omitProps<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  ...omit: string[]
) {
  return function Omit(props: P) {
    const clean: Record<string, unknown> = { ...props };
    omit.forEach((key) => {
      delete clean[key];
    });
    return <Component {...(clean as P)} />;
  };
}
