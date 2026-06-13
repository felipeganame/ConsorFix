/**
 * Expo Push HTTP API client (lightweight, no SDK dep).
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
export interface ExpoPushMessage {
  to: string; // ExponentPushToken[xxx]
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
}

export async function sendExpoPush(
  messages: ExpoPushMessage[],
  accessToken?: string,
): Promise<Array<{ status: 'ok' | 'error'; id?: string; message?: string }>> {
  if (messages.length === 0) return [];
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
      ...(accessToken && { authorization: `Bearer ${accessToken}` }),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`expo push failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: Array<{ status: 'ok' | 'error'; id?: string; message?: string }> };
  return json.data ?? [];
}
