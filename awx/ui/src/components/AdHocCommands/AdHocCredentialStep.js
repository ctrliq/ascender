import React, { useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import styled from 'styled-components';
import PropTypes from 'prop-types';
import { useField } from 'formik';
import { Form, FormGroup, Alert } from '@patternfly/react-core';
import { CredentialsAPI } from 'api';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useRequest from 'hooks/useRequest';
import { required } from 'util/validators';
import { getSearchableKeys } from 'components/PaginatedTable';
import Popover from '../Popover';

import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';
import OptionsList from '../OptionsList';

const CredentialErrorAlert = styled(Alert)`
  margin-bottom: 20px;
`;

const QS_CONFIG = getQSConfig('credentials', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

function AdHocCredentialStep({ credentialTypeId }) {
  const { i18n } = useLingui();

  const history = useHistory();
  const {
    error,
    isLoading,
    request: fetchCredentials,
    result: {
      credentials,
      credentialCount,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, history.location.search);

      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        CredentialsAPI.read(
          mergeParams(params, { credential_type: credentialTypeId })
        ),
        CredentialsAPI.readOptions(),
      ]);

      return {
        credentials: results,
        credentialCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [credentialTypeId, history.location.search]),
    {
      credentials: [],
      credentialCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const [field, meta, helpers] = useField({
    name: 'credentials',
    validate: required(null),
  });

  if (error) {
    return <ContentError error={error} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }
  return (
    <>
      {meta.touched && meta.error && (
        <CredentialErrorAlert variant="danger" isInline title={meta.error} />
      )}
      <Form autoComplete="off">
        <FormGroup
          fieldId="credential"
          label={i18n._(msg`Machine Credential`)}
          aria-label={i18n._(msg`Machine Credential`)}
          isRequired
          validated={!meta.touched || !meta.error ? 'default' : 'error'}
          helperTextInvalid={meta.error}
          labelIcon={
            <Popover
              content={i18n._(msg`Select the credential you want to use when accessing the remote hosts to run the command. Choose the credential containing the username and SSH key or password that Ansible will need to log into the remote hosts.`)}
            />
          }
        >
          <OptionsList
            value={field.value || []}
            options={credentials}
            optionCount={credentialCount}
            header={i18n._(msg`Machine Credential`)}
            readOnly
            qsConfig={QS_CONFIG}
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
            name="credential"
            selectItem={(value) => {
              helpers.setValue([value]);
            }}
            deselectItem={() => {
              helpers.setValue([]);
            }}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
          />
        </FormGroup>
      </Form>
    </>
  );
}

AdHocCredentialStep.propTypes = {
  credentialTypeId: PropTypes.number.isRequired,
};
export default AdHocCredentialStep;
