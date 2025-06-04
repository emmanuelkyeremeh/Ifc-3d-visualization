import React, { useEffect, useRef, useState } from "react";
import * as WEBIFC from "web-ifc";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import ModelInfo from "./ModelInfo";
import "../styles/IfcViewer.css";

const IfcViewer = ({ ifcFile }) => {
  const sceneDataRef = useRef(null);
  const [activeTool, setActiveTool] = useState(null);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [model, setModel] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);

  useEffect(() => {
    const createScene = async () => {
      const container = document.getElementById("scene-container");
      if (!container) {
        console.error("Scene container not found");
        return null;
      }

      const components = new OBC.Components();
      const worlds = components.get(OBC.Worlds);
      const world = worlds.create();

      world.scene = new OBC.SimpleScene(components);
      world.renderer = new OBCF.PostproductionRenderer(components, container);
      world.camera = new OBC.OrthoPerspectiveCamera(components);

      try {
        await components.init();
        if (!world.scene.three) {
          throw new Error("Scene initialization failed");
        }
        world.scene.setup();
        world.renderer.postproduction.enabled = true;
        world.renderer.postproduction.customEffects.outlineEnabled = true;
        world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
      } catch (error) {
        console.error("Error initializing components or scene:", error);
        return null;
      }

      const grids = components.get(OBC.Grids);
      const grid = grids.create(world);
      grid.three.position.y -= 1;
      grid.config.color.setHex(0x666666);
      world.renderer.postproduction.customEffects.excludedMeshes.push(
        grid.three
      );

      const fragmentIfcLoader = components.get(OBC.IfcLoader);
      try {
        await fragmentIfcLoader.setup();
        fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
        const excludedCats = [
          WEBIFC.IFCTENDONANCHOR,
          WEBIFC.IFCREINFORCINGBAR,
          WEBIFC.IFCREINFORCINGELEMENT,
        ];
        for (const cat of excludedCats) {
          fragmentIfcLoader.settings.excludedCategories.add(cat);
        }
      } catch (error) {
        console.error("Error setting up IFC loader:", error);
        return null;
      }

      const workerUrl = "/worker.mjs";
      const fragments = new FRAGS.FragmentsModels(workerUrl);

      world.camera.controls.addEventListener("rest", () =>
        fragments.update(true)
      );
      world.camera.controls.addEventListener("update", () =>
        fragments.update()
      );

      fragments.models.list.onItemSet.add(({ value: loadedModel }) => {
        if (world.scene.three) {
          loadedModel.useCamera(world.camera.three);
          world.scene.three.add(loadedModel.object);
          world.meshes.add(loadedModel.object);
        }
      });

      return {
        world,
        fragmentIfcLoader,
        components,
        container,
        fragments,
      };
    };

    const loadIfcFile = async (ifcFile) => {
      try {
        const data = await ifcFile.arrayBuffer();
        const buffer = new Uint8Array(data);
        const sceneData = await createScene();
        if (!sceneData) {
          console.error("Failed to create scene");
          return;
        }
        sceneDataRef.current = sceneData;

        const { world, fragments } = sceneData;

        if (!world.scene.three) {
          console.error("Scene not initialized, cannot load model");
          return;
        }

        const serializer = new FRAGS.IfcImporter();
        serializer.wasm = {
          absolute: true,
          path: "https://unpkg.com/web-ifc@0.0.68/",
        };
        const fragmentBytes = await serializer.process({ bytes: buffer });
        if (!fragmentBytes) {
          console.error("Failed to convert IFC to fragments");
          return;
        }

        try {
          const Model = await fragments.load(fragmentBytes, {
            modelId: "ifc_bim",
          });
          setModel(Model);
          console.log("model created and added to scene:", Model);
        } catch (error) {
          console.error("model:", error);
        }
      } catch (error) {
        console.error("Error loading IFC file:", error);
      }
    };

    if (ifcFile) {
      loadIfcFile(ifcFile);
    }

    return () => {
      if (sceneDataRef.current) {
        const { components, world, fragments } = sceneDataRef.current;
        try {
          components?.dispose();
          if (fragments) {
            try {
              fragments.dispose();
            } catch (err) {
              console.error("Error disposing fragments:", err);
            }
          }
          if (world?.scene?.three) {
            world.scene.three.traverse((object) => {
              if (object.geometry) object.geometry.dispose();
              if (object.material) object.material.dispose();
            });
          }
        } catch (error) {
          console.error("Error during cleanup:", error);
        }
        sceneDataRef.current = null;
        console.log("Scene resources disposed.");
      }
    };
  }, [ifcFile]);

  useEffect(() => {
    if (!sceneDataRef.current || !model) return;

    const { world, fragments, container } = sceneDataRef.current;
    if (!world.renderer || !world.scene?.three) {
      console.error("World is not properly initialized");
      return;
    }

    const highlightMaterial = {
      color: new THREE.Color("gold"),
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    };

    let localId = null;

    const highlight = async () => {
      if (!localId || !model) return;
      try {
        await model.highlight([localId], highlightMaterial);
      } catch (error) {
        console.error("Error highlighting element:", error);
      }
    };

    const resetHighlight = async () => {
      if (!localId || !model) return;
      try {
        await model.resetHighlight([localId]);
      } catch (error) {
        console.error("Error resetting highlight:", error);
      }
    };

    const getName = async () => {
      if (!localId || !model) return null;
      try {
        const [data] = await model.getItemsData([localId], {
          attributesDefault: false,
          attributes: ["Name"],
        });
        const Name = data?.Name;
        if (!(Name && "value" in Name)) return "Unnamed Element";
        return Name.value || "Unnamed Element";
      } catch (error) {
        console.error("Error getting element name:", error);
        return "Unnamed Element";
      }
    };

    const getAttributes = async () => {
      if (!localId || !model) return null;
      try {
        const [data] = await model.getItemsData([localId], {
          attributesDefault: true,
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
            DefinesOccurrence: { attributes: false, relations: false },
          },
        });
        const formatPsets = (rawPsets) => {
          if (!rawPsets || !Array.isArray(rawPsets)) return {};
          const result = {};
          for (const pset of rawPsets) {
            const { Name: psetName, HasProperties } = pset;
            if (!("value" in psetName && Array.isArray(HasProperties)))
              continue;
            const props = {};
            for (const prop of HasProperties) {
              const { Name, NominalValue } = prop;
              if (!("value" in Name && "value" in NominalValue)) continue;
              const name = Name.value;
              const nominalValue = NominalValue.value;
              if (name && nominalValue !== undefined) {
                props[name] = nominalValue;
              }
            }
            result[psetName.value] = props;
          }
          return result;
        };
        const formattedData = {
          attributes: data,
          propertySets: formatPsets(data.IsDefinedBy),
        };
        console.log(
          "Selected element attributes and property sets:",
          formattedData
        );
        return formattedData;
      } catch (error) {
        console.error("Error getting element attributes:", error);
        return null;
      }
    };

    const handleClick = async (event) => {
      if (activeTool !== "modelinfo" || !model) return;
      const mouse = new THREE.Vector2();
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      try {
        const result = await model.raycast({
          camera: world.camera.three,
          mouse,
          dom: world.renderer.three.domElement,
        });
        const promises = [];
        if (result && result.localId !== null) {
          promises.push(resetHighlight());
          localId = result.localId;
          const name = await getName();
          await getAttributes();
          console.log("Selected element:", { localId, name });
          setSelectedElement({ localId, name });
          promises.push(highlight());
        } else {
          promises.push(resetHighlight());
          localId = null;
          setSelectedElement(null);
        }
        await Promise.all(promises);
      } catch (error) {
        console.error("Error during raycasting:", error);
        setSelectedElement(null);
      }
    };

    if (activeTool === "modelinfo") {
      container.addEventListener("click", handleClick);
    }

    return () => {
      container.removeEventListener("click", handleClick);
      resetHighlight();
      localId = null;
      setSelectedElement(null);
    };
  }, [model, activeTool]);

  useEffect(() => {
    if (!sceneDataRef.current) return;

    if (activeTool === "modelinfo") {
      setShowModelInfo(true);
    } else {
      setShowModelInfo(false);
    }
  }, [activeTool]);

  return (
    <div className="viewer-container">
      <div className="controls">
        <button
          onClick={() =>
            setActiveTool(activeTool === "modelinfo" ? null : "modelinfo")
          }
          className={`control-button ${
            activeTool === "modelinfo" ? "active" : ""
          }`}
        >
          <InformationCircleIcon className="icon" />
          Model Info
        </button>
      </div>
      <div className="scene-wrapper">
        <div id="scene-container" className="scene-container">
          {activeTool === "modelinfo" && (
            <div className="tool-instructions">
              <div className="font-bold">Model Info Active</div>
              <div>• Click an element to view its name</div>
              <div>• Click elsewhere to clear selection</div>
            </div>
          )}
        </div>
        {showModelInfo && model && (
          <ModelInfo
            selectedElement={selectedElement}
            onExit={() => setActiveTool(null)}
          />
        )}
      </div>
    </div>
  );
};

export default IfcViewer;
