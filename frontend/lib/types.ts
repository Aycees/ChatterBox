// Mirrors backend/app/schemas/*.py. Keep these in sync by hand -- there's
// no shared codegen between the two projects (yet).

export type User = {
  id: string;
  username: string;
  email: string;
  created_at: string;
};

// schemas/user.py:UserDirectoryOut -- GET /users deliberately omits email
// (any authenticated user can query it for everyone else, see users.py).
export type UserDirectoryEntry = {
  id: string;
  username: string;
  created_at: string;
};

export type Token = {
  access_token: string;
  token_type: string;
};

// schemas/room.py:RoomOut
export type Room = {
  id: string;
  name: string;
  is_private: boolean;
  owner_id: string;
  created_at: string;
};

// schemas/room.py:RoomMemberOut
export type RoomMember = {
  room_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

// schemas/room.py:RoomMemberWithUserOut
export type RoomMemberWithUser = {
  user_id: string;
  username: string;
  role: string;
  joined_at: string;
};

// schemas/invite.py:InviteOut
export type InviteStatus = "pending" | "accepted" | "declined";

export type Invite = {
  id: string;
  room_id: string;
  invited_user_id: string;
  invited_by_id: string;
  status: InviteStatus;
  created_at: string;
  responded_at: string | null;
};

// schemas/invite.py:InviteWithDetailsOut
export type InviteWithDetails = {
  id: string;
  room_id: string;
  room_name: string;
  invited_by_id: string;
  invited_by_username: string;
  status: InviteStatus;
  created_at: string;
};

// schemas/message.py:MessageOut
export type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

// schemas/ws.py:WsTicketOut
export type WsTicket = {
  ticket: string;
  expires_in: number;
};

// The single JSON envelope every WS frame uses (spec 5.2). Server -> client
// frames carry one of these `type`s; client -> server frames only ever send
// "message" or "typing" (see ClientEnvelope below).
export type ServerEnvelope =
  | { type: "message"; payload: Message }
  | { type: "typing"; payload: { user_id: string } }
  | { type: "presence"; payload: { user_id: string; status: "online" | "offline" } }
  | { type: "error"; payload: { detail: string } };

export type ClientEnvelope =
  | { type: "message"; payload: { content: string } }
  | { type: "typing"; payload: Record<string, never> };
