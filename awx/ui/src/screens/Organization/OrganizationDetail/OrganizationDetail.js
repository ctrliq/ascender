import React, { useEffect, useState, useCallback } from 'react';
import { Link, useHistory, useRouteMatch } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Button } from '@patternfly/react-core';
import { OrganizationsAPI } from 'api';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import { CardBody, CardActionsRow } from 'components/Card';
import AlertModal from 'components/AlertModal';
import ChipGroup from 'components/ChipGroup';
import CredentialChip from 'components/CredentialChip';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

function OrganizationDetail({ organization }) {
  const {
    params: { id },
  } = useRouteMatch();
  const {
    name,
    description,
    custom_virtualenv,
    max_hosts,
    created,
    modified,
    summary_fields,
    galaxy_credentials = [],
  } = organization;
  const [contentError, setContentError] = useState(null);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const [instanceGroups, setInstanceGroups] = useState([]);
  const history = useHistory();
  const { license_info = {} } = useConfig();
  const { i18n } = useLingui();

  useEffect(() => {
    (async () => {
      setContentError(null);
      setHasContentLoading(true);
      try {
        const {
          data: { results = [] },
        } = await OrganizationsAPI.readInstanceGroups(id);
        setInstanceGroups(results);
      } catch (error) {
        setContentError(error);
      } finally {
        setHasContentLoading(false);
      }
    })();
  }, [id]);

  const {
    request: deleteOrganization,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await OrganizationsAPI.destroy(id);
      history.push(`/organizations`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const deleteDetailsRequests =
    relatedResourceDeleteRequests.organization(organization);

  if (hasContentLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="organization-detail-name"
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        {license_info?.license_type !== 'open' && (
          <Detail
            label={i18n._(msg`Max Hosts`)}
            value={`${max_hosts}`}
            helpText={i18n._(msg`The maximum number of hosts allowed to be managed by
            this organization. Value defaults to 0 which means no limit.
            Refer to the Ansible documentation for more details.`)}
          />
        )}
        <ExecutionEnvironmentDetail
          virtualEnvironment={custom_virtualenv}
          executionEnvironment={summary_fields?.default_environment}
          isDefaultEnvironment
          helpText={i18n._(msg`The execution environment that will be used for jobs
          inside of this organization. This will be used a fallback when
          an execution environment has not been explicitly assigned at the
          project, job template or workflow level.`)}
        />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={created}
          user={summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={modified}
          user={summary_fields.modified_by}
        />
        {instanceGroups && (
          <Detail
            fullWidth
            label={i18n._(msg`Instance Groups`)}
            helpText={i18n._(
              msg`The Instance Groups for this Organization to run on.`
            )}
            value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
            isEmpty={instanceGroups.length === 0}
          />
        )}
        <Detail
          fullWidth
          label={i18n._(msg`Galaxy Credentials`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={galaxy_credentials?.length}
              ouiaId="galaxy-credential-chips"
            >
              {galaxy_credentials?.map((credential) => (
                <Link
                  key={credential.id}
                  to={`/credentials/${credential.id}/details`}
                >
                  <CredentialChip
                    credential={credential}
                    key={credential.id}
                    isReadOnly
                    ouiaId={`galaxy-credential-${credential.id}-chip`}
                  />
                </Link>
              ))}
            </ChipGroup>
          }
          isEmpty={galaxy_credentials?.length === 0}
        />
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities.edit && (
          <Button
            ouiaId="organization-detail-edit-button"
            aria-label={i18n._(msg`Edit`)}
            component={Link}
            to={`/organizations/${id}/edit`}
          >
            {i18n._(msg`Edit`)}
          </Button>
        )}
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.delete && (
            <DeleteButton
              name={name}
              modalTitle={i18n._(msg`Delete Organization`)}
              onConfirm={deleteOrganization}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={i18n._(
                msg`This organization is currently being by other resources. Are you sure you want to delete it?`
              )}
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
      </CardActionsRow>
      {/* Update delete modal to show dependencies https://github.com/ansible/awx/issues/5546 */}
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete organization.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default OrganizationDetail;
