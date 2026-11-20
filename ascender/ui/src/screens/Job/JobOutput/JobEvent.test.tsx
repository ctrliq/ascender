import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobEvent from './JobEvent';
import type { JobEvent as OutputEvent } from './useJobEvents';

const mockOnPlayStartEvent: OutputEvent = {
  uuid: 'c7a1b4ee-play-start',
  created: '2019-07-11T18:11:22.005319Z',
  event: 'playbook_on_play_start',
  counter: 2,
  start_line: 0,
  end_line: 2,
  stdout:
    '\r\nPLAY [add hosts to inventory] **************************************************',
};
const mockRunnerOnOkEvent: OutputEvent = {
  uuid: 'c7a1b4ee-runner-on-ok',
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
const lineTextNodes = (container: HTMLElement) =>
  container.querySelectorAll('[type="job_event_line_text"]');

const lineTextCss = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'shared',
    'JobEventLineText.css'
  ),
  'utf8'
);

describe('<JobEvent />', () => {
  test('playbook event timestamps are rendered', () => {
    const { container: c1 } = renderWithContexts(
      <JobEvent
        onJobEventClick={() => {}}
        lineTextHtml={mockOnPlayStartLineTextHtml}
        event={mockOnPlayStartEvent}
        measure={vi.fn()}
      />
    );
    expect(c1.innerHTML).toContain('18:11:22');

    const { container: c2 } = renderWithContexts(
      <JobEvent
        onJobEventClick={() => {}}
        lineTextHtml={mockSingleDigitTimestampEventLineTextHtml}
        event={singleDigitTimestampEvent}
        measure={vi.fn()}
      />
    );
    expect(c2.innerHTML).toContain('08:01:02');
  });

  test('numbers its lines from one, although the api counts from zero', () => {
    const { container } = renderWithContexts(
      <JobEvent
        onJobEventClick={() => {}}
        lineTextHtml={mockOnPlayStartLineTextHtml}
        event={mockOnPlayStartEvent}
        measure={vi.fn()}
      />
    );
    const numbers = Array.from(lineTextNodes(container), (node) =>
      node.previousElementSibling?.textContent?.trim()
    );
    expect(numbers).toEqual(['1', '2']);
  });

  test('ansi stdout colors are rendered as html', () => {
    const { container } = renderWithContexts(
      <JobEvent
        onJobEventClick={() => {}}
        lineTextHtml={mockAnsiLineTextHtml}
        event={mockRunnerOnOkEvent}
        measure={vi.fn()}
      />
    );
    expect(container.innerHTML).toContain(
      '<span class="output--1977390340">ok: [localhost]</span>'
    );
  });

  test("events without stdout aren't rendered", () => {
    const missingStdoutEvent: OutputEvent = { ...mockOnPlayStartEvent };
    delete missingStdoutEvent.stdout;
    const { container } = renderWithContexts(
      <JobEvent
        onJobEventClick={() => {}}
        lineTextHtml={[]}
        event={missingStdoutEvent}
        measure={vi.fn()}
      />
    );
    expect(lineTextNodes(container)).toHaveLength(0);
  });

  describe('click handling with text selection', () => {
    let originalGetSelection: typeof window.getSelection;

    beforeEach(() => {
      originalGetSelection = window.getSelection;
    });

    afterEach(() => {
      window.getSelection = originalGetSelection;
    });

    // The text is what opens the event, rather than the row it sits in: the row
    // runs the width of the output, so clicking it meant clicking the empty
    // space after a line, and the line number, counted as clicking the line.
    const clickableLine = (container: HTMLElement) =>
      lineTextNodes(container)[0] as HTMLElement;
    const rowAround = (container: HTMLElement) =>
      (lineTextNodes(container)[0] as HTMLElement).parentElement as HTMLElement;

    test('click fires onJobEventClick when no text is selected', async () => {
      window.getSelection = vi.fn().mockReturnValue({
        toString: () => '',
      });
      const onJobEventClick = vi.fn();
      const { user, container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable
          onJobEventClick={onJobEventClick}
          measure={vi.fn()}
        />
      );
      await user.click(clickableLine(container));
      expect(onJobEventClick).toHaveBeenCalledTimes(1);
    });

    /*
     * The row is as wide as the output, so anything on it that is not the text
     * is empty space or the line number. Neither opens the event.
     */
    test('the row around the text does not open the event', async () => {
      window.getSelection = vi.fn().mockReturnValue({
        toString: () => '',
      });
      const onJobEventClick = vi.fn();
      const { container, user } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable
          onJobEventClick={onJobEventClick}
          measure={vi.fn()}
        />
      );

      await user.click(rowAround(container));

      expect(onJobEventClick).not.toHaveBeenCalled();
    });

    test('click is suppressed when text is selected', async () => {
      window.getSelection = vi.fn().mockReturnValue({
        toString: () => 'selected text',
      });
      const onJobEventClick = vi.fn();
      const { user, container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable
          onJobEventClick={onJobEventClick}
          measure={vi.fn()}
        />
      );
      await user.click(clickableLine(container));
      expect(onJobEventClick).not.toHaveBeenCalled();
    });

    test('no click handler when isClickable is false', () => {
      const onJobEventClick = vi.fn();
      const { container } = renderWithContexts(
        <JobEvent
          lineTextHtml={mockAnsiLineTextHtml}
          event={mockRunnerOnOkEvent}
          isClickable={false}
          onJobEventClick={onJobEventClick}
          measure={vi.fn()}
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

  /*
   * The pointer is asked for outright rather than on hover. cursor is
   * inherited, so with a hover state not yet applied the text took auto from
   * the row, which over text is the I beam: the browser picks the cursor for a
   * move from the style as it stands and applies hover after, so crossing into
   * a line drew a frame of I beam first. jsdom paints no cursor, so what the
   * stylesheet says is what there is to hold on to here.
   */
  test('asks for the pointer without waiting to be hovered', () => {
    const rule = lineTextCss
      .split('}')
      .find((block) =>
        block.includes('.ascender-job-event-line-text--clickable')
      );

    expect(rule).toBeDefined();
    expect(rule).toContain('cursor: pointer');
    expect(
      lineTextCss.includes('.ascender-job-event-line-text--clickable:hover')
    ).toBe(false);
  });
});
