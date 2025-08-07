import React, { useEffect, forwardRef } from 'react';
import {
  JobEventLine,
  JobEventLineToggle,
  JobEventLineNumber,
  JobEventLineText,
} from './shared';

function JobEventSkeletonContent({ contentLength }) {
  return (
    <JobEventLineText>
      <span className="content">{' '.repeat(contentLength)}</span>
    </JobEventLineText>
  );
}

const JobEventSkeleton = forwardRef(({ counter, contentLength, style, measure }, ref) => {
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
});

export default JobEventSkeleton;
