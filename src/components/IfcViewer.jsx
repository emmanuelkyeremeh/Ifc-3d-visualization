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
      const outliner = components.get(OBCF.Outliner);

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

      outliner.world = world;
      outliner.enabled = true;
      outliner.create(
        "example",
        new THREE.MeshBasicMaterial({
          color: 0xffd700,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
      );

      return {
        world,
        fragmentIfcLoader,
        fragments,
        components,
        container,
        indexer,
        classifier,
        highlighter,
        outliner,
      };
    };

    const loadIfcFile = async (ifcFile, guid) => {
      if (!guid) {
        console.log("No GUID provided, skipping IFC loading");
        return;
      }

      try {
        const sceneData = await createScene();
        if (!sceneData) {
          console.error("Failed to create scene");
          return;
        }
        sceneDataRef.current = sceneData;

        const {
          fragmentIfcLoader,
          world,
          fragments,
          classifier,
          indexer,
          highlighter,
          outliner,
        } = sceneData;

        const data = await ifcFile.arrayBuffer();
        const buffer = new Uint8Array(data);
        console.log("Loading IFC file...");

        // //// DEBUG BEGIN
        // console.log("All IFC entity types in web-ifc:");
        // for (const [key, value] of Object.entries(WEBIFC)) {
        //   if (key.startsWith("IFC")) {
        //     console.log(`${key}: ${value}`);
        //   }
        // }
        // /// DEBUG END

        const loadedModel = await fragmentIfcLoader.load(buffer);
        loadedModel.name = "ifc_bim";
        console.log("IFC file loaded, processing fragments...");

        setModel(loadedModel);
        modelRef.current = loadedModel;
        console.log("Model state and ref set");

        console.log("Indexing relations...");
        await indexer.process(loadedModel);

        const localId = loadedModel.globalToExpressIDs.get(guid);
        if (!localId) {
          console.error("No local ID found for GUID:", guid);
          return;
        }

        console.log("Local ID found:", localId);

        // Get properties to identify entity type
        const properties = loadedModel.getLocalProperties();
        if (!properties) {
          console.error("No properties found in model");
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

        // First try to find the space containing our target element
        await classifier.bySpatialStructure(loadedModel, {
          isolate: new Set([WEBIFC.IFCSPACE]),
        });

        let targetSpaceId = null;
        let targetSpaceName = null;
        const spaces = classifier.list.spatialStructures;

        // Try to find the space containing our element
        for (const [spaceName, spaceData] of Object.entries(spaces)) {
          if (spaceData.id !== null) {
            const spaceElements = indexer.getEntityChildren(
              loadedModel,
              spaceData.id
            );
            if (spaceElements.has(localId)) {
              targetSpaceId = spaceData.id;
              targetSpaceName = spaceName;
              console.log(
                `Found target space: ${spaceName} with ID ${spaceData.id}`
              );
              break;
            }
          }
        }

        // If no space found, fall back to storey
        if (!targetSpaceId) {
          console.log("No space found, falling back to storey...");
          await classifier.bySpatialStructure(loadedModel, {
            isolate: new Set([WEBIFC.IFCBUILDINGSTOREY]),
          });

          const storeys = classifier.list.spatialStructures;
          for (const [storeyName, storeyData] of Object.entries(storeys)) {
            if (storeyData.id !== null) {
              const storeyElements = indexer.getEntityChildren(
                loadedModel,
                storeyData.id
              );
              if (storeyElements.has(localId)) {
                targetSpaceId = storeyData.id;
                targetSpaceName = storeyName;
                console.log(
                  `Found target storey: ${storeyName} with ID ${storeyData.id}`
                );
                break;
              }
            }
          }
        }

        if (!targetSpaceId) {
          console.error(
            "No space or storey found for element with GUID:",
            guid
          );
          return;
        }

        // Get fragments associated with the target space/storey
        const spaceElements = indexer.getEntityChildren(
          loadedModel,
          targetSpaceId
        );

        const fragMap = loadedModel.getFragmentMap(spaceElements);
        if (!fragMap) {
          console.error("No fragment map returned for space/storey elements");
          return;
        }

        // Add fragments to the scene
        const fragmentMeshes = [];
        console.log("Processing fragments for scene...");

        for (const fragmentID of Object.keys(fragMap)) {
          const fragmentMesh = loadedModel.children.find(
            (child) => child.uuid === fragmentID
          );

          if (fragmentMesh) {
            if (fragmentMesh.currentLOD !== undefined) {
              fragmentMesh.currentLOD = 0;
            }
            fragmentMeshes.push(fragmentMesh);
            world.scene.three.add(fragmentMesh);
            console.log(`Added fragment to scene: ${fragmentID}`);
          }
        }

        if (fragmentMeshes.length === 0) {
          console.error("No fragments found for the target space/storey");
          return;
        }

        console.log(
          `Successfully added ${fragmentMeshes.length} fragments to scene`
        );

        // Set properties for the model
        loadedModel.setLocalProperties(properties);

        fragments.onFragmentsLoaded.add((loadedModel) => {
          console.log("Fragments loaded:", loadedModel);
        });

        highlighter.events.select.onHighlight.add((data) => {
          outliner.clear("example");
          outliner.add("example", data);
        });

        highlighter.events.select.onClear.add(() => {
          outliner.clear("example");
        });

        // Wait for the next render cycle to ensure model state is updated
        setTimeout(() => {
          console.log("Attempting to highlight element...");
          highlightByGuid(guid);
        }, 100); // Increased timeout to ensure fragments are loaded

        console.log("IFC file processing complete");
      } catch (error) {
        console.error("Error loading IFC file or fragments:", error);
      }
    };

    if (ifcFile && guid) {
      loadIfcFile(ifcFile, guid);
    }

    return () => {
      if (sceneDataRef.current) {
        const { components, world, fragments, highlighter, outliner } =
          sceneDataRef.current;
        try {
          components?.dispose();
          if (fragments) {
            fragments.dispose();
          }
          if (highlighter) {
            highlighter.dispose();
          }
          if (outliner) {
            outliner.dispose();
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

      // Find the fragment mesh in the scene
      // const fragmentMesh = currentModel.children.find(
      //   (child) => child.uuid === targetFragmentId
      // );

      const fragmentMesh =
        sceneDataRef.current.world.scene.three.getObjectByProperty(
          "uuid",
          targetFragmentId
        );

      if (!fragmentMesh) {
        console.error("Fragment mesh not found in scene");
        return;
      }

      // Create highlight material
      const highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.9,
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

      // Configure post-processing effects
      const effects =
        sceneDataRef.current?.world?.renderer?.postproduction?.customEffects;
      if (effects) {
        effects.outlineEnabled = true;
        effects.outlineColor?.setHex(0xffd700);
        effects.outlineThickness = 2;
        effects.outlineOpacity = 1;
      }

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
      <div className="scene-wrapper">
        <div id="scene-container" className="scene-container"></div>
      </div>
    </div>
  );
};

export default IfcViewer;
