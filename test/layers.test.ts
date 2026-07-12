import { describe, it, expect } from "vitest";
import { LayerInfo, LayerValidationError, getAllLayerInfo, validateLayers} from '../src/config/layer-config';

interface LayerInfoOptions {
  id?: string;
  label?: string;
  desc?: string;
  color?: string;
  geospatial?: boolean;
  text?: boolean;
}

function createLayerInfo({ id = "test", label = "test", desc = "test", color = "#000000", geospatial = true, text = false }: LayerInfoOptions): LayerInfo {
  return { id, label, desc, color, geospatial, text };
}

describe("layer information", () => {
  describe("valid", () => {
    it("default values", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ }),
      ];
      validateLayers(layerInfo);
    });
    it("actual values", () => {
      const layerInfo: LayerInfo[] = getAllLayerInfo();
      validateLayers(layerInfo);
    });
  });
  
  describe("invalid", () => {
    it("duplicate id", () => {
      const id = "dupe";
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ id: id }),
        createLayerInfo({ id: id }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on duplicate id!").toBe(10);
      }
    });
    it("multiline label", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ label: "l1\nl2" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on multiline label!").toBe(21);
      }
    });
    it("short label", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ label: "" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid label length!").toBe(22);
      }
    });
    it("long label", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ label: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid label length!").toBe(22);
      }
    });
    it("short description", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ desc: "" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid description length!").toBe(30);
      }
    });
    it("long description", () => {
      let desc: string = "";
      for (let i = 0; i < 201; i++) { desc += "a"; }
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ desc: desc }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid description length!").toBe(30);
      }
    });
    it("short hexcode color", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ color: "#fffff" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid hex color!").toBe(40);
      }
    });
    it("no hexcode color (#)", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ color: "ffffff" }),
      ];

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid hex color!").toBe(40);
      }
    });
    it("no hexcode color (g)", () => {
      const layerInfo: LayerInfo[] = [
        createLayerInfo({ color: "#fffffg" }),
      ];
      const color = "#fffffg";
      const res = color.toLowerCase().match(/^0x[0-9a-f]+$/i);

      try {
        validateLayers(layerInfo);
        expect.fail("Expected LayerValidationError!");
      }
      catch (err) {
        expect(err).toBeInstanceOf(LayerValidationError);
        const valError = err as LayerValidationError;
        expect(valError.code(), "Wrong error code: Expected to fail on invalid hex color!").toBe(40);
      }
    });
  });
});
