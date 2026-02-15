'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function Refresher({ interval }: { interval: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(timer);
  }, [interval, router]);

  return null;
}
