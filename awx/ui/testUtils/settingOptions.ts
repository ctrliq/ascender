import type { SettingsValue } from 'contexts/Settings';
import mockAllOptions from '../src/screens/Setting/shared/data.allSettingOptions.json';

/**
 * The OPTIONS block for /settings/all/, as the settings screens are given it.
 *
 * The fixture is json, so its choice lists come back as arrays of arrays where
 * the api sends pairs; the assertion here is what a settings screen would get
 * from the real endpoint, and it is made once rather than at every test.
 */
export const settingOptions =
  mockAllOptions.actions as unknown as SettingsValue;

export default settingOptions;
