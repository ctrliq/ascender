import 'styled-components/macro';
import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button } from '@patternfly/react-core';
import { Host } from 'types';
import { CardBody, CardActionsRow } from 'components/Card';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import Sparkline from 'components/Sparkline';
import DeleteButton from 'components/DeleteButton';
import { HostsAPI } from 'api';
import HostToggle from 'components/HostToggle';

function InventoryHostDetail({ host }) {
  const {
    created,
    description,
    id,
    modified,
    name,
    variables,
    summary_fields: {
      inventory,
      recent_jobs,
      created_by,
      modified_by,
      user_capabilities,
    },
  } = host;
  const { i18n } = useLingui();
  const [isLoading, setIsloading] = useState(false);
  const [deletionError, setDeletionError] = useState(false);
  const history = useHistory();

  const handleHostDelete = async () => {
    setIsloading(true);
    try {
      await HostsAPI.destroy(id);
      history.push(`/inventories/inventory/${inventory.id}/hosts`);
    } catch (err) {
      setDeletionError(err);
    } finally {
      setIsloading(false);
    }
  };

  if (!isLoading && deletionError) {
    return (
      <AlertModal
        isOpen={deletionError}
        variant="error"
        title={i18n._(msg`Error!`)}
        onClose={() => setDeletionError(false)}
      >
        {i18n._(msg`Failed to delete ${name}.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    );
  }

  const recentPlaybookJobs = recent_jobs.map((job) => ({
    ...job,
    type: 'job',
  }));

  return (
    <CardBody>
      <HostToggle host={host} css="padding-bottom: 40px" />
      <DetailList gutter="sm">
        <Detail label={i18n._(msg`Name`)} value={name} />
        <Detail
          label={i18n._(msg`Activity`)}
          value={<Sparkline jobs={recentPlaybookJobs} />}
          isEmpty={recentPlaybookJobs?.length === 0}
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        <UserDateDetail date={created} label={i18n._(msg`Created`)} user={created_by} />
        <UserDateDetail
          date={modified}
          label={i18n._(msg`Last Modified`)}
          user={modified_by}
        />
        <VariablesDetail
          label={i18n._(msg`Variables`)}
          rows={4}
          value={variables}
          name="variables"
          dataCy="inventory-host-detail-variables"
        />
      </DetailList>
      <CardActionsRow>
        {user_capabilities?.edit && (
          <Button
            ouiaId="inventory-host-detail-edit-button"
            aria-label={i18n._(msg`edit`)}
            component={Link}
            to={`/inventories/inventory/${inventory.id}/hosts/${id}/edit`}
          >
            {i18n._(msg`Edit`)}
          </Button>
        )}
        {user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={i18n._(msg`Delete Host`)}
            onConfirm={() => handleHostDelete()}
          />
        )}
      </CardActionsRow>
      {deletionError && (
        <AlertModal
          isOpen={deletionError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={() => setDeletionError(null)}
        >
          {i18n._(msg`Failed to delete host.`)}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </CardBody>
  );
}

InventoryHostDetail.propTypes = {
  host: Host.isRequired,
};

export default InventoryHostDetail;
