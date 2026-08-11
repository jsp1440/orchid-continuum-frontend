import { useEffect, useState } from 'react';

import {
  getCalyxProviderReadiness,
  providerPresentation,
  type CalyxProviderPresentation,
} from './providerMode';

export function CalyxProviderModeBadge() {
  const [presentation, setPresentation] = useState<CalyxProviderPresentation>(() =>
    providerPresentation(null),
  );

  useEffect(() => {
    let active = true;
    void getCalyxProviderReadiness().then((readiness) => {
      if (active) setPresentation(providerPresentation(readiness));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <span
      className="inline-flex max-w-full flex-col rounded-md border bg-white px-2.5 py-1 text-left"
      title={presentation.detail}
      data-provider-state={presentation.state}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-700">{presentation.label}</span>
      {presentation.state === 'acceptance_pending' && (
        <span className="text-[10px] text-amber-700">Live acceptance pending</span>
      )}
    </span>
  );
}
