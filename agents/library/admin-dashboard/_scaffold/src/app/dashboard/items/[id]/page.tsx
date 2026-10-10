import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/dashboard/item-form";

export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;                       // Next 16: params is async
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("items")
    .select("id, name, slug, description, price_cents, status")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Items</p>
        <h1 className="mt-1 text-3xl font-semibold">Edit item</h1>
      </div>
      <ItemForm item={item} />
    </div>
  );
}
