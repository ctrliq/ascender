import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import StatusLabel from './StatusLabel';

// PF Label color is rendered as a `pf-m-<color>` class on the label span, and
// the status icon (no distinguishing accessible name) is identified by its
// unique SVG path data — both assert the color and icon for each status.
const ICON_PATH_PREFIX = {
  CheckCircleIcon: 'M504 256c0 136.967-111.033 248',
  ExclamationCircleIcon: 'M504 256c0 136.997-111.043 248',
  SyncAltIcon: 'M370.72 133.28C339.458 104.008',
  ClockIcon: 'M256,8C119,8,8,119,8,256S119,5',
  MinusCircleIcon: 'M256 8C119 8 8 119 8 256s111 2',
  ExclamationTriangleIcon: 'M569.517 440.013C587.975 472.0',
};

function getLabel(container) {
  return container.querySelector('.pf-v6-c-label');
}

function expectLabel(container, { icon, color, text }) {
  const label = getLabel(container);
  if (color === 'grey') {
    // PF Label renders no color modifier class for the default grey color, so
    // assert no other color class leaked in (preserving the original
    // color="grey" prop assertion).
    ['green', 'red', 'blue', 'orange'].forEach((c) =>
      expect(label).not.toHaveClass(`pf-m-${c}`)
    );
  } else {
    expect(label).toHaveClass(`pf-m-${color}`);
  }
  expect(label).toHaveTextContent(text);
  const path = container.querySelector('svg path').getAttribute('d');
  expect(path).toContain(ICON_PATH_PREFIX[icon]);
}

describe('StatusLabel', () => {
  test('should render success', () => {
    const { container } = renderWithContexts(<StatusLabel status="success" />);
    expectLabel(container, {
      icon: 'CheckCircleIcon',
      color: 'green',
      text: 'Success',
    });
    // No tooltip wrapper when tooltipContent is absent.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('should render failed', () => {
    const { container } = renderWithContexts(<StatusLabel status="failed" />);
    expectLabel(container, {
      icon: 'ExclamationCircleIcon',
      color: 'red',
      text: 'Failed',
    });
  });

  test('should render error', () => {
    const { container } = renderWithContexts(<StatusLabel status="error" />);
    expectLabel(container, {
      icon: 'ExclamationCircleIcon',
      color: 'red',
      text: 'Error',
    });
  });

  test('should render running', () => {
    const { container } = renderWithContexts(<StatusLabel status="running" />);
    expectLabel(container, {
      icon: 'SyncAltIcon',
      color: 'blue',
      text: 'Running',
    });
  });

  test('should render pending', () => {
    const { container } = renderWithContexts(<StatusLabel status="pending" />);
    expectLabel(container, {
      icon: 'ClockIcon',
      color: 'blue',
      text: 'Pending',
    });
  });

  test('should render waiting', () => {
    const { container } = renderWithContexts(<StatusLabel status="waiting" />);
    expectLabel(container, {
      icon: 'ClockIcon',
      color: 'grey',
      text: 'Waiting',
    });
  });

  test('should render disabled', () => {
    const { container } = renderWithContexts(<StatusLabel status="disabled" />);
    expectLabel(container, {
      icon: 'MinusCircleIcon',
      color: 'grey',
      text: 'Disabled',
    });
  });

  test('should render canceled', () => {
    const { container } = renderWithContexts(<StatusLabel status="canceled" />);
    expectLabel(container, {
      icon: 'ExclamationTriangleIcon',
      color: 'orange',
      text: 'Canceled',
    });
  });

  test('should render tooltip', async () => {
    const { container } = renderWithContexts(
      <StatusLabel tooltipContent="Foo" status="success" />
    );
    expectLabel(container, {
      icon: 'CheckCircleIcon',
      color: 'green',
      text: 'Success',
    });
    // The Tooltip wrapper renders its content into a portal on hover.
    fireEvent.mouseEnter(getLabel(container));
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('Foo')
    );
    fireEvent.mouseLeave(getLabel(container));
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    );
  });

  test('should render children', () => {
    const { container } = renderWithContexts(
      <StatusLabel tooltipContent="Foo" status="success">
        children
      </StatusLabel>
    );
    expect(getLabel(container)).toHaveTextContent('children');
  });
});
