"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Message } from "@/lib/types";

const PAGE_SIZE = 50;

// GET /rooms/{id}/messages paginates newest-first (backend/app/api/routes/
// rooms.py:list_messages). Page 0 is the most recent PAGE_SIZE messages,
// page 1 the PAGE_SIZE before that, and so on -- so pages are contiguous,
// non-overlapping, newest-first windows, in fetch order.
export function useRoomMessages(roomId: string) {
  return useInfiniteQuery({
    queryKey: ["rooms", roomId, "messages"],
    queryFn: ({ pageParam }) =>
      apiFetch<Message[]>(`/rooms/${roomId}/messages?limit=${PAGE_SIZE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });
}

// Pages themselves are newest-first, and pages are fetched/stored in
// newest-to-oldest order too, so concatenating them in order already
// yields one globally newest-first list; reversing that gives the
// oldest-first order a chat view wants to render top-to-bottom.
export function flattenMessagePages(pages: Message[][]): Message[] {
  return pages.flat().reverse();
}
