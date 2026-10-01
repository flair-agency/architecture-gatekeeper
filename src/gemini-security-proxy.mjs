/**
 * src/gemini-security-proxy.mjs
 * Builtin Node.js HTTP loopback security proxy for Google Gemini review requests.
 * Zero external npm dependencies: uses node:http and node:https.
 *
 * Implements the security contract specified in:
 * - docs/architecture.md (Target multi-provider credential-isolated review proxy boundary)
 * - docs/investigations/2026-10-02-credential-isolated-review-proxy-boundary.md
 *
 * Enforces:
 * 1. Strict loopback binding (127.0.0.1:ephemeral)
 * 2. Strict method (POST only) and route allowlist (*:generateContent)
 * 3. In-flight credential injection (x-goog-api-key or Authorization: Bearer)
 * 4. Pinned upstream provider hosts (generativelanguage.googleapis.com or *-aiplatform.googleapis.com)
 * 5. Fail-closed on redirects, non-allowlisted routes, malformed URLs, or upstream errors
 */
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';

const ALLOWED_AI_STUDIO_PATH = /^\/v1beta\/models\/([a-zA-Z0-9._-]+):generateContent$/;
const ALLOWED_VERTEX_PATH = /^\/v1\/projects\/([a-zA-Z0-9._-]+)\/locations\/([a-zA-Z0-9._-]+)\/publishers\/google\/models\/([a-zA-Z0-9._-]+):generateContent$/;
const ALLOWED_VERTEX_HOST = /^[a-z0-9-]+-aiplatform\.googleapis\.com$/;
const ALLOWED_AI_STUDIO_HOST = 'generativelanguage.googleapis.com';

/**
 * Validates whether a request path and upstream target match the allowed Gemini review routes.
 * @param {string} pathname
 * @returns {{ mode: 'vertex' | 'studio', path: string } | null}
 */
export function validateGeminiRoute(pathname) {
  if (!pathname || typeof pathname !== 'string') return null;
  const cleanPath = pathname.split('?')[0];

  if (ALLOWED_AI_STUDIO_PATH.test(cleanPath)) {
    return { mode: 'studio', path: cleanPath };
  }
  if (ALLOWED_VERTEX_PATH.test(cleanPath)) {
    return { mode: 'vertex', path: cleanPath };
  }
  return null;
}

/**
 * Starts an in-process or child-process Gemini Security Proxy server.
 *
 * @param {object} config
 * @param {object} config.credentials
 * @param {'apiKey' | 'bearer'} config.credentials.type
 * @param {string} config.credentials.value
 * @param {string} [config.upstreamHost] Override upstream host (e.g., for testing or Vertex regional endpoint)
 * @param {number} [config.deadlineMs] Max server lifetime before auto-shutdown
 * @returns {Promise<{ endpointUrl: string, shutdown: () => Promise<void> }>}
 */
export async function startGeminiSecurityProxy(config) {
  if (!config?.credentials?.type || !config?.credentials?.value) {
    throw new Error('GeminiSecurityProxy requires credentials with valid type and value.');
  }

  const { credentials } = config;
  const upstreamHostOverride = config.upstreamHost || null;

  return new Promise((resolve, reject) => {
    let timer = null;

    const server = createServer(async (req, res) => {
      // 1. Only POST method is permitted
      if (req.method !== 'POST') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: only POST method is permitted.' }));
        return;
      }

      // 2. Strict route allowlisting
      const parsedRoute = validateGeminiRoute(req.url);
      if (!parsedRoute) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Forbidden: route ${req.url} is not allowlisted.` }));
        return;
      }

      // 3. Resolve and validate upstream host
      let targetHost;
      if (parsedRoute.mode === 'vertex') {
        // Vertex regional endpoint or override
        if (upstreamHostOverride) {
          targetHost = upstreamHostOverride;
        } else {
          // Extract location from path: /v1/projects/:project/locations/:region/...
          const match = ALLOWED_VERTEX_PATH.exec(parsedRoute.path);
          const region = match ? match[2] : 'us-central1';
          targetHost = `${region}-aiplatform.googleapis.com`;
        }

        if (!ALLOWED_VERTEX_HOST.test(targetHost) && targetHost !== '127.0.0.1' && targetHost !== 'localhost') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Forbidden: unverified Vertex host ${targetHost}` }));
          return;
        }
      } else {
        // AI Studio
        targetHost = upstreamHostOverride || ALLOWED_AI_STUDIO_HOST;
        if (targetHost !== ALLOWED_AI_STUDIO_HOST && targetHost !== '127.0.0.1' && targetHost !== 'localhost') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Forbidden: unverified AI Studio host ${targetHost}` }));
          return;
        }
      }

      // 4. Read client request body
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);

        // 5. Build forwarded headers with credential injection
        const forwardHeaders = {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
        };

        if (credentials.type === 'apiKey') {
          forwardHeaders['x-goog-api-key'] = credentials.value;
        } else if (credentials.type === 'bearer') {
          forwardHeaders['Authorization'] = `Bearer ${credentials.value}`;
        }

        const isLocalUpstream = targetHost === '127.0.0.1' || targetHost === 'localhost';
        const requestOptions = {
          hostname: targetHost,
          port: isLocalUpstream ? (config.upstreamPort || 443) : 443,
          path: parsedRoute.path,
          method: 'POST',
          headers: forwardHeaders,
          timeout: 60000,
        };

        const transport = isLocalUpstream && config.upstreamHttp ? import('node:http') : Promise.resolve({ request: httpsRequest });

        transport.then(({ request: makeRequest }) => {
          const upstreamReq = makeRequest(requestOptions, upstreamRes => {
            // Fail closed on redirect
            if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway: Upstream redirects are prohibited on credential-bearing proxy.' }));
              return;
            }

            res.writeHead(upstreamRes.statusCode, {
              'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
            });
            upstreamRes.pipe(res);
          });

          upstreamReq.on('timeout', () => {
            upstreamReq.destroy(new Error('Upstream request timed out.'));
          });

          upstreamReq.on('error', err => {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Bad Gateway: ${err.message}` }));
            }
          });

          upstreamReq.write(bodyBuffer);
          upstreamReq.end();
        });
      });
    });

    // Bind strictly to 127.0.0.1 with ephemeral port (0)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const endpointUrl = `http://127.0.0.1:${address.port}`;

      if (config.deadlineMs && Number.isSafeInteger(config.deadlineMs) && config.deadlineMs > 0) {
        timer = setTimeout(() => {
          shutdown();
        }, config.deadlineMs);
        timer.unref?.();
      }

      const shutdown = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return new Promise((resolveClose) => {
          server.closeAllConnections?.();
          server.close(() => resolveClose());
        });
      };

      resolve({ endpointUrl, shutdown });
    });

    server.on('error', err => {
      reject(err);
    });
  });
}
