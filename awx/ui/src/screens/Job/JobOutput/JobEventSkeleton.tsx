import type { Untyped } from 'types/api';
import React, { useEffect } from 'react';
import {
  JobEventLine,
  JobEventLineToggle,
  JobEventLineNumber,
  JobEventLineText,
} from './shared';

export interface JobEventSkeletonContentProps {
  contentLength: Untyped;
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

function JobEventSkeleton({
  counter,
  contentLength,
  style,
  measure,
  ref,
}: Untyped) {
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
