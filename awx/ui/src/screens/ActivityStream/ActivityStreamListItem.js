import React from 'react';
import { shape } from 'prop-types';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';

import { formatDateString } from 'util/dates';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';

import ActivityStreamDetailButton from './ActivityStreamDetailButton';
import ActivityStreamDescription from './ActivityStreamDescription';

function ActivityStreamListItem({ streamItem }) {
  const { i18n } = useLingui();
  ActivityStreamListItem.propTypes = {
    streamItem: shape({}).isRequired,
  };

  const buildUser = (item) => {
    let link;
    if (item?.summary_fields?.actor?.id) {
      link = (
        <Link to={`/users/${item.summary_fields.actor.id}/details`}>
          {item.summary_fields.actor.username}
        </Link>
      );
    } else if (item?.summary_fields?.actor) {
      link = i18n._(msg`${item.summary_fields.actor.username} (deleted)`);
    } else {
      link = i18n._(msg`system`);
    }
    return link;
  };

  const labelId = `check-action-${streamItem.id}`;
  const user = buildUser(streamItem);
  const description = <ActivityStreamDescription activity={streamItem} />;

  return (
    <Tr id={streamItem.id} ouiaId={streamItem.id} aria-labelledby={labelId}>
      <Td />
      <Td dataLabel={i18n._(msg`Time`)}>
        {streamItem.timestamp ? formatDateString(streamItem.timestamp) : ''}
      </Td>
      <Td dataLabel={i18n._(msg`Initiated By`)}>{user}</Td>
      <Td id={labelId} dataLabel={i18n._(msg`Event`)}>
        {description}
      </Td>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        <ActionItem visible tooltip={i18n._(msg`View event details`)}>
          <ActivityStreamDetailButton
            streamItem={streamItem}
            user={user}
            description={description}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
export default ActivityStreamListItem;
