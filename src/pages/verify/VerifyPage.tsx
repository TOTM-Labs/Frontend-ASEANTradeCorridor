import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarCheck, ChevronDown, Download, EyeOff, FileJson, FileText, Fingerprint, Lock, PenLine, Upload } from 'lucide-react';
import { PORTAL } from '@/config/portal';
import {
  Button, Card, CopyId, ElcReadOnly, FileDrop, KeyValue, Mark, PageHeader, Spinner, StatusPill, WithFlag,
} from '@/shared/components';
import { formFromJson, shortGoods } from '@/shared/services/elcModel';
import { downloadJson } from '@/shared/services/files';
import { fmtAmount, fmtDate, fmtDateTime } from '@/shared/services/format';
import { takeVerifyHandoff } from '@/shared/services/session';
import {
  looksLikeJwt, looksLikeVc, parseCredentialText, verifyCredential, type Check, type Verification,
} from '@/shared/services/verification';
import { TestDocsPicker } from '@/test-docs/TestDocsPicker'; // test-docs
import './Verify.css';

type State =
  | { kind: 'idle'; error?: string }
  | { kind: 'checking'; fileName: string }
  | { kind: 'done'; fileName: string; result: Verification };

export function VerifyPage() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Check drop-downs start closed, and only one is open at a time.
  const [open, setOpen] = useState<string | null>(null);

  const run = async (vc: unknown, fileName: string) => {
    if (!looksLikeVc(vc) && !looksLikeJwt(vc)) {
      setState({ kind: 'idle', error: `${fileName} is not a signed credential (a W3C credential with a proof, or a VC-JWT).` });
      return;
    }
    setState({ kind: 'checking', fileName });
    const result = await verifyCredential(vc);
    setOpen(null);
    setState({ kind: 'done', fileName, result });
  };

  useEffect(() => {
    const h = takeVerifyHandoff();
    if (h) void run(h.vc, h.fileName);
  }, []);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      await run(parseCredentialText(await f.text(), f.name), f.name);
    } catch (e) {
      setState({ kind: 'idle', error: (e as Error).message });
    }
  };

  // test-docs: verify a sample file chosen in the Test documents card.
  const onTestDoc = async (text: string, fileName: string) => {
    try {
      await run(parseCredentialText(text, fileName), fileName);
    } catch (e) {
      setState({ kind: 'idle', error: (e as Error).message });
    }
  };

  const reset = () => setState({ kind: 'idle' });

  return (
    <>
      <PageHeader
        title="Verify eLC"
        actions={state.kind === 'done' && (
          <>
            <Button icon={<Download size={16} />} onClick={() => downloadJson(report(state.result, state.fileName), `verification-${state.result.ref}.json`)}>Download report</Button>
            <Button variant="primary" icon={<Upload size={16} />} onClick={reset}>Verify another eLC</Button>
          </>
        )}
      />
      {state.kind === 'idle' ? (
        <div className="page-grid">
          <div>
          <Card className="verify-upload">
            <div className="verify-upload__head">
              <h2>Upload a signed eLC</h2>
              <p>JSON (W3C credential) or VC-JWT. You can also open one from the Inbox.</p>
            </div>
            <FileDrop large accept=".json,.jwt,.txt,application/json" onFiles={onFiles}
              title={<>Drop the file here or <span className="drop__link">browse</span></>}
              hint=".json · .jwt" />
            {state.error && (
              <div className="verify-error" role="alert">
                <strong>This file can't be verified</strong>
                <span>{state.error}</span>
              </div>
            )}
            <p className="verify-note"><Lock size={13} /> The file is used only for this check and is never stored. Only the result is recorded.</p>
          </Card>
          <TestDocsPicker onPick={onTestDoc} />{/* test-docs */}
          </div>
          <div className="sticky">
            <Card>
              <h3 className="verify-side__title">What we check</h3>
              <ul className="verify-steps">
                {STEPS.map((x) => (
                  <li key={x.title}>
                    <span className="verify-steps__icon">{x.icon}</span>
                    <span><strong>{x.title}</strong><span>{x.text}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="verify-side__title">Who checks it</h3>
              <div className="verify-route">
                <span className="via via--totm">TOTM</span>
                <span>Issued by a bank in the TOTM issuer registry: checked by the TOTM Trust API.</span>
              </div>
              <div className="verify-route">
                <span className="via via--pila">{PORTAL.externalPlatform.name}</span>
                <span>Any other issuer: checked with {PORTAL.externalPlatform.name}'s SDK and NDAKey.</span>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="page-grid">
          <div className="verify-main">
          <Card padded={false} data-tour="verify-checks">
            <div className="checks__head">
              <h2>Verification checks</h2>
              <span className="checks__file">{state.kind === 'done' && <span className={`via via--${state.result.platform.toLowerCase()}`}>via {state.result.platform}</span>}<FileJson size={14} /> {state.fileName}</span>
            </div>
            {(state.kind === 'checking' ? PENDING : state.result.checks).map((c) => (
              <CheckRow key={c.id} check={c} pending={state.kind === 'checking'} open={open === c.id}
                notReliedOn={state.kind === 'done' && changedAfterSigning(state.result) && c.id !== 'integrity'}
                onToggle={() => setOpen((o) => (o === c.id ? null : c.id))} />
            ))}
            <div className="checks__foot"><Lock size={13} /> Only the result is stored. The eLC content is checked, never kept.</div>
          </Card>
          {state.kind === 'done' && <ElcPreview r={state.result} />}
          </div>
          <div className="sticky">
            {state.kind === 'checking' ? (
              <Card><div className="verdict verdict--wait"><Spinner size={22} /><div className="verdict__text"><strong>Checking…</strong><span>Asking the issuer registry and status service.</span></div></div></Card>
            ) : <ResultCard r={state.result} />}
          </div>
        </div>
      )}
    </>
  );
}

const STEPS = [
  { icon: <Fingerprint size={16} />, title: 'Integrity', text: 'Nothing changed since it was signed' },
  { icon: <CalendarCheck size={16} />, title: 'Status', text: 'Active today, not expired or suspended' },
  { icon: <PenLine size={16} />, title: 'Issuer', text: 'Signed by the issuer it names' },
  { icon: <BadgeCheck size={16} />, title: 'Trusted issuer', text: 'That issuer is on the trusted list' },
];

const PENDING: Check[] = [
  { id: 'integrity', title: 'Integrity', question: 'Unchanged since signing?', state: 'error', detail: [] },
  { id: 'status', title: 'Status', question: 'Still valid today?', state: 'error', detail: [] },
  { id: 'issuer', title: 'Issuer', question: 'Who signed it?', state: 'error', detail: [] },
  { id: 'trusted', title: 'Trusted issuer', question: 'Allowed to issue eLCs?', state: 'error', detail: [] },
];

const PILL = { pass: ['Passed', 'ok'], fail: ['Failed', 'bad'], error: ['Not checked', 'warn'] } as const;

/** Integrity failed: the file was changed after signing, so nothing else read from it can be relied on. */
const changedAfterSigning = (r: Verification) => r.checks.find((c) => c.id === 'integrity')?.state === 'fail';

function CheckRow({ check, pending, open, onToggle, notReliedOn = false }: { check: Check; pending: boolean; open: boolean; onToggle: () => void; notReliedOn?: boolean }) {
  // Once Integrity fails, the other answers describe a changed file: show them as neutral, not green or red.
  const [text, tone] = notReliedOn ? (['Not relied on', 'neutral'] as const) : PILL[check.state];
  if (notReliedOn) check = { ...check, state: 'na' as Check['state'], detail: [{ text: "Not relied on: the file changed after signing, so this answer doesn't apply to it.", state: 'na' as Check['state'] }], facts: [] };
  return (
    <div className="check">
      <button className="check__head" onClick={onToggle} disabled={pending} aria-expanded={open}>
        {pending ? <Spinner size={20} /> : <Mark state={check.state} size={22} />}
        <span className="check__title">{check.title}</span>
        <span className="check__q">{check.question}</span>
        <span className="grow" />
        {!pending && <StatusPill status={text} tone={tone} dot={false} />}
        {!pending && <span className={`check__chev${open ? ' check__chev--open' : ''}`} />}
      </button>
      {open && !pending && (
        <div className="check__body">
          <ul className="check__detail">
            {check.detail.map((d) => (
              <li key={d.text} className={`check__item check__item--${d.state}`}><Mark state={d.state} size={15} /> {d.text}</li>
            ))}
          </ul>
          {!!check.facts?.length && (
            <dl className="check__facts">
              {check.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd className={f.mono ? 'mono' : ''}>{f.copy ? <CopyId value={f.value} head={14} tail={8} /> : f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

const reason = (r: Verification) => {
  if (changedAfterSigning(r)) return 'changed after signing';
  if (r.headline) return r.headline;
  const failed = r.checks.find((c) => c.state === 'fail');
  if (!failed) return '';
  if (failed.id === 'integrity') return 'changed after signing';
  if (failed.id === 'status') return r.status === 'not_found' ? 'not on record' : r.status ?? 'not valid today';
  if (failed.id === 'issuer') return 'signature does not match the issuer';
  return 'issuer not trusted';
};

function ResultCard({ r }: { r: Verification }) {
  const changed = changedAfterSigning(r);
  const [showDetails, setShowDetails] = useState(false);
  const f = r.fields;
  const issuerName = r.issuerName;
  const j = r.issuerJurisdiction;
  const title = String(f.lcNumber ?? f.legalName ?? 'Credential');
  const party = f.beneficiaryName ?? f.legalName;
  const noun = f.lcNumber ? 'eLC' : 'credential';
  const who = r.platform === 'TOTM' && r.issuerName !== r.issuerDid ? issuerName : 'the issuer';
  const head = r.overall === 'pass'
    ? { title: `Verified · this ${noun} is genuine`, sub: 'All 4 checks passed. Safe to rely on.' }
    : r.overall === 'fail'
      ? { title: `Failed · ${reason(r)}`, sub: `Don't rely on this ${noun}. Ask ${who} for a new copy.` }
      : { title: 'Could not confirm', sub: 'A check could not be completed. Treat as not verified and try again.' };
  const pill = r.overall === 'pass' ? (r.status ?? 'active') : r.overall === 'fail' ? (r.checks[0].state === 'fail' ? 'Untrusted' : r.status ?? 'Failed') : 'Not checked';
  return (
    <Card padded={false} className={`result result--${r.overall}`} data-tour="verify-result">
      <div className="result__top">
        <div className="verdict">
          <Mark state={r.overall} size={40} />
          <div className="verdict__text"><strong>{head.title}</strong><span>{head.sub}</span></div>
        </div>
        <div className="result__meta"><span>Checked <b>{fmtDateTime(r.checkedAt)}</b></span><span>Ref. <b>{r.ref}</b></span></div>
      </div>
      <div className="result__body">
        <div className="result__lc">
          <strong>{title}</strong>
          <StatusPill status={pill} tone={r.overall === 'pass' ? 'ok' : r.overall === 'fail' ? 'bad' : 'warn'} dot={false} />
        </div>
        {changed && !showDetails ? (
          <div className="result__hidden">
            <strong><EyeOff size={14} /> {noun === 'eLC' ? 'eLC' : 'Credential'} details hidden</strong>
            <span>Beneficiary, issuer and expiry come from a file that was changed after {who} signed it, so they can't be trusted.</span>
            <button className="link-btn" onClick={() => setShowDetails(true)}>Show anyway</button>
          </div>
        ) : (
          <KeyValue rows={[
            ...(party ? [{ label: f.beneficiaryName ? 'Beneficiary' : 'Holder', value: String(party) }] : []),
            { label: 'Issued by', value: <WithFlag j={j}><span title={r.issuerDid ?? ''}>{issuerName}</span></WithFlag> },
            ...(f.expiryDate ? [{ label: 'Expires', value: fmtDate(String(f.expiryDate)) }] : []),
            { label: 'Verified with', value: r.platform === 'PILA' ? 'PILA SDK + NDAKey' : 'TOTM Trust API' },
          ]} />
        )}
        <KeyValue divider rows={[
          ...(r.platform === 'TOTM' ? [{ label: 'Tx ID', value: <CopyId value={r.txId} full /> }] : []),
          { label: 'VC ID', value: <CopyId value={r.vcId} /> },
        ]} />
        {changed && showDetails && (
          <p className="result__warn">These details can't be trusted. The file was changed after {who} signed it.</p>
        )}
      </div>
    </Card>
  );
}

/** The eLC's key fields under the checks, as signed; "View full eLC" opens every field. Hidden when the file changed. */
function ElcPreview({ r }: { r: Verification }) {
  const [full, setFull] = useState(false);
  const f = r.fields;
  if (!f.lcNumber) return null;
  const str = (v: unknown) => (v == null || v === '' ? '' : String(v));
  const changed = changedAfterSigning(r);
  const intact = r.checks.find((c) => c.id === 'integrity')?.state === 'pass';
  const docs = Array.isArray(f.documentsRequired)
    ? f.documentsRequired.map(String)
    : str(f.documentsRequired).split(/\n|\+/).map((d) => d.trim()).filter(Boolean);
  const lower = (v: unknown) => str(v).toLowerCase();
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const items: { label: string; value: string; sub?: string }[] = [
    { label: 'Applicant', value: str(f.applicantName), sub: str(f.applicantAddress) },
    { label: 'Beneficiary', value: str(f.beneficiaryName), sub: str(f.beneficiaryAddress) },
    { label: 'Amount', value: f.amount ? fmtAmount(str(f.currency), str(f.amount)) : '', sub: cap([lower(f.formOfCredit), lower(f.availableBy)].filter(Boolean).join(' · ')) },
    { label: 'Expires', value: f.expiryDate ? fmtDate(str(f.expiryDate)) : '', sub: str(f.expiryPlace) },
    { label: 'Goods', value: shortGoods(str(f.goodsDescription ?? f.goods), 60), sub: f.portOfLoading && f.portOfDischarge ? `${str(f.portOfLoading).split(',')[0]} → ${str(f.portOfDischarge).split(',')[0]}` : str(f.incoterm) },
    { label: 'Available with', value: str(f.availableWith ?? f.advisingBankName ?? f.advisingBankBic), sub: cap(lower(f.availableBy)) },
    { label: 'Documents required', value: docs.length ? shortGoods(docs[0], 60) : '', sub: docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'}` : '' },
    { label: 'Applicable rules', value: str(f.applicableRules) },
  ].filter((x) => x.value);
  const total = Object.entries(f).filter(([k, v]) => k !== 'id' && v != null && v !== '').length;
  const signedOn = f.dateOfIssue ? ` on ${fmtDate(str(f.dateOfIssue))}` : '';
  return (
    <Card padded={false} className="elc-preview">
      <div className="elc-preview__head">
        <span className="elc-preview__icon"><FileText size={16} /></span>
        <div className="elc-preview__title">
          <strong>eLC preview</strong>
          <span>Documentary credit · as signed by {r.issuerName}{signedOn}</span>
        </div>
        <span className="grow" />
        {intact && <StatusPill status="Content matches signature" tone="ok" />}
      </div>
      {changed ? (
        <div className="elc-preview__hidden"><EyeOff size={14} /> Hidden: the file was changed after signing, so its contents can't be trusted.</div>
      ) : (
        <>
          <div className="elc-preview__grid">
            {items.map((x) => (
              <div key={x.label}>
                <span className="elc-preview__label">{x.label}</span>
                <span className="elc-preview__value" title={x.value}>{x.value}</span>
                {x.sub && <span className="elc-preview__sub" title={x.sub}>{x.sub}</span>}
              </div>
            ))}
          </div>
          {full && <div className="elc-preview__full"><ElcReadOnly form={formFromJson(f).form} /></div>}
          <div className="elc-preview__foot">
            <span>Showing {full ? 'all' : `${items.length} of ${total}`} fields</span>
            <button className="link-btn" onClick={() => setFull((v) => !v)} aria-expanded={full}>
              {full ? 'Show less' : 'View full eLC'} <ChevronDown size={14} className={full ? 'rot' : ''} />
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

/** Report download: results and IDs only (no eLC content beyond its number). */
const report = (r: Verification, fileName: string) => ({
  ref: r.ref, checkedAt: r.checkedAt, file: fileName, result: r.overall,
  platform: r.platform, lcNumber: r.fields.lcNumber ?? null, vcId: r.vcId, txId: r.txId, issuerDid: r.issuerDid, issuerName: r.issuerName,
  status: r.status, checks: r.checks.map((c) => ({ check: c.title, result: c.state, details: c.detail.map((d) => d.text) })),
});
