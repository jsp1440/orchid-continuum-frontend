import http from 'node:http';

const port = Number(process.env.PORT || 4199);
const payload = {
  focal_node: { label: 'Cattleya' },
  graph: { depth: 2, node_count: 5, edge_count: 4 },
  pagination: { limit: 500, offset: 0, truncated: true, next_offset: 500 },
  domain_coverage: {
    taxonomy: { nodes: 2, edges: 1 },
    traits: { nodes: 2, edges: 2 },
    literature: { nodes: 1, edges: 1 },
  },
};

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'GET' && request.url?.startsWith('/api/knowledge-graph/genus/')) {
    response.writeHead(200);
    response.end(JSON.stringify(payload));
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ detail: 'Not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BUILD-069 graph mock listening on http://127.0.0.1:${port}`);
});
