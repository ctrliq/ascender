import type { Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { CredentialsAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useAutoPopulateLookup from 'hooks/useAutoPopulateLookup';
import useRequest from 'hooks/useRequest';
import type { QSParams } from 'util/qs';
import Popover from '../Popover';
import Lookup from './Lookup';
import OptionsList from '../OptionsList';
import LookupErrorMessage from './shared/LookupErrorMessage';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('credentials', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface CredentialLookupProps {
  autoPopulate?: boolean;
  credentialTypeId?: number | string;
  credentialTypeKind?: string;
  credentialTypeNamespace?: Untyped;
  fieldName?: string;
  helperTextInvalid?: string;
  isDisabled?: boolean;
  isSelectedDraggable?: boolean;
  isValid?: boolean;
  label: React.ReactNode;
  modalDescription?: Untyped;
  multiple?: boolean;
  onBlur?: (...args: Untyped[]) => void;
  onChange: (...args: Untyped[]) => void;
  required?: boolean;
  tooltip?: Untyped;
  validate?: (...args: Untyped[]) => void;
  value?: Untyped;
  [key: string]: unknown;
}

function CredentialLookup({
  autoPopulate = false,
  credentialTypeId = '',
  credentialTypeKind = '',
  credentialTypeNamespace,
  fieldName = 'credential',
  helperTextInvalid = '',
  isDisabled = false,
  isSelectedDraggable,
  isValid = true,
  label,
  modalDescription,
  multiple = false,
  onBlur = () => {},
  onChange,
  required = false,
  tooltip,
  validate = () => undefined,
  value,
}: CredentialLookupProps) {
  const { t } = useLingui();
  const location = useLocation();
  const autoPopulateLookup = useAutoPopulateLookup(onChange);
  const {
    result: { count, credentials, relatedSearchableKeys, searchableKeys },
    error,
    request: fetchCredentials,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const typeIdParams: QSParams = credentialTypeId
        ? { credential_type: credentialTypeId }
        : {};
      const typeKindParams: QSParams = credentialTypeKind
        ? { credential_type__kind: credentialTypeKind }
        : {};
      const typeNamespaceParams: QSParams = credentialTypeNamespace
        ? { credential_type__namespace: credentialTypeNamespace }
        : {};

      const [{ data }, actionsResponse] = await Promise.all([
        CredentialsAPI.read(
          mergeParams(params, {
            ...typeIdParams,
            ...typeKindParams,
            ...typeNamespaceParams,
          })
        ),
        CredentialsAPI.readOptions(),
      ]);

      if (autoPopulate) {
        autoPopulateLookup(data.results);
      }

      const searchKeys = getSearchableKeys(actionsResponse.data.actions?.GET);
      // Expose the credential_type__kind filter (coarse enum: ssh, cloud, …)
      // as a searchable key, mirroring CredentialList. Searching by the actual
      // credential type name is handled by the credential_type__search column
      // below, which queries the credential types over REST rather than the
      // hardcoded kind enum.
      if (actionsResponse.data.actions?.GET.type) {
        searchKeys.push({ key: 'credential_type__kind', type: 'string' });
      }

      return {
        count: data.count,
        credentials: data.results,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val: Untyped) => val.slice(0, -8)),
        searchableKeys: searchKeys,
      };
    }, [
      autoPopulate,
      autoPopulateLookup,
      credentialTypeId,
      credentialTypeKind,
      credentialTypeNamespace,
      location.search,
    ]),
    {
      count: 0,
      credentials: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const checkCredentialName = useCallback(
    async (name: string) => {
      if (!name) {
        onChange(null);
        return;
      }

      try {
        const typeIdParams: QSParams = credentialTypeId
          ? { credential_type: credentialTypeId }
          : {};
        const typeKindParams: QSParams = credentialTypeKind
          ? { credential_type__kind: credentialTypeKind }
          : {};
        const typeNamespaceParams: QSParams = credentialTypeNamespace
          ? { credential_type__namespace: credentialTypeNamespace }
          : {};

        const {
          data: { results: nameMatchResults, count: nameMatchCount },
        } = await CredentialsAPI.read({
          name,
          ...typeIdParams,
          ...typeKindParams,
          ...typeNamespaceParams,
        });
        onChange(nameMatchCount ? nameMatchResults[0] : null);
      } catch {
        onChange(null);
      }
    },
    [onChange, credentialTypeId, credentialTypeKind, credentialTypeNamespace]
  );

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  return (
    <FormGroup
      fieldId="credential"
      isRequired={required}
      label={label}
      labelHelp={tooltip ? <Popover content={tooltip} /> : undefined}
    >
      <Lookup
        id="credential"
        header={label}
        value={value as LookupItem[]}
        onBlur={onBlur}
        onChange={onChange}
        onUpdate={fetchCredentials}
        onDebounce={checkCredentialName}
        fieldName={fieldName}
        validate={validate}
        required={required}
        qsConfig={QS_CONFIG}
        isDisabled={isDisabled}
        multiple={multiple}
        modalDescription={modalDescription}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={credentials}
            optionCount={count}
            header={label}
            qsConfig={QS_CONFIG}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
              {
                name: t`Modified By (Username)`,
                key: 'modified_by__username__icontains',
              },
              {
                name: t`Credential Type`,
                key: 'credential_type__search',
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            readOnly={!canDelete}
            name="credential"
            selectItem={(item: LookupItem) =>
              dispatch({ type: 'SELECT_ITEM', item })
            }
            deselectItem={(item: LookupItem) =>
              dispatch({ type: 'DESELECT_ITEM', item })
            }
            sortSelectedItems={(selectedItems: LookupItem[]) =>
              dispatch({ type: 'SET_SELECTED_ITEMS', selectedItems })
            }
            multiple={multiple}
            isSelectedDraggable={isSelectedDraggable}
          />
        )}
      />
      <LookupErrorMessage error={error} />
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{helperTextInvalid}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export { CredentialLookup as _CredentialLookup };
export default CredentialLookup;
