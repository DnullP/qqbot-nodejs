/** Current outer event types; separate from legacy data.type CONFIG_QUERY/UPDATE. */
export const InteractionEventType = {
  MESSAGE_BUTTON: 11, QUICK_MENU: 12, FEEDBACK: 13, CLEAR_SESSION: 14,
  STORY: 15, SWITCH_MODEL: 16, USER_AUTHORIZATION: 18, GROUP_AUTHORIZATION: 19,
  GROUP_AUTHORIZATION_CHANGE: 20,
} as const;
/** No legacy coercion; type14 ACK/client gray-bar behavior needs separate verification. */
export function requiresInteractionAck(type: number): boolean { return type === 11 || type === 12; }
