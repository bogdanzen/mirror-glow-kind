import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: {
  supabase: { rpc: (name: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: boolean | null; error: { message: string } | null }> };
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Acces rezervat administratorului");
}

export const initializeRemoteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw countError;
    if ((count ?? 0) === 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: context.userId, role: "admin" });
      if (error && error.code !== "23505") throw error;
    }
    await requireAdmin(context);
    return { ok: true };
  });

export const getKioskStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("kiosk_status")
      .select("id,kiosk_name,last_seen,current_screen,camera_ok,ai_ok,ai_latency_ms,last_ai_success_at,last_error,app_version,user_agent,viewport,session_active,updated_at")
      .order("last_seen", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const sendKioskCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    kioskId: z.string().uuid(),
    command: z.enum(["refresh", "reset_experience", "test_ai"]),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: command, error } = await context.supabase
      .from("kiosk_commands")
      .insert({ kiosk_id: data.kioskId, command: data.command, created_by: context.userId })
      .select("id,created_at")
      .single();
    if (error) throw error;
    return command;
  });