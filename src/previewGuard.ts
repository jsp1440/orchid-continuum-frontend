/** Historical design review only: never contact a production data service. */
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.origin === window.location.origin && url.pathname.startsWith('/assets/')) {
    return originalFetch(input, init);
  }
  return new Response(JSON.stringify({ error: 'HISTORICAL_PREVIEW', message: 'Live services are disabled in this historical design preview.' }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });
};
document.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  window.alert('This is a historical homepage preview. Forms and account actions are disabled.');
}, true);
