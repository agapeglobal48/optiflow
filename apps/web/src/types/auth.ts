// Mirrors apps/api/src/types/express.d.ts AuthContext plus the login
// response's `user` object. Kept as a hand-written mirror rather than a
// shared package for now - the two apps are still simple enough that
// duplicating these few fields is cheaper than setting up a shared types
// package, and any drift will show up immediately as a type error here.
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  practiceId: string;
}

export interface DecodedAccessToken {
  userId: string;
  practiceId: string;
  roleId: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}
