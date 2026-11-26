export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Friend request seen by the signed-in user (`user` is always the other person). */
export interface Friendship {
  id: string;
  status: FriendshipStatus;
  /** RECEIVED: the other user sent it; SENT: the signed-in user sent it. */
  direction: 'RECEIVED' | 'SENT';
  user: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/** Accepted friend returned by `GET /api/friends`. */
export interface Friend {
  id: string;
  name: string;
  friendshipId: string;
  since: string;
}

/** Up to two initials for the avatar (the User model has no profile picture). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
