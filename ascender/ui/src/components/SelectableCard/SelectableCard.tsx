import React from 'react';
import './SelectableCard.css';

export interface SelectableCardProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Declared as a method so it stays bivariant: the same handler is the
   * card's click and its keypress, which name different events.
   */
  onClick(event: React.SyntheticEvent): void;
  isSelected?: boolean;
  dataCy?: string;
  ariaLabel?: string;
  [key: string]: unknown;
}

function SelectableCard({
  label = '',
  description = '',
  onClick,
  isSelected = false,
  dataCy,
  ariaLabel = '',
}: SelectableCardProps) {
  return (
    <div
      onClick={onClick}
      onKeyPress={onClick}
      role="button"
      tabIndex={0}
      data-cy={dataCy}
      className={[
        'ascender-selectable-card__item',
        isSelected && 'ascender-selectable-card__item--selected',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      <div
        className={[
          'ascender-selectable-card__indicator',
          isSelected && 'ascender-selectable-card__indicator--selected',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <div className="ascender-selectable-card__contents">
        <b>{label}</b>
        <p className="ascender-selectable-card__description">{description}</p>
      </div>
    </div>
  );
}

export default SelectableCard;
