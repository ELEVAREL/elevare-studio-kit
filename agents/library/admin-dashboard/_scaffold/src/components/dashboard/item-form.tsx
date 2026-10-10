"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { saveItem, deleteItem } from "@/lib/item-actions";

type Item = {
  id: string; name: string; slug: string; description: string | null;
  price_cents: number; status: string;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</>) : "Save"}
    </button>
  );
}

export function ItemForm({ item }: { item?: Item }) {
  return (
    <div className="max-w-xl space-y-6">
      <form action={saveItem} className="card space-y-4 p-6">
        {item && <input type="hidden" name="id" value={item.id} />}

        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required className="field" defaultValue={item?.name ?? ""} />
        </div>

        <div>
          <label className="label" htmlFor="slug">URL slug <span className="font-normal">(optional — auto from name)</span></label>
          <input id="slug" name="slug" className="field" defaultValue={item?.slug ?? ""} placeholder="my-item" />
        </div>

        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={4} className="field" defaultValue={item?.description ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="price">Price (USD)</label>
            <input id="price" name="price" type="number" step="0.01" min="0" className="field"
              defaultValue={item ? (item.price_cents / 100).toFixed(2) : ""} />
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="field" defaultValue={item?.status ?? "draft"}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (public)</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <SaveButton />
      </form>

      {item && (
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="text-sm font-medium text-[color:var(--color-danger)] hover:underline"
            onClick={(e) => { if (!confirm("Delete this item? This can't be undone.")) e.preventDefault(); }}
          >
            Delete item
          </button>
        </form>
      )}
    </div>
  );
}
