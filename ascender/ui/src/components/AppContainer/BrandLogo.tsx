//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';

import { useConfig } from 'contexts/Config';
import './BrandLogo.css';

const defaultSrc = 'static/media/Ascender_logo.svg';

export interface BrandLogoProps {
  alt: string;
  [key: string]: unknown;
}

const BrandLogo = ({ alt }: BrandLogoProps) => {
  const { custom_header_logo } = useConfig();
  const src = (custom_header_logo as string) || defaultSrc;
  return <img className="ascender-brand-logo__img" src={src} alt={alt} />;
};

export default BrandLogo;
