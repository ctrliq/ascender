import type { Untyped } from 'types/api';
import React from 'react';

import { Label, LabelGroup } from '@patternfly/react-core';
import { Link } from 'react-router';

export interface InstanceGroupLabelsProps {
  /** Instance groups, not labels: each is drawn as a PatternFly label. */
  labels: Untyped[];
  isLinkable?: boolean;
  [key: string]: unknown;
}

function InstanceGroupLabels({
  labels,
  isLinkable = false,
}: InstanceGroupLabelsProps) {
  const buildLinkURL = (isContainerGroup: unknown) =>
    isContainerGroup
      ? '/instance_groups/container_group/'
      : '/instance_groups/';
  return (
    <LabelGroup numLabels={5}>
      {labels.map(({ id, name, is_container_group }) =>
        isLinkable ? (
          <Label
            color="blue"
            key={id}
            render={({ className, content, componentRef }) => (
              <Link
                className={className}
                ref={componentRef}
                to={`${buildLinkURL(is_container_group)}${id}/details`}
              >
                {content}
              </Link>
            )}
          >
            {name}
          </Label>
        ) : (
          <Label color="blue" key={id}>
            {name}
          </Label>
        )
      )}
    </LabelGroup>
  );
}

export default InstanceGroupLabels;
