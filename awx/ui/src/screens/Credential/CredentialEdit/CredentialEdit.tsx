import type { Credential, Untyped } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CardBody } from 'components/Card';
import {
  CredentialsAPI,
  CredentialInputSourcesAPI,
  CredentialTypesAPI,
  OrganizationsAPI,
  UsersAPI,
} from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import CredentialForm from '../shared/CredentialForm';

export interface CredentialEditProps {
  credential: Credential;
  [key: string]: unknown;
}

function CredentialEdit({ credential }: CredentialEditProps) {
  const navigate = useNavigate();
  const { id: credId } = useParams() as { id: string };
  const { me = {} } = useConfig();
  const [isOrgLookupDisabled, setIsOrgLookupDisabled] = useState(false);

  const {
    error: submitError,
    request: submitRequest,
    result,
  } = useRequest(
    useCallback(
      async (
        values: Untyped,
        credentialTypesMap: Untyped,
        inputSourceMap: Untyped
      ) => {
        const { inputs: credentialTypeInputs } =
          credentialTypesMap[values.credential_type];

        const { inputs, organization, passwordPrompts, ...remainingValues } =
          values;

        const nonPluginInputs: Record<string, Untyped> = {};
        const pluginInputs: Record<string, Untyped> = {};
        const possibleFields = credentialTypeInputs.fields || [];

        possibleFields.forEach((field: Untyped) => {
          const input = inputs[field.id];
          if (input?.credential && input?.inputs) {
            pluginInputs[field.id] = input;
          } else if (passwordPrompts[field.id]) {
            nonPluginInputs[field.id] = 'ASK';
          } else {
            nonPluginInputs[field.id] = input;
          }
        });

        const createAndUpdateInputSources = () =>
          Object.entries(pluginInputs).map(
            ([fieldName, fieldValue]: Untyped[]) => {
              if (!inputSourceMap[fieldName]) {
                return CredentialInputSourcesAPI.create({
                  input_field_name: fieldName,
                  metadata: fieldValue.inputs,
                  source_credential: fieldValue.credential.id,
                  target_credential: credId,
                });
              }
              if (fieldValue.touched) {
                return CredentialInputSourcesAPI.update(
                  inputSourceMap[fieldName].id,
                  {
                    metadata: fieldValue.inputs,
                    source_credential: fieldValue.credential.id,
                  }
                );
              }

              return null;
            }
          );

        const destroyInputSources = () =>
          Object.values<Untyped>(inputSourceMap).map((inputSource) => {
            const { id, input_field_name } = inputSource;
            if (!inputs[input_field_name]?.credential) {
              return CredentialInputSourcesAPI.destroy(id);
            }
            return null;
          });

        const modifiedData = { inputs: nonPluginInputs, ...remainingValues };
        // can send only one of org, user, team
        if (organization?.id) {
          modifiedData.organization = organization.id;
        } else {
          modifiedData.organization = null;
          if (me?.id) {
            modifiedData.user = me.id;
          }
        }

        if (credential.kind === 'vault' && !credential.inputs?.vault_id) {
          delete modifiedData.inputs.vault_id;
        }

        const [{ data }] = await Promise.all([
          CredentialsAPI.update(credId, modifiedData),
          ...destroyInputSources(),
        ]);

        await Promise.all(createAndUpdateInputSources());

        return data;
      },
      [me, credId, credential]
    )
  );

  useEffect(() => {
    if (result) {
      navigate(`/credentials/${result.id}/details`);
    }
    // navigate is not referentially stable in react-router-dom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  const {
    isLoading,
    error,
    request: loadData,
    result: { credentialTypes, loadedInputSources },
  } = useRequest(
    useCallback(async () => {
      const [
        { data },
        {
          data: { results },
        },
        {
          data: { count: adminOrgCount },
        },
        {
          data: { count: credentialAdminCount },
        },
      ] = await Promise.all([
        CredentialTypesAPI.read({ page_size: 200 }),
        CredentialsAPI.readInputSources(credId),
        UsersAPI.readAdminOfOrganizations(me?.id as number),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'credential_admin_role',
        }),
      ]);
      setIsOrgLookupDisabled(!(adminOrgCount || credentialAdminCount));
      const credTypes = data.results;
      if (data.next && data.next.includes('page=2')) {
        const {
          data: { results: additionalCredTypes },
        } = await CredentialTypesAPI.read({
          page_size: 200,
          page: 2,
        });
        credTypes.concat([...additionalCredTypes]);
      }
      const creds = credTypes.reduce(
        (credentialTypesMap: Untyped, credentialType: Untyped) => {
          credentialTypesMap[credentialType.id] = credentialType;
          return credentialTypesMap;
        },
        {}
      );
      const inputSources = results.reduce(
        (inputSourcesMap: Record<string, Untyped>, inputSource: Untyped) => {
          inputSourcesMap[inputSource.input_field_name] = inputSource;
          return inputSourcesMap;
        },
        {}
      );
      return { credentialTypes: creds, loadedInputSources: inputSources };
    }, [credId, me?.id]),
    { credentialTypes: {}, loadedInputSources: {} }
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancel = () => {
    const url = `/credentials/${credId}/details`;
    navigate(`${url}`);
  };

  const handleSubmit = async (values: Untyped) => {
    await submitRequest(values, credentialTypes, loadedInputSources);
  };

  if (error) {
    return <ContentError error={error} />;
  }

  if (isLoading || !credentialTypes) {
    return <ContentLoading />;
  }

  return (
    <CardBody>
      <CredentialForm
        onCancel={handleCancel}
        onSubmit={handleSubmit}
        credential={credential}
        credentialTypes={credentialTypes}
        inputSources={loadedInputSources}
        submitError={submitError}
        isOrgLookupDisabled={isOrgLookupDisabled}
      />
    </CardBody>
  );
}

export { CredentialEdit as _CredentialEdit };
export default CredentialEdit;
