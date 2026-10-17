import React, { useCallback, useEffect, useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useLocation, useNavigate } from 'react-router';

import type { ExecutionEnvironment, SummaryFieldRef } from 'types/api';
import { ExecutionEnvironmentsAPI } from 'api';
import { Config } from 'contexts/Config';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import ExecutionEnvironmentForm from '../shared/ExecutionEnvironmentForm';
import type { ExecutionEnvironmentFormValues } from '../shared/ExecutionEnvironmentForm';

function ExecutionEnvironmentAdd() {
  const location = useLocation();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);
  /*
   * An organization's Execution Environments tab sends its organization
   * along, so the new one is made in it without the reader picking it again,
   * and Cancel goes back to that tab rather than to the list of every one.
   */
  const organization =
    (location.state as { organization?: SummaryFieldRef } | null)
      ?.organization ?? null;

  /*
   * What the form draws with, read here rather than inside it: read there, the
   * card was already on screen and a second loading animation ran inside it.
   */
  const {
    request: fetchFormOptions,
    result: formOptions,
    isLoading,
    error: contentError,
  } = useRequest(
    useCallback(async () => {
      const { data } = await ExecutionEnvironmentsAPI.readOptions();
      return data;
    }, []),
    null
  );

  useEffect(() => {
    fetchFormOptions();
  }, [fetchFormOptions]);

  const handleSubmit = async (values: ExecutionEnvironmentFormValues) => {
    try {
      const { data: response } = await ExecutionEnvironmentsAPI.create({
        ...values,
        credential: values.credential?.id,
        organization: values.organization?.id,
      });
      navigate(`/execution_environments/${response.id}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(
      organization
        ? `/organizations/${organization.id}/execution_environments`
        : `/execution_environments`
    );
  };

  const hubParams = {
    description: '',
    image: '',
    name: '',
  };

  location.search
    .replace(/^\?/, '')
    .split('&')
    .map((s) => s.split('='))
    .forEach(([key, val]) => {
      if (!key || !(key in hubParams)) {
        return;
      }
      hubParams[key as keyof typeof hubParams] = decodeURIComponent(
        val as string
      );
    });

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentError error={contentError} />
      </PageSection>
    );
  }

  if (isLoading || !formOptions) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <Config>
            {({ me }) => (
              <ExecutionEnvironmentForm
                options={formOptions}
                onSubmit={handleSubmit}
                submitError={submitError}
                onCancel={handleCancel}
                me={me || {}}
                executionEnvironment={
                  organization
                    ? ({
                        ...hubParams,
                        summary_fields: { organization },
                      } as Partial<ExecutionEnvironment>)
                    : hubParams
                }
              />
            )}
          </Config>
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentAdd;
