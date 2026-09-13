import React from 'react';

import { Form } from './Form';
import type { FormContextValue, Values } from './types';

export interface WithFormConfig<P extends object, V extends object> {
  /** The values the form starts with, built from the wrapper's own props. */
  mapPropsToValues: (props: P) => V;
  /** Called on a valid submit, with the wrapper's props alongside the form's. */
  handleSubmit: (
    values: V,
    bag: FormContextValue<V> & { props: P }
  ) => void | Promise<void>;
  enableReinitialize?: boolean;
}

/**
 * Wrap a component in a form, the way withFormik did.
 *
 * Three components are built this way, all of them large forms whose initial
 * values are derived from a record they are handed. The component inside
 * receives the form's own members as props on top of its own, which is what
 * those three already expect and why this exists rather than each of them
 * rendering a form root itself.
 */
export default function withForm<P extends object, V extends object>(
  config: WithFormConfig<P, V>
) {
  return function wrap(Wrapped: React.ComponentType<never>) {
    function WithForm(props: P) {
      return (
        <Form<V>
          initialValues={config.mapPropsToValues(props)}
          enableReinitialize={config.enableReinitialize}
          onSubmit={(values, helpers) =>
            config.handleSubmit(values, { ...helpers, props })
          }
        >
          {(form) => {
            const Inner = Wrapped as React.ComponentType<
              P & FormContextValue<V>
            >;
            return <Inner {...props} {...form} />;
          }}
        </Form>
      );
    }
    WithForm.displayName = `withForm(${Wrapped.displayName || Wrapped.name || 'Component'})`;
    return WithForm as React.ComponentType<P>;
  };
}

export type { Values };
