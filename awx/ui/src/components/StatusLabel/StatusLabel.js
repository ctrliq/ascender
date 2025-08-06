/* eslint-disable react/jsx-no-useless-fragment */
import 'styled-components/macro';
import React from 'react';
import { t } from '@lingui/react/macro';
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
    approved: i18n._(t`Approved`),
    denied: i18n._(t`Denied`),
    success: i18n._(t`Success`),
    healthy: i18n._(t`Healthy`),
    successful: i18n._(t`Successful`),
    ok: i18n._(t`OK`),
    failed: i18n._(t`Failed`),
    error: i18n._(t`Error`),
    unreachable: i18n._(t`Unreachable`),
    running: i18n._(t`Running`),
    pending: i18n._(t`Pending`),
    skipped: i18n._(t`Skipped`),
    timedOut: i18n._(t`Timed out`),
    waiting: i18n._(t`Waiting`),
    disabled: i18n._(t`Disabled`),
    canceled: i18n._(t`Canceled`),
    changed: i18n._(t`Changed`),
    /* Instance statuses */
    ready: i18n._(t`Ready`),
    installed: i18n._(t`Installed`),
    provisioning: i18n._(t`Provisioning`),
    deprovisioning: i18n._(t`Deprovisioning`),
    unavailable: i18n._(t`Unavailable`),
    'provision-fail': i18n._(t`Provisioning fail`),
    'deprovision-fail': i18n._(t`Deprovisioning fail`),
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
