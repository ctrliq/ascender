import React, { useContext } from 'react';

export const KebabifiedContext = React.createContext({});

export const KebabifiedProvider = KebabifiedContext.Provider;
export const Kebabified = KebabifiedContext.Consumer;
export const useKebabifiedMenu = () => useContext(KebabifiedContext);
