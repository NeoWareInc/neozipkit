# Why npm publish says “Access token expired” / 404 even after you logged in

## What’s actually happening

When you run `npm publish`, you see:

```text
Authenticate your account at:
https://www.npmjs.com/auth/cli/903c8fd8-f376-4c6b-ac6a-30cbebedf54c
Press ENTER to open in the browser...
```

Then:

```text
npm notice Access token expired or revoked. Please try logging in again.
npm error 404 Not Found - PUT ... 'neozipkit@0.5.0' is not in this registry.
```

So:

1. **Your earlier `npm login` did work** – you are logged in for normal commands.
2. **Publishing uses a different, stricter auth path.** For publish, npm often starts a **new, one-time web login** (the “Authenticate your account at …” URL).
3. **If you don’t complete that web step**, npm never gets a valid **publish** token. It may then fall back to an old or read-only token, which the registry rejects. The registry often responds with **404** instead of “unauthorized,” so you see “not in this registry” even though the real problem is **auth for publish**.

So: **login can “succeed” in general, but the publish-specific auth (the browser step) is failing or not being completed**, which leads to “token expired/revoked” and 404.

---

## What to do

### Option 1: Complete the browser auth when npm asks

1. Run `npm publish --access public`.
2. When you see **“Authenticate your account at: …”** and **“Press ENTER to open in the browser”**, **press ENTER**.
3. Complete the flow in the browser (log in, allow access, etc.).
4. Go back to the terminal; npm should then continue and publish. If it already exited, run `npm publish --access public` again – you may not be prompted again if the new token was saved.

So: **it’s “failing” because the publish flow is waiting for you to finish the browser step, and if you don’t, it ends up using a bad/old token and you get 404.**

### Option 2: Use an Automation token (no browser during publish)

Then npm won’t need to open the browser when you publish:

1. Go to https://www.npmjs.com/settings/~/tokens.
2. **Generate New Token** → type **Automation** (or **Publish** with “Bypass 2FA for publish” if your org has it).
3. Copy the token.
4. Log in with it so it’s the one used for publish:
   ```bash
   npm login
   ```
   - Username: your npm username  
   - Password: **paste the token** (not your account password)  
   - Email: your email  
5. Run `npm publish --access public`. It should publish without asking for the browser.

---

## If you’re sure you completed the browser step and it still 404s

Then the problem may be **permissions**, not “not logged in”:

- Your user might **not be in the `your npm user or org` organization** on npm, or
- Your user might not have **publish** permission for `neozipkit`.

In that case the registry can still return 404. Check:

- https://www.npmjs.com/org/your-org/teams (or your org URL) – your user should be a member with publish rights, or
- Have an org owner add you and grant publish permission for this package.

---

## Short version

- **Why it “keeps failing”:** Publish uses a **second** auth step (the browser link). If you don’t **press ENTER and finish that**, npm doesn’t get a valid publish token and the request is rejected → “token expired/revoked” and 404.
- **Fix:** When you see “Press ENTER to open in the browser,” **press ENTER and complete the browser login**, then publish again. Or use an **Automation** (or Publish) token and `npm login` with that token so publish doesn’t need the browser.
