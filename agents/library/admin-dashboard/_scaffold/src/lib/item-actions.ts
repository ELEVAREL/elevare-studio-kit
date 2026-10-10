"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// NOTE: a Server Actions module may only export async functions — keep helpers
// like slugify un-exported (or move them to a plain lib file).
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) throw new Error("Not authorized");
  return supabase;
}

/** Create or update an item. Writes run under the admin's RLS (is_admin). */
export async function saveItem(formData: FormData) {
  const supabase = await requireAdmin();

  const id = (formData.get("id") as string) || "";
  const name = ((formData.get("name") as string) || "").trim();
  const slug = ((formData.get("slug") as string) || "").trim() || slugify(name);
  const description = ((formData.get("description") as string) || "").trim() || null;
  const price = Math.round(Number(formData.get("price") || 0) * 100);
  const status = (formData.get("status") as string) || "draft";

  if (!name) throw new Error("Name is required");

  const row = { name, slug, description, price_cents: price, status, updated_at: new Date().toISOString() };

  const res = id
    ? await supabase.from("items").update(row).eq("id", id)
    : await supabase.from("items").insert(row);
  if (res.error) throw new Error(res.error.message);

  revalidatePath("/dashboard/items");
  redirect("/dashboard/items");
}

export async function deleteItem(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get("id") as string;
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/items");
  redirect("/dashboard/items");
}
