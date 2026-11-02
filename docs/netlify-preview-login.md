# Netlify Deploy Preview login

The production and preview frontends can use the same `VITE_API_URL` but have different browser origins. The tracked Render configuration permits only `https://thunderous-moxie-b0872a.netlify.app`; it excludes `https://deploy-preview-1--thunderous-moxie-b0872a.netlify.app`. With that setting, the browser's JSON login preflight receives no matching `Access-Control-Allow-Origin` and prevents the login POST. This is reproduced locally with the real API CORS configuration. Live response verification remains blocked by this cloud environment's egress policy, so deployed CORS is a probable cause until the live preflight is checked.

## Exact configuration prepared for review

The API already supports a comma-separated allowlist. No CORS/authentication code change or wildcard is necessary. On the backend serving the preview's `VITE_API_URL`, the complete value, preserving the production origin, is:

```text
CORS_ORIGIN=https://thunderous-moxie-b0872a.netlify.app,https://deploy-preview-1--thunderous-moxie-b0872a.netlify.app
```

If additional origins are currently configured, preserve those approved entries as well. Use origins only, without a trailing slash or path. `CORS_ORIGIN` takes precedence over `WEB_ORIGIN`; changing only `WEB_ORIGIN` has no effect when `CORS_ORIGIN` is set. Do not allow `*.netlify.app`, dynamically reflect arbitrary Origin headers or enable cookie credentials.

This is a **backend** runtime environment change, followed by a backend restart/redeploy so it reloads the value. The existing backend code supports it; a Netlify rebuild alone cannot change the API's CORS responses. Nothing in this investigation changes live backend variables, Render/Netlify settings, `render.yaml`, or the production branch. Since the preview currently shares production's API, applying this setting affects the production backend and requires approval before doing so. A dedicated development API/database is preferable for tests that create offences, issue tickets or simulate payments; CORS approval does not isolate production data. Remove this exact preview origin when testing ends. Other preview numbers remain disallowed until separately approved.

## Authentication and routing findings

- Login is a JSON POST to `VITE_API_URL + /api/v1/auth/login`, which requires CORS preflight across origins. Subsequent calls send `Authorization: Bearer ...`; both `Content-Type` and `Authorization` are already allowed.
- Authentication returns a random 30-minute session token in JSON. The browser keeps it in React memory. There are no authentication cookies, refresh cookies, SameSite settings, cookie domain dependencies or CSRF token exchanges in this implementation. The API guard accepts only a valid bearer token. Adding `credentials: include`, cookie credentials or disabling checks would not fix the missing-origin problem.
- Successful login returns HTTP 200 JSON with `token`, `expiresAt`, and safe user fields. Invalid passwords, disabled users or the wrong login category return 401. Throttling may return 429. Those responses must also have the matching CORS header so the frontend can read them. No login redirects are implemented.
- The Netlify `/* -> /index.html` rule is a 200 SPA rewrite. With a correctly built absolute `VITE_API_URL`, API requests go directly to the backend and do not pass through this rewrite. An HTML response or redirect from the login endpoint instead indicates the wrong compiled URL, host protection, or a proxy/routing issue. Inspect the browser's actual Request URL and response Content-Type, not only the Netlify environment editor.

## Verification without production mutations

From an environment permitted to reach the backend, compare the OPTIONS response for the production origin and the exact preview origin:

```sh
curl -i -X OPTIONS 'https://zrp-traffic-api.onrender.com/api/v1/auth/login' \
  -H 'Origin: https://deploy-preview-1--thunderous-moxie-b0872a.netlify.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
```

After an approved backend configuration change, expect a nonredirected 204, `Access-Control-Allow-Origin` equal to the exact preview origin, allowed POST method, permitted Content-Type/Authorization headers, and `Vary: Origin`. The production origin should still pass; another site's or preview number's origin should have no allow-origin header. A 204 alone does not establish permission.

Then use an authorized test account in the browser: verify 200 JSON login, a subsequent `/auth/me` request with its bearer token, and 401 for invalid credentials with a readable response. Do not send real tokens/passwords in screenshots, shell history or diagnostic output. No live login attempt or production record mutation was performed during this investigation.
