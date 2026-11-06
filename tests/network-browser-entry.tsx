// Local acceptance harness mounts the production component against the local HTTP backend.
// It does not replace the existing /relationship-explorer route or provide fixture science.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ScientificNetworkExplorer from '../src/components/orchid/ScientificNetworkExplorer';
import { createScientificNetworkClient } from '../src/lib/scientificNetworkApi';
const query = new URLSearchParams(window.location.search).get('q') ?? '';
createRoot(document.getElementById('root')!).render(<ScientificNetworkExplorer initialQuery={query} client={createScientificNetworkClient(window.location.origin)} />);
