// Issue eLC step tabs (non-numbered, as agreed with PILA; look as in the design): green tick = step done,
// blue dot = current step, grey dot = not done yet, red ! = fields that need attention. Any tab can be opened directly.
import { Check } from 'lucide-react';
import type { SectionId } from '@/shared/services/elcModel';

export type StepState = 'done' | 'todo' | 'bad';

export interface StepItem { id: SectionId; label: string; state: StepState }

/** Short tab labels from the design (the section cards keep their full titles). */
export const STEP_LABEL: Record<SectionId, string> = {
  credit: 'Credit', parties: 'Parties', amount: 'Amount', availability: 'Availability', shipment: 'Shipment',
  documents: 'Documents', banks: 'Banks', attachments: 'Attachments',
};

export function Steps({ steps, current, onSelect, disabled, locked }: {
  steps: StepItem[]; current: SectionId; onSelect: (id: SectionId) => void; disabled?: boolean;
  /** Issued eLC: every step keeps its green tick, the current one is only underlined. */
  locked?: boolean;
}) {
  return (
    <nav className="steps" aria-label="eLC sections" data-tour="issue-steps">
      {steps.map((s) => {
        const on = s.id === current;
        const mark = on && !locked && s.state !== 'bad' ? 'on' : s.state;
        return (
          <button key={s.id} type="button" className={`steps__tab${on ? ' steps__tab--on' : ''}`} aria-current={on ? 'step' : undefined}
            onClick={() => onSelect(s.id)} disabled={disabled}>
            <span className={`steps__mark steps__mark--${mark}`} aria-hidden>
              {mark === 'done' ? <Check size={11} strokeWidth={3.2} /> : mark === 'bad' ? <span className="steps__bang">!</span> : <span className="steps__dot" />}
            </span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
