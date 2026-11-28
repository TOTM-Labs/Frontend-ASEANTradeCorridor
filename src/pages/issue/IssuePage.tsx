import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Save, Send, Upload } from 'lucide-react';
import { JURISDICTIONS, OWN_REGISTRY, PORTAL, bankLabel } from '@/config/portal';
import { Banner, Button, Card, PageHeader } from '@/shared/components';
import {
  REQUIRED_KEYS, SECTIONS, apiData, emptyForm, formFromJson, requiredDone, sectionErrors, sectionSummary,
  validate, type ElcForm, type SectionId,
} from '@/shared/services/elcModel';
import { readBase64, readJson } from '@/shared/services/files';
import { fmtDateTime } from '@/shared/services/format';
import { ApiError } from '@/shared/services/http';
import { rememberSigned } from '@/shared/services/session';
import { deleteDraft, saveDraft, type Draft } from '@/shared/services/drafts';
import { DraftsMenu } from './DraftsMenu';
import { trustApi, type IssueResponse } from '@/shared/services/trustApi';
import { FormSection, type Attachment } from './FormSection';
import { SidePanel } from './SidePanel';
import { SendCard, advisingPartner, useSendElc } from './SendToAdvisingBank';
import { STEP_LABEL, Steps, type StepItem } from './Steps';
import { SentModal } from './SentModal';
import { useDemo } from '@/demo/DemoProvider';
import { SigningModal } from '@/demo/SigningModal';
import { sampleElc } from '@/test-docs/sampleElc'; // test-docs
import { FillDetailsButton } from '@/test-docs/FillDetailsButton'; // test-docs
import './Issue.css';

const MAX_ATTACH = 10 * 1024 * 1024;
type Phase = 'edit' | 'signing' | 'failed' | 'issued';

export function IssuePage() {
  const [form, setForm] = useState<ElcForm>(emptyForm);
  const [step, setStep] = useState<SectionId>('credit');
  const [visited, setVisited] = useState<Set<SectionId>>(new Set());
  const [sentPopup, setSentPopup] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [embedPdf, setEmbedPdf] = useState(true);
  const [phase, setPhase] = useState<Phase>('edit');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad' | 'info'; title: string; text?: string } | null>(null);
  const [issued, setIssued] = useState<IssueResponse | null>(null);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Draft['origin']>('manual');
  const importInput = useRef<HTMLInputElement>(null);
  const demo = useDemo();
  const sendCtl = useSendElc(issued?.txId, issued?.vc);
  const sendTo = advisingPartner(issued?.vc);
  const isSent = sendCtl.state.kind === 'sent';

  // The "eLC sent" pop-up appears once, right after the Send button succeeds.
  const sendKind = sendCtl.state.kind;
  const prevSendKind = useRef(sendKind);
  useEffect(() => {
    if (prevSendKind.current === 'sending' && sendKind === 'sent') setSentPopup(true);
    prevSendKind.current = sendKind;
  }, [sendKind]);

  const isIssued = phase === 'issued' && issued;
  const errors = useMemo(() => validate(form), [form]);
  const done = requiredDone(errors);

  // The sign card stays hidden until every required field has been filled once. After that it stays,
  // so clearing a field shows what needs attention instead of the card disappearing.
  const [signCardShown, setSignCardShown] = useState(false);
  useEffect(() => { if (!signCardShown && done === REQUIRED_KEYS.length) setSignCardShown(true); }, [done, signCardShown]);
  const issues = Object.keys(errors).filter((k) => attempted || touched.has(k)).length;
  const show = (k: string) => attempted || touched.has(k);

  // "Fix 3 issues before signing": shown after Sign is pressed with fields missing or wrong, one line per section.
  const issueLines = attempted ? SECTIONS.flatMap((s) => {
    const errs = sectionErrors(s, errors);
    if (!errs.length) return [];
    const labels = errs.map((k) => (k === 'documentsRequired' ? 'Documents required' : s.fields.find((f) => f.key === k)?.label ?? k));
    const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0];
    const allMissing = errs.every((k) => errors[k] === 'Required');
    return [`${STEP_LABEL[s.id]} · ${list} ${allMissing ? (labels.length > 1 ? 'are required' : 'is required') : (labels.length > 1 ? 'need fixing' : 'needs fixing')}.`];
  }) : [];
  const issueCount = attempted ? Object.keys(errors).length : 0;

  // No attachments step: the eLC carries no attachment files (only the optional embedded PDF copy).
  const sections = SECTIONS.filter((s) => s.id !== 'attachments');
  const steps: StepItem[] = sections.map((s) => {
    const errs = sectionErrors(s, errors);
    const state = isIssued ? 'done'
      : errs.some(show) ? 'bad'
      : !errs.length && (visited.has(s.id) || !!sectionSummary(s.id, form, attachments.length)) ? 'done' : 'todo';
    return { id: s.id, label: STEP_LABEL[s.id], state };
  });
  const current = sections.find((s) => s.id === step) ?? sections[0];
  const stepIndex = sections.indexOf(current);

  const setField = (key: string, value: string) => setForm((f) => ({ ...f, fields: { ...f.fields, [key]: value } }));
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const { form: next, ignored, count } = formFromJson(await readJson(file));
      setForm(next);
      setOrigin('import');
      setSignCardShown(false);
      setTouched(new Set());
      setAttempted(false);
      setNotice({ tone: 'info', title: `Imported ${count} field${count === 1 ? '' : 's'} from ${file.name}`, text: ignored.length ? `Not used: ${ignored.slice(0, 6).join(', ')}${ignored.length > 6 ? '…' : ''}` : 'Check each section, then sign.' });
    } catch (e) {
      setNotice({ tone: 'bad', title: 'Could not import this file', text: (e as Error).message });
    }
  };

  const fillSample = () => {
    setForm(sampleElc());
    setOrigin('manual');
    setSignCardShown(false);
    setTouched(new Set());
    setAttempted(false);
    goFirst();
    setNotice({ tone: 'ok', title: 'Sample details filled', text: `${PORTAL.bank.name} sample eLC with a new LC number. Check each section, then sign.` });
  };

  const addFiles = async (files: File[]) => {
    const used = attachments.reduce((n, a) => n + a.size, 0);
    const ok = files.filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name));
    const total = used + ok.reduce((n, f) => n + f.size, 0);
    if (ok.length < files.length) setNotice({ tone: 'bad', title: 'Only PDF, JPG or PNG files can be attached' });
    if (total > MAX_ATTACH) { setNotice({ tone: 'bad', title: 'Attachments are larger than 10 MB in total' }); return; }
    const added = await Promise.all(ok.map(async (f) => ({ filename: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, data: await readBase64(f) })));
    setAttachments((a) => [...a, ...added]);
  };

  const goFirst = () => { setStep('credit'); setVisited(new Set()); };

  // Leaving a step marks it visited; Next refuses to move on while the step's required fields are empty
  // (the missing ones are highlighted instead). Tabs can always jump anywhere.
  const goTo = (id: SectionId) => {
    setVisited((v) => (v.has(step) ? v : new Set(v).add(step)));
    setStep(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => {
    const i = steps.findIndex((s) => s.id === step);
    const missing = isIssued ? [] : sectionErrors(SECTIONS.find((s) => s.id === step)!, errors).filter((k) => errors[k] === 'Required');
    if (missing.length) { setTouched((t) => new Set([...t, ...missing])); return; }
    if (i < steps.length - 1) goTo(steps[i + 1].id);
  };
  const back = () => {
    const i = steps.findIndex((s) => s.id === step);
    if (i > 0) goTo(steps[i - 1].id);
  };

  const saveCurrentDraft = () => {
    try {
      const { draft, withoutAttachments } = saveDraft({ id: draftId ?? undefined, origin, form, attachments, embedPdf });
      setDraftId(draft.id);
      const when = fmtDateTime(draft.savedAt).split(' · ')[1];
      setNotice({
        tone: 'ok', title: 'Draft saved',
        text: `${form.fields.lcNumber || 'Untitled draft'} · ${when}. Open it later from Open draft.${withoutAttachments ? ' Attachments were too large to keep in the browser; add them again before signing.' : ''}`,
      });
    } catch (e) {
      setNotice({ tone: 'bad', title: 'Could not save the draft', text: (e as Error).message });
    }
  };

  const openDraft = (d: Draft) => {
    setForm(d.form);
    setAttachments([]); // attachments are no longer part of an eLC; ignore any kept in older drafts
    setEmbedPdf(d.embedPdf);
    setOrigin(d.origin);
    setSignCardShown(false);
    setDraftId(d.id);
    setTouched(new Set());
    setAttempted(false);
    setPhase('edit');
    goFirst();
    setNotice({ tone: 'info', title: `Opened draft ${d.form.fields.lcNumber || 'Untitled draft'}`, text: 'Changes are not saved until you click Save draft.' });
  };

  const sign = async () => {
    if (Object.keys(errors).length) {
      setAttempted(true);
      const first = SECTIONS.find((s) => sectionErrors(s, errors).length);
      if (first) goTo(first.id);
      return;
    }
    setPhase('signing');
    setNotice(null);
    try {
      const files = attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data }));
      if (embedPdf) {
        const { elcPdfBase64 } = await import('@/shared/services/pdf');
        files.push({ filename: `${form.fields.lcNumber}.pdf`, mimeType: 'application/pdf', data: elcPdfBase64(form) });
      }
      // Keep the signing pop-up up long enough to read, even when the API answers quickly.
      const [r] = await Promise.all([trustApi.issueElc({ data: apiData(form), attachments: files }), new Promise((ok) => setTimeout(ok, 2200))]);
      rememberSigned(r.data.vc);
      if (draftId) { deleteDraft(draftId); setDraftId(null); }
      setIssued(r.data);
      setIssuedAt(new Date().toISOString());
      setPhase('issued');
      setStep('credit');
      window.scrollTo({ top: 0 });
    } catch (e) {
      const err = e as ApiError;
      setPhase('failed');
      setNotice({
        tone: 'bad', title: "Couldn't sign this eLC",
        text: err.isUnavailable ? "The signing service didn't respond. Your details are kept, so you can try again." : `${err.message}. Your details are kept.`,
      });
    }
  };

  const reset = () => {
    setForm(emptyForm()); setAttachments([]); setTouched(new Set()); setAttempted(false);
    setPhase('edit'); setIssued(null); setNotice(null); setDraftId(null); setOrigin('manual'); setSentPopup(false); setSignCardShown(false); goFirst();
  };

  // Header actions are the same in every state (as in the design). Once the eLC is issued, any of them starts a new eLC.
  const fresh = (then?: () => void) => () => { if (isIssued) reset(); then?.(); };

  return (
    <>
      <PageHeader
        title="Issue eLC"
        actions={(
          <>
            <FillDetailsButton onFill={() => { if (isIssued) reset(); fillSample(); }} force={!!demo.mode} disabled={phase === 'signing'} />{/* test-docs */}
            <DraftsMenu currentId={draftId} onOpen={(d) => { if (isIssued) reset(); openDraft(d); }} disabled={phase === 'signing'} />
            <Button icon={<Save size={16} />} onClick={saveCurrentDraft} disabled={phase === 'signing' || !!isIssued}>Save draft</Button>
            <Button variant="primary" icon={<Upload size={16} />} onClick={fresh(() => importInput.current?.click())} disabled={phase === 'signing'}>Import JSON</Button>
            <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        )}
      />
      {isIssued && isSent && sendTo && sendCtl.state.kind === 'sent' && (
        <Banner tone="ok" title={`eLC sent · ${form.fields.lcNumber} delivered to ${bankLabel(sendTo.name, sendTo.jurisdiction)}`}
          action={<span className="banner-sent" data-tour="elc-sent"><CheckCircle2 size={16} /> Sent</span>}>
          {sendCtl.state.sent.via || sendTo.platform} accepted it on {fmtDateTime(sendCtl.state.sent.at)}. Track the result in the card on the right.
        </Banner>
      )}
      {isIssued && !isSent && (
        <Banner tone="ok" title={`eLC issued · ${form.fields.lcNumber} is now Active`}
          action={sendTo && (
            <Button variant="primary" icon={<Send size={16} />} loading={sendCtl.state.kind === 'sending'} onClick={() => void sendCtl.send()} data-tour="send-elc">
              {sendCtl.state.kind === 'error' ? 'Try sending again' : `Send to ${sendTo.name}`}
            </Button>
          )}>
          {sendCtl.state.kind === 'error' ? `Not sent: ${sendCtl.state.message}` : `Signed by ${PORTAL.bank.name} ${JURISDICTIONS[PORTAL.bank.jurisdiction].name} and recorded in the ${OWN_REGISTRY}. Next: send it to the advising bank.`}
        </Banner>
      )}
      {!isIssued && issueCount > 0 && (
        <Banner tone="bad" title={`Fix ${issueCount} issue${issueCount === 1 ? '' : 's'} before signing`}>
          {issueLines.map((l) => <span key={l} className="issue-line">{l}</span>)}
        </Banner>
      )}
      {notice && !isIssued && !(issueCount > 0 && notice.tone !== 'bad') && <Banner tone={notice.tone} title={notice.title} onClose={() => setNotice(null)}>{notice.text}</Banner>}
      {phase === 'signing' && <SigningModal />}
      {sentPopup && isIssued && sendTo && sendCtl.state.kind === 'sent' && (
        <SentModal lcNumber={form.fields.lcNumber || issued.txId} partner={sendTo} sent={sendCtl.state.sent} onClose={() => setSentPopup(false)} />
      )}
      <Steps steps={steps} current={current.id} onSelect={goTo} disabled={phase === 'signing'} locked={!!isIssued} />
      <div className="page-grid">
        <Card className={`step-card${phase === 'signing' ? ' is-busy' : ''}`} data-tour="issue-form">
          <div className="step-card__head">
            <h2>{current.title}</h2>
            {current.optional && !isIssued && <span className="muted">Optional</span>}
          </div>
          {/* Issued: the same form, greyed out and locked. */}
          <fieldset className={`step-form${isIssued ? ' step-form--locked' : ''}`} disabled={!!isIssued}>
            <FormSection section={current} form={form} errors={errors} show={isIssued ? () => false : show} setField={setField} touch={touch}
              setDocs={(docs) => setForm((f) => ({ ...f, docs }))} attachments={attachments} addFiles={(f) => void addFiles(f)}
              removeAttachment={(i) => setAttachments((a) => a.filter((_, n) => n !== i))} />
          </fieldset>
          {/* No Back / Next once the eLC is issued: the process is done. */}
          {!isIssued && (
            <div className="step-card__nav">
              <Button icon={<ArrowLeft size={16} />} onClick={back} disabled={stepIndex === 0}>Back</Button>
              {stepIndex < sections.length - 1 && (
                <Button variant="primary" onClick={next}>Next <ArrowRight size={16} /></Button>
              )}
            </div>
          )}
        </Card>
        <SidePanel form={form} done={done} issues={issues} showIssues={attempted || issues > 0} embedPdf={embedPdf} setEmbedPdf={setEmbedPdf}
          phase={phase} onSign={() => void sign()} issued={issued} issuedAt={issuedAt}
          sent={isSent} showSignCard={signCardShown} sendCard={isIssued ? <SendCard vc={issued.vc} ctl={sendCtl} showCheck /> : null} />
      </div>
    </>
  );
}
