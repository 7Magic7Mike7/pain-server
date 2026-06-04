import { DbConfig } from "./db-config";


// ######################################################################################
//        Layer Information
// ######################################################################################

export type LayerInfo = {
  id: string,             // the layer's unique identifier (e.g., for database queries)
  label: string,          // human-readable representation of the layer (one line, multiple words allowed)
  desc: string,           // human-readable description of the layer (multiple lines allowed)
  color: string,          // hex code of the color associated with the layer for visualization purposes
  geospatial: boolean,    // whether the layer's datapoints are based on geospatial coordinates or country codes
  text: boolean,          // whether the layer's datapoints have additional text associated with them
}

function emoLayer(): LayerInfo {
  return {
    id: DbConfig.PO_EMO,
    label: "Emotional Pain",
    desc: "todo",
    color: "#0000ff",
    geospatial: false,
    text: true
  };
}

function envLayer(): LayerInfo {
  return {
    id: DbConfig.PO_ENV,
    label: "Environmental Pain",
    desc: "todo",
    color: "#00ff00",
    geospatial: true,
    text: false
  }
}

function physLayer(): LayerInfo {
  return {
    id: DbConfig.PO_PHYS,
    label: "Physical Pain",
    desc: "todo",
    color: "#ff0000",
    geospatial: true,
    text: false
  }
}

function socioecoLayer(): LayerInfo {
  return {
    id: DbConfig.PO_SOCIOECO,
    label: "Socio-economical Pain",
    desc: "todo",
    color: "#ffff00",
    geospatial: false,
    text: false
  }
}

/**
 * 
 * @returns {@link LayerInfo} for every available layer
 */
export function getAllLayerInfo(): LayerInfo[] {
  return [
    emoLayer(),
    envLayer(),
    physLayer(),
    socioecoLayer(),
  ];
}


// ######################################################################################
//        Layer Validation
// ######################################################################################

const MAX_LABEL_LENGTH = 25;
const MAX_DESCRIPTION_LENGTH = 200;

export class LayerValidationError extends Error {
  private _layer: LayerInfo;
  constructor(layer: LayerInfo, msg: string) {
    super(msg);
    this._layer = layer;
    Object.setPrototypeOf(this, LayerValidationError.prototype);  // todo: do I need this?
  }

  layer(): LayerInfo {
    return this._layer;
  }
}

export function validateLayers(layers: LayerInfo[]) {
  const usedIds = new Set();
  for (const layer of layers) {
    const { id, label, desc, color } = layer;
    
    // 1) ids must be unique
    if (usedIds.has(id)) {
      throw new LayerValidationError(layer, `id=${id} already exists for another layer!`);
    }
    usedIds.add(id);

    // 2.1) labels must be single-line
    if (label.includes("\n")) {
      throw new LayerValidationError(layer, `label must not contain a new line!`);
    }
    // 2.2) labels must be between 1 and MAX_LABEL_LENGTH characters
    if (label.length <= 0 || MAX_LABEL_LENGTH < label.length) {
      throw new LayerValidationError(layer, `invalid label length: 1 <= ${label.length} <= ${MAX_LABEL_LENGTH} must be true!`);
    }

    // 3) descriptions must be between 1 and MAX_DESCRIPTION_LENGTH characters
    if (desc.length <= 0 || MAX_DESCRIPTION_LENGTH < desc.length) {
      throw new LayerValidationError(layer, `invalid description length: 1 <= ${desc.length} <= ${MAX_DESCRIPTION_LENGTH} must be true!`);
    }

    // 4) colors must be valid 6-digit hex codes
    if (color.length != 7 || Boolean(color.toLowerCase().match(/^0x[0-9a-f]+$/i))) {
      throw new LayerValidationError(layer, `color=${color} is not a supported hex format (e.g., "#FFFFFF")!`)
    }
  }
}
