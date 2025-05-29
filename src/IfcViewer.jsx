import React, { useEffect, useRef, useState } from "react";
import * as WEBIFC from "web-ifc";
import * as OBC from "@thatopen/components";
import Stats from "stats.js";
import "./styles/ifcViewer.css";

function IfcViewer() {
  const containerRef = useRef(null);
  const fragmentsRef = useRef(null);
  const fragmentIfcLoaderRef = useRef(null);
  const componentsRef = useRef(null);
  const worldRef = useRef(null);
  const highlighterRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState(null);

  useEffect(() => {
    initViewer();

    // Cleanup on unmount
    return () => {
      if (fragmentsRef.current) fragmentsRef.current.dispose();
      if (componentsRef.current) componentsRef.current.dispose();
      if (highlighterRef.current) highlighterRef.current.dispose();
      const statsDom = document.querySelector(".stats-js");
      if (statsDom) statsDom.remove();
    };
  }, []);

  async function initViewer() {
    const container = containerRef.current;
    const components = new OBC.Components();
    componentsRef.current = components;

    const world = components.get(OBC.Worlds).create();
    worldRef.current = world;
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);
    world.scene.three.background = null;

    await components.init();

    world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
    world.scene.setup();
    components.get(OBC.Grids).create(world);

    const fragments = components.get(OBC.FragmentsManager);
    fragmentsRef.current = fragments;

    const fragmentIfcLoader = components.get(OBC.IfcLoader);
    fragmentIfcLoaderRef.current = fragmentIfcLoader;
    await fragmentIfcLoader.setup();
    const excludedCats = [
      WEBIFC.IFCTENDONANCHOR,
      WEBIFC.IFCREINFORCINGBAR,
      WEBIFC.IFCREINFORCINGELEMENT,
    ];
    for (const cat of excludedCats) {
      fragmentIfcLoader.settings.excludedCategories.add(cat);
    }
    fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

    // Initialize Highlighter for selection
    const highlighter = components.get(OBC.Highlighter);
    highlighterRef.current = highlighter;
    highlighter.setup({
      world,
      selectionColor: 0xffff00, // Bright yellow for visible highlighting
      hoverColor: 0x00ff00, // Green for hover effect
      multiple: false, // Allow only single selection for clarity
    });
    highlighter.events.select.onHighlight.add((fragmentMap) => {
      const fragmentId = Object.keys(fragmentMap)[0];
      if (!fragmentId) return;
      const expressId = fragmentMap[fragmentId][0];
      const fragment = fragments.list[fragmentId];
      const model = fragment.group;
      const properties = model.getLocalProperties();
      const elementProps = properties[expressId] || {
        message: "No properties found for this element",
      };
      console.log("Selected Element Properties:", elementProps); // Log to console
      setSelectedProperties(elementProps);
    });
    highlighter.events.select.onClear.add(() => {
      console.log("Selection cleared"); // Log when selection is cleared
      setSelectedProperties(null);
    });

    const stats = new Stats();
    stats.showPanel(2);
    stats.dom.classList.add("stats-js");
    document.body.append(stats.dom);
    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());
  }

  async function loadIfcFromFile(file) {
    setIsLoading(true);
    try {
      // Clear existing fragments and scene objects
      if (fragmentsRef.current.groups.size > 0) {
        fragmentsRef.current.dispose();
        worldRef.current.scene.three.clear();
        fragmentsRef.current = componentsRef.current.get(OBC.FragmentsManager);
        setSelectedProperties(null); // Clear any selected properties
      }

      const data = await file.arrayBuffer();
      const buffer = new Uint8Array(data);
      const model = await fragmentIfcLoaderRef.current.load(buffer);
      model.name = file.name;
      worldRef.current.scene.three.add(model);
    } catch (error) {
      console.error("Error loading IFC file:", error);
      alert("Failed to load IFC file. Please ensure it’s a valid IFC file.");
    } finally {
      setIsLoading(false);
    }
  }

  function download(file) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function exportFragments() {
    const fragments = fragmentsRef.current;
    if (!fragments.groups.size) return;
    const group = Array.from(fragments.groups.values())[0];
    const data = fragments.export(group);
    download(new File([new Blob([data])], "model.frag"));
    const properties = group.getLocalProperties();
    if (properties) {
      download(new File([JSON.stringify(properties)], "model.json"));
    }
  }

  function disposeFragments() {
    fragmentsRef.current.dispose();
  }

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (file) loadIfcFromFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    containerRef.current.classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith(".ifc")) {
      loadIfcFromFile(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    containerRef.current.classList.add("drag-over");
  }

  function handleDragLeave(event) {
    event.preventDefault();
    containerRef.current.classList.remove("drag-over");
  }

  return (
    <div
      ref={containerRef}
      className="ifc-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading IFC file...</p>
        </div>
      )}
      <label className="ifc-upload-label">
        <input
          type="file"
          accept=".ifc"
          className="ifc-upload"
          onChange={handleFileChange}
        />
        Upload IFC
      </label>
      {selectedProperties && (
        <div className="properties-panel">
          <h3>Element Properties</h3>
          <pre>{JSON.stringify(selectedProperties, null, 2)}</pre>
          <button onClick={() => setSelectedProperties(null)}>Close</button>
        </div>
      )}
    </div>
  );
}

export default IfcViewer;
