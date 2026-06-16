import React from 'react';
import { render } from '@testing-library/react';
import StatusIcon from './StatusIcon';

// The PF icon SVGs have role="img" but no distinguishing accessible name,
// so to preserve the original per-icon assertions we match on the SVG path
// data, which is unique per icon component. Each prefix below identifies the
// icon the original enzyme test looked up by component name.
const ICON_PATH_PREFIX = {
  CheckCircleIcon: 'M504 256c0 136.967-111.033 248',
  RunningIcon: 'M370.72 133.28C339.458 104.008',
  ClockIcon: 'M256,8C119,8,8,119,8,256S119,5',
  ExclamationCircleIcon: 'M504 256c0 136.997-111.043 248',
  ExclamationTriangleIcon: 'M569.517 440.013C587.975 472.0',
  MinusCircleIcon: 'M256 8C119 8 8 119 8 256s111 2',
};

function expectIcon(container, iconName) {
  const path = container.querySelector('svg path').getAttribute('d');
  expect(path).toContain(ICON_PATH_PREFIX[iconName]);
}

describe('StatusIcon', () => {
  test('renders the successful status', () => {
    const { container } = render(<StatusIcon status="successful" />);
    expectIcon(container, 'CheckCircleIcon');
  });

  test('renders running status', () => {
    const { container } = render(<StatusIcon status="running" />);
    expectIcon(container, 'RunningIcon');
  });

  test('renders waiting status', () => {
    const { container } = render(<StatusIcon status="waiting" />);
    expectIcon(container, 'ClockIcon');
  });

  test('renders failed status', () => {
    const { container } = render(<StatusIcon status="failed" />);
    expectIcon(container, 'ExclamationCircleIcon');
  });

  test('renders a successful status when host status is "ok"', () => {
    const { container } = render(<StatusIcon status="ok" />);
    expectIcon(container, 'CheckCircleIcon');
  });

  test('renders "failed" host status', () => {
    const { container } = render(<StatusIcon status="failed" />);
    expectIcon(container, 'ExclamationCircleIcon');
  });

  test('renders "changed" host status', () => {
    const { container } = render(<StatusIcon status="changed" />);
    expectIcon(container, 'ExclamationTriangleIcon');
  });

  test('renders "skipped" host status', () => {
    const { container } = render(<StatusIcon status="skipped" />);
    expectIcon(container, 'MinusCircleIcon');
  });

  test('renders "unreachable" host status', () => {
    const { container } = render(<StatusIcon status="unreachable" />);
    expectIcon(container, 'ExclamationCircleIcon');
  });
});
