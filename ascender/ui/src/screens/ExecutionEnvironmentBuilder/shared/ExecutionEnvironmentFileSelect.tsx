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

export interface ExecutionEnvironmentFileSelectProps {
  projectId?: number | string | null;
  isValid: boolean;
  selected?: string;
  /**
   * Declared method style on purpose: the handler is the form's own, handed
   * straight to the PatternFly input, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  onError?: (error: unknown) => void;
  /** Sets the field to the file picked, which is its path in the project. */
  onChange?: (file: string) => void;
}

/**
 * Picks one of the ansible-builder definition files a project holds.
 *
 * The same shape as the job template's playbook select, except that the file
 * has to be one the project lists: a build cannot be pointed at a path the
 * project's last sync did not find.
 */
function ExecutionEnvironmentFileSelect({
  projectId = null,
  isValid,
  selected,
  onBlur,
  onError = noop,
  onChange = noop,
}: ExecutionEnvironmentFileSelectProps) {
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
      const { data } =
        await ProjectsAPI.readExecutionEnvironmentFiles(projectId);

      // A project with one definition file picks it, which is what the field
      // would have to be set to anyway.
      const only = data[0];
      if (data.length === 1 && only && only !== selected) {
        onChange(only);
      }
      return data;
      // selected is read for the auto-pick only, not a reason to re-fetch
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onChange(value as string);
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          isDisabled={isLoading || isDisabled || !projectId}
          status={isValid ? undefined : 'danger'}
          id="execution-environment-builder-file"
          ouiaId="ExecutionEnvironmentBuilderForm-execution-environment-file"
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
              placeholder={t`Select an execution environment file`}
              aria-label={t`Select an execution environment file`}
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
        {filteredOptions.length === 0 && (
          <SelectOption isDisabled>
            {options.length === 0
              ? t`No execution environment files found in this project. Sync the project after adding one.`
              : t`No results found`}
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );
}

export default ExecutionEnvironmentFileSelect;
