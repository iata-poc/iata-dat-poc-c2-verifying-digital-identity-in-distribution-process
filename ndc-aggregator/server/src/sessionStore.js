/**
 * Session Schema:
 * {
 *   id: uuid,
 *   ip: string,
 *   hopaeSessionId: string,
 *   verifier: "HOPAE",
 *   state: "REQUESTED" | "VERIFIED",
 *   flowType: "agency_desktop",
 *   createdAt: Date,
 *   expiresAt: Date,
 *   agentProfile: {
 *     did: string,
 *     name: string,
 *     email: string,
 *     agency: {
 *       id: string,
 *       name: string,
 *       iataNumber: string
 *     },
 *     roles: array
 *   },
 *   vpToken: string,
 *   agencyIataNumber: string
 * }
 */
const sessions = [];

const getSessionById = (id) => {
  const session = sessions.find((s) => s.id === id);
  return session ? { ...session } : undefined;
};


const updateSession = (updatedSession) => {
  const index = sessions.findIndex((s) => s.id === updatedSession.id);
  if (index === -1) {
    return false;
  }
  sessions.splice(index, 1, updatedSession);
  return true;
};

const addSession = (session) => {
  sessions.push(session);
};

const getSessionWithProfile = (id) => {
  const session = sessions.find((s) => s.id === id);
  if (!session) {
    return undefined;
  }
  return {
    ...session,
    agentProfile: session.agentProfile ? { ...session.agentProfile } : undefined,
  };
};

export const sessionStore = {
  getSessionById,
  updateSession,
  addSession,
  getSessionWithProfile,
};
