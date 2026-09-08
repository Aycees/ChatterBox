// Mirrors backend/app/schemas/user.py:UserOut and schemas/token.py:Token.
// Keep these in sync by hand -- there's no shared codegen between the two
// projects (yet).

export type User = {
  id: string;
  username: string;
  email: string;
  created_at: string;
};

export type Token = {
  access_token: string;
  token_type: string;
};
