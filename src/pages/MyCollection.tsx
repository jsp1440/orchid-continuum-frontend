import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Compatibility entrypoint for the former collection shell.
 *
 * The live authenticated grower workspace is My Conservatory. Keep the
 * historical /collection route working, but do not strand visitors in the old
 * placeholder dashboard now that the Conservatory has real plant, label, QR,
 * and readiness workflows.
 */
const MyCollection: React.FC = () => <Navigate to="/conservatory" replace />;

export default MyCollection;
