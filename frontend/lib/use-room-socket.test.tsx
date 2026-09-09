import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRoomSocket } from "@/lib/use-room-socket";

// jsdom doesn't implement WebSocket, so tests stand in a minimal fake that
// captures what useRoomSocket does with it (the URL it connects to, what
// it sends) and lets a test drive its lifecycle callbacks directly.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  emitServerEnvelope(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

describe("useRoomSocket", () => {
  it("mints a ws-ticket, opens the socket with it in the URL, and reflects the open state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ticket: "tix-1", expires_in: 30 })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useRoomSocket("room-1"), { wrapper });

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.instances[0].url).toContain("/ws/rooms/room-1?ticket=tix-1");
    expect(result.current.connectionState).toBe("connecting");

    act(() => FakeWebSocket.instances[0].emitOpen());
    await waitFor(() => expect(result.current.connectionState).toBe("open"));
  });

  it("closes without ever opening a socket if minting the ticket fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(404, { detail: "Room not found" })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useRoomSocket("room-1"), { wrapper });

    await waitFor(() => expect(result.current.connectionState).toBe("closed"));
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(result.current.lastError).toBeTruthy();
  });

  it("tracks online/offline presence from server envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ticket: "tix-1", expires_in: 30 })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useRoomSocket("room-1"), { wrapper });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitServerEnvelope({ type: "presence", payload: { user_id: "u1", status: "online" } }));
    await waitFor(() => expect(result.current.onlineUserIds.has("u1")).toBe(true));

    act(() => socket.emitServerEnvelope({ type: "presence", payload: { user_id: "u1", status: "offline" } }));
    await waitFor(() => expect(result.current.onlineUserIds.has("u1")).toBe(false));
  });

  it("adds a user to typingUserIds on a typing envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ticket: "tix-1", expires_in: 30 })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useRoomSocket("room-1"), { wrapper });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitServerEnvelope({ type: "typing", payload: { user_id: "u1" } }));
    await waitFor(() => expect(result.current.typingUserIds.has("u1")).toBe(true));
  });

  it("sends message and typing envelopes in the wire shape the backend expects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ticket: "tix-1", expires_in: 30 })));
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useRoomSocket("room-1"), { wrapper });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];

    act(() => result.current.sendMessage("hey team"));
    act(() => result.current.sendTyping());

    expect(JSON.parse(socket.sent[0])).toEqual({ type: "message", payload: { content: "hey team" } });
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "typing", payload: {} });
  });
});
