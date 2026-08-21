import { PainDbConfig } from "./db-config";
import { ServerConfig } from "./server-config";


// ######################################################################################
//        Layer Information
// ######################################################################################
export const EXPERIMENTAL_LAYER_PREFIX = "Ex_";

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
    id: PainDbConfig.TN_EMO,
    label: "Emotional Pain",
    desc: "todo",
    color: "#0000ff",
    geospatial: false,
    text: true
  };
}

function envLayer(): LayerInfo {
  return {
    id: PainDbConfig.TN_ENV,
    label: "Environmental Pain",
    desc: "todo",
    color: "#00ff00",
    geospatial: true,
    text: false
  }
}

function physLayer(): LayerInfo {
  return {
    id: PainDbConfig.TN_PHYS,
    label: "Physical Pain",
    desc: "todo",
    color: "#ff0000",
    geospatial: true,
    text: false
  }
}

function socioecoLayer(): LayerInfo {
  return {
    id: PainDbConfig.TN_SOCIOECO,
    label: "Socio-economic Pain",
    desc: "todo",
    color: "#ffff00",
    geospatial: false,
    text: false
  }
}

function experimentalLayers(): LayerInfo[] {
  const layers = [
    {
      id: "Aggr1",
      label: "Aggregation Area 18x36",
      desc: "aggregation with coordinate based on area center",
      color: "#5adb2f",
      geospatial: true,
      text: false
    }
    // --------------------------- 18x36
    /*
    {
      id: "Aggr_18x36 area-centric",
      label: "Aggregation Area 18x36",
      desc: "aggregation with coordinate based on area center",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_18x36 data-mid-centric",
      label: "Aggregation Mid 18x36",
      desc: "aggregation with coordinate based on data points' middle",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_18x36 weighted-mid-centric",
      label: "Aggregation Weighted 18x36",
      desc: "aggregation with coordinate based on the weighted middle of the data points",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_18x36 data-max-centric",
      label: "Aggregation Max 18x36",
      desc: "aggregation with coordinate based on the coordinate of the data point with the highest value",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    // --------------------------- 36x72
    {
      id: "Aggr_36x72 area-centric",
      label: "Aggregation Area 36x72",
      desc: "aggregation with coordinate based on area center",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_36x72 data-mid-centric",
      label: "Aggregation Mid 36x72",
      desc: "aggregation with coordinate based on data points' middle",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_36x72 weighted-mid-centric",
      label: "Aggregation Weighted 36x72",
      desc: "aggregation with coordinate based on the weighted middle of the data points",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_36x72 data-max-centric",
      label: "Aggregation Max 36x72",
      desc: "aggregation with coordinate based on the coordinate of the data point with the highest value",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    // --------------------------- Details
    {
      id: "Aggr_36x18_details",
      label: "Details 36x18",
      desc: "some detailed points form 18x36 aggregation",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    {
      id: "Aggr_72x36_details",
      label: "Details 72x36",
      desc: "some detailed points from 36x72 aggregation",
      color: "#5adb2f",
      geospatial: true,
      text: false
    },
    */
  ];
  layers.forEach((val) => val.id = `${EXPERIMENTAL_LAYER_PREFIX}${val.id}`);
  return layers;
}

/**
 * 
 * @returns {@link LayerInfo} for every available layer
 */
export function getAllLayerInfo(): LayerInfo[] {
  const layers = [
    emoLayer(),
    envLayer(),
    physLayer(),
    socioecoLayer(),
  ];
  if (ServerConfig.DEV_MODE) {
    experimentalLayers().forEach(l => layers.push(l));
  }
  return layers;
}


// ######################################################################################
//        Layer Validation
// ######################################################################################

const MAX_LABEL_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

export class LayerValidationError extends Error {
  private _layer: LayerInfo;
  private _code: number;

  constructor(layer: LayerInfo, code: number, msg: string) {
    super(msg);
    this._layer = layer;
    this._code = code;
    Object.setPrototypeOf(this, LayerValidationError.prototype);  // todo: do I need this?
  }

  layer(): LayerInfo {
    return this._layer;
  }

  code(): number {
    return this._code;
  }
}

export function validateLayers(layers: LayerInfo[]) {
  const usedIds = new Set();
  for (const layer of layers) {
    const { id, label, desc, color } = layer;
    
    // 1) ids must be unique
    if (usedIds.has(id)) {
      throw new LayerValidationError(layer, 10, `id=${id} already exists for another layer!`);
    }
    usedIds.add(id);

    // 2.1) labels must be single-line
    if (label.includes("\n")) {
      throw new LayerValidationError(layer, 21, `label must not contain a new line!`);
    }
    // 2.2) labels must be between 1 and MAX_LABEL_LENGTH characters
    if (label.length <= 0 || MAX_LABEL_LENGTH < label.length) {
      throw new LayerValidationError(layer, 22, `invalid label length: 1 <= ${label.length} <= ${MAX_LABEL_LENGTH} must be true!`);
    }

    // 3) descriptions must be between 1 and MAX_DESCRIPTION_LENGTH characters
    if (desc.length <= 0 || MAX_DESCRIPTION_LENGTH < desc.length) {
      throw new LayerValidationError(layer, 30, `invalid description length: 1 <= ${desc.length} <= ${MAX_DESCRIPTION_LENGTH} must be true!`);
    }

    // 4) colors must be valid 6-digit hex codes
    if (color.length != 7 || color.match(/^#[\da-f]+$/i) === null) {
      throw new LayerValidationError(layer, 40, `color=${color} is not a supported hex format (e.g., "#FFFFFF")!`)
    }
  }
}

/**
 * 
 * @param painOrigin 
 * @returns whether the painOrigin belongs to an experimental layer or not
 * @throws Error if an experimental layer is checked outside of DEV_MODE
 */
export function isExperimentalLayer(painOrigin: string): boolean {
  const result = painOrigin.startsWith(EXPERIMENTAL_LAYER_PREFIX)
  if (result && !ServerConfig.DEV_MODE) {
    throw new Error("Experimental Layers are only allowed during development!")
  }
  return result;
}
