import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

// Calls useLingui itself, the way every other helptext module does: it was
// the only one taking t from its caller, and the use prefix is what says so.
function useExecutionEnvironmentHelpTextStrings() {
  const { t } = useLingui();
  return {
    image: (
      <span>
        <Trans>
          The full image location, including the container registry, image name,
          and version tag.
        </Trans>
        <br />
        <br />
        <Trans>Examples:</Trans>
        <ul css="margin: 10px 0 10px 20px">
          <li>
            <code>quay.io/ctrliq/ascender-ee:latest</code>
          </li>
          <li>
            <code>repo/project/image-name:tag</code>
          </li>
        </ul>
      </span>
    ),
    registryCredential: t`Credential to authenticate with a protected container registry.`,
  };
}

export default useExecutionEnvironmentHelpTextStrings;
