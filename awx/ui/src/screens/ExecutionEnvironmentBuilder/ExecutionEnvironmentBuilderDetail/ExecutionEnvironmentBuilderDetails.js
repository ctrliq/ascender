import React, { useState, useCallback } from 'react';
import { useParams, Link, useHistory } from 'react-router-dom';
import { Card, PageSection, Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import DeleteButton from 'components/DeleteButton';
import AlertModal from 'components/AlertModal';

function ExecutionEnvironmentBuilderDetails({ builder, isLoading }) {
  const { t } = useLingui();
  const { id } = useParams();
  const history = useHistory();
  const [isLaunchDisabled, setIsLaunchDisabled] = useState(false);

  const {
    request: deleteBuilder,
    isLoading: deleteLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await ExecutionEnvironmentBuildersAPI.destroy(id);
      history.push('/execution_environment_builders');
    }, [id, history])
  );

  const launchBuilder = useCallback(async () => {
    try {
      setIsLaunchDisabled(true);
      const response = await ExecutionEnvironmentBuildersAPI.launch(id, {
        name: `${builder?.name}`,
      });
      if (response.status === 201) {
        history.push(`/jobs/build/${response.data.execution_environment_builder_build}`);
      }
    } catch (error) {
      setIsLaunchDisabled(false);
    }
  }, [id, builder?.name, history]);

  const { error, dismissError } = useDismissableError(deleteError);

  if (isLoading) {
    return <ContentLoading />;
  }

  if (!builder) {
    return <div>{t`Execution Environment Builder not found`}</div>;
  }

  return (
    <PageSection>
      <Card>
        <CardBody>
          <DetailList>
            <Detail
              label={t`Name`}
              value={builder.name}
            />
            <Detail
              label={t`Image`}
              value={builder.image}
            />
            <Detail
              label={t`Tag`}
              value={builder.tag}
            />
            {builder.definition && (
              <VariablesDetail
                label={t`Definition`}
                value={builder.definition}
                rows={20}
                name="definition"
                dataCy="builder-detail-definition"
              />
            )}
            {builder.organization && (
              <Detail
                label={t`Organization`}
                value={
                  <Link to={`/organizations/${builder.organization.id}`}>
                    {builder.organization.name}
                  </Link>
                }
              />
            )}
            {builder.summary_fields?.credential && (
              <Detail
                label={t`Credential`}
                value={builder.summary_fields.credential.name}
              />
            )}
            <UserDateDetail
              label={t`Created`}
              date={builder.created}
              user={builder.summary_fields?.created_by}
            />
            <UserDateDetail
              label={t`Last Modified`}
              date={builder.modified}
              user={builder.summary_fields?.modified_by}
            />
          </DetailList>
          <CardActionsRow>
            <Button
              onClick={launchBuilder}
              isDisabled={isLaunchDisabled}
              ouiaId="builder-detail-launch-button"
              variant="primary"
            >
              {t`Launch`}
            </Button>
            {builder.summary_fields?.user_capabilities?.edit && (
              <Button
                component={Link}
                to={`/execution_environment_builders/${id}/edit`}
              >
                {t`Edit`}
              </Button>
            )}
            {builder.summary_fields?.user_capabilities?.delete && (
              <DeleteButton
                name={builder.name}
                modalTitle={t`Delete Execution Environment Builder`}
                onConfirm={deleteBuilder}
                isDisabled={deleteLoading}
              >
                {t`Delete`}
              </DeleteButton>
            )}
          </CardActionsRow>
          {error && (
            <AlertModal
              isOpen={error}
              onClose={dismissError}
              title={t`Error`}
              variant="error"
            />
          )}
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentBuilderDetails;
