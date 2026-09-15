import type { DetailedError } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { ProjectsAPI } from 'api';
import useRequest from 'hooks/useRequest';

const noop = () => {};

export interface PlaybookSelectProps {
  projectId?: number | string | null;
  isValid: boolean;
  selected?: string;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  onError: (error: unknown) => void;
  /** Sets the field to the playbook picked, which is its path in the project. */
  onChange?: (playbook: string) => void;
  [key: string]: unknown;
}

function PlaybookSelect({
  projectId = null,
  isValid,
  selected,
  onBlur,
  onError,
  onChange = noop,
}: PlaybookSelectProps) {
  const { t } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const {
    result: options,
    request: fetchOptions,
    isLoading,
    error,
  } = useRequest(
    useCallback(async () => {
      if (!projectId) {
        return [];
      }
      const { data } = await ProjectsAPI.readPlaybooks(projectId);

      // A project with one playbook picks it, which is what the field would
      // have to be set to anyway.
      const only = data[0];
      if (data.length === 1 && only) {
        onChange(only);
      }
      return data;
    }, [projectId, onChange]),
    []
  );

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    if (error) {
      if ((error as DetailedError).response?.status === 403) {
        setIsDisabled(true);
      } else {
        onError(error);
      }
    }
  }, [error, onError]);

  const filteredOptions = filterValue
    ? options.filter((opt) =>
        opt.toLowerCase().includes(filterValue.toLowerCase())
      )
    : options;

  const showCreatableOption =
    filterValue &&
    !options.some((opt) => opt.toLowerCase() === filterValue.toLowerCase());

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setFilterValue('');
      }}
      onSelect={(_event, value) => {
        setIsOpen(false);
        setFilterValue('');
        onChange(value);
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          isDisabled={isLoading || isDisabled}
          status={isValid ? undefined : 'danger'}
          id="template-playbook"
          ouiaId="JobTemplateForm-playbook"
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={filterValue || selected || ''}
              onClick={() => setIsOpen(true)}
              onChange={(_event, val) => {
                setFilterValue(val);
                setIsOpen(true);
              }}
              onFocus={() => {
                if (selected && !filterValue) {
                  setFilterValue(selected);
                }
              }}
              onBlur={onBlur}
              autoComplete="off"
              placeholder={t`Select a playbook`}
              aria-label={t`Select a playbook`}
            />
            {(filterValue || selected) && (
              <TextInputGroupUtilities>
                <Button
                  icon={<TimesIcon />}
                  variant="plain"
                  onClick={() => {
                    onChange('');
                    setFilterValue('');
                  }}
                  aria-label={t`Clear`}
                />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList>
        {filteredOptions.map((opt) => (
          <SelectOption key={opt} value={opt}>
            {opt}
          </SelectOption>
        ))}
        {showCreatableOption && (
          <SelectOption value={filterValue}>{filterValue}</SelectOption>
        )}
        {filteredOptions.length === 0 && !showCreatableOption && (
          <SelectOption isDisabled>{t`No results found`}</SelectOption>
        )}
      </SelectList>
    </Select>
  );
}
export { PlaybookSelect as _PlaybookSelect };
export default PlaybookSelect;
