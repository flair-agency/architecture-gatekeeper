/** Validates the existing HTTP loopback endpoint contract. */
export function validateLoopbackEndpoint(endpointUrl: unknown): URL {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    throw new Error('Proxy endpoint URL must be a non-empty string.');
  }
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch (err) {
    throw new Error(`Invalid proxy endpoint URL: ${endpointUrl}`);
  }
  if (url.protocol !== 'http:') {
    throw new Error(`Proxy endpoint must use plain http on loopback, received: ${url.protocol}`);
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error(`Proxy endpoint must bind to loopback (127.0.0.1), received: ${url.hostname}`);
  }
  const port = parseInt(url.port, 10);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Proxy endpoint must have a valid port number, received: ${url.port}`);
  }
  return url;
}
