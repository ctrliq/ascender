import React, { useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useHistory, useParams } from 'react-router-dom';
import { Button } from '@patternfly/react-core';

import { VariablesDetail } from 'components/CodeEditor';
import { CardBody, CardActionsRow } from 'components/Card';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import InventoryGroupsDeleteModal from '../shared/InventoryGroupsDeleteModal';

function InventoryGroupDetail({ inventoryGroup }) {
  const { i18n } = useLingui();
  const { inventoryType, id, groupId } = useParams();
  const {
    summary_fields: { created_by, modified_by, user_capabilities },
    created,
    modified,
    name,
    description,
    variables,
  } = inventoryGroup;
  const [error, setError] = useState(false);
  const history = useHistory();

  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="inventory-group-detail-name"
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        <VariablesDetail
          label={i18n._(msg`Variables`)}
          value={variables}
          rows={4}
          name="variables"
          dataCy="inventory-group-detail-variables"
        />
        <UserDateDetail label={i18n._(msg`Created`)} date={created} user={created_by} />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={modified}
          user={modified_by}
        />
      </DetailList>
      {inventoryType !== 'constructed_inventory' && (
        <CardActionsRow>
          {user_capabilities?.edit && (
            <Button
              ouiaId="inventory-group-detail-edit-button"
              variant="primary"
              aria-label={i18n._(msg`Edit`)}
              onClick={() =>
                history.push(
                  `/inventories/inventory/${id}/groups/${groupId}/edit`
                )
              }
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
          {user_capabilities?.delete && (
            <InventoryGroupsDeleteModal
              groups={[inventoryGroup]}
              isDisabled={false}
              onAfterDelete={() =>
                history.push(`/inventories/inventory/${id}/groups`)
              }
            />
          )}
        </CardActionsRow>
      )}
      {error && (
        <AlertModal
          variant="error"
          title={i18n._(msg`Error!`)}
          isOpen={error}
          onClose={() => setError(false)}
        >
          {i18n._(msg`Failed to delete group ${inventoryGroup.name}.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}
export default InventoryGroupDetail;
