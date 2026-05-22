// src/lib/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Define all projects here
 */
const projects = {
  "sales.server.main": {
    url: "https://qewlpnmtsynrcjhblatn.supabase.co",
    anonKey: "sb_publishable_KU4GdSw7ta3Sxrzjp2TkJg_oiXu3DeW",
  },

  "sales.server.extension": {
    url: "https://zshlyhsnhzxdkquufsum.supabase.co",
    anonKey: "sb_publishable_MhgUbcj593As7zdaWEUyNQ_pmOo2YA-",
  },
};

type ProjectKey = keyof typeof projects;

const clients: Partial<Record<ProjectKey, SupabaseClient>> = {};

/**
 * Lazy-create and cache clients
 */
function createProjectClient(project: ProjectKey) {
  if (!clients[project]) {
    const config = projects[project];

    clients[project] = createClient(config.url, config.anonKey);
  }

  return clients[project]!;
}

/**
 * Current active project
 */
let currentProject: ProjectKey = "sales.server.main";

/**
 * Get current active client
 */
export function supabase() {
  return createProjectClient(currentProject);
}

/**
 * Switch active project
 */
export function switchSupabase(project: ProjectKey) {
  currentProject = project;
}

/**
 * Get current project name
 */
export function getCurrentProject() {
  return currentProject;
}

/**
 * Optional direct access
 */
export const supabaseClients = {
  "sales.server.main": createProjectClient("sales.server.main"),
  "sales.server.extension": createProjectClient("sales.server.extension"),
};
