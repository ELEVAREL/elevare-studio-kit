import { ItemForm } from "@/components/dashboard/item-form";

export default function NewItemPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Items</p>
        <h1 className="mt-1 text-3xl font-semibold">New item</h1>
      </div>
      <ItemForm />
    </div>
  );
}
