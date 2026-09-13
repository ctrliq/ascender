import React, { useEffect } from 'react';
import {
  JobEventLine,
  JobEventLineToggle,
  JobEventLineNumber,
  JobEventLineText,
} from './shared';

export interface JobEventSkeletonContentProps {
  contentLength: number;
  [key: string]: unknown;
}

function JobEventSkeletonContent({
  contentLength,
}: JobEventSkeletonContentProps) {
  return (
    <JobEventLineText>
      <span className="content">{' '.repeat(contentLength)}</span>
    </JobEventLineText>
  );
}

export interface JobEventSkeletonProps {
  /** The row this skeleton stands in for, which is also its key. */
  counter: number;
  contentLength: number;
  style?: React.CSSProperties;
  /** Tells the virtualizer to re-measure this row once it has rendered. */
  measure: () => void;
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: unknown;
}

function JobEventSkeleton({
  counter,
  contentLength,
  style,
  measure,
  ref,
}: JobEventSkeletonProps) {
  useEffect(() => {
    measure();
  }, [measure]);

  return (
    counter > 1 && (
      <div style={style} ref={ref}>
        <JobEventLine key={counter}>
          <JobEventLineToggle />
          <JobEventLineNumber />
          <JobEventSkeletonContent contentLength={contentLength} />
        </JobEventLine>
      </div>
    )
  );
}

export default JobEventSkeleton;
