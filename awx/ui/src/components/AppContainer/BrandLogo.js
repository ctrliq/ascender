//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React from 'react';

import styled from 'styled-components';

const BrandImg = styled.img`
  flex: initial;
  width: initial;
  padding-left: 0px;
  margin: 0px 0px 0px 0px;
  max-width: initial;
  max-height: 46px;
  pointer-events: none;
`;

const BrandLogo = () => {
  const src = 'static/media/Ascender_logo.svg';
  return <BrandImg src={src} />;
};

export default BrandLogo;
