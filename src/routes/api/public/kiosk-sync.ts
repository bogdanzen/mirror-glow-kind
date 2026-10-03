import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";

const heartbeat = z.object({
  kioskId: z.string().uuid().or(z.literal("")),
  token: z.string().min(40).max(200),
  kioskName: z.string().min(1).max(60),
  currentScreen: z.enum(["attract", "consent", "framing", "mirror", "choice", "healthy", "final", "donate"]),
  cameraOk: z.boolean(),
  aiOk: z.boolean(),
  aiLatencyMs: z.number().int().nonnegative().nullable(),
  lastAiSuccessAt: z.string().datetime().nullable(),
  lastError: z.string().max(500).nullable(),
  sessionActive: z.boolean(),
});

const acknowledgement = z.object({
  kioskId: z.string().uuid(),
  token: z.string().min(40).max(200),
  commandId: z.string().uuid(),
  result: z.string().max(200),
});

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/kiosk-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = heartbeat.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Date invalide", { status: 400 });
        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = digest(body.token);
        let kioskId = body.kioskId;

        if (kioskId) {
          const { data } = await supabaseAdmin.from("kiosk_status").select("token_hash").eq("id", kioskId).maybeSingle();
          if (!data || !secureMatch(data.token_hash, tokenHash)) return new Response("Neautorizat", { status: 401 });
        } else {
          const { data: existing } = await supabaseAdmin.from("kiosk_status").select("id").eq("token_hash", tokenHash).maybeSingle();
          if (existing) kioskId = existing.id;
          else {
            const { data: created, error } = await supabaseAdmin
              .from("kiosk_status")
              .insert({ kiosk_name: body.kioskName, token_hash: tokenHash })
              .select("id")
              .single();
            if (error) throw error;
            kioskId = created.id;
          }
        }

        const now = new Date().toISOString();
        const { error: statusError } = await supabaseAdmin.from("kiosk_status").update({
          kiosk_name: body.kioskName,
          last_seen: now,
          current_screen: body.currentScreen,
          camera_ok: body.cameraOk,
          ai_ok: body.aiOk,
          ai_latency_ms: body.aiLatencyMs,
          last_ai_success_at: body.lastAiSuccessAt,
          last_error: body.lastError,
          app_version: "principal",
          user_agent: request.headers.get("user-agent"),
          viewport: request.headers.get("x-kiosk-viewport"),
          session_active: body.sessionActive,
          updated_at: now,
        }).eq("id", kioskId);
        if (statusError) throw statusError;

        const { data: command } = await supabaseAdmin
          .from("kiosk_commands")
          .select("id,command,delivered_at")
          .eq("kiosk_id", kioskId)
          .is("acknowledged_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (command && !command.delivered_at) {
          await supabaseAdmin.from("kiosk_commands").update({ delivered_at: now }).eq("id", command.id);
        }
        return Response.json({ kioskId, command: command ?? null });
      },
      PATCH: async ({ request }) => {
        const parsed = acknowledgement.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Date invalide", { status: 400 });
        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("kiosk_status").select("token_hash").eq("id", body.kioskId).maybeSingle();
        if (!data || !secureMatch(data.token_hash, digest(body.token))) return new Response("Neautorizat", { status: 401 });
        const { error } = await supabaseAdmin.from("kiosk_commands").update({
          acknowledged_at: new Date().toISOString(),
          result: body.result,
        }).eq("id", body.commandId).eq("kiosk_id", body.kioskId);
        if (error) throw error;
        return Response.json({ ok: true });
      },
    },
  },
});