import React, { useContext } from 'react';

/**
 * Whether the toolbar has collapsed its actions into a kebab menu, and the
 * setter a collapsed action calls when it opens a modal, so the menu can stay
 * open behind it. Supplied by DataListToolbar.
 */
export interface KebabifiedValue {
  isKebabified: boolean;
  onKebabModalChange: React.Dispatch<React.SetStateAction<boolean>>;
}

// The default stands for a toolbar that has not collapsed anything, so the
// setter is a no-op rather than absent and callers need not guard it.
export const KebabifiedContext = React.createContext<KebabifiedValue>({
  isKebabified: false,
  onKebabModalChange: () => {},
});

export const KebabifiedProvider = KebabifiedContext.Provider;
export const Kebabified = KebabifiedContext.Consumer;
export const useKebabifiedMenu = () => useContext(KebabifiedContext);
