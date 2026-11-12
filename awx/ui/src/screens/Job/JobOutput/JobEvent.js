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

// React 19.2 rewrites innerHTML whenever the dangerouslySetInnerHTML object is
// a new one, even with the same __html. The output re-renders while a text
// selection is being dragged (selectionchange widens the rendered range), and
// rewriting the line replaces the text node holding the selection anchor, so
// the selection jumps to the start of the line. Memoizing on the html string
// leaves an unchanged line's DOM alone.
const JobEventLineHtml = React.memo(({ html }) => (
  <JobEventLineText
    type="job_event_line_text"
    dangerouslySetInnerHTML={{
      __html: html,
    }}
  />
));
JobEventLineHtml.displayName = 'JobEventLineHtml';

function JobEvent({
  style,
  lineTextHtml,
  isClickable,
  onJobEventClick,
  event,
  measure,
  isCollapsed,
  onToggleCollapsed,
  hasChildren,
  jobStatus,
  ref,
}) {
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
    <div ref={ref} style={style} type={event.type}>
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
            <JobEventLineHtml html={html} />
          </JobEventLine>
        );
      })}
    </div>
  );
}

export default JobEvent;
