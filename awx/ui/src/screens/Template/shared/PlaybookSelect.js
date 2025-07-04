import React, { useCallback, useEffect, useState } from 'react';
import { func, number, string, oneOfType } from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { SelectVariant, Select, SelectOption } from '@patternfly/react-core';
import { ProjectsAPI } from 'api';
import useRequest from 'hooks/useRequest';

function PlaybookSelect({
  projectId,
  isValid,
  selected,
  onBlur,
  onError,
  onChange,
}) {
  const { i18n } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
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
      if (error.response.status === 403) {
        setIsDisabled(true);
      } else {
        onError(error);
      }
    }
  }, [error, onError]);

  return (
    <Select
      ouiaId="JobTemplateForm-playbook"
      isOpen={isOpen}
      variant={SelectVariant.typeahead}
      selections={selected}
      onToggle={setIsOpen}
      placeholderText={i18n._(msg`Select a playbook`)}
      typeAheadAriaLabel={i18n._(msg`Select a playbook`)}
      isCreatable
      createText=""
      onSelect={(event, value) => {
        setIsOpen(false);
        onChange(value);
      }}
      id="template-playbook"
      validated={isValid ? 'default' : 'error'}
      onBlur={onBlur}
      isDisabled={isLoading || isDisabled}
      maxHeight="1000%"
      noResultsFoundText={i18n._(msg`No results found`)}
    >
      {options.map((opt) => (
        <SelectOption key={opt} value={opt} />
      ))}
    </Select>
  );
}
PlaybookSelect.propTypes = {
  projectId: oneOfType([number, string]),
  onChange: func,
};
PlaybookSelect.defaultProps = {
  projectId: null,
  onChange: () => {},
};

export { PlaybookSelect as _PlaybookSelect };
export default PlaybookSelect;
