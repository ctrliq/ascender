import React, { useContext } from 'react';
import type { OptionsResponse } from 'types/api';

/**
 * What every settings screen is given: the OPTIONS block for /settings/all/.
 *
 * GET describes every setting the api will report, PUT every setting it will
 * accept, and the detail and edit screens are driven off one each.
 */
export type SettingsValue = OptionsResponse['actions'];

export const SettingsContext = React.createContext<SettingsValue>({});
export const SettingsProvider = SettingsContext.Provider;

export const useSettings = () => useContext(SettingsContext);
