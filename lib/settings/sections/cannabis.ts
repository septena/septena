/**
 * Cannabis strains config def. Wires the canonical strain list to the
 * generic <SectionConfigEditor>.
 */

import {
  addCannabisStrain,
  deleteCannabisStrain,
  getCannabisConfig,
  updateCannabisStrain,
} from "@/lib/api";
import { group, stringField } from "../schema";
import { defineSectionConfig } from "../section-config";

interface Strain {
  id: string;
  name: string;
}

const strainItemSchema = group("Strain", {
  name: stringField({ label: "Name", placeholder: "Strain name", width: "wide", default: "" }),
});

export const cannabisStrainsDef = defineSectionConfig<Strain>({
  swrKey: "cannabis-config",
  fetcher: getCannabisConfig,
  selectItems: (data) => (data as { strains: Strain[] }).strains ?? [],
  add: ({ name }) => addCannabisStrain(name ?? "New strain"),
  update: (id, patch) => updateCannabisStrain(id, String(patch.name ?? "")),
  remove: (id) => deleteCannabisStrain(id),
  itemSchema: strainItemSchema,
  emptyLabel: "No strains yet.",
  addLabel: "strain",
  defaultNewItem: () => ({ name: "New strain" }),
});
