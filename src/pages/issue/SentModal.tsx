// Pop-up shown right after "Send to <bank>" succeeds: what was sent, to whom, by which route, and what happens next.
import { Send } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { JURISDICTIONS, bankLabel, type PartnerBank } from '@/config/portal';
import { Button, CopyId, WithFlag } from '@/shared/components';
import { fmtDateTime } from '@/shared/services/format';
import type { ElcSent } from '@/shared/services/trustApi';
import '@/demo/Demo.css';

export function SentModal({ lcNumber, partner, sent, onClose }: {
  lcNumber: string; partner: PartnerBank; sent: ElcSent; onClose: () => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const via = sent.via || partner.platform || '';
  return (
    <div className="sign-modal" role="dialog" aria-modal="true" aria-labelledby="sent-modal-title" data-tour="elc-sent-popup" onClick={onClose}>
      <div className="sign-modal__card sent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sign-modal__icon sign-modal__icon--done"><Send size={22} /></div>
        <h3 id="sent-modal-title">eLC sent to {partner.name}</h3>
        <p>{lcNumber} was delivered through {via}. Only {partner.name} can open it, and the send is recorded in the Audit log.</p>
        <dl className="sent-modal__rows">
          <div><dt>eLC</dt><dd><strong>{lcNumber}</strong></dd></div>
          <div><dt>Sent to</dt><dd><WithFlag j={JURISDICTIONS[partner.jurisdiction]}><strong>{bankLabel(partner.name, partner.jurisdiction)}</strong></WithFlag></dd></div>
          <div><dt>Route</dt><dd>{partner.bic} · via {via}</dd></div>
          <div><dt>Sent at</dt><dd>{fmtDateTime(sent.at)}</dd></div>
          {sent.pilaRequestId && <div><dt>{via} request ID</dt><dd><CopyId value={sent.pilaRequestId} head={8} tail={6} /></dd></div>}
        </dl>
        <p className="sent-modal__wait"><span className="sent-modal__dot" /> Waiting for {partner.name} to verify it. The result shows in the card on the right and in Overview.</p>
        <div className="sent-modal__actions">
          <Button onClick={() => navigate('/overview')}>Go to Overview</Button>
          <Button variant="primary" onClick={onClose} autoFocus>Done</Button>
        </div>
      </div>
    </div>
  );
}
