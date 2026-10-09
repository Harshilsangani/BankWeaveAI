"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui";
import { confirmCustomer, saveFormCorrection } from "@/services";
import type { CustomerFields, FormDraft } from "@/types";

const fieldLabels: Record<keyof CustomerFields, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  email: "Email",
  phone: "Mobile number",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "PIN / postal code",
};
export function FormReview({ draft, onSaved }: { draft: FormDraft; onSaved?: () => void }) {
  const [fields, setFields] = useState(draft.fields),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<string | undefined>(draft.status === 'saved' ? draft.customerId : undefined);
  const [correctionStatus,setCorrectionStatus] = useState('');
  const [quality,setQuality]=useState<Pick<FormDraft,'revision'|'provenance'|'possibleDuplicates'>>({revision:draft.revision,provenance:draft.provenance,possibleDuplicates:draft.possibleDuplicates});
  const [duplicateDecision,setDuplicateDecision]=useState<'reuse'|'create_separate'|''>('');
  const [duplicateReason,setDuplicateReason]=useState('');
  const correctionTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (busy || saved || fields === draft.fields || draft.status !== 'pending') return;
    const timer = setTimeout(() => {
      void saveFormCorrection(draft.id,fields).then((review) => {setQuality(review);setCorrectionStatus('Corrections saved');}).catch((e) => setCorrectionStatus(e.message));
    }, 400);
    correctionTimer.current=timer;
    return () => clearTimeout(timer);
  },[fields,draft,saved,busy]);
  async function save() {
    setBusy(true);
    setError("");
    clearTimeout(correctionTimer.current);
    try {
      const review=await saveFormCorrection(draft.id,fields);
      setQuality(review);
      const result = await confirmCustomer(draft, fields,{reviewRevision:review.revision,...(duplicateDecision ? {duplicateDecision,duplicateReason} : {})});
      setSaved(result.customerId);
      onSaved?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Customer could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-review">
      <div className="form-source">
        <FileText size={18} />
        <strong>{draft.filename}</strong>
        <span>{draft.provider === 'local' ? 'Local form reader · No external AI call' : 'Vertex form reader · Document sent for extraction'}</span>
      </div>
      <section className="markdown-preview">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}
        >
          {draft.markdown}
        </ReactMarkdown>
      </section>
      <details className="form-markdown-source">
        <summary>View Markdown source</summary>
        <pre>{draft.markdown}</pre>
      </details>
      <div className="customer-draft">
        <h3>Review customer details</h3>
        <p>
          Save to the local Meridian customer directory with verification pending. This creates a
          profile; account opening and KYC approval require separate workflows.
        </p>
        <div className="customer-fields">
          {(Object.keys(fieldLabels) as (keyof CustomerFields)[]).map((key) => (
            <label key={key}>
              {fieldLabels[key]}
              {(key === "fullName" || key === "dateOfBirth") && " *"}
              <input
                aria-label={`Customer ${fieldLabels[key]}`}
                type={key === "dateOfBirth" ? "date" : key === "email" ? "email" : "text"}
                value={fields[key]}
                disabled={busy || !!saved}
                onChange={(e) => setFields((v) => ({ ...v, [key]: e.target.value }))}
              />
              {quality.provenance?.[key] && <small className={['missing','invalid'].includes(quality.provenance[key].status) ? 'text-amber' : 'muted'}>{quality.provenance[key].status} · {quality.provenance[key].page ? `Page ${quality.provenance[key].page}` : quality.provenance[key].method}<span className="field-reason">{quality.provenance[key].reason}</span></small>}
            </label>
          ))}
        </div>
        <ul>
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        {correctionStatus && <p className="muted" role="status">{correctionStatus}</p>}
        {!!quality.possibleDuplicates?.length && !saved && <section className="duplicate-review"><h4>Possible existing customer</h4><p>Review these matches. Nothing is merged or overwritten automatically.</p>{quality.possibleDuplicates.map(match=><p key={match.customerId}><strong>{match.name} · {match.customerId}</strong><br/>{match.reasons.join(' · ')}</p>)}<label>Duplicate decision<select aria-label="Duplicate decision" value={duplicateDecision} onChange={e=>setDuplicateDecision(e.target.value as typeof duplicateDecision)}><option value="">Choose after review</option>{quality.possibleDuplicates.length===1 && <option value="reuse">Link this form to the existing customer</option>}<option value="create_separate">Create a separate profile</option></select></label><label>Review reason<input aria-label="Duplicate review reason" value={duplicateReason} maxLength={500} onChange={e=>setDuplicateReason(e.target.value)}/></label></section>}
        {error && (
          <p role="alert" className="text-amber">
            {error}
          </p>
        )}
        {saved ? (
          <div className="customer-saved" role="status">
            <CheckCircle2 size={19} />
            <span>
              Customer saved: <strong>{saved}</strong> · Verification pending
            </span>
          </div>
        ) : draft.status === 'deleted' ? <p className="text-amber">This customer was deleted. Start a new review.</p> : (
          <Button
            variant="primary"
            disabled={busy || !fields.fullName.trim() || !fields.dateOfBirth || (!!quality.possibleDuplicates?.length && (!duplicateDecision || duplicateReason.trim().length<5))}
            onClick={save}
          >
            {busy ? "Saving reviewed customer…" : "Confirm & add customer"}
          </Button>
        )}
      </div>
    </div>
  );
}
