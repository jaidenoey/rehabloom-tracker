// Sends text messages to support contacts.
//
// iMessage has no public API for apps, so we send a normal SMS through Twilio:
// on an iPhone it lands in the Messages app (green bubble). If the Twilio
// secrets are not set, we run in "simulated" mode and only log the message —
// handy for the hackathon demo without spending credit.

export type SendResult = { status: "sent" | "simulated" | "failed"; error?: string };

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];

  if (!sid || !token || !from) {
    console.info(`[alerts] simulated SMS to ${to}:\n${body}`);
    return { status: "simulated" };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) return { status: "failed", error: `Twilio ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
