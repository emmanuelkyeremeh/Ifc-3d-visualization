import React, { useEffect, useRef, useState } from "react";
import * as WEBIFC from "web-ifc";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import "../styles/IfcViewer.css";

// Helper function to get IFC type name from numeric type
const getIfcTypeName = (type) => {
  for (const [key, value] of Object.entries(WEBIFC)) {
    if (value === type) {
      return key;
    }
  }
  return `Unknown Type (${type})`;
};

const IfcViewer = ({ ifcFile, guid }) => {
  const sceneDataRef = useRef(null);
  const modelRef = useRef(null);
  const [model, setModel] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

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

        world.renderer.three.setPixelRatio(
          Math.min(window.devicePixelRatio, 2)
        );
        world.renderer.three.setSize(
          container.clientWidth,
          container.clientHeight
        );
        world.renderer.three.shadowMap.enabled = false;
        world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;

        world.scene.three.frustumCulled = true;
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
      const fragments = components.get(OBC.FragmentsManager);
      const indexer = components.get(OBC.IfcRelationsIndexer);
      const classifier = components.get(OBC.Classifier);
      const highlighter = components.get(OBCF.Highlighter);

      try {
        await fragmentIfcLoader.setup();
        fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
        fragmentIfcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;
        fragmentIfcLoader.settings.webIfc.CIRCLE_SEGMENTS = 12;
        fragmentIfcLoader.settings.webIfc.SPATIAL_INDEX = true;

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

      highlighter.setup({ world });
      highlighter.zoomToSelection = true;

      return {
        world,
        fragmentIfcLoader,
        fragments,
        components,
        container,
        indexer,
        classifier,
        highlighter,
      };
    };

    const loadIfcFile = async (ifcFile, guid) => {
      if (!guid) {
        console.log("No GUID provided, skipping IFC loading");
        return;
      }

      try {
        setIsLoading(true);
        setLoadingProgress(0);

        // Stage 1: Scene setup (10%)
        const sceneData = await createScene();
        if (!sceneData) {
          console.error("Failed to create scene");
          setIsLoading(false);
          return;
        }
        sceneDataRef.current = sceneData;
        setLoadingProgress(10);

        const {
          fragmentIfcLoader,
          world,
          fragments,
          classifier,
          indexer,
          highlighter,
        } = sceneData;

        // Stage 2: Reading file (20%)
        const data = await ifcFile.arrayBuffer();
        const buffer = new Uint8Array(data);
        console.log("Loading IFC file...");
        setLoadingProgress(30);

        // Stage 3: Loading IFC model (50%)
        const loadedModel = await fragmentIfcLoader.load(buffer);
        loadedModel.name = "ifc_bim";
        console.log("IFC file loaded, processing fragments...");
        setLoadingProgress(50);

        setModel(loadedModel);
        modelRef.current = loadedModel;
        console.log("Model state and ref set");

        // Stage 4: Indexing relations (70%)
        console.log("Indexing relations...");
        await indexer.process(loadedModel);
        setLoadingProgress(70);

        const localId = loadedModel.globalToExpressIDs.get(guid);
        if (!localId) {
          console.error("No local ID found for GUID:", guid);
          setIsLoading(false);
          return;
        }

        console.log("Local ID found:", localId);

        // Get properties to identify entity type
        const properties = loadedModel.getLocalProperties();
        if (!properties) {
          console.error("No properties found in model");
          setIsLoading(false);
          return;
        }

        // Log the entity type of our target element
        const targetProps = properties[localId];
        if (targetProps) {
          const typeName = getIfcTypeName(targetProps.type);
          console.log("Target element type:", typeName);
          console.log("Target element properties:", targetProps);
        } else {
          console.error("No properties found for target element");
        }

        // Stage 5: Finding spatial structure (80%)
        await classifier.bySpatialStructure(loadedModel, {
          isolate: new Set([WEBIFC.IFCBUILDINGSTOREY]),
        });

        let targetStoreyId = null;
        let targetStoreyName = null;
        const storeys = classifier.list.spatialStructures;
        for (const [storeyName, storeyData] of Object.entries(storeys)) {
          if (storeyData.id !== null) {
            const storeyElements = indexer.getEntityChildren(
              loadedModel,
              storeyData.id
            );
            if (storeyElements.has(localId)) {
              targetStoreyId = storeyData.id;
              targetStoreyName = storeyName;
              console.log(
                `Found target storey: ${storeyName} with ID ${storeyData.id}`
              );
              break;
            }
          }
        }

        if (!targetStoreyId) {
          console.error("No storey found for element with GUID:", guid);
          setIsLoading(false);
          return;
        }
        setLoadingProgress(80);

        // Stage 6: Processing fragments (90%)
        const storeyElements = indexer.getEntityChildren(
          loadedModel,
          targetStoreyId
        );

        // Filter fragments to only include those that belong to the target storey
        const fragmentMap = loadedModel.getFragmentMap(storeyElements);
        if (!fragmentMap) {
          console.error("No fragment map returned for storey elements");
          setIsLoading(false);
          return;
        }

        const fragmentMeshes = [];
        console.log("Processing fragments for scene...");

        for (const fragmentID of Object.keys(fragmentMap)) {
          const fragmentMesh = loadedModel.children.find(
            (child) => child.uuid === fragmentID
          );

          if (fragmentMesh) {
            // Verify that the fragment's elements are exclusively from the target storey
            const fragmentLocalIds = fragmentMap[fragmentID];
            let isValidFragment = true;

            // Check if all local IDs in the fragment are in storeyElements
            for (const fragLocalId of fragmentLocalIds) {
              if (!storeyElements.has(fragLocalId)) {
                isValidFragment = false;
                break;
              }
            }

            if (isValidFragment) {
              if (fragmentMesh.currentLOD !== undefined) {
                fragmentMesh.currentLOD = 0;
              }
              fragmentMeshes.push(fragmentMesh);
              world.scene.three.add(fragmentMesh);
            }
          }
        }

        if (fragmentMeshes.length === 0) {
          console.error("No fragments found for the target storey");
          setIsLoading(false);
          return;
        }

        console.log(
          `Successfully added ${fragmentMeshes.length} fragments to scene`
        );
        setLoadingProgress(90);

        // Set properties for the model
        loadedModel.setLocalProperties(properties);

        fragments.onFragmentsLoaded.add((loadedModel) => {
          console.log("Fragments loaded:", loadedModel);
        });

        // Stage 7: Highlighting (100%)
        console.log("Attempting to highlight element...");
        await highlightByGuid(guid);
        setLoadingProgress(100);
        setTimeout(() => setIsLoading(false), 2000); // Brief delay for smooth transition

        console.log("IFC file processing complete");
      } catch (error) {
        console.error("Error loading IFC file or fragments:", error);
        setIsLoading(false);
      }
    };

    if (ifcFile && guid) {
      loadIfcFile(ifcFile, guid);
    }

    return () => {
      if (sceneDataRef.current) {
        const { components, world, fragments, highlighter } =
          sceneDataRef.current;
        try {
          components?.dispose();
          if (fragments) {
            fragments.dispose();
          }
          if (highlighter) {
            highlighter.dispose();
          }
          if (world?.scene?.three) {
            world.scene.three.traverse((object) => {
              if (object.geometry) object.geometry.dispose();
              if (object.material) {
                if (Array.isArray(object.material)) {
                  object.material.forEach((mat) => mat?.dispose());
                } else {
                  object.material?.dispose();
                }
              }
            });
          }
        } catch (error) {
          console.error("Error during cleanup:", error);
        }
        sceneDataRef.current = null;
        console.log("Scene resources disposed.");
      }
    };
  }, [ifcFile, guid]);

  const highlightByGuid = async (guid) => {
    const currentModel = modelRef.current;
    if (!currentModel) {
      console.error("No model available for highlighting");
      return;
    }
    try {
      console.log("Attempting to highlight element with GUID:", guid);

      const localId = currentModel.globalToExpressIDs.get(guid);
      console.log("Local ID found:", localId);

      if (!localId) {
        console.error("No local ID found for GUID:", guid);
        return;
      }

      // Get all fragments in the model
      const fragmentMap = currentModel.getFragmentMap();
      if (!fragmentMap) {
        console.error("Fragment map not found");
        return;
      }

      // Find which fragment contains our element
      let targetFragmentId = null;
      for (const [fragmentId, localIds] of Object.entries(fragmentMap)) {
        if (localIds && localIds.has(localId)) {
          targetFragmentId = fragmentId;
          break;
        }
      }

      if (!targetFragmentId) {
        console.error("No fragment found containing local ID:", localId);
        return;
      }

      const fragmentMesh =
        sceneDataRef.current.world.scene.three.getObjectByProperty(
          "uuid",
          targetFragmentId
        );

      if (!fragmentMesh) {
        console.error("Fragment mesh not found in scene");
        return;
      }

      // Create aggressive highlight material
      const highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000, // Bright red for aggressive highlighting
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });

      // Store original material if not already stored
      if (!fragmentMesh.userData.originalMaterial) {
        fragmentMesh.userData.originalMaterial = fragmentMesh.material;
      }

      // Apply highlight material
      fragmentMesh.material = highlightMaterial;

      // Configure post-processing effects for aggressive highlighting
      const effects =
        sceneDataRef.current?.world?.renderer?.postproduction?.customEffects;
      if (effects) {
        effects.outlineEnabled = true;
        effects.outlineColor?.setHex(0xff0000);
        effects.outlineThickness = 4;
        effects.outlineOpacity = 1;
      }

      // Dim other elements to emphasize the highlighted element
      currentModel.children.forEach((child) => {
        if (child.uuid !== targetFragmentId && child.material) {
          child.material.opacity = 0.3;
          child.material.transparent = true;
        }
      });

      // Zoom to the highlighted element
      if (sceneDataRef.current?.world?.camera) {
        const box = new THREE.Box3().setFromObject(fragmentMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov =
          sceneDataRef.current.world.camera.three.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
        cameraZ *= 1.5;

        sceneDataRef.current.world.camera.controls.setLookAt(
          center.x + cameraZ,
          center.y + cameraZ,
          center.z + cameraZ,
          center.x,
          center.y,
          center.z
        );
      }

      console.log("Element highlighted successfully");
    } catch (error) {
      console.error("Error highlighting element:", error);
    }
  };

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
