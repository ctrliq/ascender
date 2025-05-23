import React, { useState } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button, Modal } from '@patternfly/react-core';
import { SearchPlusIcon } from '@patternfly/react-icons';

import { formatDateString } from 'util/dates';

import { DetailList, Detail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';

function ActivityStreamDetailButton({ streamItem, user, description }) {
  const { i18n } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const setting = streamItem?.summary_fields?.setting;
  const changeRows = Math.max(
    Object.keys(streamItem?.changes || []).length + 2,
    6
  );

  return (
    <>
      <Button
        ouiaId={`${streamItem.id}-view-details-button`}
        aria-label={i18n._(msg`View event details`)}
        variant="plain"
        component="button"
        onClick={() => setIsOpen(true)}
      >
        <SearchPlusIcon />
      </Button>
      <Modal
        variant="large"
        isOpen={isOpen}
        title={i18n._(msg`Event detail`)}
        aria-label={i18n._(msg`Event detail modal`)}
        onClose={() => setIsOpen(false)}
      >
        <DetailList gutter="sm">
          <Detail
            label={i18n._(msg`Time`)}
            value={formatDateString(streamItem.timestamp)}
          />
          <Detail label={i18n._(msg`Initiated by`)} value={user} />
          <Detail
            label={i18n._(msg`Setting category`)}
            value={setting && setting[0]?.category}
          />
          <Detail label={i18n._(msg`Setting name`)} value={setting && setting[0]?.name} />
          <Detail fullWidth label={i18n._(msg`Action`)} value={description} />
          {streamItem?.changes && (
            <VariablesDetail
              label={i18n._(msg`Changes`)}
              rows={changeRows}
              value={
                streamItem?.changes ? JSON.stringify(streamItem.changes) : ''
              }
              name="changes"
              dataCy="activity-stream-detail-changes"
            />
          )}
        </DetailList>
      </Modal>
    </>
  );
}

export default ActivityStreamDetailButton;
