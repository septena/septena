/**
 * Caffeine beans config def. Same shape as cannabis strains — both are
 * lists of named presets — so they share the abstraction.
 */

import {
  addCaffeineBean,
  deleteCaffeineBean,
  getCaffeineConfig,
  updateCaffeineBean,
} from "@/lib/api";
import { group, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

interface Bean {
  id: string;
  name: string;
}

const beanItemSchema = group("Bean", {
  name: stringField({ label: "Name", placeholder: "Bean / coffee name", width: "wide", default: "" }),
});

export const caffeineBeansDef = defineSectionConfig<Bean>({
  swrKey: "caffeine-config",
  fetcher: getCaffeineConfig,
  selectItems: (data) => (data as { beans: Bean[] }).beans ?? [],
  add: ({ name }) => addCaffeineBean(name ?? "New beans"),
  update: (id, patch) => updateCaffeineBean(id, String(patch.name ?? "")),
  remove: (id) => deleteCaffeineBean(id),
  itemSchema: beanItemSchema,
  emptyLabel: "No bean presets yet.",
  addLabel: "beans",
  defaultNewItem: () => ({ name: "New beans" }),
});
