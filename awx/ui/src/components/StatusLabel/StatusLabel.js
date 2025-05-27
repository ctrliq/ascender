/* eslint-disable react/jsx-no-useless-fragment */
import 'styled-components/macro';
import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { oneOf } from 'prop-types';
import { Label, Tooltip } from '@patternfly/react-core';
import icons from '../StatusIcon/icons';

const colors = {
  approved: 'green',
  denied: 'red',
  success: 'green',
  successful: 'green',
  ok: 'green',
  healthy: 'green',
  failed: 'red',
  error: 'red',
  unreachable: 'red',
  running: 'blue',
  pending: 'blue',
  skipped: 'blue',
  timedOut: 'red',
  waiting: 'grey',
  disabled: 'grey',
  canceled: 'orange',
  changed: 'orange',
  /* Instance statuses */
  ready: 'green',
  installed: 'blue',
  provisioning: 'gray',
  deprovisioning: 'gray',
  unavailable: 'red',
  'provision-fail': 'red',
  'deprovision-fail': 'red',
};

export default function StatusLabel({ status, tooltipContent = '', children }) {
  const { i18n } = useLingui();
  const upperCaseStatus = {
    approved: i18n._(msg`Approved`),
    denied: i18n._(msg`Denied`),
    success: i18n._(msg`Success`),
    healthy: i18n._(msg`Healthy`),
    successful: i18n._(msg`Successful`),
    ok: i18n._(msg`OK`),
    failed: i18n._(msg`Failed`),
    error: i18n._(msg`Error`),
    unreachable: i18n._(msg`Unreachable`),
    running: i18n._(msg`Running`),
    pending: i18n._(msg`Pending`),
    skipped: i18n._(msg`Skipped`),
    timedOut: i18n._(msg`Timed out`),
    waiting: i18n._(msg`Waiting`),
    disabled: i18n._(msg`Disabled`),
    canceled: i18n._(msg`Canceled`),
    changed: i18n._(msg`Changed`),
    /* Instance statuses */
    ready: i18n._(msg`Ready`),
    installed: i18n._(msg`Installed`),
    provisioning: i18n._(msg`Provisioning`),
    deprovisioning: i18n._(msg`Deprovisioning`),
    unavailable: i18n._(msg`Unavailable`),
    'provision-fail': i18n._(msg`Provisioning fail`),
    'deprovision-fail': i18n._(msg`Deprovisioning fail`),
  };
  const label = upperCaseStatus[status] || status;
  const color = colors[status] || 'grey';
  const Icon = icons[status];

  const renderLabel = () => (
    <Label variant="outline" color={color} icon={Icon ? <Icon /> : null}>
      {children || label}
    </Label>
  );

  return (
    <>
      {tooltipContent ? (
        <Tooltip content={tooltipContent} position="top">
          {renderLabel()}
        </Tooltip>
      ) : (
        renderLabel()
      )}
    </>
  );
}

StatusLabel.propTypes = {
  status: oneOf([
    'approved',
    'denied',
    'success',
    'successful',
    'ok',
    'healthy',
    'failed',
    'error',
    'unreachable',
    'running',
    'pending',
    'skipped',
    'timedOut',
    'waiting',
    'disabled',
    'canceled',
    'changed',
    'ready',
    'installed',
    'provisioning',
    'deprovisioning',
    'unavailable',
    'provision-fail',
    'deprovision-fail',
  ]).isRequired,
};
