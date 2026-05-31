//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
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

const BrandLogo = () => {
  const { custom_logo } = useConfig();
  const src = custom_logo || defaultSrc;
  return <BrandImg src={src} />;
};

export default BrandLogo;
