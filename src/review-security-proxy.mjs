/**
 * src/review-security-proxy.mjs
 * Abstract interface contracts and utilities for credential-isolated review proxies.
 * Conforms to docs/architecture.md (Target multi-provider credential-isolated review proxy boundary).
 */

/**
 * Validates that an endpoint URL conforms to local loopback constraints:
 * - Must be plain HTTP
 * - Host must be exactly '127.0.0.1' or 'localhost'
 * - Port must be a valid positive integer
 *
 * @param {string} endpointUrl
 * @returns {URL}
 */
export function validateLoopbackEndpoint(endpointUrl) {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    throw new Error('Proxy endpoint URL must be a non-empty string.');
  }
  let url;
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
