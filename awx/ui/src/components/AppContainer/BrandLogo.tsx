//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import type { Untyped } from 'types/api';
import React from 'react';

import styled from 'styled-components';
import { useConfig } from 'contexts/Config';

const BrandImg = styled.img`
  flex: initial;
  width: initial;
  padding-left: 0px;
  margin: 0px 0px 0px 0px;
  max-width: initial;
  max-height: 46px;
  pointer-events: none;
`;

const defaultSrc = 'static/media/Ascender_logo.svg';

export interface BrandLogoProps {
  alt: Untyped;
  [key: string]: unknown;
}

const BrandLogo = ({ alt }: BrandLogoProps) => {
  const { custom_header_logo } = useConfig();
  const src = (custom_header_logo as string) || defaultSrc;
  return <BrandImg src={src} alt={alt} />;
};

export default BrandLogo;
