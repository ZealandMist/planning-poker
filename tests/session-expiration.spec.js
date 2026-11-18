const { test, expect } = require("@playwright/test");
const { buildExpiredSessionDeletes } = require("../functions/expiration");

const SESSION_CODE = "TS-A1B2C3";

async function installFirebaseMock(page, sessions = {}) {
  await page.addInitScript(({ sessions }) => {
    const data = { sessions };
    const listeners = {};

    function clone(value) {
      return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function read(path) {
      return path.split("/").filter(Boolean).reduce((value, key) => value && value[key], data);
    }

    function write(path, value) {
      const keys = path.split("/").filter(Boolean);
      const last = keys.pop();
      const parent = keys.reduce((value, key) => value[key] ||= {}, data);
      if (value === null) delete parent[last];
      else parent[last] = clone(value);
      Object.entries(listeners).forEach(([listenerPath, callback]) => {
        if (path === listenerPath || path.startsWith(`${listenerPath}/`)) {
          callback(snapshot(listenerPath));
        }
      });
    }

    function snapshot(path) {
      const value = clone(read(path));
      return {
        exists: () => value !== undefined && value !== null,
        val: () => value
      };
    }

    function ref(path) {
      return {
        get: () => Promise.resolve(snapshot(path)),
        set: value => {
          write(path, value);
          return Promise.resolve();
        },
        update: values => {
          Object.entries(values).forEach(([key, value]) => write(`${path}/${key}`, value));
          return Promise.resolve();
        },
        remove: () => {
          write(path, null);
          return Promise.resolve();
        },
        child: key => ref(`${path}/${key}`),
        on: (_event, callback) => {
          listeners[path] = callback;
          callback(snapshot(path));
        },
        off: () => {
          delete listeners[path];
        },
        onDisconnect: () => ({ remove: () => Promise.resolve() }),
        transaction: update => {
          const current = read(path);
          const next = update(current);
          if (next !== undefined) write(path, next);
          return Promise.resolve({ committed: next !== undefined });
        }
      };
    }

    const auth = {
      currentUser: { uid: "test-user" },
      signInAnonymously: () => Promise.resolve(),
      onAuthStateChanged: callback => setTimeout(() => callback(auth.currentUser), 0)
    };

    const database = () => ({ ref });
    database.ServerValue = { TIMESTAMP: Date.now() };
    window.firebase = {
      initializeApp: () => {},
      auth: () => auth,
      database
    };
    window.FIREBASE_CONFIG = {
      apiKey: "test-key",
      databaseURL: "https://test.firebaseio.com"
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: text => {
          window.__copiedInvite = text;
          return Promise.resolve();
        }
      }
    });
  }, { sessions });

  await page.route("https://www.gstatic.com/**", route => route.fulfill({ body: "" }));
  await page.route("https://cdnjs.cloudflare.com/**", route => route.fulfill({ body: "" }));
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ body: "" }));
}

test("host invite link matches the session bar and browser URL", async ({ page }) => {
  await installFirebaseMock(page);
  await page.goto("/");

  await page.locator("#nameInput").fill("Host");
  await page.locator("#lobbySubmit").click();
  await expect(page.locator("#sessionBar")).toBeVisible();

  const code = await page.locator("#codeDisplay").textContent();
  expect(code).toMatch(/^TS-[A-Z0-9]{6}$/);
  expect(new URL(page.url()).searchParams.get("session")).toBe(code);

  await page.locator("#copyLinkBtn").click();
  expect(await page.evaluate(() => window.__copiedInvite)).toBe(page.url());
});

test("expired sessions cannot be joined", async ({ page }) => {
  await installFirebaseMock(page, {
    [SESSION_CODE]: {
      expiresAt: Date.now() - 1,
      hostId: "host",
      players: {}
    }
  });
  await page.goto(`/?session=${SESSION_CODE}`);

  await page.locator("#nameInput").fill("Guest");
  await page.locator("#lobbySubmit").click();
  await expect(page.locator("#lobbyError")).toHaveText(
    "That session has expired. Ask the host to start a new one."
  );
});

test("scheduled cleanup selects only expired sessions", async () => {
  const now = 1_000;
  expect(buildExpiredSessionDeletes({
    expired: { expiresAt: 999 },
    active: { expiresAt: 1_001 },
    missing: {}
  }, now)).toEqual({
    "sessions/expired": null
  });
});
