import { NextRequest, NextResponse } from "next/server";
import { handleDiscordInteraction, verifyDiscordSignature } from "@/lib/discord-interactions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
    const signature = request.headers.get("x-signature-ed25519") ?? "";
    const timestamp = request.headers.get("x-signature-timestamp") ?? "";

    if (process.env.DISCORD_SKIP_SIGNATURE_CHECK !== "true") {
      if (!publicKey || !signature || !timestamp) {
        return NextResponse.json({ error: "missing-discord-signature" }, { status: 401 });
      }
      const verified = verifyDiscordSignature(rawBody, timestamp, signature, publicKey);
      if (!verified) {
        return NextResponse.json({ error: "invalid-discord-signature" }, { status: 401 });
      }
    }

    const interaction = JSON.parse(rawBody) as Parameters<typeof handleDiscordInteraction>[0];
    const response = await handleDiscordInteraction(interaction);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "invalid-discord-interaction" }, { status: 400 });
  }
}
