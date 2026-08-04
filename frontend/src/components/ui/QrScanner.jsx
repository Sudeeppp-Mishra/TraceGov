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
  const callbacksRef = useRef({ onClose, onScanSuccess });

  // Update callbacksRef on every render without triggering effect re-run
  useEffect(() => {
    callbacksRef.current = { onClose, onScanSuccess };
  });

  useEffect(() => {
    if (!isOpen) return;

    setScannerError('');
    setScannerInitializing(true);

    const timer = setTimeout(async () => {
      let Html5QrcodeModule;
      try {
        const mod = await import('html5-qrcode');
        Html5QrcodeModule = mod.Html5Qrcode;
      } catch {
        setScannerInitializing(false);
        setScannerError('Could not load camera scanner. Check your connection.');
        return;
      }

      try {
        const elem = document.getElementById('qr-scanner-viewfinder');
        if (!elem) {
          setScannerInitializing(false);
          return;
        }

        const html5QrCode = new Html5QrcodeModule('qr-scanner-viewfinder');
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
            if (callbacksRef.current.onClose) callbacksRef.current.onClose();
            if (callbacksRef.current.onScanSuccess) callbacksRef.current.onScanSuccess(decodedText, scanMode);
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
        const scanner = qrScannerRef.current;
        qrScannerRef.current = null;
        try {
          if (scanner.isScanning) {
            scanner.stop().catch(() => {});
          } else if (typeof scanner.clear === 'function') {
            scanner.clear().catch(() => {});
          }
        } catch {
          // Ignore html5-qrcode error on cleanup
        }
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          scanner.stop().catch(() => {});
        } else if (typeof scanner.clear === 'function') {
          scanner.clear().catch(() => {});
        }
      } catch {
        // Ignore html5-qrcode error when stopping non-scanning instance
      }
    }

    if (typeof onClose === 'function') {
      onClose();
    }
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
