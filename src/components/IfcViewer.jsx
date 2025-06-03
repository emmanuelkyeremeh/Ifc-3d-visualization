import React, { useEffect, useRef, useState } from "react";
import * as WEBIFC from "web-ifc";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import {
  ArrowUpIcon,
  ArrowsUpDownIcon,
  Square3Stack3DIcon,
  Square2StackIcon,
  DocumentMagnifyingGlassIcon,
  ArrowTrendingUpIcon,
  ArrowsPointingOutIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import ModelInfo from "./ModelInfo";
import "../styles/IfcViewer.css";

const IfcViewer = ({ ifcFile }) => {
  const sceneDataRef = useRef(null);
  const anglesRef = useRef(null);
  const lineRef = useRef(null);
  const areaRef = useRef(null);
  const edgeRef = useRef(null);
  const faceRef = useRef(null);
  const lengthRef = useRef(null);
  const highlighterRef = useRef(null);
  const fragmentsRef = useRef(null);
  const cleanupRef = useRef(null);
  const [activeTool, setActiveTool] = useState(null);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [model, setModel] = useState(null);
  const [fragmentsModel, setFragmentsModel] = useState(null);
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

      const fragments = components.get(OBC.FragmentsManager);
      fragmentsRef.current = fragments;

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
      const fragmentsModels = new FRAGS.FragmentsModels(workerUrl);

      world.camera.controls.addEventListener("rest", () =>
        fragmentsModels.update(true)
      );
      world.camera.controls.addEventListener("update", () =>
        fragmentsModels.update()
      );

      fragmentsModels.models.list.onItemSet.add(({ value: loadedModel }) => {
        if (world.scene.three) {
          loadedModel.useCamera(world.camera.three);
          world.scene.three.add(loadedModel.object);
          world.meshes.add(loadedModel.object);
        }
      });

      return {
        world,
        fragments,
        fragmentIfcLoader,
        components,
        container,
        fragmentsModels,
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

        const { world, fragments, fragmentIfcLoader, fragmentsModels } =
          sceneData;

        if (!world.scene.three) {
          console.error("Scene not initialized, cannot load model");
          return;
        }

        const loadedModel = await fragmentIfcLoader.load(buffer);
        loadedModel.name = "ifc_bim";
        world.scene.three.add(loadedModel);
        world.meshes.add(loadedModel);
        setModel(loadedModel);
        console.log("IFC model loaded:", loadedModel);

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
          const fragmentsModel = await fragmentsModels.load(fragmentBytes, {
            modelId: "ifc_bim",
          });
          setFragmentsModel(fragmentsModel);
          console.log(
            "Fragments model created and added to scene:",
            fragmentsModel
          );
        } catch (error) {
          console.error("Error creating fragments model:", error);
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
        const { components, world, fragmentsModels } = sceneDataRef.current;
        try {
          components?.dispose();
          if (fragmentsModels) {
            try {
              fragmentsModels.dispose();
            } catch (err) {
              console.error("Error disposing fragmentsModels:", err);
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
    if (!sceneDataRef.current || !model || !fragmentsModel) return;

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
      if (!localId || !fragmentsModel) return;
      try {
        await fragmentsModel.highlight([localId], highlightMaterial);
      } catch (error) {
        console.error("Error highlighting element:", error);
      }
    };

    const resetHighlight = async () => {
      if (!localId || !fragmentsModel) return;
      try {
        await fragmentsModel.resetHighlight([localId]);
      } catch (error) {
        console.error("Error resetting highlight:", error);
      }
    };

    const getName = async () => {
      if (!localId || !fragmentsModel) return null;
      try {
        const [data] = await fragmentsModel.getItemsData([localId], {
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
      if (!localId || !fragmentsModel) return null;
      try {
        const [data] = await fragmentsModel.getItemsData([localId], {
          attributesDefault: true, // Get all attributes
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
            DefinesOccurrence: { attributes: false, relations: false },
          },
        });
        // Format property sets for better readability
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
      if (activeTool !== "modelinfo" || !fragmentsModel) return;
      const mouse = new THREE.Vector2();
      // Calculate mouse coordinates as per the tutorial
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      try {
        const result = await fragmentsModel.raycast({
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
      resetHighlight(); // Clear highlight on cleanup
      localId = null;
      setSelectedElement(null);
    };
  }, [model, fragmentsModel, activeTool]);

  const setupAngleMeasurement = (world, components, container) => {
    try {
      const angles = components.get(OBCF.AngleMeasurement);
      angles.world = world;
      if (angles.config) angles.config.snapDistance = 25;
      angles.enabled = true;
      anglesRef.current = angles;

      const handleDoubleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (angles.enabled && angles.world) {
          try {
            angles.create();
          } catch (error) {
            console.error("Error creating angle measurement:", error);
          }
        }
      };

      const onKeyDown = (event) => {
        if (event.code === "Delete" || event.code === "Backspace") {
          try {
            angles.deleteAll();
          } catch (error) {
            console.error("Error deleting angles:", error);
          }
        }
      };

      container.addEventListener("dblclick", handleDoubleClick, true);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        angles.enabled = false;
        angles.deleteAll();
        container.removeEventListener("dblclick", handleDoubleClick, true);
        window.removeEventListener("keydown", onKeyDown);
      };
    } catch (error) {
      console.error("Error setting up angle measurement:", error);
      return () => {};
    }
  };

  const setupLineMeasurement = (world, components, model) => {
    try {
      const measurements = components.get(OBC.MeasurementUtils);
      const casters = components.get(OBC.Raycasters);
      const caster = casters.get(world);
      let line = null;

      const canvas = world.renderer.three.domElement;

      const onPointerMove = () => {
        try {
          const result = caster.castRay([model]);
          if (
            !result ||
            !(result.object instanceof THREE.Mesh) ||
            result.faceIndex === undefined
          ) {
            return;
          }

          const face = measurements.getFace(
            result.object,
            result.faceIndex,
            result.instanceId
          );
          if (face) {
            const points = [];
            for (const edge of face.edges) {
              points.push(...edge.points);
            }

            if (line) {
              line.geometry.dispose();
              line.material.dispose();
              world.scene.three.remove(line);
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
              color: 0xff0000,
              depthTest: false,
            });

            line = new THREE.LineSegments(geometry, material);
            world.scene.three.add(line);
            lineRef.current = line;
          }
        } catch (error) {
          console.error("Error during line measurement raycast:", error);
        }
      };

      canvas.addEventListener("pointermove", onPointerMove);

      return () => {
        if (line) {
          line.geometry.dispose();
          line.material.dispose();
          world.scene.three.remove(line);
        }
        canvas.removeEventListener("pointermove", onPointerMove);
      };
    } catch (error) {
      console.error("Error setting up line measurement:", error);
      return () => {};
    }
  };

  const setupAreaMeasurement = (world, components, container) => {
    try {
      const areaDims = components.get(OBCF.AreaMeasurement);
      areaDims.world = world;
      if (areaDims.config) areaDims.config.snapDistance = 25;
      areaDims.enabled = true;
      areaRef.current = areaDims;

      let isCreating = false;
      let clickTimeout = null;

      const handleDoubleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (clickTimeout) clearTimeout(clickTimeout);
        if (!isCreating) {
          if (areaDims.enabled && areaDims.world) {
            try {
              areaDims.create();
              isCreating = true;
            } catch (error) {
              console.error("Error creating area measurement:", error);
            }
          }
        }
      };

      const handleClick = (event) => {
        if (event.detail === 2) return;
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          if (isCreating && event.detail === 1) {
            // Handle single click during creation if needed
          }
          clickTimeout = null;
        }, 200);
      };

      const handleRightClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isCreating) {
          try {
            if (areaDims.endCreation) areaDims.endCreation();
            else if (areaDims.finish) areaDims.finish();
            else if (areaDims.complete) areaDims.complete();
            isCreating = false;
          } catch (error) {
            console.error("Error ending area measurement:", error);
          }
        }
      };

      const onKeyDown = (event) => {
        try {
          if (event.code === "Delete" || event.code === "Backspace") {
            areaDims.deleteAll();
            isCreating = false;
          } else if (event.code === "Escape" && isCreating) {
            if (areaDims.cancel) areaDims.cancel();
            else if (areaDims.endCreation) areaDims.endCreation();
            isCreating = false;
          } else if (event.code === "Enter" && isCreating) {
            if (areaDims.endCreation) areaDims.endCreation();
            else if (areaDims.finish) areaDims.finish();
            isCreating = false;
          }
        } catch (error) {
          console.error("Error handling area measurement keydown:", error);
        }
      };

      container.addEventListener("dblclick", handleDoubleClick, true);
      container.addEventListener("click", handleClick, true);
      container.addEventListener("contextmenu", handleRightClick, true);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        if (clickTimeout) clearTimeout(clickTimeout);
        areaDims.enabled = false;
        areaDims.deleteAll();
        container.removeEventListener("dblclick", handleDoubleClick, true);
        container.removeEventListener("click", handleClick, true);
        container.removeEventListener("contextmenu", handleRightClick, true);
        window.removeEventListener("keydown", onKeyDown);
      };
    } catch (error) {
      console.error("Error setting up area measurement:", error);
      return () => {};
    }
  };

  const setupEdgeMeasurement = (world, components, container) => {
    try {
      const edges = components.get(OBCF.EdgeMeasurement);
      edges.world = world;
      if (edges.config) edges.config.snapDistance = 25;
      edges.enabled = true;
      edgeRef.current = edges;

      const handleDoubleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (edges.enabled && edges.world) {
          try {
            edges.create();
          } catch (error) {
            console.error("Error creating edge measurement:", error);
          }
        }
      };

      const onKeyDown = (event) => {
        if (event.code === "Delete" || event.code === "Backspace") {
          try {
            edges.deleteAll();
          } catch (error) {
            console.error("Error deleting edges:", error);
          }
        }
      };

      container.addEventListener("dblclick", handleDoubleClick, true);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        edges.enabled = false;
        edges.deleteAll();
        container.removeEventListener("dblclick", handleDoubleClick, true);
        window.removeEventListener("keydown", onKeyDown);
      };
    } catch (error) {
      console.error("Error setting up edge measurement:", error);
      return () => {};
    }
  };

  const setupFaceMeasurement = (world, components, container) => {
    try {
      const faces = components.get(OBCF.FaceMeasurement);
      faces.world = world;
      if (faces.config) faces.config.snapDistance = 25;
      faces.enabled = true;
      faceRef.current = faces;

      const handleDoubleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (faces.enabled && faces.world) {
          try {
            faces.create();
          } catch (error) {
            console.error("Error creating face measurement:", error);
          }
        }
      };

      const onKeyDown = (event) => {
        if (event.code === "Delete" || event.code === "Backspace") {
          try {
            faces.deleteAll();
          } catch (error) {
            console.error("Error deleting faces:", error);
          }
        }
      };

      container.addEventListener("dblclick", handleDoubleClick, true);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        faces.enabled = false;
        faces.deleteAll();
        container.removeEventListener("dblclick", handleDoubleClick, true);
        window.removeEventListener("keydown", onKeyDown);
      };
    } catch (error) {
      console.error("Error setting up face measurement:", error);
      return () => {};
    }
  };

  const setupLengthMeasurement = (world, components, container) => {
    try {
      const lengths = components.get(OBCF.LengthMeasurement);
      lengths.world = world;
      if (lengths.config) lengths.config.snapDistance = 1;
      lengths.enabled = true;
      lengthRef.current = lengths;

      const handleDoubleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (lengths.enabled && lengths.world) {
          try {
            lengths.create();
          } catch (error) {
            console.error("Error creating length measurement:", error);
          }
        }
      };

      const onKeyDown = (event) => {
        if (event.code === "Delete" || event.code === "Backspace") {
          try {
            lengths.delete();
          } catch (error) {
            console.error("Error deleting lengths:", error);
          }
        }
      };

      container.addEventListener("dblclick", handleDoubleClick, true);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        lengths.enabled = false;
        lengths.delete();
        container.removeEventListener("dblclick", handleDoubleClick, true);
        window.removeEventListener("keydown", onKeyDown);
      };
    } catch (error) {
      console.error("Error setting up length measurement:", error);
      return () => {};
    }
  };

  const setupHighlighter = (world, components, container) => {
    try {
      const highlighter = components.get(OBCF.Highlighter);
      highlighter.setup({ world });
      highlighter.zoomToSelection = true;
      highlighterRef.current = highlighter;

      const outliner = components.get(OBCF.Outliner);
      outliner.world = world;
      outliner.enabled = true;

      const handleClick = async (event) => {
        try {
          const result = await highlighter.highlight(event);
          if (result && result.expressID) {
            console.log("Selected element with Express ID:", result.expressID);
            console.log("Element data:", result);
          }
        } catch (error) {
          console.error("Error highlighting element:", error);
        }
      };

      container.addEventListener("click", handleClick);

      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0xbcf124,
        transparent: true,
        opacity: 0.5,
      });

      if (!outliner.selections.has("selection")) {
        outliner.create("selection", outlineMaterial);
      }

      highlighter.events.select.onHighlight.add((data) => {
        console.log("Highlighter data:", data);
        outliner.clear("selection");
        outliner.add("selection", data);
      });

      highlighter.events.select.onClear.add(() => {
        outliner.clear("selection");
      });

      return () => {
        container.removeEventListener("click", handleClick);
        highlighter.enabled = false;
        outliner.enabled = false;
        outliner.clear("selection");
        if (outlineMaterial?.dispose) outlineMaterial.dispose();
      };
    } catch (error) {
      console.error("Error setting up highlighter:", error);
      return () => {};
    }
  };

  useEffect(() => {
    if (!sceneDataRef.current) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!activeTool) {
      if (highlighterRef.current) {
        highlighterRef.current.enabled = false;
      }
      return;
    }

    const { world, components, container } = sceneDataRef.current;
    if (!world.renderer || !world.scene?.three) {
      console.error("World is not properly initialized for tool setup");
      return;
    }

    const currentModel = model || world.scene.three.getObjectByName("ifc_bim");

    const setupTool = () => {
      if (activeTool === "angle") {
        cleanupRef.current = setupAngleMeasurement(
          world,
          components,
          container
        );
      } else if (activeTool === "line" && currentModel) {
        cleanupRef.current = setupLineMeasurement(
          world,
          components,
          currentModel
        );
      } else if (activeTool === "area") {
        cleanupRef.current = setupAreaMeasurement(world, components, container);
      } else if (activeTool === "edge") {
        cleanupRef.current = setupEdgeMeasurement(world, components, container);
      } else if (activeTool === "face") {
        cleanupRef.current = setupFaceMeasurement(world, components, container);
      } else if (activeTool === "length") {
        cleanupRef.current = setupLengthMeasurement(
          world,
          components,
          container
        );
      } else if (activeTool === "highlighter") {
        cleanupRef.current = setupHighlighter(world, components, container);
      } else if (activeTool === "modelinfo") {
        setShowModelInfo(true);
      }
    };

    if (
      currentModel ||
      [
        "angle",
        "area",
        "edge",
        "face",
        "length",
        "highlighter",
        "modelinfo",
      ].includes(activeTool)
    ) {
      setTimeout(setupTool, 500);
    } else {
      const checkModel = () => {
        const loadedModel = world.scene.three.getObjectByName("ifc_bim");
        if (loadedModel) {
          clearInterval(checkModelInterval);
          setModel(loadedModel);
          setTimeout(setupTool, 500);
        }
      };

      const checkModelInterval = setInterval(checkModel, 100);

      return () => {
        clearInterval(checkModelInterval);
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
      };
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      setShowModelInfo(false);
      if (highlighterRef.current) {
        highlighterRef.current.enabled = false;
      }
    };
  }, [activeTool, model, fragmentsModel]);

  return (
    <div className="viewer-container">
      <div className="controls">
        <button
          onClick={() => setActiveTool(activeTool === "angle" ? null : "angle")}
          className={`control-button ${activeTool === "angle" ? "active" : ""}`}
        >
          <ArrowUpIcon className="icon" />
          Angle
        </button>
        <button
          onClick={() => setActiveTool(activeTool === "line" ? null : "line")}
          className={`control-button ${activeTool === "line" ? "active" : ""}`}
        >
          <ArrowsUpDownIcon className="icon" />
          Line
        </button>
        <button
          onClick={() => setActiveTool(activeTool === "area" ? null : "area")}
          className={`control-button ${activeTool === "area" ? "active" : ""}`}
        >
          <Square3Stack3DIcon className="icon" />
          Area
        </button>
        <button
          onClick={() => setActiveTool(activeTool === "edge" ? null : "edge")}
          className={`control-button ${activeTool === "edge" ? "active" : ""}`}
        >
          <Square2StackIcon className="icon" />
          Edge
        </button>
        <button
          onClick={() => setActiveTool(activeTool === "face" ? null : "face")}
          className={`control-button ${activeTool === "face" ? "active" : ""}`}
        >
          <DocumentMagnifyingGlassIcon className="icon" />
          Face
        </button>
        <button
          onClick={() =>
            setActiveTool(activeTool === "length" ? null : "length")
          }
          className={`control-button ${
            activeTool === "length" ? "active" : ""
          }`}
        >
          <ArrowTrendingUpIcon className="icon" />
          Length
        </button>
        <button
          onClick={() =>
            setActiveTool(activeTool === "highlighter" ? null : "highlighter")
          }
          className={`control-button ${
            activeTool === "highlighter" ? "active" : ""
          }`}
        >
          <ArrowsPointingOutIcon className="icon" />
          Highlighter
        </button>
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
          {activeTool && (
            <div className="tool-instructions">
              {activeTool === "angle" && (
                <div>
                  <div className="font-bold">Angle Tool Active</div>
                  <div>• Double-click to start angle measurement</div>
                  <div>• Click 3 points to complete</div>
                  <div>• DEL to delete all angles</div>
                </div>
              )}
              {activeTool === "area" && (
                <div>
                  <div className="font-bold">Area Tool Active</div>
                  <div>• Double-click to start area measurement</div>
                  <div>• Single-click to add points</div>
                  <div>• Right-click or Enter to finish area</div>
                  <div>• ESC to cancel, DEL to delete all</div>
                </div>
              )}
              {activeTool === "line" && (
                <div>
                  <div className="font-bold">Line Tool Active</div>
                  <div>• Move mouse over model faces</div>
                </div>
              )}
              {activeTool === "edge" && (
                <div>
                  <div className="font-bold">Edge Tool Active</div>
                  <div>• Double-click to create edge measurement</div>
                  <div>• DEL to delete all edges</div>
                </div>
              )}
              {activeTool === "face" && (
                <div>
                  <div className="font-bold">Face Tool Active</div>
                  <div>• Double-click to create face measurement</div>
                  <div>• DEL to delete all faces</div>
                </div>
              )}
              {activeTool === "length" && (
                <div>
                  <div className="font-bold">Length Tool Active</div>
                  <div>• Double-click to create length measurement</div>
                  <div>• DEL or Backspace to delete all lengths</div>
                </div>
              )}
              {activeTool === "highlighter" && (
                <div>
                  <div className="font-bold">Highlighter Active</div>
                  <div>• Hover to highlight elements</div>
                  <div>• Click to select with outline</div>
                  <div>• Click elsewhere to clear selection</div>
                </div>
              )}
              {activeTool === "modelinfo" && (
                <div>
                  <div className="font-bold">Model Info Active</div>
                  <div>• Click an element to view its name</div>
                  <div>• Click elsewhere to clear selection</div>
                </div>
              )}
            </div>
          )}
        </div>
        {showModelInfo && fragmentsModel && (
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
