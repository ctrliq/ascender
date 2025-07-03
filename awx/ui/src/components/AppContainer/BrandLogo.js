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
  max-height: 60px;
  pointer-events: none;
`;

const BrandLogo = ({ customLogoMenu }) => {
  const src = customLogoMenu
    ? `data:image/jpeg;${customLogoMenu}`
    : "static/media/AscenderAuto_logo_h_rev_S_side.png";
  return <BrandImg src={src} />;
};

export default BrandLogo;
