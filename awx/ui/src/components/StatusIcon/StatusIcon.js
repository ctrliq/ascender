import React from 'react';
import icons from './icons';

const green = "--pf-t--global--color--status--success--default";
const red = "--pf-t--global--color--status--danger--default";
const blue = "--pf-t--global--color--brand--default";
const lightBlue = "--ascender-status-running-color";
const orange = "--ascender-status-canceled-color";
const gray = "--pf-t--global--text--color--300";
const colors = {
  success: green,
  successful: green,
  healthy: green,
  ok: green,
  failed: red,
  error: red,
  unreachable: red,
  running: lightBlue,
  pending: blue,
  skipped: blue,
  waiting: gray,
  disabled: gray,
  canceled: orange,
  changed: orange,
  /* Instance statuses */
  ready: green,
  installed: blue,
  provisioning: gray,
  deprovisioning: gray,
  unavailable: red,
  'provision-fail': red,
  'deprovision-fail': red,
};

function StatusIcon({ status, ...props }) {
  const color = colors[status] || '--pf-v6-chart-global--Fill--Color--500';
  const Icon = icons[status];
  return (
    <div {...props} data-job-status={status} aria-label={status}>
      {Icon ? (
        <div style={{ color: `var(${color})` }}>
          <Icon label={status} />
        </div>
      ) : null}
      <span className="pf-v6-screen-reader"> {status} </span>
    </div>
  );
}

export default StatusIcon;
