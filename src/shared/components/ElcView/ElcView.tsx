import { useState } from 'react';
import { jurisdictionFromLabel } from '@/config/portal';
import { SECTIONS, displayValue, sectionSummary, shortGoods, type ElcForm } from '@/shared/services/elcModel';
import { fmtDate } from '@/shared/services/format';
import { Card } from '../Card/Card';
import { Collapsible } from '../Collapsible/Collapsible';
import { WithFlag } from '../Flag/Flag';
import { FieldValues, KeyValue } from '../KeyValue/KeyValue';
import { StatusPill } from '../StatusPill/StatusPill';
import { FileText } from 'lucide-react';
import './ElcView.css';

/** The right-hand summary card: eLC number, beneficiary, advising bank, expiry, goods. */
export function ElcSummaryCard({ form, status }: { form: ElcForm; status?: string }) {
  const f = form.fields;
  const advising = f.advisingBankName || f.availableWith;
  return (
    <Card className="elc-summary">
      <div className="elc-summary__head">
        <strong>{f.lcNumber || 'New eLC'}</strong>
        {status && <StatusPill status={status} solid />}
      </div>
      <KeyValue rows={[
        { label: 'Beneficiary', value: f.beneficiaryName || '—' },
        { label: 'Advising bank', value: advising ? <WithFlag j={jurisdictionFromLabel(advising)}>{advising}</WithFlag> : '—' },
        { label: 'Expires', value: fmtDate(f.expiryDate) },
        { label: 'Goods', value: shortGoods(f.goodsDescription) || '—' },
      ]} />
    </Card>
  );
}

/** Read-only eLC: one numbered card per section; the first opens by default. A filled eLC shows no attachments section. */
export function ElcReadOnly({ form }: { form: ElcForm }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ credit: true });
  return (
    <div>
      {SECTIONS.filter((s) => s.id !== 'attachments').map((s, i) => {
        const rows = s.fields.filter((fd) => form.fields[fd.key]).map((fd) => ({
          label: fd.label, tag: fd.tag || undefined, value: displayValue(fd.key, form), wide: fd.wide,
        }));
        return (
          <Collapsible key={s.id} variant="card" number={i + 1} title={s.title} summary={sectionSummary(s.id, form, 0) || 'Not filled'}
            open={!!open[s.id]} onToggle={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
            {rows.length ? <FieldValues rows={rows} /> : <span className="muted">No values in this section.</span>}
            {s.id === 'documents' && form.docs.length > 0 && (
              <div className="elc-docs">
                <span className="fv__label">Documents required <span className="fv__tag">46A</span></span>
                {form.docs.map((d, n) => (
                  <div key={n} className="elc-file"><FileText size={16} /><span><strong>{d.title}</strong>{d.detail && <span className="tbl__sub">{d.detail}</span>}</span></div>
                ))}
              </div>
            )}
          </Collapsible>
        );
      })}
    </div>
  );
}
