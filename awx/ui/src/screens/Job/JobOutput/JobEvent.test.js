import React from 'react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobEvent from './JobEvent';

const mockOnPlayStartEvent = {
  created: '2019-07-11T18:11:22.005319Z',
  event: 'playbook_on_play_start',
  counter: 2,
  start_line: 0,
  end_line: 2,
  stdout:
    '\r\nPLAY [add hosts to inventory] **************************************************',
};
const mockRunnerOnOkEvent = {
  created: '2019-07-11T18:09:22.906001Z',
  event: 'runner_on_ok',
  counter: 5,
  start_line: 4,
  end_line: 5,
  stdout: '[0;32mok: [localhost][0m',
};

const singleDigitTimestampEvent = {
  ...mockOnPlayStartEvent,
  created: '2019-07-11T08:01:02.906001Z',
};

const mockSingleDigitTimestampEventLineTextHtml = [
  { lineNumber: 0, html: '' },
  {
    lineNumber: 1,
    html: 'PLAY [add hosts to inventory] **************************************************<span class="time">08:01:02</span>',
  },
];

const mockAnsiLineTextHtml = [
  {
    lineNumber: 4,
    html: '<span class="output--1977390340">ok: [localhost]</span>',
  },
];

const mockOnPlayStartLineTextHtml = [
  { lineNumber: 0, html: '' },
  {
    lineNumber: 1,
    html: 'PLAY [add hosts to inventory] **************************************************<span class="time">18:11:22</span>',
  },
];

// JobEventLineText renders the html via dangerouslySetInnerHTML; in jsdom that
// lands in the line-text element. type="job_event_line_text" identifies them.
const lineTextNodes = (container) =>
  container.querySelectorAll('[type="job_event_line_text"]');

describe('<JobEvent />', () => {
  test('playbook event timestamps are rendered', () => {
    const { container: c1 } = renderWithContexts(
      <JobEvent
        lineTextHtml={mockOnPlayStartLineTextHtml}
        event={mockOnPlayStartEvent}
        measure={jest.fn()}
      />
    );
    expect(c1.innerHTML).toContain('18:11:22');

    const { container: c2 } = renderWithContexts(
      <JobEvent
        lineTextHtml={mockSingleDigitTimestampEventLineTextHtml}
        event={singleDigitTimestampEvent}
        measure={jest.fn()}
      />
    );
    expect(c2.innerHTML).toContain('08:01:02');
  });

  test('ansi stdout colors are rendered as html', () => {
    const { container } = renderWithContexts(
      <JobEvent
        lineTextHtml={mockAnsiLineTextHtml}
        event={mockRunnerOnOkEvent}
        measure={jest.fn()}
      />
    );
    expect(container.innerHTML).toContain(
      '<span class="output--1977390340">ok: [localhost]</span>'
    );
  });

  test("events without stdout aren't rendered", () => {
    const missingStdoutEvent = { ...mockOnPlayStartEvent };
    delete missingStdoutEvent.stdout;
    const { container } = renderWithContexts(
      <JobEvent
        lineTextHtml={[]}
        event={missingStdoutEvent}
        measure={jest.fn()}
      />
    );
    expect(lineTextNodes(container)).toHaveLength(0);
  });

  describe('click handling with text selection', () => {
    let originalGetSelection;

    beforeEach(() => {
      originalGetSelection = window.getSelection;
    });

    afterEach(() => {
      window.getSelection = originalGetSelection;
    });

    // JobEventLine sets onClick only when isClickable; the clickable element is
    // the line wrapper that contains the line-text node.
    const clickableLine = (container) =>
      lineTextNodes(container)[0]?.closest('[class]')?.parentElement ||
      container.querySelector('[type="job_event_line_text"]')?.parentElement;

    test('click fires onJobEventClick when no text is selected', async () => {
      window.getSelection = jest.fn().mockReturnValue({
        toString: () => '',
      });
      const onJobEventClick = jest.fn();
      const { user, container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable
          onJobEventClick={onJobEventClick}
          measure={jest.fn()}
        />
      );
      await user.click(clickableLine(container));
      expect(onJobEventClick).toHaveBeenCalledTimes(1);
    });

    test('click is suppressed when text is selected', async () => {
      window.getSelection = jest.fn().mockReturnValue({
        toString: () => 'selected text',
      });
      const onJobEventClick = jest.fn();
      const { user, container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable
          onJobEventClick={onJobEventClick}
          measure={jest.fn()}
        />
      );
      await user.click(clickableLine(container));
      expect(onJobEventClick).not.toHaveBeenCalled();
    });

    test('no click handler when isClickable is false', () => {
      const onJobEventClick = jest.fn();
      const { container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable={false}
          onJobEventClick={onJobEventClick}
          measure={jest.fn()}
        />
      );
      // With isClickable false, JobEventLine receives no onClick handler.
      const line = clickableLine(container);
      expect(line).toBeTruthy();
      // No onClick prop -> the cursor/clickable styling marker is absent.
      // Asserting the handler isn't wired: clicking does nothing.
      line.click();
      expect(onJobEventClick).not.toHaveBeenCalled();
    });
  });
});
