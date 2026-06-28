import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'routerCompat';
import { Card, PageSection } from '@patternfly/react-core';

import { CardBody } from 'components/Card';
import { InstanceGroupsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import ContainerGroupForm from '../shared/ContainerGroupForm';

function ContainerGroupEdit({ instanceGroup }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);
  const detailsIUrl = `/instance_groups/container_group/${instanceGroup.id}/details`;

  const {
    error: fetchError,
    isLoading,
    request: fetchInitialPodSpec,
    result: initialPodSpec,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InstanceGroupsAPI.readInstanceGroupOptions(
        instanceGroup.id
      );
      return data.actions.PUT.pod_spec_override.default;
    }, [instanceGroup.id]),
    {
      initialPodSpec: {},
    }
  );

  useEffect(() => {
    fetchInitialPodSpec();
  }, [fetchInitialPodSpec]);

  const handleSubmit = async (values) => {
    try {
      await InstanceGroupsAPI.update(instanceGroup.id, {
        name: values.name,
        credential: values.credential ? values.credential.id : null,
        pod_spec_override: values.override ? values.pod_spec_override : null,
        max_forks: values.max_forks ? values.max_forks : 0,
        max_concurrent_jobs: values.max_concurrent_jobs
          ? values.max_concurrent_jobs
          : 0,
        is_container_group: true,
      });
      navigate(detailsIUrl);
    } catch (error) {
      setSubmitError(error);
    }
  };
  const handleCancel = () => {
    navigate(detailsIUrl);
  };

  if (fetchError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <CardBody>
            <ContentError error={fetchError} />
          </CardBody>
        </Card>
      </PageSection>
    );
  }

  if (isLoading) {
    return (
      <CardBody>
        <ContentLoading />
      </CardBody>
    );
  }

  return (
    <CardBody>
      <ContainerGroupForm
        instanceGroup={instanceGroup}
        initialPodSpec={initialPodSpec}
        onSubmit={handleSubmit}
        submitError={submitError}
        onCancel={handleCancel}
      />
    </CardBody>
  );
}

export default ContainerGroupEdit;
