import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, switchSupabase } from "@/config/db";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";

/* =========================
   TYPES
========================= */

export type ColumnType = "text" | "number" | "boolean" | "textarea";

export type TableColumn = {
  key: string;
  label: string;
  type: ColumnType;
  filterable?: boolean;
  editable?: boolean;
};

export type DataTableProps = {
  table: string;
  columns: TableColumn[];

  project?: "sales.server.main" | "sales.server.extension";

  enableAdd?: boolean;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableBulkDelete?: boolean;

  pageSize?: number;
};

/* =========================
   COMPONENT
========================= */

function DataModal({
  open,
  onOpenChange,
  columns,
  initialData,
  onSubmit,
}: any) {
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    setForm(initialData || {});
  }, [initialData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit" : "Add"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {columns.map((col: any) => (
            <Input
              key={col.key}
              value={form[col.key] || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  [col.key]: e.target.value,
                })
              }
            />
          ))}
        </div>

        <Button className="w-full mt-4" onClick={() => onSubmit(form)}>
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function DataTableController({
  table,
  columns,
  project = "sales.server.main",
  enableAdd = true,
  enableEdit = true,
  enableDelete = true,
  enableBulkDelete = false,
  pageSize = 10,
}: DataTableProps) {
  const [params, setParams] = useSearchParams();

  const search = params.get("search") || "";
  const page = Number(params.get("page") || "1");
  const filterKey = params.get("filterKey") || "";
  const filterValue = params.get("filterValue") || "";

  const [data, setData] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const [openModal, setOpenModal] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);

  /* =========================
     SAFE PARAM UPDATER
  ========================= */

  const updateParams = (updates: Record<string, any>) => {
    const next = new URLSearchParams(params);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    });

    setParams(next);
  };

  /* =========================
     PROJECT SWITCH (IMPORTANT)
  ========================= */

  useEffect(() => {
    switchSupabase(project);
  }, [project]);

  /* =========================
     FETCH
  ========================= */

  const fetchData = async () => {
    let query = supabase().from(table).select("*", { count: "exact" });

    const textCol = columns.find((c) => c.type === "text");

    if (search && textCol) {
      query = query.ilike(textCol.key, `%${search}%`);
    }

    if (filterKey && filterValue) {
      query = query.eq(filterKey, filterValue);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data } = await query.range(from, to);
    setData(data || []);
  };

  useEffect(() => {
    fetchData();
  }, [params.toString(), project]);

  /* =========================
     CRUD
  ========================= */

  const handleSave = async (form: any) => {
    if (editingRow) {
      await supabase().from(table).update(form).eq("id", editingRow.id);
    } else {
      await supabase().from(table).insert(form);
    }

    setOpenModal(false);
    setEditingRow(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase().from(table).delete().eq("id", id);
    fetchData();
  };

  const handleBulkDelete = async () => {
    await supabase().from(table).delete().in("id", Array.from(selectedRows));

    setSelectedRows(new Set());
    fetchData();
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex justify-between gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
          className="max-w-sm"
        />

        <div className="flex gap-2">
          <Select
            value={filterKey}
            onValueChange={(v) =>
              updateParams({
                filterKey: v,
                filterValue: "",
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter column" />
            </SelectTrigger>

            <SelectContent>
              {columns
                .filter((c) => c.filterable)
                .map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {filterKey && (
            <Input
              placeholder="Filter value"
              value={filterValue}
              onChange={(e) =>
                updateParams({
                  filterValue: e.target.value,
                  page: 1,
                })
              }
            />
          )}

          {enableAdd && (
            <Button
              onClick={() => {
                setEditingRow(null);
                setOpenModal(true);
              }}
            >
              Add
            </Button>
          )}

          {enableBulkDelete && selectedRows.size > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete Selected
            </Button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {enableBulkDelete && <th />}

              {columns.map((c) => (
                <th key={c.key} className="text-left p-2">
                  {c.label}
                </th>
              ))}

              <th className="p-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b">
                {enableBulkDelete && (
                  <td className="p-2">
                    <Checkbox
                      checked={selectedRows.has(row.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedRows);
                        v ? next.add(row.id) : next.delete(row.id);
                        setSelectedRows(next);
                      }}
                    />
                  </td>
                )}

                {columns.map((c) => (
                  <td key={c.key} className="p-2">
                    {String(row[c.key])}
                  </td>
                ))}

                <td className="p-2 flex gap-2">
                  {enableEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingRow(row);
                        setOpenModal(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}

                  {enableDelete && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(row.id)}
                    >
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-end gap-2">
        <Button
          disabled={page === 1}
          onClick={() => updateParams({ page: page - 1 })}
        >
          Prev
        </Button>

        <Button onClick={() => updateParams({ page: page + 1 })}>Next</Button>
      </div>

      {/* MODAL */}
      <DataModal
        open={openModal}
        onOpenChange={setOpenModal}
        columns={columns}
        initialData={editingRow}
        onSubmit={handleSave}
      />
    </div>
  );
}
