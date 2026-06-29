import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "./info";
import type { Database } from "../../src/types/database";

export const supabase = createClient<Database>(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    realtime: { params: { eventsPerSecond: 10 } },
  },
);

export const EDGE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-3c4c7f8d`;
export const EDGE_HEADERS = {
  Authorization: `Bearer ${publicAnonKey}`,
};
