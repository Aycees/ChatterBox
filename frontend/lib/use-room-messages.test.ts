import { describe, expect, it } from "vitest";
import { flattenMessagePages } from "@/lib/use-room-messages";
import type { Message } from "@/lib/types";

function message(id: string): Message {
  return { id, room_id: "room-1", sender_id: "user-1", content: id, created_at: "2024-01-01T00:00:00Z" };
}

describe("flattenMessagePages", () => {
  it("returns an empty list for no pages", () => {
    expect(flattenMessagePages([])).toEqual([]);
  });

  it("orders a single newest-first page as oldest-first", () => {
    const page = [message("3"), message("2"), message("1")];
    expect(flattenMessagePages([page]).map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("orders multiple newest-first pages (fetched newest page first) as one oldest-first list", () => {
    // Page 0 = the most recent batch, page 1 = the batch before that --
    // matches how useRoomMessages' getNextPageParam fetches older pages.
    const page0 = [message("4"), message("3")];
    const page1 = [message("2"), message("1")];
    expect(flattenMessagePages([page0, page1]).map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
  });
});
