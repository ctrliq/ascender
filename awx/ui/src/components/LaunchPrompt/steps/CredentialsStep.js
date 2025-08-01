import 'styled-components/macro';
import React, { useState, useCallback, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useField } from 'formik';
import styled from 'styled-components';
import { Alert, ToolbarItem } from '@patternfly/react-core';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString, updateQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import AnsibleSelect from '../../AnsibleSelect';
import OptionsList from '../../OptionsList';
import ContentLoading from '../../ContentLoading';
import CredentialChip from '../../CredentialChip';
import ContentError from '../../ContentError';
import credentialsValidator from './credentialsValidator';

const CredentialErrorAlert = styled(Alert)`
  margin-bottom: 20px;
`;

const QS_CONFIG = getQSConfig('credential', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

function CredentialsStep({
  allowCredentialsWithPasswords,
  defaultCredentials = [],
}) {
  const { i18n } = useLingui();
  const history = useHistory();
  const location = useLocation();
  const [field, meta, helpers] = useField({
    name: 'credentials',
    validate: (val) =>
      credentialsValidator(
        allowCredentialsWithPasswords,
        val,
        defaultCredentials ?? []
      ),
  });
  const [selectedType, setSelectedType] = useState(null);
  const {
    result: types,
    error: typesError,
    isLoading: isTypesLoading,
    request: fetchTypes,
  } = useRequest(
    useCallback(async () => {
      const loadedTypes = await CredentialTypesAPI.loadAllTypes();
      if (loadedTypes.length) {
        const match =
          loadedTypes.find((type) => type.kind === 'ssh') || loadedTypes[0];
        setSelectedType(match);
      }
      return loadedTypes;
    }, []),
    []
  );

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const {
    result: { credentials, count, relatedSearchableKeys, searchableKeys },
    error: credentialsError,
    isLoading: isCredentialsLoading,
    request: fetchCredentials,
  } = useRequest(
    useCallback(async () => {
      if (!selectedType) {
        return { credentials: [], count: 0 };
      }
      const params = parseQueryString(QS_CONFIG, history.location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        CredentialsAPI.read({
          ...params,
          credential_type: selectedType.id,
        }),
        CredentialsAPI.readOptions(),
      ]);
      return {
        credentials: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [selectedType, history.location.search]),
    { credentials: [], count: 0, relatedSearchableKeys: [], searchableKeys: [] }
  );

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  useEffect(() => {
    helpers.setError(
      credentialsValidator(
        allowCredentialsWithPasswords,
        field.value,
        defaultCredentials ?? []
      )
    );
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const removeAllSearchTerms = (qsConfig) => {
    const oldParams = parseQueryString(qsConfig, location.search);
    Object.keys(oldParams).forEach((key) => {
      oldParams[key] = null;
    });
    const defaultParams = {
      ...oldParams,
      page: 1,
      page_size: 5,
      order_by: 'name',
    };
    const qs = updateQueryString(qsConfig, location.search, defaultParams);
    pushHistoryState(qs);
  };

  const pushHistoryState = (qs) => {
    const { pathname } = history.location;
    history.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (isTypesLoading) {
    return <ContentLoading />;
  }

  if (typesError || credentialsError) {
    return <ContentError error={typesError || credentialsError} />;
  }

  const isVault = selectedType?.kind === 'vault';

  const renderChip = ({ item, removeItem, canDelete }) => (
    <CredentialChip
      id={`credential-chip-${item.id}`}
      key={item.id}
      onClick={() => removeItem(item)}
      isReadOnly={!canDelete}
      credential={item}
      ouiaId={`credential-chip-${item.id}`}
    />
  );

  return (
    <div data-cy="credentials-prompt">
      {meta.error && (
        <CredentialErrorAlert variant="danger" isInline title={meta.error} />
      )}
      {types && types.length > 0 && (
        <ToolbarItem css=" display: flex; align-items: center;">
          <div css="flex: 0 0 25%; margin-right: 32px">
            {i18n._(msg`Selected Category`)}
          </div>
          <AnsibleSelect
            css="flex: 1 1 75%;"
            id="multiCredentialsLookUp-select"
            label={i18n._(msg`Selected Category`)}
            data={types.map((type) => ({
              key: type.id,
              value: type.id,
              label: type.name,
              isDisabled: false,
            }))}
            value={selectedType && selectedType.id}
            onChange={(e, id) => {
              // Reset query params when the category of credentials is changed
              removeAllSearchTerms(QS_CONFIG);
              setSelectedType(types.find((o) => o.id === parseInt(id, 10)));
            }}
          />
        </ToolbarItem>
      )}
      <OptionsList
        isLoading={isCredentialsLoading}
        value={field.value || []}
        options={credentials}
        optionCount={count}
        searchColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: i18n._(msg`Created By (Username)`),
            key: 'created_by__username__icontains',
          },
          {
            name: i18n._(msg`Modified By (Username)`),
            key: 'modified_by__username__icontains',
          },
        ]}
        sortColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'name',
          },
        ]}
        searchableKeys={searchableKeys}
        relatedSearchableKeys={relatedSearchableKeys}
        multiple={isVault}
        header={i18n._(msg`Credentials`)}
        name="credentials"
        qsConfig={QS_CONFIG}
        readOnly={false}
        selectItem={(item) => {
          const hasSameVaultID = (val) =>
            val?.inputs?.vault_id !== undefined &&
            val?.inputs?.vault_id === item?.inputs?.vault_id;
          const hasSameCredentialType = (val) =>
            val.credential_type === item.credential_type;
          const newItems = field.value.filter((i) =>
            isVault ? !hasSameVaultID(i) : !hasSameCredentialType(i)
          );
          newItems.push(item);
          helpers.setValue(newItems);
        }}
        deselectItem={(item) => {
          helpers.setValue(field.value.filter((i) => i.id !== item.id));
        }}
        renderItemChip={renderChip}
      />
    </div>
  );
}

export default CredentialsStep;
