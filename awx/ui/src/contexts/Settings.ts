import React, { useContext } from 'react';

/**
 * The settings the UI reads out of /api/v2/settings/, which differ per
 * category, so the shape is left open beyond what callers name.
 */
export type SettingsValue = Record<string, unknown>;

export const SettingsContext = React.createContext<SettingsValue>({});
export const SettingsProvider = SettingsContext.Provider;

export const useSettings = () => useContext(SettingsContext);
