import React, { useEffect, useState } from 'react';
import { Button, Icons, Input, Modal, Select, Textarea } from '.';
import { DOCUMENT_TYPES } from '../../lib/documentCategories';
import { useNepaliInput } from '../../lib/nepaliTransliteration';

/**
 * Officer "Edit file details" modal.
 *
 * Lets officers correct registration fields on a file that's already in the
 * system (typo'd phone, wrong document category, missing checklist item, etc.).
 * Every applied change is logged to the immutable MovementHistory ledger as an
 * `Edited` entry on the backend, so we hand the form values to the parent
 * unchanged and let `api.editFile` return the diff for the toast.
 *
 * Pattern-wise this mirrors `DocumentChecklistItem.jsx` for the required-
 * documents chips (an array of removable pills + an "Add" input below).
 */
export function EditFileModal({
  isOpen,
  onClose,
  file,
  onSave,
  loading = false,
}) {
  // `file` is the currently-selected file from OfficerDashboard. We snapshot
  // its current values into local form state when the modal opens so we don't
  // accidentally clobber pre-saved edits if the parent re-renders.
  const [form, setForm] = useState(() => ({
    title: '',
    citizenName: '',
    citizenNameNepali: '',
    citizenPhone: '',
    citizenEmail: '',
    documentType: '',
    requiredDocuments: [],
    internalNotes: '',
  }));
  const [newDocLabel, setNewDocLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Devanagari transliteration for the Nepali citizen-name field. Same pattern
  // as RegisterFilePage: type romanized Latin, the hook converts keystrokes to
  // Devanagari in real time. The form's local state is the source of truth;
  // we update it through the hook so the buffer stays in sync with what the
  // officer typed.
  const updateNepaliName = (v) => setForm((f) => ({ ...f, citizenNameNepali: v }));
  const nepaliNameProps = useNepaliInput(form.citizenNameNepali, updateNepaliName);

  useEffect(() => {
    if (!isOpen || !file) return;
    setForm({
      title: file.title || '',
      citizenName: file.citizenName || '',
      citizenNameNepali: file.citizenNameNepali || '',
      citizenPhone: file.citizenPhone || '',
      citizenEmail: file.citizenEmail || '',
      documentType: file.documentType || '',
      requiredDocuments: Array.isArray(file.requiredDocuments)
        ? file.requiredDocuments.slice()
        : [],
      internalNotes: '', // never pre-fill — explicit write only
    });
    setNewDocLabel('');
    setErrorMsg('');
  }, [isOpen, file]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addDoc = () => {
    const v = newDocLabel.trim();
    if (!v) return;
    setForm((f) =>
      f.requiredDocuments.includes(v)
        ? f
        : { ...f, requiredDocuments: [...f.requiredDocuments, v] }
    );
    setNewDocLabel('');
  };

  const removeDoc = (label) =>
    setForm((f) => ({
      ...f,
      requiredDocuments: f.requiredDocuments.filter((d) => d !== label),
    }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const phone = form.citizenPhone.trim();
    if (phone && !/^\d{10}$/.test(phone)) {
      setErrorMsg('Citizen phone must be exactly 10 digits.');
      return;
    }

    const email = form.citizenEmail.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!form.title.trim() || !form.citizenName.trim() || !form.documentType.trim()) {
      setErrorMsg('File title, citizen name, and document category are required.');
      return;
    }

    onSave?.({
      title: form.title.trim(),
      citizenName: form.citizenName.trim(),
      citizenNameNepali: form.citizenNameNepali.trim(),
      citizenPhone: phone,
      citizenEmail: email || undefined,
      documentType: form.documentType.trim(),
      requiredDocuments: form.requiredDocuments,
      internalNotes: form.internalNotes,
    });
  };

  if (!file) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit file details"
      description={`Correcting registration fields for ${file.fileUid} · ${file.title}.`}
      className="max-w-[calc(100vw-2rem)] md:max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Citizen information */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Citizen information
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Citizen name (English)"
              id="edit_citizen_name"
              value={form.citizenName}
              onChange={update('citizenName')}
              required
            />
            <Input
              label="Citizen name (Nepali)"
              id="edit_citizen_name_np"
              {...nepaliNameProps}
              hint="Optional · type romanized Nepali (e.g. 'ram') to auto-transliterate to देवनागरी"
            />
            <Input
              label="Phone"
              id="edit_citizen_phone"
              value={form.citizenPhone}
              onChange={update('citizenPhone')}
              required
              hint="10 digits, e.g. 9841234567"
            />
            <Input
              label="Email"
              id="edit_citizen_email"
              type="email"
              value={form.citizenEmail}
              onChange={update('citizenEmail')}
              hint="Optional · leave blank to remove"
            />
          </div>
        </section>

        {/* File information */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            File information
          </h4>
          <Input
            label="File title"
            id="edit_title"
            value={form.title}
            onChange={update('title')}
            required
          />
          <Select
            label="Document category"
            id="edit_document_type"
            value={form.documentType}
            onChange={update('documentType')}
            required
          >
            <option value="">Choose category…</option>
            {DOCUMENT_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          {/* Editable checklist chips */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Required documents
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-2.5 min-h-[42px]">
              {form.requiredDocuments.length === 0 && (
                <span className="text-xs italic text-muted-foreground px-1.5">
                  No required documents declared.
                </span>
              )}
              {form.requiredDocuments.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => removeDoc(label)}
                    className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                    aria-label={`Remove ${label}`}
                  >
                    <Icons.X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="edit_new_doc"
                placeholder="Add a required document (e.g. Tax Receipt)…"
                value={newDocLabel}
                onChange={(e) => setNewDocLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDoc();
                  }
                }}
                className="text-xs"
              />
              <Button type="button" variant="outline" size="md" onClick={addDoc}>
                <Icons.Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </section>

        {/* Internal notes (officer-only) */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Internal notes
          </h4>
          <Textarea
            id="edit_internal_notes"
            rows={3}
            placeholder="Optional: note for the next officer (e.g. typo corrected from original handwritten form)."
            value={form.internalNotes}
            onChange={update('internalNotes')}
          />
        </section>

        {errorMsg && (
          <p className="text-xs font-semibold text-red-500 flex items-center gap-1.5">
            <Icons.AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
          </p>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-3 pt-2 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icons.ShieldCheck className="h-3.5 w-3.5" />
            Edits are recorded in the immutable audit ledger.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              <Icons.Check className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default EditFileModal;
