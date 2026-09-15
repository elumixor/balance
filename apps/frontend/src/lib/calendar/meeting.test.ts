import { describe, expect, it } from "vitest";
import { asGoogleAccount, callFrom, hasAddress, meetingOf, partsOf } from "./meeting";

describe("callFrom", () => {
  it("names the provider a pasted link belongs to", () => {
    expect(callFrom("https://us02web.zoom.us/j/81234567890?pwd=x")).toEqual({
      url: "https://us02web.zoom.us/j/81234567890?pwd=x",
      name: "Zoom Meeting",
    });
    expect(callFrom("https://teams.microsoft.com/l/meetup-join/19%3ameeting").name).toBe("Teams Meeting");
    expect(callFrom("https://meet.google.com/abc-defg-hij").name).toBe("Google Meet");
  });

  it("falls back to the site for a call nothing here recognises", () => {
    expect(callFrom("https://www.whereby.com/room").name).toBe("whereby.com");
    expect(callFrom("not a url").name).toBe("Link");
  });
});

describe("meetingOf", () => {
  it("takes the conferencing block the calendar gives outright", () => {
    const { join } = meetingOf({ conferenceUrl: "https://meet.google.com/abc-defg-hij" });
    expect(join).toEqual({ url: "https://meet.google.com/abc-defg-hij", label: "Google Meet", provider: "meet" });
  });

  it("finds the room in notes written by a person", () => {
    const { join } = meetingOf({ description: "Standup — join at https://zoom.us/j/123456789 if you're remote" });
    expect(join?.provider).toBe("zoom");
  });

  it("knows the providers it claims to", () => {
    const providers = [
      ["https://meet.google.com/x", "meet"],
      ["https://zoom.us/j/1", "zoom"],
      ["https://acme.zoom.us/my/room", "zoom"],
      ["https://zoom.com/w/1", "zoom"],
      ["https://teams.microsoft.com/l/meetup-join/x", "teams"],
      ["https://teams.live.com/meet/x", "teams"],
      ["https://acme.webex.com/meet/x", "webex"],
    ] as const;
    for (const [url, provider] of providers) expect(meetingOf({ conferenceUrl: url }).join?.provider).toBe(provider);
  });

  it("leaves the sentence's punctuation out of the link", () => {
    // A trailing full stop makes a URL that 404s, and it's how most invitations end a line.
    const { join } = meetingOf({ description: "Dial in: https://meet.google.com/abc-defg-hij." });
    expect(join?.url).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("leaves brackets and quotes out of the link too", () => {
    const { links } = meetingOf({
      description: '(see https://docs.example.com/agenda) and "https://wiki.example.com/x"',
    });
    expect(links.map((l) => l.url)).toEqual(["https://docs.example.com/agenda", "https://wiki.example.com/x"]);
  });

  it("lists the other links once each, by the site they're on", () => {
    const { join, links } = meetingOf({
      location: "https://meet.google.com/abc-defg-hij",
      description: "Agenda https://docs.google.com/document/d/1 and again https://docs.google.com/document/d/1",
    });
    expect(join?.provider).toBe("meet");
    expect(links).toEqual([{ url: "https://docs.google.com/document/d/1", label: "docs.google.com" }]);
  });

  it("doesn't list the room a second time as an ordinary link", () => {
    const { links } = meetingOf({
      conferenceUrl: "https://meet.google.com/abc-defg-hij",
      description: "Room: https://meet.google.com/abc-defg-hij (backup https://zoom.us/j/1)",
    });
    expect(links).toEqual([]);
  });

  it("drops www and falls back to a plain label for something unparseable", () => {
    const { links } = meetingOf({ description: "https://www.example.com/a https://[" });
    expect(links.map((l) => l.label)).toEqual(["example.com", "Link"]);
  });

  it("treats a location that was only a link as nowhere to go", () => {
    expect(meetingOf({ location: "https://meet.google.com/abc-defg-hij" }).location).toBeNull();
    expect(meetingOf({ location: "   " }).location).toBeNull();
    expect(meetingOf({}).location).toBeNull();
  });

  it("keeps the address when the link is only tacked onto it", () => {
    expect(meetingOf({ location: "Grote Markt 1, Antwerpen, https://maps.example.com/x" }).location).toBe(
      "Grote Markt 1, Antwerpen",
    );
  });

  it("has nothing to join when nothing in the event is a call", () => {
    expect(meetingOf({ description: "Bring coffee" })).toEqual({ join: null, links: [], location: null });
  });
});

describe("hasAddress", () => {
  it("is true for somewhere you have to physically be", () => {
    expect(hasAddress({ location: "Grote Markt 1, Antwerpen" })).toBe(true);
    expect(hasAddress({ location: "Baker Street" })).toBe(true);
  });

  it("is false for a link, a bare room name, and nothing at all", () => {
    expect(hasAddress({ location: "https://meet.google.com/abc-defg-hij" })).toBe(false);
    expect(hasAddress({ location: "Boardroom" })).toBe(false);
    expect(hasAddress({})).toBe(false);
  });
});

describe("asGoogleAccount", () => {
  it("names the account a Google link should open as", () => {
    expect(asGoogleAccount("https://meet.google.com/abc-defg-hij", "work@example.com")).toBe(
      "https://meet.google.com/abc-defg-hij?authuser=work%40example.com",
    );
    expect(asGoogleAccount("https://docs.google.com/document/d/1?usp=sharing", "work@example.com")).toBe(
      "https://docs.google.com/document/d/1?usp=sharing&authuser=work%40example.com",
    );
  });

  it("leaves alone what the parameter would mean nothing to, or would overwrite", () => {
    expect(asGoogleAccount("https://zoom.us/j/1", "work@example.com")).toBe("https://zoom.us/j/1");
    expect(asGoogleAccount("https://notgoogle.com/x", "work@example.com")).toBe("https://notgoogle.com/x");
    expect(asGoogleAccount("https://meet.google.com/a?authuser=1", "work@example.com")).toBe(
      "https://meet.google.com/a?authuser=1",
    );
    expect(asGoogleAccount("https://meet.google.com/a", null)).toBe("https://meet.google.com/a");
    expect(asGoogleAccount("meet.google.com/a", "work@example.com")).toBe("meet.google.com/a");
  });
});

describe("partsOf", () => {
  it("keeps the words and turns each link into a labelled pill", () => {
    expect(partsOf("Agenda: https://docs.google.com/d/1. Join https://meet.google.com/abc")).toEqual([
      { text: "Agenda: " },
      { link: { url: "https://docs.google.com/d/1", label: "docs.google.com" } },
      { text: ". Join " },
      { link: { url: "https://meet.google.com/abc", label: "Google Meet", provider: "meet" } },
    ]);
  });

  it("is only words when there is no link, and only a link when there are no words", () => {
    expect(partsOf("Bring coffee")).toEqual([{ text: "Bring coffee" }]);
    expect(partsOf("https://example.com/x")).toEqual([
      { link: { url: "https://example.com/x", label: "example.com" } },
    ]);
  });
});
