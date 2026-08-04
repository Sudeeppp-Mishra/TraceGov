import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Modal, Spinner, Icons } from './index';

/**
 * QrScanner modal component wrapping html5-qrcode.
 * Supports async scan validation and inline error display for QR mismatches or invalid tags.
 */
export function QrScanner({ isOpen, onClose, onScanSuccess }) {
  const [scannerInitializing, setScannerInitializing] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [processingScan, setProcessingScan] = useState(false);
  const qrScannerRef = useRef(null);
  const callbacksRef = useRef({ onClose, onScanSuccess });

  // Update callbacksRef on every render without triggering effect re-run
  useEffect(() => {
    callbacksRef.current = { onClose, onScanSuccess };
  });

  const stopScannerInstance = useCallback(() => {
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
  }, []);

  const startScannerInstance = useCallback(async () => {
    setScannerError('');
    setScannerInitializing(true);
    setProcessingScan(false);

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

      // Stop previous instance if any
      stopScannerInstance();

      const html5QrCode = new Html5QrcodeModule('qr-scanner-viewfinder');
      qrScannerRef.current = html5QrCode;

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const scanMode = isMobile ? 'mobile' : 'webcam';

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          stopScannerInstance();
          setProcessingScan(true);

          if (callbacksRef.current.onScanSuccess) {
            try {
              const res = await callbacksRef.current.onScanSuccess(decodedText, scanMode);
              if (res && res.success === false) {
                setScannerError(res.error || 'Scan validation failed.');
                setProcessingScan(false);
                return;
              }
            } catch (err) {
              setScannerError(err.message || 'Scan validation failed.');
              setProcessingScan(false);
              return;
            }
          }

          if (callbacksRef.current.onClose) {
            callbacksRef.current.onClose();
          }
        },
        () => {}
      );
      setScannerInitializing(false);
    } catch (err) {
      setScannerInitializing(false);
      setScannerError('Could not access camera. Please allow camera permission in browser.');
    }
  }, [stopScannerInstance]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      startScannerInstance();
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScannerInstance();
    };
  }, [isOpen, startScannerInstance, stopScannerInstance]);

  const handleClose = () => {
    stopScannerInstance();
    setScannerError('');
    setProcessingScan(false);
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleRetry = () => {
    startScannerInstance();
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

          {processingScan && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/80">
              <Spinner className="h-6 w-6 text-primary" />
              <p className="text-xs font-medium text-white">Validating QR code…</p>
            </div>
          )}
        </div>

        {/* Inline Error Container for Mismatch or Invalid QR */}
        {scannerError && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-100 shadow-xs">
            <div className="flex items-start gap-2">
              <Icons.AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <p className="font-bold text-amber-950 dark:text-amber-100">QR Tag Verification Issue</p>
                <p className="text-amber-900/90 dark:text-amber-300/90 leading-relaxed font-medium">
                  {scannerError}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="mt-2 border-amber-500/30 text-amber-950 dark:text-amber-100 hover:bg-amber-500/20"
                >
                  <Icons.RefreshCw className="h-3.5 w-3.5" /> Try scanning again
                </Button>
              </div>
            </div>
          </div>
        )}

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
