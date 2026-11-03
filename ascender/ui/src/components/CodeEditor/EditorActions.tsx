import React, { useEffect, useRef, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  Form,
  FormGroup,
  SplitItem,
  TextInput,
} from '@patternfly/react-core';
import {
  AlignJustifyIcon,
  AngleDownIcon,
  AngleUpIcon,
  CopyIcon,
} from '@patternfly/react-icons';
import AlertModal from '../AlertModal';
import { maxEditorRows } from './constants';
import './VariablesDetail.css';
import Tooltip from '../Tooltip';

/**
 * PatternFly asks for the top and then, with no room there, walks its default
 * list of top, right, bottom, left. These buttons sit against the right edge of
 * a wide row, so a long label has no room above centred on its trigger and ends
 * up beside the button. Offering the two top alignments instead keeps it above
 * and slides it along the row.
 */
const TOOLTIP_FLIP: ('top' | 'top-end' | 'top-start')[] = [
  'top',
  'top-end',
  'top-start',
];

/**
 * The height an editor is showing, as a row count the caller hands to it.
 *
 * Two ends and a number in between: the compact height the caller renders by
 * default, the height it takes when told to fit its value, and whatever the
 * reader asked for through the lines button. Which end is the default differs
 * by screen, which is why both are arguments: a job's variables start fitted
 * and collapse to four, while a settings page starts at four and expands, since
 * a page holding dozens of them cannot open them all.
 */
export function useEditorRows(
  compact: number | 'auto',
  fitted: number | 'auto',
  startFitted: boolean
) {
  const [isFitted, setIsFitted] = useState(startFitted);
  // Survives a collapse and is returned to on the way back out, so the arrow
  // does not throw away a height the reader chose.
  const [chosen, setChosen] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  let rows: number | 'auto' = isFitted ? fitted : compact;
  if (isFitted && chosen !== null) {
    rows = chosen;
  }

  return {
    rows,
    isCollapsed: !isFitted,
    toggleCollapse: () => setIsFitted(!isFitted),
    isModalOpen,
    openModal: () => setIsModalOpen(true),
    closeModal: () => setIsModalOpen(false),
    /** A height was asked for, so the box is not collapsed any more. */
    chooseRows: (next: number) => {
      setChosen(next);
      setIsFitted(true);
      setIsModalOpen(false);
    },
  };
}

export interface EditorActionsProps {
  dataCy?: string;
  /** Put on the row, for a caller whose label row runs at another size. */
  className?: string;
  /** The value as the editor is showing it, which is what copying yields. */
  copyValue?: string;
  /** The editor these act on, for aria-controls. */
  controls?: string;
  /** Omitted leaves the arrow out: an editable box does not collapse. */
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  /** Whether collapsing or choosing a height would change anything. */
  isSizeable?: boolean;
  /** Omitted leaves the lines button out. */
  onSetHeight?: () => void;
}

/**
 * Copy, collapse and height, in the label row above an editor rather than over
 * the code, so they never cover a value or the scrollbar. Each is optional
 * except copying, which is worth as much on a one line value as a long one.
 */
export function EditorActions({
  dataCy,
  className,
  copyValue = '',
  controls,
  onToggleCollapse,
  isCollapsed = false,
  isSizeable = true,
  onSetHeight,
}: EditorActionsProps) {
  const { t } = useLingui();

  // The tooltip is the whole of the feedback: a copy leaves nothing on screen
  // to show it worked, so the label says so for a moment and goes back.
  const [hasCopied, setHasCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setHasCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // A clipboard the browser refuses, on an insecure origin or without the
      // permission, is not worth an error state on a detail page. The tooltip
      // simply does not change, which reads as nothing having happened.
    }
  };

  const cy = (suffix: string) => (dataCy ? `${dataCy}-${suffix}` : undefined);

  return (
    <SplitItem
      className={['ascender-variables-detail__actions', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Tooltip
        flipBehavior={TOOLTIP_FLIP}
        content={hasCopied ? t`Copied` : t`Copy to Clipboard`}
      >
        <Button
          icon={<CopyIcon />}
          aria-label={t`Copy to Clipboard`}
          ouiaId={cy('copy-button')}
          data-cy={cy('copy-button')}
          variant="secondary"
          type="button"
          className="ascender-variables-detail__action"
          onClick={handleCopy}
        />
      </Tooltip>
      {/* The tooltip is only read out while the button has focus or the
          pointer, and a screen reader reads a changed tooltip no more than
          it would anything else that changes silently: the copy is said
          again here, where it is announced as it happens. */}
      <span className="pf-v6-screen-reader" role="status" aria-live="polite">
        {hasCopied ? t`Copied` : ''}
      </span>
      {/* The span is the tooltip's trigger rather than the button: a disabled
          button takes no pointer events, so a tooltip attached straight to it
          never opens, which is the state these are in on a short value. */}
      {onToggleCollapse && (
        <Tooltip
          flipBehavior={TOOLTIP_FLIP}
          content={isCollapsed ? t`Expand` : t`Collapse`}
        >
          <span className="ascender-variables-detail__action-trigger">
            <Button
              icon={isCollapsed ? <AngleDownIcon /> : <AngleUpIcon />}
              aria-label={isCollapsed ? t`Expand` : t`Collapse`}
              aria-expanded={!isCollapsed}
              aria-controls={controls}
              ouiaId={cy('collapse-toggle')}
              data-cy={cy('collapse-toggle')}
              variant="secondary"
              type="button"
              className="ascender-variables-detail__action"
              isDisabled={!isSizeable}
              onClick={onToggleCollapse}
            />
          </span>
        </Tooltip>
      )}
      {onSetHeight && (
        <Tooltip
          flipBehavior={TOOLTIP_FLIP}
          content={t`Set the number of lines shown`}
        >
          <span className="ascender-variables-detail__action-trigger">
            <Button
              icon={<AlignJustifyIcon />}
              aria-label={t`Set the number of lines shown`}
              ouiaId={cy('height-button')}
              data-cy={cy('height-button')}
              variant="secondary"
              type="button"
              className="ascender-variables-detail__action"
              isDisabled={!isSizeable}
              onClick={onSetHeight}
            />
          </span>
        </Tooltip>
      )}
    </SplitItem>
  );
}

export interface HeightModalProps {
  dataCy?: string;
  /** The height the editor is showing now, which the field opens on. */
  value: number;
  onCancel: () => void;
  onSave: (rows: number) => void;
}

/**
 * Asks for a number of lines to show. The draft is kept as the string the field
 * holds rather than a number, so a half typed value and an emptied field are
 * states the field can be in rather than something coerced to 0 behind it.
 */
export function HeightModal({
  dataCy,
  value,
  onCancel,
  onSave,
}: HeightModalProps) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(String(value));

  // Only a floor. A height above the value's own length is empty space and a
  // height above the auto cap is more rows than the box would ever grow to on
  // its own, but both are the reader's to ask for: a fixed height scrolls, and
  // the editor renders the rows in view rather than all of them.
  const parsed = Number(draft);
  const isValid =
    draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 1;
  const fieldId = dataCy ? `${dataCy}-height-input` : 'variables-height-input';

  return (
    <AlertModal
      isOpen
      title={t`Editor Height`}
      label={t`Editor Height`}
      onClose={onCancel}
      ouiaId={dataCy ? `${dataCy}-height-modal` : 'variables-height-modal'}
      actions={[
        <Button
          key="save"
          variant="primary"
          isDisabled={!isValid}
          onClick={() => onSave(parsed)}
          ouiaId={dataCy ? `${dataCy}-height-save` : 'variables-height-save'}
          data-cy={dataCy ? `${dataCy}-height-save` : undefined}
        >
          {t`Save`}
        </Button>,
        <Button
          key="cancel"
          variant="link"
          onClick={onCancel}
          ouiaId={
            dataCy ? `${dataCy}-height-cancel` : 'variables-height-cancel'
          }
          data-cy={dataCy ? `${dataCy}-height-cancel` : undefined}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          if (isValid) {
            onSave(parsed);
          }
        }}
      >
        <FormGroup label={t`Lines to Show`} fieldId={fieldId} isRequired>
          <TextInput
            id={fieldId}
            data-cy={fieldId}
            type="number"
            min={1}
            value={draft}
            validated={isValid ? 'default' : 'error'}
            aria-label={t`Lines to Show`}
            onChange={(_event, next) => setDraft(next)}
          />
        </FormGroup>
      </Form>
    </AlertModal>
  );
}

/**
 * The height the lines field opens on for a box that grows to fit: its value's
 * own length, or the cap on the auto height, whichever it reached first.
 */
export function fittedHeight(lineCount: number): number {
  return Math.min(lineCount, maxEditorRows());
}
