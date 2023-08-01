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
  max-width: 300px;
  max-height: initial;
  pointer-events: none;
`;

const BrandLogo = ({ alt }) => (
  <BrandImg src="static/media/AscenderAuto_logo_h_rev_S_side.png" alt={alt} />
);

export default BrandLogo;
