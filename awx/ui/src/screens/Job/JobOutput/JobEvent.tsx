import type { Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
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
  style?: Untyped;
  lineTextHtml: Untyped[];
  isClickable?: boolean;
  onJobEventClick: (...args: Untyped[]) => void;
  event: Untyped;
  measure: Untyped;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  hasChildren?: boolean;
  jobStatus?: Untyped;
  ref?: Untyped;
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
          <JobEventLine
            onClick={isClickable ? handleClick : undefined}
            key={`${event.counter}-${lineNumber}`}
            $isClickable={isClickable}
          >
            <JobEventLineToggle
              canToggle={canToggle}
              isCollapsed={isCollapsed}
              onToggle={onToggleCollapsed}
            />
            <JobEventLineNumber>
              {!event.isTracebackOnly ? lineNumber : ''}
              <JobEventEllipsis isCollapsed={isCollapsed && canToggle} />
            </JobEventLineNumber>
            <JobEventLineText
              {...({
                type: 'job_event_line_text',
              } as React.HTMLAttributes<HTMLDivElement>)}
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
