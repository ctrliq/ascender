import { useState, useEffect } from 'react';
import useIsMounted from 'hooks/useIsMounted';

/** An option the select can hold, which is any object with an id and a name. */
export interface SelectOptionValue {
  id: number | string;
  /** Null where the api sends one, which the labels endpoint can. */
  name?: string | null;
  /** True for an option the user is not allowed to remove. */
  isReadOnly?: boolean;
  [key: string]: unknown;
}

/*
  Hook for using PatternFly's <Select> component when a pre-existing value
  is loaded from somewhere other than the options. Guarantees object equality
  between objects in `value` and the corresponding objects loaded as
  `options` (based on matched id value).
 */
export default function useSyncedSelectValue(
  value: SelectOptionValue[],
  onChange: (next: SelectOptionValue[]) => void
) {
  const [options, setOptions] = useState<SelectOptionValue[]>([]);
  const [selections, setSelections] = useState<SelectOptionValue[]>([]);
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!isMounted.current) {
      return;
    }
    const newOptions: SelectOptionValue[] = [];
    if (value && value !== selections && options.length) {
      const syncedValue = value.map((item: SelectOptionValue) => {
        const match = options.find((i) => i.id === item.id);
        if (!match) {
          newOptions.push(item);
        }

        if (match) {
          if (item.isReadOnly) {
            match.isReadOnly = true;
          }
          return match;
        }

        return item;
      });
      setSelections(syncedValue);
    }
    if (newOptions.length > 0) {
      setOptions(options.concat(newOptions));
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [value, options]);

  const onSelect = (
    event: React.SyntheticEvent | null,
    item: SelectOptionValue
  ) => {
    if (selections.includes(item)) {
      onChange(selections.filter((i) => i !== item));
    } else {
      onChange(selections.concat(item));
    }
  };
  return {
    selections: options.length ? addToStringToObjects(selections) : [],
    onSelect,
    options,
    setOptions: (newOpts: SelectOptionValue[]) => {
      if (isMounted.current) {
        setOptions(addToStringToObjects(newOpts));
      }
    },
  };
}

/*
  PF uses toString to generate React keys. This is used to ensure
  all objects in the array have a toString method.
 */
function addToStringToObjects(items: SelectOptionValue[] = []) {
  items.forEach((item) => {
    item.toString = toString;
  });
  return items;
}

function toString(this: SelectOptionValue) {
  return String(this.id);
}
