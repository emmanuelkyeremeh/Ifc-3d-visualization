import React, { useEffect, useRef, useState } from "react";
import * as WEBIFC from "web-ifc";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import "../styles/IfcViewer.css";

const IfcViewer = ({ ifcFile, guid }) => {
  const sceneDataRef = useRef(null);
  const [model, setModel] = useState(null);
  const [spatialStructures, setSpatialStructures] = useState({});
  const [classes, setClasses] = useState({});
  const [isMenuVisible, setIsMenuVisible] = useState(false);
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

        // Optimize renderer settings for better performance
        world.renderer.three.setPixelRatio(window.devicePixelRatio);
        world.renderer.three.setSize(
          container.clientWidth,
          container.clientHeight
        );
        world.renderer.three.shadowMap.enabled = false; // Disable shadows for better performance
        world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;

        // Enable frustum culling for better performance
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
      const hider = components.get(OBC.Hider);
      const classifier = components.get(OBC.Classifier);
      const highlighter = components.get(OBCF.Highlighter);
      const outliner = components.get(OBCF.Outliner);

      try {
        await fragmentIfcLoader.setup();
        fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

        // Optimize IFC loading settings
        fragmentIfcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;
        fragmentIfcLoader.settings.webIfc.CIRCLE_SEGMENTS = 12; // Reduce circle segments for better performance
        fragmentIfcLoader.settings.webIfc.SPATIAL_INDEX = true; // Enable spatial indexing for better performance

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

      // Setup highlighter with more prominent settings
      highlighter.setup({ world });
      highlighter.zoomToSelection = true;

      // Setup outliner with more visible highlighting
      outliner.world = world;
      outliner.enabled = true;
      outliner.create(
        "example",
        new THREE.MeshBasicMaterial({
          color: 0xffd700, // Bright yellow
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
        hider,
        classifier,
        highlighter,
        outliner,
      };
    };

    const loadIfcFile = async (ifcFile) => {
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
          hider,
          highlighter,
          outliner,
        } = sceneData;

        // Load IFC and convert to fragments
        const data = await ifcFile.arrayBuffer();
        const buffer = new Uint8Array(data);

        // Show loading indicator
        console.log("Loading IFC file...");

        const model = await fragmentIfcLoader.load(buffer);
        model.name = "ifc_bim";
        console.log("IFC file loaded, processing fragments...");

        setModel(model);

        world.scene.three.add(model);

        // Convert to fragments and load properties
        const fragData = fragments.export(model);
        const fragBuffer = new Uint8Array(fragData);
        const fragModel = fragments.load(fragBuffer);
        world.scene.three.add(fragModel);

        const properties = model.getLocalProperties();
        if (properties) {
          fragModel.setLocalProperties(properties);
        }

        // Index relations before classification
        console.log("Indexing relations...");
        await indexer.process(fragModel);

        // Load classifications
        console.log("Loading classifications...");
        await classifier.byEntity(fragModel);
        try {
          await classifier.bySpatialStructure(fragModel, {
            isolate: new Set([WEBIFC.IFCBUILDINGSTOREY]),
          });
        } catch (error) {
          console.warn("Failed to classify by spatial structure:", error);
        }

        // Initialize spatial structures and classes for UI
        const spatialStructuresData = {};
        const structureNames = Object.keys(classifier.list.spatialStructures);
        for (const name of structureNames) {
          spatialStructuresData[name] = true;
        }
        setSpatialStructures(spatialStructuresData);

        const classesData = {};
        const classNames = Object.keys(classifier.list.entities);
        for (const name of classNames) {
          classesData[name] = true;
        }
        setClasses(classesData);

        fragments.onFragmentsLoaded.add((loadedModel) => {
          console.log("Fragments loaded:", loadedModel);
        });

        // Highlighter event listeners for click-to-highlight
        highlighter.events.select.onHighlight.add((data) => {
          outliner.clear("example");
          outliner.add("example", data);
          setSelectedElement(data);
        });

        highlighter.events.select.onClear.add(() => {
          outliner.clear("example");
          setSelectedElement(null);
        });

        console.log("IFC file processing complete");
      } catch (error) {
        console.error("Error loading IFC file or fragments:", error);
      }
    };

    if (ifcFile) {
      loadIfcFile(ifcFile);
    }

    return () => {
      if (sceneDataRef.current) {
        const { components, world, fragments, highlighter, outliner } =
          sceneDataRef.current;
        try {
          components?.dispose();
          if (fragments) {
            try {
              fragments.dispose();
            } catch (err) {
              console.error("Error disposing fragments:", err);
            }
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

  const highlightByGuid = async (guid) => {
    if (!model) return;
    try {
      console.log("Attempting to highlight element with GUID:", guid);

      // Get local ID from GUID using globalToExpressIDs
      const localId = model.globalToExpressIDs.get(guid);
      console.log("Local ID found:", localId);

      if (localId) {
        // Get fragment map
        const fragmentMap = model.getFragmentMap();
        if (!fragmentMap) {
          console.error("Fragment map not found");
          return;
        }
        console.log("Fragment map:", fragmentMap);

        // Find the fragment ID that contains our local ID
        let targetFragmentId = null;
        for (const [fragmentId, localIds] of Object.entries(fragmentMap)) {
          if (localIds.has(localId)) {
            targetFragmentId = fragmentId;
            break;
          }
        }
        console.log("Target fragment ID:", targetFragmentId);

        if (targetFragmentId) {
          // Get the actual fragment mesh from the model
          const fragmentMesh = model.children.find(
            (child) => child.uuid === targetFragmentId
          );
          if (fragmentMesh) {
            console.log("Found fragment mesh:", fragmentMesh);

            // Create highlight material with more prominent yellow color
            const highlightMaterial = new THREE.MeshBasicMaterial({
              color: 0xffd700, // Bright yellow
              transparent: true,
              opacity: 0.9, // Increased opacity for better visibility
              side: THREE.DoubleSide,
              depthTest: false, // Ensure highlight is always visible
              depthWrite: false,
            });

            // Store original material in userData for later restoration
            if (!fragmentMesh.userData.originalMaterial) {
              fragmentMesh.userData.originalMaterial = fragmentMesh.material;
            }

            // Apply highlight material
            fragmentMesh.material = highlightMaterial;

            // Add outline effect for better visibility
            const effects =
              sceneDataRef.current?.world?.renderer?.postproduction
                ?.customEffects;
            if (effects) {
              effects.outlineEnabled = true;
              if (effects.outlineColor) {
                effects.outlineColor.setHex(0xffd700);
              }
              if (effects.outlineThickness !== undefined) {
                effects.outlineThickness = 2;
              }
              if (effects.outlineOpacity !== undefined) {
                effects.outlineOpacity = 1;
              }
            }

            // Zoom to the highlighted element using the camera
            if (sceneDataRef.current?.world?.camera) {
              const box = new THREE.Box3().setFromObject(fragmentMesh);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              const fov =
                sceneDataRef.current.world.camera.three.fov * (Math.PI / 180);
              let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));

              // Add some padding
              cameraZ *= 1.5;

              // Set camera position
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
          } else {
            console.error("Fragment mesh not found for ID:", targetFragmentId);
          }
        } else {
          console.error("No fragment found containing local ID:", localId);
        }
      } else {
        console.error("No local ID found for GUID:", guid);
      }
    } catch (error) {
      console.error("Error highlighting element:", error);
    }
  };

  useEffect(() => {
    if (guid && model) {
      console.log("Highlighting element with GUID:", guid);
      highlightByGuid(guid);
    }
  }, [guid, model]);

  const toggleMenu = () => {
    setIsMenuVisible(!isMenuVisible);
  };

  const handleFloorToggle = (name, checked) => {
    if (!sceneDataRef.current) return;
    const { classifier, indexer, hider, fragments } = sceneDataRef.current;
    const found = classifier.list.spatialStructures[name];
    if (found && found.id !== null) {
      for (const [_id, model] of fragments.groups) {
        const foundIDs = indexer.getEntityChildren(model, found.id);
        const fragMap = model.getFragmentMap(foundIDs);

        // Instead of using hider.set, we'll directly modify the visibility
        for (const [fragmentID, localIDs] of Object.entries(fragMap)) {
          const fragment = model.children.find(
            (child) => child.uuid === fragmentID
          );
          if (fragment) {
            fragment.visible = checked;
          }
        }
      }
    }
    setSpatialStructures((prev) => ({ ...prev, [name]: checked }));
  };

  const handleCategoryToggle = (name, checked) => {
    if (!sceneDataRef.current) return;
    const { classifier, hider } = sceneDataRef.current;
    const found = classifier.find({ entities: [name] });
    hider.set(checked, found);
    setClasses((prev) => ({ ...prev, [name]: checked }));
  };

  return (
    <div className="viewer-container">
      <div className="scene-wrapper">
        <div id="scene-container" className="scene-container"></div>
        <button
          className="menu-toggle-button"
          onClick={toggleMenu}
          style={{ display: isMobile() ? "block" : "none" }}
        >
          <span className="icon">⚙️</span>
        </button>
        <div className={`control-panel ${isMenuVisible ? "visible" : ""}`}>
          <div className="panel-section">
            <h3>Floors</h3>
            {Object.keys(spatialStructures).map((name) => (
              <div key={name} className="checkbox-container">
                <input
                  type="checkbox"
                  checked={spatialStructures[name]}
                  onChange={(e) => handleFloorToggle(name, e.target.checked)}
                />
                <label>{name}</label>
              </div>
            ))}
          </div>
          <div className="panel-section">
            <h3>Categories</h3>
            {Object.keys(classes).map((name) => (
              <div key={name} className="checkbox-container">
                <input
                  type="checkbox"
                  checked={classes[name]}
                  onChange={(e) => handleCategoryToggle(name, e.target.checked)}
                />
                <label>{name}</label>
              </div>
            ))}
          </div>
          {selectedElement && (
            <div className="panel-section">
              <h3>Selected Element</h3>
              <div className="checkbox-container">
                <p>Element ID: {selectedElement.localId || "Unknown"}</p>
                {selectedElement.name && <p>Name: {selectedElement.name}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Utility to detect mobile devices
const isMobile = () => window.innerWidth <= 768;

export default IfcViewer;
