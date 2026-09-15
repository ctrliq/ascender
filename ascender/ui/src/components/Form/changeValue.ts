/*
 * What a change event means, by the type of the control that raised it.
 *
 * This is the one piece that had to be copied rather than designed. A number
 * input hands over the string "134", and a form that stores the string where
 * a number was stored before changes what the API is sent. The rules below are
 * the ones the application already runs under, reproduced: numbers parsed,
 * an unparseable number emptied, checkboxes resolved against what the field
 * currently holds, and a multiple select collapsed to its selected values.
 */

interface ChangeTarget {
  type?: string;
  name?: string;
  id?: string;
  value?: unknown;
  checked?: boolean;
  options?: ArrayLike<{ selected: boolean; value: string }>;
  multiple?: boolean;
}

/** A checkbox writes a boolean, or adds to and removes from a list. */
export function valueForCheckbox(
  current: unknown,
  checked: boolean | undefined,
  valueProp: unknown
): unknown {
  if (typeof current === 'boolean') return Boolean(checked);

  if (!Array.isArray(current)) {
    if (!valueProp || valueProp === 'true' || valueProp === 'false') {
      return Boolean(checked);
    }
    return checked && valueProp ? [valueProp] : [];
  }

  const index = current.indexOf(valueProp);
  const present = index >= 0;
  if (checked && valueProp && !present) return current.concat([valueProp]);
  if (!present) return current;
  return current.slice(0, index).concat(current.slice(index + 1));
}

/** The name the event is about: its own, or its id when it has no name. */
export function fieldNameFromEvent(event: unknown): string | undefined {
  const source = event as {
    target?: ChangeTarget;
    currentTarget?: ChangeTarget;
  };
  const target = source.target ?? source.currentTarget;
  return target?.name || target?.id;
}

/** The value the event carries, read the way the control type means it. */
export function valueFromEvent(event: unknown, current: unknown): unknown {
  const source = event as {
    target?: ChangeTarget;
    currentTarget?: ChangeTarget;
  };
  // Deliberately not optional: an event with neither is a caller error, and
  // it throws here exactly as it does today.
  const target = (source.target ?? source.currentTarget) as ChangeTarget;
  const { type, value, checked, options, multiple } = target;

  if (type && /number|range/.test(type)) {
    const parsed = parseFloat(value as string);
    return Number.isNaN(parsed) ? '' : parsed;
  }
  if (type && /checkbox/.test(type)) {
    return valueForCheckbox(current, checked, value);
  }
  if (options && multiple) {
    return Array.from(options)
      .filter((option) => option.selected)
      .map((option) => option.value);
  }
  return value;
}
