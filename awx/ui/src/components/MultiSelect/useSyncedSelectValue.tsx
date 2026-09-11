import type { Untyped } from 'types/api';
import { useState, useEffect } from 'react';
import useIsMounted from 'hooks/useIsMounted';

/*
  Hook for using PatternFly's <Select> component when a pre-existing value
  is loaded from somewhere other than the options. Guarantees object equality
  between objects in `value` and the corresponding objects loaded as
  `options` (based on matched id value).
 */
export default function useSyncedSelectValue(
  value: Untyped,
  onChange: Untyped
) {
  const [options, setOptions] = useState<Untyped[]>([]);
  const [selections, setSelections] = useState<Untyped[]>([]);
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!isMounted.current) {
      return;
    }
    const newOptions: Untyped[] = [];
    if (value && value !== selections && options.length) {
      const syncedValue = value.map((item: Record<string, unknown>) => {
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
    event: React.SyntheticEvent,
    item: Record<string, unknown>
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
    setOptions: (newOpts: unknown) => {
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
function addToStringToObjects(items = []) {
  items.forEach((item) => {
    item.toString = toString;
  });
  return items;
}

function toString() {
  return String(this.id);
}
