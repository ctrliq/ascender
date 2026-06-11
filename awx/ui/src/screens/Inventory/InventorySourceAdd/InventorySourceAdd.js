import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { Card } from '@patternfly/react-core';
import { InventorySourcesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { CardBody } from 'components/Card';
import InventorySourceForm from '../shared/InventorySourceForm';

function InventorySourceAdd({ inventory }) {
  const navigate = useNavigate();
  const { id, organization } = inventory;

  const { error, request, result } = useRequest(
    useCallback(async (values) => {
      const { data } = await InventorySourcesAPI.create(values);
      return data;
    }, [])
  );

  useEffect(() => {
    if (result) {
      navigate(
        `/inventories/inventory/${result.inventory}/sources/${result.id}/details`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is not
    // referentially stable in react-router-dom-v5-compat
  }, [result]);

  const handleSubmit = async (form) => {
    const {
      credential,
      source_path,
      source_project,
      source_script,
      execution_environment,
      ...remainingForm
    } = form;

    const sourcePath = {};
    const sourceProject = {};
    if (form.source === 'scm') {
      sourcePath.source_path =
        source_path === '/ (project root)' ? '' : source_path;
      sourceProject.source_project = source_project.id;
    }

    await request({
      credential: credential?.id || null,
      inventory: id,
      source_script: source_script?.id || null,
      execution_environment: execution_environment?.id || null,
      ...sourcePath,
      ...sourceProject,
      ...remainingForm,
    });
  };

  const handleCancel = () => {
    navigate(`/inventories/inventory/${id}/sources`);
  };

  return (
    <Card>
      <CardBody>
        <InventorySourceForm
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitError={error}
          organizationId={organization}
        />
      </CardBody>
    </Card>
  );
}

export default InventorySourceAdd;
