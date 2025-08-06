import { t } from '@lingui/react/macro';
import { i18n } from '@lingui/core';

const applicationHelpTextStrings = () => ({
  authorizationGrantType: i18n._(
    t`The Grant type the user must use to acquire tokens for this application`
  ),
  clientType: i18n._(
    t`Set to Public or Confidential depending on how secure the client device is.`
  ),
  redirectURIS: i18n._(t`Allowed URIs list, space separated`),
});

export default applicationHelpTextStrings;
