import React, { useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Button, Modal } from '@patternfly/react-core';
import { getSearchableKeys } from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import { getQSConfig, parseQueryString } from 'util/qs';
import useSelected from 'hooks/useSelected';
import OptionsList from '../OptionsList';

const QS_CONFIG = (order_by = 'name') =>
  getQSConfig('associate', {
    page: 1,
    page_size: 5,
    order_by,
  });

function AssociateModal({
  header,
  columns = [],
  title,
  onClose,
  onAssociate,
  fetchRequest,
  optionsRequest,
  isModalOpen = false,
  displayKey = 'name',
  ouiaId,
  modalNote,
}) {
  const { i18n } = useLingui();
  const history = useHistory();
  const { selected, handleSelect } = useSelected([]);

  // Set default values for header and title after i18n is available
  header = header || i18n._(msg`Items`);
  title = title || i18n._(msg`Select Items`);

  const {
    request: fetchItems,
    result: { items, itemCount, relatedSearchableKeys, searchableKeys },
    error: contentError,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(
        QS_CONFIG(displayKey),
        history.location.search
      );
      const [
        {
          data: { count, results },
        },
        actionsResponse,
      ] = await Promise.all([fetchRequest(params), optionsRequest()]);

      return {
        items: results,
        itemCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [fetchRequest, optionsRequest, history.location.search, displayKey]),
    {
      items: [],
      itemCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const clearQSParams = () => {
    const parts = history.location.search.replace(/^\?/, '').split('&');
    const { namespace } = QS_CONFIG(displayKey);
    const otherParts = parts.filter(
      (param) => !param.startsWith(`${namespace}.`)
    );
    history.replace(`${history.location.pathname}?${otherParts.join('&')}`);
  };

  const handleSave = async () => {
    await onAssociate(selected);
    clearQSParams();
    onClose();
  };

  const handleClose = () => {
    clearQSParams();
    onClose();
  };

  return (
    <Modal
      ouiaId={ouiaId}
      variant="large"
      title={title}
      aria-label={i18n._(msg`Association modal`)}
      isOpen={isModalOpen}
      onClose={handleClose}
      actions={[
        <Button
          ouiaId="associate-modal-save"
          aria-label={i18n._(msg`Save`)}
          key="select"
          variant="primary"
          onClick={handleSave}
          isDisabled={selected.length === 0}
        >
          {i18n._(msg`Save`)}
        </Button>,
        <Button
          ouiaId="associate-modal-cancel"
          aria-label={i18n._(msg`Cancel`)}
          key="cancel"
          variant="link"
          onClick={handleClose}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      {modalNote}
      <OptionsList
        displayKey={displayKey}
        contentError={contentError}
        columns={columns}
        deselectItem={handleSelect}
        header={header}
        isLoading={isLoading}
        multiple
        optionCount={itemCount}
        options={items}
        qsConfig={QS_CONFIG(displayKey)}
        readOnly={false}
        selectItem={handleSelect}
        value={selected}
        searchColumns={[
          {
            name: i18n._(msg`Name`),
            key: `${displayKey}__icontains`,
            isDefault: true,
          },
          {
            name: i18n._(msg`Created By (Username)`),
            key: 'created_by__username__icontains',
          },
          {
            name: i18n._(msg`Modified By (Username)`),
            key: 'modified_by__username__icontains',
          },
        ]}
        sortColumns={[
          {
            name: i18n._(msg`Name`),
            key: `${displayKey}`,
          },
        ]}
        searchableKeys={searchableKeys}
        relatedSearchableKeys={relatedSearchableKeys}
      />
    </Modal>
  );
}

export default AssociateModal;
