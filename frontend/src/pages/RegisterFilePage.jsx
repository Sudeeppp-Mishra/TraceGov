import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Input, Select, Textarea, Icons, useToast, Alert } from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';
import { DocumentChecklistItem } from '../components/ui/DocumentChecklistItem';
import { DOCUMENT_TYPES, CATEGORY_CHECKLISTS, CATEGORY_META } from '../lib/documentCategories';

export default function RegisterFilePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenPhone, setCitizenPhone] = useState('');
  const [citizenEmail, setCitizenEmail] = useState('');
  const [documentType, setDocumentType] = useState('Land Valuation Claim');
  const [internalNotes, setInternalNotes] = useState('');
  const [customItemText, setCustomItemText] = useState('');

  // Per-Document Checklist State
  const [checklistItems, setChecklistItems] = useState([]);

  // Form State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
  }, [navigate]);

  // Auto-populate checklist when document category changes
  useEffect(() => {
    const defaultLabels = CATEGORY_CHECKLISTS[documentType] || [];
    setChecklistItems(
      defaultLabels.map((lbl, idx) => ({
        id: `doc-${idx}-${Date.now()}`,
        label: lbl,
        isCustom: false,
        scanPreview: null,
        scanResult: null,
        scanning: false,
        scanError: '',
        status: 'not_uploaded',
      }))
    );
  }, [documentType]);

  // Checklist Handlers
  const handleLabelChange = (id, newLabel) => {
    setChecklistItems((items) =>
      items.map((item) => (item.id === id ? { ...item, label: newLabel } : item))
    );
  };

  const handleRemoveItem = (id) => {
    setChecklistItems((items) => items.filter((item) => item.id !== id));
  };

  const handleAddCustomItem = () => {
    const clean = customItemText.trim();
    if (!clean) return;
    setChecklistItems((items) => [
      ...items,
      {
        id: `custom-${Date.now()}`,
        label: clean,
        isCustom: true,
        scanPreview: null,
        scanResult: null,
        scanning: false,
        scanError: '',
        status: 'not_uploaded',
      },
    ]);
    setCustomItemText('');
  };

  // OCR Scan per Item
  const runScanForItem = async (id, dataUrl, label) => {
    setChecklistItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, scanning: true, scanError: '' } : item
      )
    );

    try {
      const result = await api.analyzeDocument({
        imageBase64: dataUrl,
        requiredKeywords: label ? [label] : undefined,
      });

      const missing = result.missingKeywords || [];
      const isVerified = !result.serviceUnavailable && missing.length === 0;

      setChecklistItems((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                scanning: false,
                scanResult: result,
                status: isVerified ? 'verified' : 'needs_review',
              }
            : item
        )
      );
    } catch (err) {
      setChecklistItems((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                scanning: false,
                scanError: err.message || 'OCR scan failed for this document.',
                status: 'needs_review',
              }
            : item
        )
      );
    }
  };

  const handleFileChange = async (id, file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file (JPG or PNG).');
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const currentItem = checklistItems.find((i) => i.id === id);
    setChecklistItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, scanPreview: dataUrl } : item
      )
    );

    await runScanForItem(id, dataUrl, currentItem?.label);
  };

  const handleClearScan = (id) => {
    setChecklistItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              scanPreview: null,
              scanResult: null,
              scanError: '',
              status: 'not_uploaded',
            }
          : item
      )
    );
  };

  const handleRetryScan = (id) => {
    const target = checklistItems.find((i) => i.id === id);
    if (target?.scanPreview) {
      runScanForItem(id, target.scanPreview, target.label);
    }
  };

  // Progress metrics
  const totalCount = checklistItems.length;
  const uploadedCount = checklistItems.filter((i) => i.scanPreview).length;
  const verifiedCount = checklistItems.filter((i) => i.status === 'verified').length;
  const needsReviewCount = checklistItems.filter((i) => i.status === 'needs_review').length;
  const isAnyScanning = checklistItems.some((i) => i.scanning);

  const categoryMeta = CATEGORY_META[documentType] || {
    typicalDays: '1-3',
    deskCount: 'multi',
    trackingValue: 'medium',
  };

  // Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !citizenName.trim() || !citizenPhone.trim()) {
      setError('Please complete all required citizen and case title fields.');
      return;
    }
    if (!/^\d{10}$/.test(citizenPhone.trim())) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    if (uploadedCount === 0) {
      setError('At least one physical document image must be uploaded for file registration.');
      return;
    }
    if (isAnyScanning) {
      setError('OCR document scanning is still in progress. Please wait a moment.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const requiredDocsList = checklistItems.map((i) => i.label).filter(Boolean);

      const documentVerifications = checklistItems.map((item) => ({
        documentLabel: item.label,
        imagePreview: item.scanPreview || null,
        scannedAt: new Date(),
        detectedType: item.scanResult?.documentType || item.label,
        ocrConfidence: item.scanResult?.ocrConfidence || 0,
        qualityScore: item.scanResult?.imageQualityIssue?.qualityScore || 0.85,
        completenessScore: item.scanResult?.completenessScore || (item.status === 'verified' ? 1.0 : 0),
        detectedLanguage: item.scanResult?.detectedLanguage || 'unknown',
        isQualityPassed: item.scanResult?.imageQualityIssue?.isQualityPassed ?? true,
        missingKeywords: item.scanResult?.missingKeywords || [],
        status: item.status,
        extractedTextPreview: item.scanResult?.extractedTextPreview || null,
      }));

      // Aggregate single object for legacy compatibility
      const primaryScan = checklistItems.find((i) => i.scanResult)?.scanResult;
      const allMissing = checklistItems.flatMap((i) => i.scanResult?.missingKeywords || []);

      const res = await api.registerFile({
        title: title.trim(),
        citizenName: citizenName.trim(),
        citizenPhone: citizenPhone.trim(),
        citizenEmail: citizenEmail.trim() || undefined,
        documentType,
        requiredDocuments: requiredDocsList,
        internalNotes: internalNotes.trim(),
        documentVerifications,
        documentVerification: primaryScan
          ? {
              detectedType: primaryScan.documentType,
              ocrConfidence: primaryScan.ocrConfidence,
              qualityScore: primaryScan.imageQualityIssue?.qualityScore || 0.85,
              completenessScore: primaryScan.completenessScore,
              detectedLanguage: primaryScan.detectedLanguage,
              isQualityPassed: primaryScan.imageQualityIssue?.isQualityPassed ?? true,
              missingKeywords: allMissing,
              missingDocuments: allMissing,
            }
          : undefined,
      });

      setReceipt(res);
      toast.success('File registered successfully with document checklist verification.');
    } catch (err) {
      setError(err.message || 'Failed to register file.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setCitizenName('');
    setCitizenPhone('');
    setCitizenEmail('');
    setDocumentType('Land Valuation Claim');
    setInternalNotes('');
    setCustomItemText('');
    setReceipt(null);
    setError('');
  };

  // Group document categories for visual prioritization
  const highMediumCategories = DOCUMENT_TYPES.filter(
    (type) => CATEGORY_META[type]?.trackingValue !== 'low'
  );
  const lowCategories = DOCUMENT_TYPES.filter(
    (type) => CATEGORY_META[type]?.trackingValue === 'low'
  );
  const file = receipt?.file;
  const receiptMissingDocs = receipt?.missingDocuments || file?.missingDocuments || checklistItems.filter(i => i.status !== 'verified').map(i => i.label);
  const isReceiptIncomplete = receipt?.verificationStatus === 'missing-documents' || file?.verificationStatus === 'missing-documents' || receiptMissingDocs.length > 0;

  return (
    <AppShell user={currentUser}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body { background:#fff !important; color:#000 !important; }
          .no-print, header { display:none !important; }
          .print-ticket { position:absolute; inset:0; margin:0 auto; box-shadow:none !important; border:1px solid #000 !important; }
        }
      `,
        }}
      />
      <Container className="max-w-2xl pt-8 pb-12">
        {!receipt ? (
          <div className="animate-fade-up space-y-6">
            <PageHeading
              breadcrumbs={['Workspace', 'Register file']}
              title="Register a physical file"
              description="Enter citizen information, select a Nagarik Bada Patra document category, and verify attachment scans."
            />

            {error && <Alert tone="error">{error}</Alert>}

            <Card>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Section 1: Citizen Details & Case Title */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                    1. Case & Citizen Information
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Citizen full name"
                      id="name"
                      placeholder="e.g. Aarav Sharma"
                      value={citizenName}
                      onChange={(e) => setCitizenName(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <Input
                      label="Mobile (10 digits for SMS alerts)"
                      id="phone"
                      placeholder="9841234567"
                      value={citizenPhone}
                      onChange={(e) => setCitizenPhone(e.target.value)}
                      required
                      disabled={loading}
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Citizen Email (optional for email alerts)"
                      id="email"
                      type="email"
                      placeholder="e.g. aarav@gmail.com"
                      value={citizenEmail}
                      onChange={(e) => setCitizenEmail(e.target.value)}
                      disabled={loading}
                    />
                    <Input
                      label="File title (Case Identifier)"
                      id="title"
                      placeholder="e.g. Land Valuation Claim - Ward 4 Property"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Section 2: Document Category Selection */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                    2. Document Category (Nagarik Bada Patra)
                  </h3>
                  <Select
                    label="Select Document Category"
                    id="type"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    required
                    disabled={loading}
                  >
                    <optgroup label="Multi-Day / Multi-Desk Services (Optimal Tracking)">
                      {highMediumCategories.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} ({CATEGORY_META[opt]?.typicalDays || '1-3'} days)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Same-Day / Single-Desk Services">
                      {lowCategories.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} (Same Day / 0-1 day)
                        </option>
                      ))}
                    </optgroup>
                  </Select>

                  {/* Metadata Badge */}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                    <span className="font-semibold text-foreground">Service SLA:</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">
                      ⏱ {categoryMeta.typicalDays} Business Days
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                      🏢 {categoryMeta.deskCount === 'multi' ? 'Multi-Desk Workflow' : 'Single Desk Resolution'}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold ${
                        categoryMeta.trackingValue === 'high'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : categoryMeta.trackingValue === 'medium'
                          ? 'bg-blue-500/10 text-blue-600'
                          : 'bg-gray-500/10 text-gray-600'
                      }`}
                    >
                      {categoryMeta.trackingValue.toUpperCase()} Tracking Value
                    </span>
                  </div>
                </div>

                {/* Section 3: Unified Per-Document Checklist & Multi-Upload */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      3. Required Documents Checklist & AI Scans
                    </h3>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="text-muted-foreground">Verification Progress:</span>
                      <span className="font-bold text-foreground">
                        {verifiedCount} of {totalCount} verified
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${totalCount > 0 ? (verifiedCount / totalCount) * 100 : 0}%`,
                      }}
                    />
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-3">
                    {checklistItems.map((item) => (
                      <DocumentChecklistItem
                        key={item.id}
                        item={item}
                        onLabelChange={handleLabelChange}
                        onRemove={checklistItems.length > 1 ? handleRemoveItem : null}
                        onFileChange={handleFileChange}
                        onClearScan={handleClearScan}
                        onRetryScan={handleRetryScan}
                        disabled={loading}
                      />
                    ))}
                  </div>

                  {/* Add Custom Item */}
                  <div className="flex gap-2 pt-2">
                    <Input
                      id="custom-item"
                      placeholder="Add custom required attachment label…"
                      value={customItemText}
                      onChange={(e) => setCustomItemText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomItem();
                        }
                      }}
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddCustomItem}
                      className="shrink-0"
                      disabled={loading}
                    >
                      <Icons.Plus className="h-4 w-4" /> Add Item
                    </Button>
                  </div>
                </div>

                {/* Section 4: Internal Notes */}
                <div>
                  <Textarea
                    label="Internal notes (optional)"
                    id="notes"
                    rows={2}
                    placeholder="e.g. Physical tax receipts verified against archives."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => navigate('/officer')}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={loading} disabled={isAnyScanning}>
                    Register File & Generate Ticket <Icons.ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : (
          /* Receipt / Ticket View */
          <div className="animate-zoom-in">
            <div className="no-print mb-6 text-center">
              <div
                className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${
                  isReceiptIncomplete ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                }`}
              >
                {isReceiptIncomplete ? <Icons.AlertCircle className="h-6 w-6" /> : <Icons.CheckCircle className="h-6 w-6" />}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isReceiptIncomplete
                  ? `Registered — Pending ${receiptMissingDocs.length} missing document${receiptMissingDocs.length > 1 ? 's' : ''}`
                  : 'File registered successfully'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isReceiptIncomplete
                  ? 'Registration succeeded and QR ticket is active. Submit missing attachments to resume routing.'
                  : 'Print the physical ticket below and attach it to the file folder.'}
              </p>
            </div>

            {/* Incomplete Missing Documents Banner */}
            {isReceiptIncomplete && (
              <div className="no-print mx-auto mb-6 max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-left shadow-xs">
                <div className="flex items-start gap-2.5">
                  <Icons.AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                      Pending Required Attachment(s) ({receiptMissingDocs.length})
                    </h4>
                    <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/80 leading-relaxed">
                      Registration is complete and fully trackable via QR code <strong>{file?.fileUid}</strong>. However, desk routing is paused until the citizen/officer submits the following required document(s):
                    </p>
                    <ul className="mt-2.5 list-disc list-inside space-y-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                      {receiptMissingDocs.map((doc) => (
                        <li key={doc}><strong>{doc}</strong></li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <Card className={`print-ticket mx-auto max-w-md border-2 ${isReceiptIncomplete ? 'border-amber-500/40' : 'border-primary/20'}`}>
              <p className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
                TraceGov File Tracking Ticket
              </p>

              <div className="mx-auto my-5 flex h-48 w-48 items-center justify-center rounded-xl border border-border bg-white p-2.5 shadow-xs">
                {file?.qrDataUrl ? (
                  <img src={file.qrDataUrl} alt="File QR tag" className="h-full w-full object-contain" />
                ) : (
                  <p className="text-xs uppercase text-red-500">QR unavailable</p>
                )}
              </div>

              <h3 className="text-center text-lg font-bold leading-snug text-foreground">{file?.title}</h3>
              <p className="text-center text-xs text-muted-foreground mt-0.5 font-medium">{documentType}</p>

              {/* Per-Document Verification Status */}
              <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Document Attachments Verification ({verifiedCount}/{totalCount})
                </p>
                <div className="space-y-1.5 text-xs">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between font-medium">
                      <span className="truncate pr-2">{item.label}</span>
                      <span
                        className={`shrink-0 font-semibold ${
                          item.status === 'verified'
                            ? 'text-emerald-600'
                            : item.status === 'needs_review'
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {item.status === 'verified'
                          ? '✓ Verified'
                          : item.status === 'needs_review'
                          ? '⚠️ Review needed'
                          : 'Not uploaded'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4 text-left text-xs">
                <div>
                  <span className="block text-xs font-bold uppercase text-muted-foreground">File UID</span>
                  <span className="mt-0.5 font-mono font-bold text-foreground">{file?.fileUid}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Tracking ID</span>
                  <span className="mt-0.5 font-mono font-bold text-foreground">{file?.trackingId}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Citizen</span>
                  <span className="mt-0.5 font-bold text-foreground">{citizenName}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Phone (SMS)</span>
                  <span className="mt-0.5 font-mono font-bold text-foreground">+977-{citizenPhone}</span>
                </div>
              </div>

              <p className="mt-4 text-center text-xs italic leading-relaxed text-muted-foreground">
                Track status anytime by scanning this QR or visiting
                <br />
                <strong>{window.location.origin}/track</strong>
              </p>
            </Card>

            <div className="no-print mx-auto mt-6 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => window.print()}>
                <Icons.Printer className="h-4 w-4" /> Print ticket
              </Button>
              <Button variant="primary" onClick={resetForm}>
                <Icons.Plus className="h-4 w-4" /> Register another
              </Button>
            </div>
          </div>
        )}
      </Container>
    </AppShell>
  );
}
