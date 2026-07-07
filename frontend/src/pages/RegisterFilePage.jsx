import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Input, Select, Icons } from '../components/ui';

export default function RegisterFilePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenPhone, setCitizenPhone] = useState('');
  const [documentType, setDocumentType] = useState('Recommendation Letter');
  const [internalNotes, setInternalNotes] = useState('');
  
  // Checklist builder state
  const [requiredDocs, setRequiredDocs] = useState([]);
  const [newDocText, setNewDocText] = useState('');

  // Status controls
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationReceipt, setRegistrationReceipt] = useState(null);

  // Verify auth session
  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
  }, [navigate]);

  const documentTypes = useMemo(() => [
    'Recommendation Letter',
    'Tax Clearance Receipt',
    'Birth Certificate Registration',
    'Marriage Certificate Registration',
    'Land Valuation Claim',
    'Citizenship Verification Request',
    'Business License Approval',
  ], []);

  // Quick addition list templates
  const documentTemplates = useMemo(() => [
    'Citizenship Copy',
    'Land Ownership Title deed',
    'Recent Passport Photograph',
    'Previous Tax Invoice Receipt',
    'Ward Chair Signature Clearance',
  ], []);

  // Add custom doc check list item
  const handleAddChecklistItem = (text) => {
    if (!text.trim()) return;
    const cleanText = text.trim();
    if (!requiredDocs.includes(cleanText)) {
      setRequiredDocs([...requiredDocs, cleanText]);
    }
    setNewDocText('');
  };

  // Remove checklist item
  const handleRemoveChecklistItem = (item) => {
    setRequiredDocs(requiredDocs.filter((d) => d !== item));
  };

  // Register physical file record in db
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !citizenName.trim() || !citizenPhone.trim() || !documentType) {
      setError('Please populate all required fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        citizenName: citizenName.trim(),
        citizenPhone: citizenPhone.trim(),
        documentType,
        requiredDocuments: requiredDocs,
        internalNotes: internalNotes.trim(),
      };

      const response = await api.registerFile(payload);
      setRegistrationReceipt(response);
    } catch (err) {
      setError(err.message || 'Failed to complete physical file registration.');
    } finally {
      setLoading(false);
    }
  };

  // Print envelope label ticket
  const handlePrintReceipt = () => {
    window.print();
  };

  // Reset form to register another folder
  const handleRegisterAnother = () => {
    setTitle('');
    setCitizenName('');
    setCitizenPhone('');
    setDocumentType('Recommendation Letter');
    setInternalNotes('');
    setRequiredDocs([]);
    setRegistrationReceipt(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors pb-16">
      
      {/* Print media specific styles inline */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, main > div > *:not(.print-ticket-wrapper), button, a {
            display: none !important;
          }
          .print-ticket-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .qr-print-box {
            width: 200px !important;
            height: 200px !important;
            margin: 1.5rem auto !important;
          }
        }
      `}} />

      {/* Header */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-40">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1 bg-teal-600 rounded-full" />
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">TraceGov Register</span>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/officer" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
              Go to Workspace
            </Link>
          </div>
        </Container>
      </header>

      <main className="mt-8 md:mt-12">
        <Container className="max-w-2xl">
          
          {!registrationReceipt ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="text-center max-w-md mx-auto mb-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Register physical folder</h2>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Enter citizen metadata and attach required checklist envelopes to generate the tracking record.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-4 text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-2.5">
                  <Icons.AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Card className="p-6 md:p-8">
                <form onSubmit={handleRegisterSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Citizen Full Name"
                      id="name"
                      placeholder="e.g. Sudeep Mishra"
                      value={citizenName}
                      onChange={(e) => setCitizenName(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <Input
                      label="Citizen 10-Digit Mobile"
                      id="phone"
                      placeholder="e.g. 9841234567"
                      value={citizenPhone}
                      onChange={(e) => setCitizenPhone(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="File Subject / Title"
                      id="title"
                      placeholder="e.g. Property Registration Form"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <Select
                      label="Document Subject Category"
                      id="type"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      required
                      disabled={loading}
                    >
                      {documentTypes.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </Select>
                  </div>

                  {/* Checklist Builder */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                      Attach Checklist Requirements
                    </label>
                    <div className="flex gap-2 mb-3">
                      <Input
                        id="new-item"
                        placeholder="Add required attachment name..."
                        value={newDocText}
                        onChange={(e) => setNewDocText(e.target.value)}
                        className="py-1.5"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddChecklistItem(newDocText);
                          }
                        }}
                      />
                      <Button variant="secondary" onClick={() => handleAddChecklistItem(newDocText)} className="shrink-0">
                        Add
                      </Button>
                    </div>

                    {/* Pre-made shortcuts */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {documentTemplates.map((tmpl) => (
                        <button
                          key={tmpl}
                          type="button"
                          onClick={() => handleAddChecklistItem(tmpl)}
                          className="rounded bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:bg-accent"
                        >
                          + {tmpl}
                        </button>
                      ))}
                    </div>

                    {/* Active Checklist list */}
                    {requiredDocs.length > 0 ? (
                      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                        {requiredDocs.map((doc) => (
                          <div key={doc} className="flex justify-between items-center text-xs text-foreground font-medium">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                              {doc}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveChecklistItem(doc)}
                              className="text-red-500 hover:text-red-600 text-[10px] uppercase font-semibold cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic bg-muted/10 border border-dashed border-border rounded-lg p-3 text-center">
                        No check items attached to file yet.
                      </p>
                    )}
                  </div>

                  <Input
                    label="Private Internal Notes"
                    id="notes"
                    placeholder="e.g. Backdoor tax audit checks completed. Citizen receipt attached."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    disabled={loading}
                  />

                  <div className="flex justify-end gap-3 pt-3">
                    <Link to="/officer">
                      <Button variant="secondary">Cancel</Button>
                    </Link>
                    <Button type="submit" variant="primary" disabled={loading}>
                      {loading ? 'Creating file record...' : 'Register File & Generate Tag'}
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          ) : (
            // Success registration Receipt layout
            <div className="space-y-6 animate-in zoom-in-95 duration-200">
              <div className="text-center max-w-md mx-auto mb-6 print:hidden">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
                  <Icons.ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">File Registered successfully</h2>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The physical file tracking details are logged. Print the barcode coupon below and paste it on the folder wrapper.
                </p>
              </div>

              {/* Printable Envelope Coupon Ticket Card */}
              <Card className="print-ticket-wrapper max-w-md mx-auto p-6 border-2 border-primary/20 dark:border-primary/45">
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">TraceGov File Tracking Ticket</p>
                  
                  {/* Base64 Rendered QR Code */}
                  <div className="qr-print-box flex items-center justify-center bg-white border border-neutral-200 p-2.5 rounded-lg w-48 h-48 mx-auto my-5">
                    {registrationReceipt.file?.qrDataUrl ? (
                      <img
                        src={registrationReceipt.file.qrDataUrl}
                        alt="Verification QR code tag"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <p className="text-[10px] text-red-500 uppercase">QR Code Offline</p>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-foreground leading-snug">{registrationReceipt.file?.title}</h3>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6 text-left text-xs bg-muted/40 p-4.5 rounded-lg border border-border">
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-muted-foreground">File Uid</span>
                      <span className="font-mono font-bold text-foreground mt-0.5">{registrationReceipt.file?.fileUid}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-muted-foreground">Tracking Id</span>
                      <span className="font-mono font-bold text-foreground mt-0.5">{registrationReceipt.file?.trackingId}</span>
                    </div>
                    <div className="mt-2">
                      <span className="block text-[9px] uppercase font-bold text-muted-foreground">Citizen Name</span>
                      <span className="font-bold text-foreground mt-0.5">{citizenName}</span>
                    </div>
                    <div className="mt-2">
                      <span className="block text-[9px] uppercase font-bold text-muted-foreground">Initial Section</span>
                      <span className="font-bold text-foreground mt-0.5">{registrationReceipt.file?.currentLocation}</span>
                    </div>
                  </div>

                  <p className="text-[9px] text-muted-foreground mt-6 text-center italic leading-relaxed">
                    Citizens can track their status updates in real time by scanning this QR code or checking tracking details at: <br />
                    <strong>{window.location.origin}/track</strong>
                  </p>
                </div>
              </Card>

              {/* Action buttons (hidden on print) */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto pt-2 print:hidden">
                <Button variant="outline" onClick={handlePrintReceipt} className="flex gap-2">
                  <svg className="h-4.5 w-4.5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print QR Label ticket
                </Button>
                <Button variant="primary" onClick={handleRegisterAnother}>
                  Register Another folder
                </Button>
              </div>
            </div>
          )}

        </Container>
      </main>
    </div>
  );
}
