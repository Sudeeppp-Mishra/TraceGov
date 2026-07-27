import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, Spinner } from './index';

/**
 * QrScanner modal component wrapping html5-qrcode.
 * Emits (decodedText, scanMode) on successful QR scan.
 */
export function QrScanner({ isOpen, onClose, onScanSuccess }) {
  const [scannerInitializing, setScannerInitializing] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const qrScannerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    setScannerError('');
    setScannerInitializing(true);

    const timer = setTimeout(async () => {
      let Html5Qrcode;
      try {
        ({ Html5Qrcode } = await import('html5-qrcode'));
      } catch {
        setScannerInitializing(false);
        setScannerError('Could not load camera scanner. Check your connection.');
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode('qr-scanner-viewfinder');
        qrScannerRef.current = html5QrCode;

        // Detect mobile vs desktop webcam for scanned_via tagging
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const scanMode = isMobile ? 'mobile' : 'webcam';

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (qrScannerRef.current) {
              qrScannerRef.current.stop().catch(() => {});
              qrScannerRef.current = null;
            }
            onClose();
            onScanSuccess(decodedText, scanMode);
          },
          () => {}
        );
        setScannerInitializing(false);
      } catch (err) {
        setScannerInitializing(false);
        setScannerError('Could not access camera. Please allow camera permission in browser.');
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
    };
  }, [isOpen, onClose, onScanSuccess]);

  const handleClose = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Scan physical QR tag"
      description="Center the printed envelope QR tag in the viewfinder to verify desk arrival."
    >
      <div className="space-y-4">
        <div className="relative mx-auto aspect-square max-w-[280px] overflow-hidden rounded-xl border border-border bg-black">
          <div id="qr-scanner-viewfinder" className="h-full w-full" />
          {scannerInitializing && !scannerError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/80">
              <Spinner className="h-6 w-6 text-white" />
              <p className="text-xs font-medium text-white/80">Starting camera…</p>
            </div>
          )}
        </div>
        {scannerError && <p className="text-center text-xs font-semibold text-red-500">{scannerError}</p>}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default QrScanner;
