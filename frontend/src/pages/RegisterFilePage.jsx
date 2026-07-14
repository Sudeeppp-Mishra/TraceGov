import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Input, Select, Textarea, Icons, useToast } from '../components/ui';
import { AppShell } from '../components/layout';

const DOCUMENT_TYPES = [
  'Recommendation Letter', 'Tax Clearance Receipt', 'Birth Certificate Registration',
  'Marriage Certificate Registration', 'Land Valuation Claim',
  'Citizenship Verification Request', 'Business License Approval',
];

const DOCUMENT_TEMPLATES = [
  'Citizenship Copy', 'Land Ownership Title Deed', 'Recent Passport Photograph',
  'Previous Tax Invoice Receipt', 'Ward Chair Signature Clearance',
];

export default function RegisterFilePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);

  const [title, setTitle] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenPhone, setCitizenPhone] = useState('');
  const [documentType, setDocumentType] = useState('Recommendation Letter');
  const [internalNotes, setInternalNotes] = useState('');
  const [requiredDocs, setRequiredDocs] = useState([]);
  const [newDocText, setNewDocText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
  }, [navigate]);

  const addChecklistItem = (text) => {
    const clean = text.trim();
    if (clean && !requiredDocs.includes(clean)) setRequiredDocs((d) => [...d, clean]);
    setNewDocText('');
  };
  const removeChecklistItem = (item) => setRequiredDocs((d) => d.filter((x) => x !== item));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !citizenName.trim() || !citizenPhone.trim()) {
      setError('Please complete all required fields.');
      return;
    }
    if (!/^\d{10}$/.test(citizenPhone.trim())) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.registerFile({
        title: title.trim(), citizenName: citizenName.trim(), citizenPhone: citizenPhone.trim(),
        documentType, requiredDocuments: requiredDocs, internalNotes: internalNotes.trim(),
      });
      setReceipt(res);
      toast.success('File registered successfully.');
    } catch (err) {
      setError(err.message || 'Failed to register file.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle(''); setCitizenName(''); setCitizenPhone(''); setDocumentType('Recommendation Letter');
    setInternalNotes(''); setRequiredDocs([]); setReceipt(null); setError('');
  };

  const file = receipt?.file;

  return (
    <AppShell user={currentUser} kicker="Register">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background:#fff !important; color:#000 !important; }
          .no-print, header { display:none !important; }
          .print-ticket { position:absolute; inset:0; margin:0 auto; box-shadow:none !important; border:1px solid #000 !important; }
        }
      `}} />
      <Container className="max-w-2xl pt-8">
        {!receipt ? (
          <div className="animate-fade-up">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Register a physical file</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Enter citizen details and required documents to generate a trackable QR record.</p>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm font-medium text-red-600 dark:text-red-400" role="alert">
                <Icons.AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" /> {error}
              </div>
            )}

            <Card className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Citizen full name" id="name" placeholder="e.g. Aarav Sharma" value={citizenName} onChange={(e) => setCitizenName(e.target.value)} required disabled={loading} />
                  <Input label="Mobile (10 digits)" id="phone" placeholder="9841234567" value={citizenPhone} onChange={(e) => setCitizenPhone(e.target.value)} required disabled={loading} inputMode="numeric" maxLength={10} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="File title" id="title" placeholder="e.g. Property Registration" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={loading} />
                  <Select label="Document category" id="type" value={documentType} onChange={(e) => setDocumentType(e.target.value)} required disabled={loading}>
                    {DOCUMENT_TYPES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">Required documents checklist</label>
                  <div className="mb-3 flex gap-2">
                    <Input id="new-item" placeholder="Add required attachment…" value={newDocText}
                      onChange={(e) => setNewDocText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(newDocText); } }} />
                    <Button variant="secondary" onClick={() => addChecklistItem(newDocText)} className="shrink-0"><Icons.Plus className="h-4 w-4" /> Add</Button>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {DOCUMENT_TEMPLATES.map((tmpl) => (
                      <button key={tmpl} type="button" onClick={() => addChecklistItem(tmpl)}
                        className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground cursor-pointer">
                        + {tmpl}
                      </button>
                    ))}
                  </div>
                  {requiredDocs.length > 0 ? (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                      {requiredDocs.map((doc) => (
                        <div key={doc} className="flex items-center justify-between text-sm font-medium text-foreground">
                          <span className="flex items-center gap-2"><Icons.Check className="h-4 w-4 text-emerald-500" /> {doc}</span>
                          <button type="button" onClick={() => removeChecklistItem(doc)} className="rounded p-1 text-muted-foreground hover:text-red-500 cursor-pointer" aria-label={`Remove ${doc}`}>
                            <Icons.X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs italic text-muted-foreground">No documents attached yet.</p>
                  )}
                </div>

                <Textarea label="Internal notes (optional)" id="notes" rows={2} placeholder="e.g. Tax audit checks completed."
                  value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} disabled={loading} />

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => navigate('/officer')}>Cancel</Button>
                  <Button type="submit" variant="primary" loading={loading}>Register & generate tag <Icons.ArrowRight className="h-4 w-4" /></Button>
                </div>
              </form>
            </Card>
          </div>
        ) : (
          <div className="animate-zoom-in">
            <div className="no-print mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <Icons.CheckCircle className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">File registered</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Print the tag below and attach it to the physical folder.</p>
            </div>

            <Card className="print-ticket mx-auto max-w-md border-2 border-primary/20 p-6">
              <p className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">TraceGov File Tracking Ticket</p>
              <div className="mx-auto my-5 flex h-48 w-48 items-center justify-center rounded-xl border border-border bg-white p-2.5">
                {file?.qrDataUrl ? (
                  <img src={file.qrDataUrl} alt="File QR tag" className="h-full w-full object-contain" />
                ) : (
                  <p className="text-[10px] uppercase text-red-500">QR unavailable</p>
                )}
              </div>
              <h3 className="text-center text-lg font-bold leading-snug text-foreground">{file?.title}</h3>
              <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4 text-left text-xs">
                <div><span className="block text-[9px] font-bold uppercase text-muted-foreground">File UID</span><span className="mt-0.5 font-mono font-bold text-foreground">{file?.fileUid}</span></div>
                <div><span className="block text-[9px] font-bold uppercase text-muted-foreground">Tracking ID</span><span className="mt-0.5 font-mono font-bold text-foreground">{file?.trackingId}</span></div>
                <div><span className="block text-[9px] font-bold uppercase text-muted-foreground">Citizen</span><span className="mt-0.5 font-bold text-foreground">{citizenName}</span></div>
                <div><span className="block text-[9px] font-bold uppercase text-muted-foreground">Initial desk</span><span className="mt-0.5 font-bold text-foreground">{file?.currentLocation}</span></div>
              </div>
              <p className="mt-6 text-center text-[9px] italic leading-relaxed text-muted-foreground">
                Track status anytime by scanning this QR or visiting<br /><strong>{window.location.origin}/track</strong>
              </p>
            </Card>

            <div className="no-print mx-auto mt-6 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => window.print()}><Icons.Printer className="h-4 w-4" /> Print tag</Button>
              <Button variant="primary" onClick={resetForm}><Icons.Plus className="h-4 w-4" /> Register another</Button>
            </div>
          </div>
        )}
      </Container>
    </AppShell>
  );
}
