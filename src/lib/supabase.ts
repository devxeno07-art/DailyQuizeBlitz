import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://wfipwaysilwuuueqamuk.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_ymWKNNbXnVw18NLsCxLq7w_hr1Uz_J6";

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
        },
      });
    } catch (err) {
      console.warn("[supabase] Failed to initialize Supabase client:", err);
      return null;
    }
  }
  return supabaseInstance;
};

/**
 * SQL script needed to create the app_settings and related tables in Supabase.
 */
export const SUPABASE_SETUP_SQL = `-- 1. Create app_settings table for Admin Password and Global Config
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert your initial Admin Password (change '7777' to whatever password you want!)
INSERT INTO public.app_settings (key, value)
VALUES ('admin_pin', '7777')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 4. Allow anon users to read app_settings (needed to verify admin login)
DROP POLICY IF EXISTS "Allow public read app_settings" ON public.app_settings;
CREATE POLICY "Allow public read app_settings"
ON public.app_settings FOR SELECT
TO anon, authenticated
USING (true);

-- 5. Allow updating app_settings
DROP POLICY IF EXISTS "Allow anon update app_settings" ON public.app_settings;
CREATE POLICY "Allow anon update app_settings"
ON public.app_settings FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
`;

/**
 * Checks connection to Supabase and whether `app_settings` table is ready.
 */
export const testSupabaseConnection = async (): Promise<{
  ok: boolean;
  tableExists: boolean;
  hasPin: boolean;
  latencyMs: number;
  error?: string;
}> => {
  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      tableExists: false,
      hasPin: false,
      latencyMs: 0,
      error: "Supabase client not initialized",
    };
  }

  const start = Date.now();
  try {
    const { data, error, status } = await sb
      .from("app_settings")
      .select("key, value")
      .limit(5);

    const latencyMs = Date.now() - start;

    if (error) {
      // PGRST205 indicates table does not exist in schema cache
      if (error.code === "PGRST205" || status === 404) {
        return {
          ok: true,
          tableExists: false,
          hasPin: false,
          latencyMs,
          error: "Table 'app_settings' not created yet. Run the SQL script in Supabase SQL Editor.",
        };
      }
      return {
        ok: false,
        tableExists: false,
        hasPin: false,
        latencyMs,
        error: error.message,
      };
    }

    const hasPin = Array.isArray(data) && data.some((r) => r.key === "admin_pin" || r.key === "admin_password");

    return {
      ok: true,
      tableExists: true,
      hasPin,
      latencyMs,
    };
  } catch (err: any) {
    return {
      ok: false,
      tableExists: false,
      hasPin: false,
      latencyMs: Date.now() - start,
      error: err?.message || "Connection failed",
    };
  }
};

/**
 * Fetches the admin PIN / password stored in Supabase.
 * Checks `app_settings` (key: admin_pin or admin_password), or fallback tables.
 * Returns null if Supabase is not reachable or table is not created yet.
 */
export const getAdminPasswordFromSupabase = async (): Promise<string | null> => {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    // Check app_settings first
    const { data, error } = await sb
      .from("app_settings")
      .select("key, value")
      .in("key", ["admin_pin", "admin_password", "admin_pass"]);

    if (!error && Array.isArray(data) && data.length > 0) {
      const match =
        data.find((r) => r.key === "admin_pin") ||
        data.find((r) => r.key === "admin_password") ||
        data[0];
      if (match?.value) {
        return String(match.value).trim();
      }
    }

    // Secondary check: admin_settings table (pin / password column)
    const alt = await sb.from("admin_settings").select("*").limit(1);
    if (!alt.error && Array.isArray(alt.data) && alt.data.length > 0) {
      const row = alt.data[0];
      const val = row?.pin || row?.password || row?.value;
      if (val) return String(val).trim();
    }
  } catch (err) {
    console.warn("[supabase] Error checking admin password:", err);
  }

  return null;
};

/**
 * Updates the admin PIN / password in Supabase.
 */
export const setAdminPasswordInSupabase = async (
  newPin: string
): Promise<{ ok: boolean; error?: string }> => {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase not configured" };

  try {
    const { error } = await sb
      .from("app_settings")
      .upsert(
        {
          key: "admin_pin",
          value: String(newPin).trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update Supabase" };
  }
};
