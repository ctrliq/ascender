import styled, { keyframes } from 'styled-components';
import {
  LucideIconCircleAlert,
  LucideIconCircleCheck,
  LucideIconClock,
  LucideIconInfo,
  LucideIconCircleMinus,
  LucideIconCirclePlus,
  LucideIconRefreshCw,
  LucideIconTriangleAlert,
} from '@ctrliq/quantic-react';

const Spin = keyframes`
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(1turn);
  }
`;

const RunningIcon = styled(LucideIconRefreshCw)`
  animation: ${Spin} 1.75s linear infinite;
`;
RunningIcon.displayName = 'RunningIcon';

const icons = {
  approved: LucideIconCircleCheck,
  denied: LucideIconInfo,
  success: LucideIconCircleCheck,
  healthy: LucideIconCircleCheck,
  successful: LucideIconCircleCheck,
  ok: LucideIconCircleCheck,
  failed: LucideIconCircleAlert,
  error: LucideIconCircleAlert,
  unreachable: LucideIconCircleAlert,
  running: RunningIcon,
  pending: LucideIconClock,
  waiting: LucideIconClock,
  disabled: LucideIconCircleMinus,
  skipped: LucideIconCircleMinus,
  canceled: LucideIconTriangleAlert,
  changed: LucideIconTriangleAlert,
  /* Instance statuses */
  ready: LucideIconCircleCheck,
  installed: LucideIconClock,
  provisioning: LucideIconCirclePlus,
  deprovisioning: LucideIconCircleMinus,
  unavailable: LucideIconCircleAlert,
  'provision-fail': LucideIconCircleAlert,
  'deprovision-fail': LucideIconCircleAlert,
};
export default icons;
