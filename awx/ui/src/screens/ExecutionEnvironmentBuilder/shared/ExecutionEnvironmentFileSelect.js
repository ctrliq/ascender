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

function ExecutionEnvironmentFileSelect({
  projectId = null,
  isValid = true,
  selected,
  onBlur,
  onError = noop,
  onChange = noop,
}) {
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
      const { data } = await ProjectsAPI.readExecutionEnvironmentFiles(
        projectId
      );

      if (data.length === 1) {
        onChange(data[0]);
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
      if (error.response?.status === 403) {
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
      isScrollable
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
          isFullWidth
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          isDisabled={isLoading || isDisabled || !projectId}
          status={isValid ? 'default' : 'danger'}
          id="eeb-execution-environment-file"
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
      <SelectList style={{ maxHeight: '360px', overflowY: 'auto' }}>
        {filteredOptions.map((opt) => (
          <SelectOption key={opt} value={opt}>
            {opt}
          </SelectOption>
        ))}
        {filteredOptions.length === 0 && (
          <SelectOption isDisabled>{t`No results found`}</SelectOption>
        )}
      </SelectList>
    </Select>
  );
}

export { ExecutionEnvironmentFileSelect as _ExecutionEnvironmentFileSelect };
export default ExecutionEnvironmentFileSelect;
