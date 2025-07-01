import { msg } from '@lingui/macro';
import { i18n } from '@lingui/core';

const applicationHelpTextStrings = () => ({
  authorizationGrantType: i18n._(msg`The Grant type the user must use to acquire tokens for this application`),
  clientType: i18n._(msg`Set to Public or Confidential depending on how secure the client device is.`),
  redirectURIS: i18n._(msg`Allowed URIs list, space separated`),
});

export default applicationHelpTextStrings;
