import React, { useCallback, useEffect } from 'react';
import type { LineTextHtml } from './getLineTextHtml';
import type { JobEvent as OutputEvent } from './useJobEvents';
import {
  JobEventLine,
  JobEventLineToggle,
  JobEventLineNumber,
  JobEventLineText,
  JobEventEllipsis,
} from './shared';

const HIDDEN_PASSWORD_PROMPTS = [
  'SSH password: ',
  'BECOME password[defaults to SSH password]: ',
];

export interface JobEventProps {
  style?: React.CSSProperties;
  lineTextHtml: LineTextHtml[];
  isClickable?: boolean;
  onJobEventClick: () => void;
  event: OutputEvent;
  /** Tells the virtualizer to re-measure this row once it has rendered. */
  measure: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  hasChildren?: boolean;
  jobStatus?: string;
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: unknown;
}

function JobEvent({
  style,
  lineTextHtml,
  isClickable,
  onJobEventClick,
  event,
  measure,
  isCollapsed = false,
  onToggleCollapsed,
  hasChildren,
  jobStatus,
  ref,
}: JobEventProps) {
  const numOutputLines = lineTextHtml?.length || 0;
  useEffect(() => {
    const timeout = setTimeout(measure, 0);
    return () => {
      clearTimeout(timeout);
    };
  }, [numOutputLines, isCollapsed, measure, jobStatus]);

  const handleClick = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    onJobEventClick();
  }, [onJobEventClick]);

  let toggleLineIndex = -1;
  if (hasChildren) {
    lineTextHtml.forEach(({ html }, index) => {
      if (html) {
        toggleLineIndex = index;
      }
    });
  }
  return !event.stdout ? null : (
    // `type` is not a div attribute, but React passes it through and the
    // output has carried it on both of these since the initial import.
    <div
      ref={ref}
      style={style}
      {...({ type: event.type } as React.HTMLAttributes<HTMLDivElement>)}
    >
      {lineTextHtml.map(({ lineNumber, html }, index) => {
        if (lineNumber < 0) {
          return null;
        }
        if (HIDDEN_PASSWORD_PROMPTS.includes(html)) {
          return null;
        }
        const canToggle = index === toggleLineIndex && !event.isTracebackOnly;
        return (
          <JobEventLine key={`${event.counter}-${lineNumber}`}>
            <JobEventLineToggle
              canToggle={canToggle}
              isCollapsed={isCollapsed}
              onToggle={onToggleCollapsed}
            />
            <JobEventLineNumber>
              {/* Counted from one, as a reader counts lines; the api counts
                  them from zero, which is what the number above goes by. */}
              {!event.isTracebackOnly ? lineNumber + 1 : ''}
              <JobEventEllipsis isCollapsed={isCollapsed && canToggle} />
            </JobEventLineNumber>
            {/*
              What opens the event is the line's text, rather than the row it
              sits in. The row runs the width of the output, so a pointer on it
              followed the line past its last character and offered a click on
              the empty space after it, and on the line number as well.
            */}
            <JobEventLineText
              {...({
                type: 'job_event_line_text',
              } as React.HTMLAttributes<HTMLDivElement>)}
              onClick={isClickable ? handleClick : undefined}
              $isClickable={isClickable}
              dangerouslySetInnerHTML={{
                __html: html,
              }}
            />
          </JobEventLine>
        );
      })}
    </div>
  );
}

export default JobEvent;
