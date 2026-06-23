import React from 'react';
import icons from './icons';

const green = '--pf-v5-global--success-color--100';
const red = '--pf-v5-global--danger-color--100';
const blue = '--pf-v5-global--primary-color--100';
const orange = '--pf-v5-global--palette--orange-300';
const gray = '--pf-v5-global--Color--300';
const colors = {
  success: green,
  successful: green,
  healthy: green,
  ok: green,
  failed: red,
  error: red,
  unreachable: red,
  running: blue,
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
  const color = colors[status] || '--pf-v5-chart-global--Fill--Color--500';
  const Icon = icons[status];
  return (
    <div {...props} data-job-status={status} aria-label={status}>
      {Icon ? (
        <div style={{ color: `var(${color})` }}>
          <Icon label={status} />
        </div>
      ) : null}
      <span className="pf-screen-reader"> {status} </span>
    </div>
  );
}

export default StatusIcon;
