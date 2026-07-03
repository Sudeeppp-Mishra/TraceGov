import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QrScanner({ onScan, onError, active }) {
  const scannerRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const regionId = 'tracegov-qr-reader';

  useEffect(() => {
    if (!active) return;

    let scanner;
    let cancelled = false;

    async function start() {
      setStarting(true);
      try {
        scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decoded) => {
            if (!cancelled) onScan(decoded);
          },
          () => {}
        );
      } catch (err) {
        if (!cancelled) onError?.(err.message || 'Camera access denied');
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [active, onScan, onError]);

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div
        id={regionId}
        className="rounded-2xl overflow-hidden border-4 border-ward-green shadow-lg bg-black min-h-[280px]"
      />
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
          <p className="text-white text-sm">Starting camera…</p>
        </div>
      )}
    </div>
  );
}
