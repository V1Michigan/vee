import assert from "node:assert/strict";
import test from "node:test";
import { sharedAuth, sharedConnections } from "./shared-auth.ts";

test("every connection uses the same grant for different requesters, without chat consent", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ token: "test-only", expiresAt: Date.now() + 3_600_000 });
  });
  const oldToken = process.env.VERCEL_OIDC_TOKEN;
  process.env.VERCEL_OIDC_TOKEN = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-only`;
  t.after(() => {
    if (oldToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = oldToken;
  });
  const requests = [];
  for (const [name, { connector, ...expected }] of Object.entries(sharedConnections)) {
    const auth = sharedAuth(name);
    assert.equal(auth.principalType, "app");
    assert.equal(auth.startAuthorization, undefined);
    assert.equal(auth.completeAuthorization, undefined);
    for (const id of ["slack-user-a", "slack-user-b"]) {
      const result = await auth.getToken({ principal: { type: "user", id }, connection: { url: "https://example.test/mcp" } });
      assert.equal(result.token, "test-only");
      assert.deepEqual(requests.at(-1), expected);
    }
  }
  // validate:true must fetch again even when another caller has a cached token.
  assert.equal(requests.length, Object.keys(sharedConnections).length * 2);
});

test("missing or revoked credentials fail without triggering a sign-in flow or exposing provider errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "user_authorization_required", message: "secret-provider-detail" } }, { status: 401 }));
  const oldToken = process.env.VERCEL_OIDC_TOKEN;
  process.env.VERCEL_OIDC_TOKEN = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-only`;
  t.after(() => {
    if (oldToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = oldToken;
  });
  for (const name of Object.keys(sharedConnections)) {
    await assert.rejects(sharedAuth(name).getToken({ principal: { type: "app" }, connection: { url: "https://example.test/mcp" } }), (error) => {
      assert.equal(error.name, "ConnectionAuthorizationFailedError");
      assert.equal(error.retryable, false);
      assert.equal(error.reason, "shared_connection_unavailable");
      assert.match(error.message, /administrator/);
      assert.doesNotMatch(error.message, /secret-provider-detail/);
      return true;
    });
  }
});
