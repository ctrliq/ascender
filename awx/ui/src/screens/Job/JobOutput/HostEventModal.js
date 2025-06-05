import React, { useEffect, useState } from 'react';
import { Modal, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import PropTypes from 'prop-types';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { encode } from 'html-entities';
import { jsonToYaml } from 'util/yaml';
import StatusLabel from '../../../components/StatusLabel';
import { DetailList, Detail } from '../../../components/DetailList';
import ContentEmpty from '../../../components/ContentEmpty';
import CodeEditor from '../../../components/CodeEditor';

const processEventStatus = (event) => {
  let status = null;
  if (event.event === 'runner_on_unreachable') {
    status = 'unreachable';
  }
  // equiv to 'runner_on_error' && 'runner_on_failed'
  if (event.failed) {
    status = 'failed';
  }
  if (
    event.event === 'runner_on_ok' ||
    event.event === 'runner_on_async_ok' ||
    event.event === 'runner_item_on_ok'
  ) {
    status = 'ok';
  }
  // if 'ok' and 'changed' are both true, show 'changed'
  if (event.changed) {
    status = 'changed';
  }
  if (event.event === 'runner_on_skipped') {
    status = 'skipped';
  }
  return status;
};

const processCodeEditorValue = (value) => {
  let codeEditorValue;
  if (!value) {
    codeEditorValue = '';
  } else if (typeof value === 'string') {
    codeEditorValue = encode(value);
  } else if (Array.isArray(value)) {
    codeEditorValue = encode(value.join(' '));
  } else {
    codeEditorValue = value;
  }
  return codeEditorValue;
};

const getStdOutValue = (hostEvent) => {
  const taskAction = hostEvent?.event_data?.task_action;
  const res = hostEvent?.event_data?.res;

  let stdOut;
  if (taskAction === 'debug' && res?.result?.stdout) {
    stdOut = res.result.stdout;
  } else if (taskAction === 'yum' && Array.isArray(res?.results)) {
    stdOut = res.results.join('\n');
  } else if (res?.stdout) {
    stdOut = Array.isArray(res.stdout) ? res.stdout.join(' ') : res.stdout;
  }
  return stdOut;
};

function HostEventModal({ onClose, hostEvent = {}, isOpen = false }) {
  const { i18n } = useLingui();
  const [hostStatus, setHostStatus] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState(0);
  useEffect(() => {
    setHostStatus(processEventStatus(hostEvent));
  }, [setHostStatus, hostEvent]);

  const handleTabClick = (event, tabIndex) => {
    setActiveTabKey(tabIndex);
  };

  const jsonObj = processCodeEditorValue(hostEvent?.event_data?.res);
  const stdErr = hostEvent?.event_data?.res?.stderr;
  const stdOut = getStdOutValue(hostEvent);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={i18n._(msg`Host Details`)}
      aria-label={i18n._(msg`Host details modal`)}
      width="75%"
      ouiaId="host-event-modal"
    >
      <Tabs
        aria-label={i18n._(msg`Tabs`)}
        activeKey={activeTabKey}
        onSelect={handleTabClick}
        ouiaId="host-event-tabs"
      >
        <Tab
          aria-label={i18n._(msg`Details tab`)}
          ouiaId="details-tab"
          eventKey={0}
          title={<TabTitleText>{i18n._(msg`Details`)}</TabTitleText>}
        >
          <DetailList
            style={{ alignItems: 'center', marginTop: '20px' }}
            gutter="sm"
          >
            <Detail label={i18n._(msg`Host`)} value={hostEvent.event_data?.host} />
            {hostEvent.summary_fields?.host?.description ? (
              <Detail
                label={i18n._(msg`Description`)}
                value={hostEvent.summary_fields?.host?.description}
              />
            ) : null}
            {hostStatus ? (
              <Detail
                label={i18n._(msg`Status`)}
                value={<StatusLabel status={hostStatus} />}
              />
            ) : null}
            <Detail label={i18n._(msg`Play`)} value={hostEvent.play} />
            <Detail label={i18n._(msg`Task`)} value={hostEvent.task} />
            <Detail
              label={i18n._(msg`Module`)}
              value={hostEvent.event_data?.task_action || i18n._(msg`No result found`)}
            />
            <Detail label={i18n._(msg`Command`)} value={hostEvent.event_data?.res?.cmd} />
          </DetailList>
        </Tab>
        <Tab
          eventKey={1}
          title={<TabTitleText>{i18n._(msg`JSON`)}</TabTitleText>}
          aria-label={i18n._(msg`JSON tab`)}
          ouiaId="json-tab"
        >
          {activeTabKey === 1 && jsonObj ? (
            <CodeEditor
              mode="javascript"
              readOnly
              value={JSON.stringify(jsonObj, null, 2)}
              onChange={() => {}}
              rows={20}
              hasErrors={false}
            />
          ) : (
            <ContentEmpty title={i18n._(msg`No JSON Available`)} />
          )}
        </Tab>
        <Tab
          eventKey={2}
          title={<TabTitleText>{i18n._(msg`YAML`)}</TabTitleText>}
          aria-label={i18n._(msg`YAML tab`)}
          ouiaId="yaml-tab"
        >
          {activeTabKey === 2 && jsonObj ? (
            <CodeEditor
              mode="javascript"
              readOnly
              value={jsonToYaml(JSON.stringify(jsonObj))}
              onChange={() => {}}
              rows={20}
              hasErrors={false}
            />
          ) : (
            <ContentEmpty title={i18n._(msg`No YAML Available`)} />
          )}
        </Tab>
        {stdOut?.length ? (
          <Tab
            eventKey={3}
            title={<TabTitleText>{i18n._(msg`Output`)}</TabTitleText>}
            aria-label={i18n._(msg`Output tab`)}
            ouiaId="standard-out-tab"
          >
            <CodeEditor
              mode="javascript"
              readOnly
              value={stdOut}
              onChange={() => {}}
              rows={20}
              hasErrors={false}
            />
          </Tab>
        ) : null}
        {stdErr?.length ? (
          <Tab
            eventKey={4}
            title={<TabTitleText>{i18n._(msg`Standard Error`)}</TabTitleText>}
            aria-label={i18n._(msg`Standard error tab`)}
            ouiaId="standard-error-tab"
          >
            <CodeEditor
              mode="javascript"
              readOnly
              onChange={() => {}}
              value={stdErr}
              hasErrors={false}
              rows={20}
            />
          </Tab>
        ) : null}
      </Tabs>
    </Modal>
  );
}

export default HostEventModal;

HostEventModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  hostEvent: PropTypes.shape({}),
  isOpen: PropTypes.bool,
};

HostEventModal.defaultProps = {
  hostEvent: null,
  isOpen: false,
};
