# Closing the network boundary — operator runbook

Ruling N1 (2026-09-30), with amendments A1–A7. Everything here needs your password. Nothing in this file
has been run for you.

**What this changes:** the listed ports stop accepting new inbound connections on Wi-Fi and on Tailscale.
**What it does not change:** how Taylor and Jim reach MojoMap. They come in through `tailscale serve`,
which does not use a host port at all — it terminates inside Tailscale and connects onward over loopback.
Their access is outside everything below. The one-step undo is at the end.

**Do the steps in this order.** Step 2 exists so that step 6 means something: if you never saw those
addresses load, "cannot connect" afterwards proves nothing.

Run from the repo root: `cd ~/dev/happy-file-hugger-main`

---

## 1. Parse the rule before anything else

```bash
sudo pfctl -vnf scripts/network/pf.anchor
```
**Look for:** the rule echoed back once, ending `flags S/SA`, with no error. Ports 443 and 8443 must not
appear — those are the Tailscale serve ports. This only parses; it changes nothing.

## 2. BEFORE test, from your phone — prove the test can fail

On your iPhone, **on Wi-Fi with Tailscale OFF**, in Safari:

| Open | Expect **today** |
|---|---|
| `http://192.168.12.191:8888` | SearXNG **loads** |
| `http://192.168.12.191:3000` | Open WebUI **loads** |

Then **turn Tailscale ON**:

| Open | Expect **today** |
|---|---|
| `http://100.96.232.94:8888` | SearXNG **loads** |

If any of these does not load now, stop — something else is already wrong, and step 6 would give you a
false pass.

## 3. Let the guard read pf state, read-only

```bash
visudo -c -f scripts/network/sudoers.mojomap-pf-readonly
```
**Look for:** `parsed OK`.

```bash
sudo install -m 0440 -o root -g wheel \
  scripts/network/sudoers.mojomap-pf-readonly /etc/sudoers.d/mojomap-pf-readonly
sudo -k
sudo -n pfctl -s info
```
**Look for:** pf status printed with **no password prompt**. The `sudo -k` matters: sudo remembers your
password for about five minutes, so without it this would succeed either way and prove nothing.

## 4. Install the boundary

```bash
sudo bash scripts/network/install-pf.sh
```
**Look for:** `parses clean` twice, `bootstrapped`, `Status: Enabled`, and your block rules listed under
`anchor rules loaded`. If it prints `FAIL`, it restored the backup and changed nothing — stop and send
the output.

## 5. Check from this Mac

```bash
nc -z -v -w 2 127.0.0.1 54321
curl -sS -o /dev/null -w '%{http_code}\n' https://mojomap.tail7b863b.ts.net/
```
**Look for:** `succeeded` on the first, `200` on the second.

**This Mac cannot test its own Wi-Fi or Tailscale address:** macOS routes traffic addressed to any of the
host's own addresses over `lo0`, and the rule deliberately exempts `lo0`, so `nc 192.168.12.191 54321`
from here would connect even with the boundary working perfectly. Only another device can test it — which
is what step 6 is for.

## 6. AFTER test, from your phone — the same addresses as step 2

**On Wi-Fi with Tailscale OFF:**

| Open | Expect now |
|---|---|
| `http://192.168.12.191:8888` | cannot connect |
| `http://192.168.12.191:3000` | cannot connect |
| `http://192.168.12.191:54321` | cannot connect |

**With Tailscale ON:**

| Open | Expect now |
|---|---|
| `http://100.96.232.94:8888` | cannot connect |
| `http://100.96.232.94:54321` | cannot connect |
| `https://mojomap.tail7b863b.ts.net` | **the app loads** |

The last row is the one that matters. If the app loads over Tailscale while every bare address refuses,
the boundary is right.

## 7. Prove the undo works — before you rely on it

```bash
sudo bash scripts/network/uninstall-pf.sh
```
On your phone: `http://192.168.12.191:8888` **loads again**. (pf stays enabled; it just carries Apple's
anchor, which blocks nothing.)

```bash
sudo -k
bash scripts/guards/network-guard.sh
```
**Look for:** `FAIL (n4)` — the guard must notice the boundary is gone. n1, n2, n3 and n5 stay `ok`.

Now put it back:

```bash
sudo bash scripts/network/install-pf.sh
```
On your phone: `http://192.168.12.191:8888` **cannot connect** again.

```bash
sudo -k
bash scripts/guards/network-guard.sh
```
**Look for:** `guard: PASS` with n1 through n5 all `ok`. This is n4's first real green run — it was
written before pf existed.

## 8. Partner test — the real acceptance

Ask Taylor **or** Jim to open <https://mojomap.tail7b863b.ts.net> and sign in, while you watch:

```bash
docker logs -f --since 5m supabase_kong_dzlgyxcvuwiulgifbmew | grep -F 'ts.net'
```
**Look for:** their requests appearing with `"https://mojomap.tail7b863b.ts.net/"` as the referer, and
the sign-in completing on their screen. Do not skip this. Everything above can look right while a
partner is still locked out.

---

## Undo — one step

```bash
sudo bash scripts/network/uninstall-pf.sh
```
The blocked ports answer again the moment it flushes the anchor; you do not need to reboot. It also boots
out the daemon so nothing re-enables at the next start, and it backs up `/etc/pf.conf` before editing it.

If a partner reports losing access, run the undo first and diagnose afterwards. Their path does not go
through these rules, so a partner outage almost certainly means something else broke at the same time —
but give them access back before you investigate.

To also bring Studio back (it is stopped, and it ran arbitrary SQL as `postgres` with no password):

```bash
docker start supabase_studio_dzlgyxcvuwiulgifbmew
```
Leave it stopped unless you need it, and only reach it at `http://127.0.0.1:54323`.
