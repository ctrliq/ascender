import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  MinusCircleIcon,
  InfoCircleIcon,
  PlusCircleIcon,
} from '@patternfly/react-icons';

import RunningIcon from './RunningIcon';

const icons = {
  approved: CheckCircleIcon,
  denied: InfoCircleIcon,
  success: CheckCircleIcon,
  healthy: CheckCircleIcon,
  successful: CheckCircleIcon,
  ok: CheckCircleIcon,
  failed: ExclamationCircleIcon,
  error: ExclamationCircleIcon,
  unreachable: ExclamationCircleIcon,
  running: RunningIcon,
  pending: ClockIcon,
  waiting: ClockIcon,
  disabled: MinusCircleIcon,
  skipped: MinusCircleIcon,
  canceled: ExclamationTriangleIcon,
  changed: ExclamationTriangleIcon,
  /* Instance statuses */
  ready: CheckCircleIcon,
  installed: ClockIcon,
  provisioning: PlusCircleIcon,
  deprovisioning: MinusCircleIcon,
  unavailable: ExclamationCircleIcon,
  'provision-fail': ExclamationCircleIcon,
  'deprovision-fail': ExclamationCircleIcon,
};
export default icons;
