import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExplorerMap, { type ExplorerMapHandle, type ExplorerMapProps } from './ExplorerMap';
import GoogleExplorerMap from './GoogleExplorerMap';
import { chooseEngine, googleReadiness, type MapEngineId } from './googleMaps';

const MapEngine = React.forwardRef<ExplorerMapHandle, ExplorerMapProps>(function MapEngine(props, ref) {
  const [params, setParams] = useSearchParams();
  const readiness = googleReadiness();
  const engine = chooseEngine(params.get('engine'), readiness.state === 'ready');
  const [googleFailure, setGoogleFailure] = useState<string | null>(null);
  const setEngine = (next: MapEngineId) => {
    setGoogleFailure(null);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('engine', next);
        return n;
      },
      { replace: true },
    );
  };
  const googleBlocked = engine === 'google' && (readiness.state !== 'ready' || googleFailure !== null);
  const blockedMessage = readiness.state !== 'ready' ? readiness.message : googleFailure;

  return (
    <>
      {engine === 'google' && readiness.state === 'ready' && googleFailure === null ? (
        <GoogleExplorerMap ref={ref} {...props} config={readiness.config} onUnavailable={setGoogleFailure} />
      ) : engine === 'open' ? (
        <ExplorerMap ref={ref} {...props} />
      ) : null}

      {googleBlocked ? (
        <div
          role="alert"
          data-testid="google-maps-unavailable"
          className="absolute inset-0 z-10 grid place-items-center bg-slate-900/80 p-6 text-center"
        >
          <div className="max-w-md rounded-lg bg-white p-4 text-sm text-slate-900 shadow-lg">
            <p className="font-semibold">Google Maps is unavailable</p>
            <p className="mt-1">{blockedMessage}</p>
            <p className="mt-2 text-xs text-slate-600">
              Occurrence data is not affected. The open basemap is a different provider and is only shown if you choose it.
            </p>
            <button
              type="button"
              onClick={() => setEngine('open')}
              className="mt-3 rounded-md bg-teal-800 px-3 py-1.5 text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              Show open basemap instead
            </button>
          </div>
        </div>
      ) : null}

      <div className="absolute right-3 top-14 z-20 flex rounded-lg border border-slate-300 bg-white/95 p-0.5 text-xs shadow-sm" role="group" aria-label="Map provider">
        {(['google', 'open'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={engine === id}
            onClick={() => setEngine(id)}
            className={`rounded-md px-2 py-1 ${engine === id ? 'bg-teal-800 text-white' : 'text-slate-800 hover:bg-slate-100'}`}
          >
            {id === 'google' ? 'Google' : 'Open'}
          </button>
        ))}
      </div>
    </>
  );
});

export default MapEngine;
