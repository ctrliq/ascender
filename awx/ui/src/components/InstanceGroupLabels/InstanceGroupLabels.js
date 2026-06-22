import React from 'react';

import { Label, LabelGroup } from '@patternfly/react-core';
import { Link } from 'react-router-dom';

function InstanceGroupLabels({ labels, isLinkable = false }) {
  const buildLinkURL = (isContainerGroup) =>
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
                innerRef={componentRef}
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
