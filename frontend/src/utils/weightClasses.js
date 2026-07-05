export const WEIGHT_CLASS_DATA = [
  { name: "Strawweight",         kg_val: 47.6, lbs_val: 105,  kg_str: "≤47.6kg",  lbs_str: "≤105lbs"  },
  { name: "Light Flyweight",     kg_val: 49.0, lbs_val: 108,  kg_str: "≤49kg",    lbs_str: "≤108lbs"  },
  { name: "Flyweight",           kg_val: 50.8, lbs_val: 112,  kg_str: "≤51kg",    lbs_str: "≤112lbs"  },
  { name: "Super Flyweight",     kg_val: 52.2, lbs_val: 115,  kg_str: "≤52kg",    lbs_str: "≤115lbs"  },
  { name: "Bantamweight",        kg_val: 53.5, lbs_val: 118,  kg_str: "≤53.5kg",  lbs_str: "≤118lbs"  },
  { name: "Super Bantamweight",  kg_val: 55.3, lbs_val: 122,  kg_str: "≤55kg",    lbs_str: "≤122lbs"  },
  { name: "Featherweight",       kg_val: 57.2, lbs_val: 126,  kg_str: "≤57kg",    lbs_str: "≤126lbs"  },
  { name: "Super Featherweight", kg_val: 59.0, lbs_val: 130,  kg_str: "≤59kg",    lbs_str: "≤130lbs"  },
  { name: "Lightweight",         kg_val: 61.2, lbs_val: 135,  kg_str: "≤61kg",    lbs_str: "≤135lbs"  },
  { name: "Super Lightweight",   kg_val: 63.5, lbs_val: 140,  kg_str: "≤63.5kg",  lbs_str: "≤140lbs"  },
  { name: "Welterweight",        kg_val: 66.7, lbs_val: 147,  kg_str: "≤67kg",    lbs_str: "≤147lbs"  },
  { name: "Super Welterweight",  kg_val: 69.9, lbs_val: 154,  kg_str: "≤70kg",    lbs_str: "≤154lbs"  },
  { name: "Middleweight",        kg_val: 72.6, lbs_val: 160,  kg_str: "≤73kg",    lbs_str: "≤160lbs"  },
  { name: "Super Middleweight",  kg_val: 76.2, lbs_val: 168,  kg_str: "≤76kg",    lbs_str: "≤168lbs"  },
  { name: "Light Heavyweight",   kg_val: 79.4, lbs_val: 175,  kg_str: "≤79kg",    lbs_str: "≤175lbs"  },
  { name: "Cruiserweight",       kg_val: 90.7, lbs_val: 200,  kg_str: "≤91kg",    lbs_str: "≤200lbs"  },
  { name: "Heavyweight",         kg_val: null, lbs_val: null, kg_str: "91+kg",    lbs_str: "200+lbs"  },
  { name: "Super Heavyweight",   kg_val: null, lbs_val: null, kg_str: null,        lbs_str: null       },
];

// Returns "Flyweight (≤51kg)" or "Flyweight (≤112lbs)" based on unit preference
export function formatWeightClass(name, unit = "kg") {
  if (!name || name === "All") return name;
  const entry = WEIGHT_CLASS_DATA.find(
    (w) => w.name.toLowerCase() === name.toLowerCase()
  );
  if (!entry) return name;
  const suffix = unit === "lbs" ? entry.lbs_str : entry.kg_str;
  return suffix ? `${name} (${suffix})` : name;
}

// Returns just the numeric weight string for badge display: "51kg" or "112lbs"
export function weightBadge(name, unit = "kg") {
  if (!name) return null;
  const entry = WEIGHT_CLASS_DATA.find(
    (w) => w.name.toLowerCase() === name.toLowerCase()
  );
  if (!entry) return null;
  return unit === "lbs" ? entry.lbs_str : entry.kg_str;
}

export function getWeightUnit(user) {
  return user?.weight_unit || "kg";
}
