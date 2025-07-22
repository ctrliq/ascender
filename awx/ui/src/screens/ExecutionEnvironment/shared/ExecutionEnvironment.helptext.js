import React from 'react';
import { msg } from '@lingui/macro';
import { i18n } from '@lingui/core';

const executionEnvironmentHelpTextStrings = {
  image: (
    <span>
      {i18n._(
        msg`The full image location, including the container registry, image name, and version tag.`
      )}
      <br />
      <br />
      {i18n._(msg`Examples:`)}
      <ul css="margin: 10px 0 10px 20px">
        <li>
          <code>quay.io/ansible/awx-ee:latest</code>
        </li>
        <li>
          <code>repo/project/image-name:tag</code>
        </li>
      </ul>
    </span>
  ),
  registryCredential: i18n._(
    msg`Credential to authenticate with a protected container registry.`
  ),
};

export default executionEnvironmentHelpTextStrings;
