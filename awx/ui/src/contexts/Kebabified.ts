import React, { useContext } from 'react';

/**
 * Whether the toolbar has collapsed its actions into a kebab menu, and the
 * setter a collapsed action calls when it opens a modal, so the menu can stay
 * open behind it. Supplied by DataListToolbar.
 */
export interface KebabifiedValue {
  isKebabified: boolean;
  onKebabModalChange?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const KebabifiedContext = React.createContext<KebabifiedValue>({
  isKebabified: false,
});

export const KebabifiedProvider = KebabifiedContext.Provider;
export const Kebabified = KebabifiedContext.Consumer;
export const useKebabifiedMenu = () => useContext(KebabifiedContext);
