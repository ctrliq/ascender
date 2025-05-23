import { msg } from '@lingui/macro';

const applicationHelpTextStrings = () => ({
  authorizationGrantType: msg`The Grant type the user must use to acquire tokens for this application`,
  clientType: msg`Set to Public or Confidential depending on how secure the client device is.`,
  redirectURIS: msg`Allowed URIs list, space separated`,
});

export default applicationHelpTextStrings;
