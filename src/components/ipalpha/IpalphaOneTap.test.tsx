import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IpalphaOneTap, { ONE_TAP_MESSAGE_TYPE } from "./IpalphaOneTap";

const AUTH = "https://auth.example.test";

function setup() {
  const onSelect = vi.fn();
  const onOther = vi.fn();
  const onDismiss = vi.fn();
  const view = render(<IpalphaOneTap authOrigin={AUTH} clientId="acampa" entryPoint="web" title="Entrar com IPAlpha" onSelect={onSelect} onOther={onOther} onDismiss={onDismiss} />);
  const frame = () => view.container.querySelector("iframe");
  const send = (data: Record<string, unknown>, origin = AUTH, source: Window | null = frame()?.contentWindow ?? null) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: ONE_TAP_MESSAGE_TYPE, ...data }, origin, source }));
    });
  return { frame, send, onSelect, onOther, onDismiss };
}

describe("IpalphaOneTap", () => {
  it("points the frame at the auth origin with this page's origin, hidden until ready", () => {
    const { frame, send } = setup();
    const src = new URL(frame()!.src);
    expect(src.origin + src.pathname).toBe(`${AUTH}/one-tap`);
    expect(src.searchParams.get("client_id")).toBe("acampa");
    expect(src.searchParams.get("entry_point")).toBe("web");
    expect(src.searchParams.get("origin")).toBe(window.location.origin);
    expect(frame()).toHaveAttribute("aria-hidden", "true");

    send({ event: "ready", height: 212 });
    expect(frame()).not.toHaveAttribute("aria-hidden");
    expect(frame()!.className).toContain("shown");
    expect(frame()!.style.height).toBe("212px");
  });

  it("ignores messages from another origin or another window", () => {
    const { frame, send, onSelect } = setup();
    send({ event: "ready", height: 200 }, "https://evil.example.test");
    send({ event: "select", personId: "p-1" }, AUTH, window);
    expect(frame()).toHaveAttribute("aria-hidden", "true");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hides itself on 'none'", () => {
    const { frame, send, onDismiss } = setup();
    send({ event: "none" });
    expect(frame()).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides itself on 'close'", () => {
    const { frame, send, onDismiss } = setup();
    send({ event: "ready", height: 180 });
    send({ event: "close" });
    expect(frame()).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("forwards 'select' with the person id and 'other' without one", () => {
    const { send, onSelect, onOther } = setup();
    send({ event: "ready", height: 180 });
    send({ event: "select", personId: "p-42" });
    send({ event: "select", personId: 7 });
    send({ event: "other" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("p-42");
    expect(onOther).toHaveBeenCalledTimes(1);
  });
});
