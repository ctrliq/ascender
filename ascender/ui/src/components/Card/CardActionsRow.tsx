import React from 'react';
import './CardActionsRow.css';

export interface CardActionsRowProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function CardActionsRow({ children }: CardActionsRowProps) {
  // Every button in the row is permission gated, so a user who may neither
  // edit nor delete leaves it empty: an invisible row that still spends the
  // margin above it, at the bottom of a card where it reads as a stray gap.
  const actions = React.Children.toArray(children);
  if (!actions.length) {
    return null;
  }

  return <div className="ascender-card-actions-row__wrapper">{children}</div>;
}

export default CardActionsRow;
