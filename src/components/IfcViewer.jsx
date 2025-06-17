import React, { useEffect, useRef, useState } from "react";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import Stats from "stats.js";
import "../styles/ifcViewer.css";

const IfcViewer = ({ ifcFile, guid }) => {
  const sceneDataRef = useRef(null);
  const modelRef = useRef(null);
  const [model, setModel] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const createScene = async () => {
    const container = document.getElementById("scene-container");
    if (!container) {
      console.error("Scene container not found");
      return null;
    }

    const components = new OBC.Components();
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create(
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBCF.PostproductionRenderer
    );

    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBCF.PostproductionRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);

    try {
      await components.init();
      if (!world.scene.three) {
        throw new Error("Scene initialization failed");
      }
      world.scene.setup();
      world.scene.three.background = null;
      world.renderer.postproduction.enabled = true;
      world.renderer.postproduction.customEffects.outlineEnabled = true;

      world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      world.renderer.three.setSize(
        container.clientWidth,
        container.clientHeight
      );
      world.renderer.three.shadowMap.enabled = false;
      world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;

      world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
    } catch (error) {
      console.error("Error initializing components or scene:", error);
      return null;
    }

    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    grid.three.position.y -= 1;
    grid.config.color.setHex(0x666666);
    world.renderer.postproduction.customEffects.excludedMeshes.push(grid.three);

    const streamer = components.get(OBCF.IfcStreamer);
    streamer.world = world;
    streamer.useCache = true;
    streamer.culler.threshold = 10;
    streamer.culler.maxHiddenTime = 1000;
    streamer.culler.maxLostTime = 3000;

    const stats = new Stats();
    stats.showPanel(2);
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "unset";
    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    world.camera.controls.addEventListener("sleep", () => {
      streamer.culler.needsUpdate = true;
    });

    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world });
    highlighter.zoomToSelection = true;

    return { world, streamer, components, container, highlighter };
  };

  const processIfcFile = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:3000/api/processIfc", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to process IFC file: ${
            errorData.error || response.statusText
          }`
        );
      }

      const result = await response.json();
      if (!result.tilesUrl || !result.modelId || !result.geometryUrl) {
        throw new Error(
          "Invalid backend response: missing tilesUrl, modelId, or geometryUrl"
        );
      }

      const tilesUrl = result.tilesUrl.endsWith("/")
        ? result.tilesUrl
        : `${result.tilesUrl}/`;

      return {
        tilesUrl,
        geometryUrl: result.geometryUrl,
        propertiesUrl: result.propertiesUrl,
        metadataUrl: result.metadataUrl,
        modelId: result.modelId,
      };
    } catch (error) {
      console.error("Error processing IFC file:", error);
      throw error;
    }
  };

  const loadIfcStream = async (ifcFile) => {
    if (!ifcFile) {
      console.log("Missing IFC file, skipping loading");
      return;
    }

    try {
      setIsLoading(true);
      setLoadingProgress(0);

      const sceneData = await createScene();
      if (!sceneData) {
        console.error("Failed to create scene");
        setIsLoading(false);
        return;
      }
      sceneDataRef.current = sceneData;
      setLoadingProgress(10);

      const { streamer } = sceneData;

      console.log("Processing IFC file...");
      const { tilesUrl, geometryUrl, propertiesUrl } = await processIfcFile(
        ifcFile
      );
      console.log("Backend response:", {
        tilesUrl,
        geometryUrl,
        propertiesUrl,
      });
      setLoadingProgress(30);

      streamer.url = tilesUrl;
      console.log("Streamer URL set to:", streamer.url);

      console.log("Fetching geometry and properties data...");

      const rawGeometryData = await fetch(geometryUrl);
      if (!rawGeometryData.ok) {
        throw new Error(
          `Failed to fetch geometry data from ${geometryUrl}: ${rawGeometryData.statusText}`
        );
      }
      const geometryData = await rawGeometryData.json();
      console.log("Geometry data loaded:", {
        hasAssets: !!geometryData.assets,
        hasGeometries: !!geometryData.geometries,
        globalDataFileId: geometryData.globalDataFileId,
        assetsCount: geometryData.assets?.length || 0,
        geometriesCount: Object.keys(geometryData.geometries || {}).length,
      });

      let propertiesData = null;
      if (propertiesUrl) {
        try {
          const rawPropertiesData = await fetch(propertiesUrl);
          if (rawPropertiesData.ok) {
            propertiesData = await rawPropertiesData.json();
            console.log("Properties data loaded:", {
              hasTypes: !!propertiesData.types,
              hasIds: !!propertiesData.ids,
              indexesFile: propertiesData.indexesFile,
            });
          } else {
            console.warn(
              `Failed to fetch properties: ${rawPropertiesData.statusText}`
            );
          }
        } catch (propError) {
          console.warn("Error loading properties:", propError.message);
        }
      }
      setLoadingProgress(50);

      console.log("Loading model with streamer...");

      const loadedModel = await streamer.load(
        geometryData,
        true,
        propertiesData
      );

      if (!loadedModel) {
        throw new Error("Failed to load model - streamer returned null");
      }

      loadedModel.name = "ifc_bim_streamed";
      setModel(loadedModel);
      modelRef.current = loadedModel;
      setLoadingProgress(100);

      console.log("Model loaded successfully:", {
        uuid: loadedModel.uuid,
        hasFragments: loadedModel.hasFragments,
        fragmentsCount: loadedModel.items?.size || 0,
      });

      console.log("IFC streaming complete");
    } catch (error) {
      console.error("Error streaming IFC model:", error);
      console.error("Error stack:", error.stack);
    } finally {
      setIsLoading(false);
    }
  };

  const highlightByGuid = async (guid) => {
    const currentModel = modelRef.current;
    const sceneData = sceneDataRef.current;

    if (!currentModel || !sceneData || !guid) {
      console.error("Model, scene, or guid not available for highlighting");
      return;
    }

    try {
      const { highlighter } = sceneData;

      if (!currentModel.globalToExpressIDs) {
        console.warn("Model does not have globalToExpressIDs mapping");
        return;
      }

      const rawId = currentModel.globalToExpressIDs.get(guid);
      const localId = typeof rawId === "string" ? parseInt(rawId, 10) : rawId;

      if (typeof localId !== "number" || isNaN(localId)) {
        console.error("Invalid local ID for GUID:", guid, "Got:", localId);
        return;
      }

      console.log(
        `Highlighting element with GUID: ${guid}, Local ID: ${localId}`
      );

      highlighter.clear();

      const fragmentMap = currentModel.getFragmentMap();
      for (const fragmentID in fragmentMap) {
        const expressIDs = fragmentMap[fragmentID];
        if (expressIDs instanceof Set && expressIDs.has(localId)) {
          const fragmentIdMap = {
            [fragmentID]: new Set([localId]),
          };
          try {
            highlighter.highlightByID("select", fragmentIdMap, true, true);
            console.log(
              `Successfully highlighted element in fragment: ${fragmentID}`
            );
            return;
          } catch (err) {
            console.error("highlightByID error:", err);
          }
        }
      }

      console.warn("Could not find fragment containing local ID:", localId);
    } catch (error) {
      console.error("Error in highlightByGuid:", error);
    }
  };

  // Load IFC when ifcFile is provided
  useEffect(() => {
    if (ifcFile) {
      loadIfcStream(ifcFile);
    }

    return () => {
      if (sceneDataRef.current) {
        const { components, world } = sceneDataRef.current;
        try {
          components?.dispose();
          if (world?.scene?.three) {
            world.scene.three.clear();
          }
        } catch (error) {
          console.warn("Error during cleanup:", error);
        }
        sceneDataRef.current = null;
        console.log("Scene resources disposed.");
      }
    };
  }, [ifcFile]);

  // Highlight when guid and model are available
  useEffect(() => {
    if (guid && model) {
      highlightByGuid(guid);
    }
  }, [guid, model]);

  return (
    <div className="viewer-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <h2>Loading IFC Model...</h2>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <p>{Math.round(loadingProgress)}%</p>
          </div>
        </div>
      )}
      <div className="scene-wrapper">
        <div id="scene-container" className="scene-container"></div>
      </div>
    </div>
  );
};

export default IfcViewer;
