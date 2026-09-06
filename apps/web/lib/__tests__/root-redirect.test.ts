import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  rootRedirectTarget,
  ROOT_REDIRECT_DESTINATION,
  ROOT_REDIRECT_STATUS,
} from "../root-redirect.ts";

const at = (
  host: string | null | undefined,
  pathname: string,
  search = "",
): string | null => rootRedirectTarget({ host, pathname, search });

describe("root-redirect — host-specific / → /lana-pro/onboarding (§7)", () => {
  test("activecitypass.com/ → /lana-pro/onboarding", () => {
    assert.equal(at("activecitypass.com", "/"), "/lana-pro/onboarding");
  });

  test("www.activecitypass.com/ → /lana-pro/onboarding", () => {
    assert.equal(at("www.activecitypass.com", "/"), "/lana-pro/onboarding");
  });

  test("query string is preserved verbatim", () => {
    assert.equal(
      at("activecitypass.com", "/", "?utm_source=test"),
      "/lana-pro/onboarding?utm_source=test",
    );
    assert.equal(
      at("www.activecitypass.com", "/", "?utm_source=instagram&ref=a%20b"),
      "/lana-pro/onboarding?utm_source=instagram&ref=a%20b",
    );
  });

  test("no redirect for the destination itself (loop protection)", () => {
    assert.equal(at("activecitypass.com", "/lana-pro/onboarding"), null);
    assert.equal(
      at("activecitypass.com", "/lana-pro/onboarding", "?utm_source=x"),
      null,
    );
  });

  test("no redirect for other Lana Pro / partner / consumer routes", () => {
    for (const p of [
      "/lana-pro/home",
      "/lana-pro/clients",
      "/lana-pro/bookings",
      "/lana-pro/schedule",
      "/lana-pro/services",
      "/lana-pro/team",
      "/lana-pro/business",
      "/partner-login",
      "/partners/signup",
      "/walkthrough",
      "/login",
      "/sessions",
      "/trainers",
    ]) {
      assert.equal(at("activecitypass.com", p), null, p);
    }
  });

  test("no redirect for API routes", () => {
    assert.equal(at("activecitypass.com", "/api/check-partner"), null);
    assert.equal(at("activecitypass.com", "/api/ai/weekly-adaptation"), null);
    assert.equal(at("www.activecitypass.com", "/api/mpesa/status"), null);
  });

  test("no redirect for an unrelated hostname root", () => {
    for (const h of [
      "lanahealth.com",
      "www.lanahealth.com",
      "localhost",
      "example.com",
      "preview-abc123.vercel.app",
    ]) {
      assert.equal(at(h, "/"), null, h);
    }
  });
});

describe("root-redirect — host normalisation & edge cases", () => {
  test("host match is case-insensitive", () => {
    assert.equal(at("ACTIVECITYPASS.COM", "/"), "/lana-pro/onboarding");
    assert.equal(at("WWW.ActiveCityPass.Com", "/"), "/lana-pro/onboarding");
  });

  test("an explicit :port on the host still matches", () => {
    assert.equal(at("activecitypass.com:443", "/"), "/lana-pro/onboarding");
    assert.equal(at("www.activecitypass.com:3000", "/"), "/lana-pro/onboarding");
  });

  test("whitespace-padded host is trimmed", () => {
    assert.equal(at("  activecitypass.com  ", "/"), "/lana-pro/onboarding");
  });

  test("missing / empty host → no redirect", () => {
    assert.equal(at(null, "/"), null);
    assert.equal(at(undefined, "/"), null);
    assert.equal(at("", "/"), null);
    assert.equal(at("   ", "/"), null);
  });

  test("look-alike hosts do NOT match", () => {
    for (const h of [
      "notactivecitypass.com",
      "activecitypass.com.evil.test",
      "evil.activecitypass.com",
      "activecitypass.co",
      "activecitypassxcom",
    ]) {
      assert.equal(at(h, "/"), null, h);
    }
  });

  test("only the exact root path '/' matches", () => {
    for (const p of ["", "//", "/index", "/ ", "/?", "/#", "/lana-pro"]) {
      assert.equal(at("activecitypass.com", p), null, JSON.stringify(p));
    }
  });
});

describe("root-redirect — contract constants", () => {
  test("temporary redirect (307, not 308)", () => {
    assert.equal(ROOT_REDIRECT_STATUS, 307);
    assert.notEqual(ROOT_REDIRECT_STATUS, 308);
  });

  test("destination is the onboarding route and is not '/'", () => {
    assert.equal(ROOT_REDIRECT_DESTINATION, "/lana-pro/onboarding");
    assert.notEqual(ROOT_REDIRECT_DESTINATION, "/");
  });
});
