import { msg } from '@lingui/macro';
import { i18n } from '@lingui/core';

const userHelpTextStrings = () => ({
  application: i18n._(msg`The application that this token belongs to, or leave this field empty to create a Personal Access Token.`),
  scope: i18n._(msg`Scope for the token's access`),
});

export default userHelpTextStrings;
