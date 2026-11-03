import type { UserEvent } from '@testing-library/user-event';
import React from 'react';
import { act, screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import HostEventModal from './HostEventModal';
import type { HostEvent } from './HostEventModal';

const hostEvent: HostEvent = {
  counter: 5,
  uuid: 'abc123-runner-on-ok',
  changed: true,
  event: 'runner_on_ok',
  event_data: {
    host: 'foo',
    play: 'all',
    playbook: 'run_command.yml',
    res: {
      ansible_loop_var: 'item',
      changed: true,
      item: '1',
      msg: 'This is a debug message: 1',
      stdout:
        '              total        used        free      shared  buff/cache   available\nMem:           7973        3005         960          30        4007        4582\nSwap:          1023           0        1023',
      stderr: 'problems',
      cmd: ['free', '-m'],
      stderr_lines: [],
      stdout_lines: [
        '              total        used        free      shared  buff/cache   available',
        'Mem:           7973        3005         960          30        4007        4582',
        'Swap:          1023           0        1023',
      ],
    },
    task: 'command',
    task_action: 'command',
  },
  event_display: 'Host OK',
  event_level: 3,
  failed: false,
  host: 1,
  host_name: 'foo',
  id: 123,
  job: 4,
  play: 'all',
  playbook: 'run_command.yml',
  stdout: `stdout: "[0;33mchanged: [localhost] => {"changed": true, "cmd": ["free", "-m"], "delta": "0:00:01.479609", "end": "2019-09-10 14:21:45.469533", "rc": 0, "start": "2019-09-10 14:21:43.989924", "stderr": "", "stderr_lines": [], "stdout": "              total        used        free      shared  buff/cache   available\nMem:           7973        3005         960          30        4007        4582\nSwap:          1023           0        1023", "stdout_lines": ["              total        used        free      shared  buff/cache   available", "Mem:           7973        3005         960          30        4007        4582", "Swap:          1023           0        1023"]}[0m"
  `,
  task: 'command',
  type: 'job_event',
  url: '/api/v2/job_events/123/',
  summary_fields: {
    host: {
      id: 1,
      name: 'foo',
      description: 'Bar',
    },
  },
};

const partialHostEvent = {
  ...hostEvent,
  host_name: undefined,
  summary_fields: undefined,
};

/*
Some libraries return a list of string in stdout
Example, ios_command.py L124-L128 in ansible-collections/cisco.ios:
https://github.com/ansible-collections/cisco.ios
*/
const hostEventWithArray = {
  ...hostEvent,
  event_data: {
    ...hostEvent.event_data,
    res: {
      ...hostEvent.event_data?.res,
      stdout: [
        '              total        used        free      shared  buff/cache   available\nMem:           7973        3005         960          30        4007        4582\nSwap:          1023           0        1023',
      ],
    },
  },
};

// The CodeEditor renders a .cm-editor inside the form-control wrapper.
const codeEditorCount = () =>
  document.querySelectorAll('.cm-editor, .pf-v6-c-form-control').length;

// PF Tabs render each tab title as a button[role="tab"] with the given label.
async function clickTab(user: UserEvent, label: string) {
  await user.click(screen.getByRole('tab', { name: label }));
}

/**
 * The heights CodeMirror has been asked to hold its scroller to, in pixels.
 *
 * The editor takes its cap from the theme it is configured with, which
 * CodeMirror writes into a stylesheet of its own rather than onto the element.
 * jsdom lays nothing out, so that rule is where a test can read the cap: the
 * numbers are rows times the line height, and nothing else in the modal sets
 * one.
 */
function editorMaxHeights(): number[] {
  return [...document.querySelectorAll('style')]
    .flatMap(
      (style) => (style.textContent || '').match(/max-height: (\d+)px/g) || []
    )
    .map((rule) => Number(rule.replace(/\D/g, '')));
}

/**
 * Sets the window height a render will read, as jsdom's own is fixed.
 *
 * Args:
 *     height: The height to report, in pixels.
 */
function setWindowHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
    writable: true,
  });
}

describe('HostEventModal', () => {
  test('initially renders successfully', () => {
    renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    expect(
      screen.getByRole('tab', { name: 'Details tab' })
    ).toBeInTheDocument();
  });

  test('renders successfully with partial data', () => {
    renderWithContexts(
      <HostEventModal hostEvent={partialHostEvent} onClose={() => {}} isOpen />
    );
    expect(
      screen.getByRole('tab', { name: 'Details tab' })
    ).toBeInTheDocument();
  });

  test('should render all tabs', () => {
    renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    // Details, JSON, YAML, Output (stdOut) and Standard Error (stderr) = 5.
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  test('should initially show details tab', () => {
    renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    assertDetail('Host', 'foo');
    assertDetail('Description', 'Bar');
    assertDetail('Play', 'all');
    assertDetail('Task', 'command');
    assertDetail('Module', 'command');
    // Command renders the cmd array joined.
    const command = screen.getByText('Command');
    expect(command.nextElementSibling).toHaveTextContent('free');
    expect(command.nextElementSibling).toHaveTextContent('-m');
    // Status detail shows the StatusLabel; changed:true -> "Changed".
    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('Changed');
  });

  test('should display successful host status label', () => {
    renderWithContexts(
      <HostEventModal
        hostEvent={{ ...hostEvent, changed: false }}
        onClose={() => {}}
        isOpen
      />
    );
    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('OK');
  });

  test('should display skipped host status label', () => {
    renderWithContexts(
      <HostEventModal
        hostEvent={{ ...hostEvent, event: 'runner_on_skipped' }}
        onClose={() => {}}
        isOpen
      />
    );
    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('Skipped');
  });

  test('should display unreachable host status label', () => {
    renderWithContexts(
      <HostEventModal
        hostEvent={{
          ...hostEvent,
          event: 'runner_on_unreachable',
          changed: false,
        }}
        onClose={() => {}}
        isOpen
      />
    );
    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('Unreachable');
  });

  test('should display failed host status label', () => {
    renderWithContexts(
      <HostEventModal
        hostEvent={{
          ...hostEvent,
          changed: false,
          failed: true,
          event: 'runner_on_failed',
        }}
        onClose={() => {}}
        isOpen
      />
    );
    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('Failed');
  });

  test('should display JSON tab content on tab click', async () => {
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'JSON tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should display YAML tab content on tab click', async () => {
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'YAML tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should display Standard Out tab content on tab click', async () => {
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'Output tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should display Standard Error tab content on tab click', async () => {
    const hostEventError = {
      ...hostEvent,
      event_data: {
        res: {
          stderr: 'error content',
        },
      },
    };
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEventError} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'Standard error tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should pass onClose to Modal', async () => {
    const onClose = vi.fn();
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={onClose} isOpen />
    );
    // The Modal close (X) button drives the onClose handler.
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('should render standard out of debug task', async () => {
    const debugTaskAction = {
      ...hostEvent,
      event_data: {
        task_action: 'debug',
        res: {
          result: {
            stdout: 'foo bar',
          },
        },
      },
    };
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={debugTaskAction} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'Output tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should render both standard out and error of yum task', async () => {
    const yumTaskAction = {
      ...hostEvent,
      event_data: {
        task_action: 'yum',
        res: {
          stdout: 'foo bar',
          stderr: 'whoops',
        },
      },
    };
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={yumTaskAction} onClose={() => {}} isOpen />
    );

    await clickTab(user, 'Output tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);

    await clickTab(user, 'Standard error tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  test('should display Standard Out array stdout content', async () => {
    const { user } = renderWithContexts(
      <HostEventModal
        hostEvent={hostEventWithArray}
        onClose={() => {}}
        isOpen
      />
    );
    await clickTab(user, 'Output tab');
    expect(codeEditorCount()).toBeGreaterThanOrEqual(1);
  });

  /*
   * The editors were twenty rows whatever the window was, which left a short
   * result sitting in a box mostly empty and, on a short window, pushed the box
   * past the modal so the modal's own body scrolled: you scrolled through empty
   * rows to reach the end of a six line document. The cap follows the window
   * now, so the scrollbar is the editor's and it scrolls the document.
   *
   * The numbers below are rows times the twenty four pixel line height, with
   * the window less the modal's own chrome deciding how many rows fit.
   */
  test('should size the editor to the window it is opened in', async () => {
    const original = window.innerHeight;
    setWindowHeight(1000);
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'JSON tab');

    // (1000 - 185) / 24 rounds down to 33 rows
    expect(editorMaxHeights()).toContain(33 * 24);
    setWindowHeight(original);
  });

  test('should keep a floor under the rows on a short window', async () => {
    const original = window.innerHeight;
    setWindowHeight(200);
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'YAML tab');

    // the window has room for none, and six is the fewest that still reads as
    // an editor rather than a line of text
    expect(editorMaxHeights()).toContain(6 * 24);
    setWindowHeight(original);
  });

  test('should follow the window as it is resized', async () => {
    const original = window.innerHeight;
    setWindowHeight(900);
    const { user } = renderWithContexts(
      <HostEventModal hostEvent={hostEvent} onClose={() => {}} isOpen />
    );
    await clickTab(user, 'JSON tab');
    // (1204 - 185) / 24 rounds down to 42 rows
    expect(editorMaxHeights()).not.toContain(42 * 24);

    setWindowHeight(1204);
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(editorMaxHeights()).toContain(42 * 24);
    setWindowHeight(original);
  });
});
