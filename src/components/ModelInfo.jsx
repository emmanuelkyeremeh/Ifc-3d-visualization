import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import "../styles/ModelInfo.css";

const ModelInfo = ({ model, world, fragments, onExit }) => {
  const [selectedElement, setSelectedElement] = useState(null);
  const [elementName, setElementName] = useState("");
  const [elementProperties, setElementProperties] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const highlightMaterialRef = useRef(null);

  // Function to format property sets as per documentation
  const formatItemPsets = (rawPsets) => {
    const result = {};
    for (const [_, pset] of rawPsets.entries()) {
      const { Name: psetName, HasProperties } = pset;
      if (!("value" in psetName && Array.isArray(HasProperties))) continue;
      const props = {};
      for (const [_, prop] of HasProperties.entries()) {
        const { Name, NominalValue } = prop;
        if (!("value" in Name && "value" in NominalValue)) continue;
        const name = Name.value;
        const nominalValue = NominalValue.value;
        if (!(name && nominalValue !== undefined)) continue;
        props[name] = nominalValue;
      }
      result[psetName.value] = props;
    }
    return result;
  };

  useEffect(() => {
    if (!model || !world || !fragments) return;

    // Create highlight material
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    highlightMaterialRef.current = highlightMaterial;

    let localId = null;

    const highlightElement = async (localId) => {
      if (!localId) return;
      try {
        await model.highlight([localId], {
          color: new THREE.Color("yellow"),
          renderedFaces: FRAGS.RenderedFaces.TWO,
          opacity: 0.6,
          transparent: true,
        });
      } catch (error) {
        console.error("Error highlighting element:", error);
      }
    };

    const resetHighlight = async (localId) => {
      if (!localId) return;
      try {
        await model.resetHighlight([localId]);
      } catch (error) {
        console.error("Error resetting highlight:", error);
      }
    };

    const getElementData = async (localId) => {
      try {
        setIsLoading(true);

        // Get element attributes
        const [data] = await model.getItemsData([localId], {
          attributesDefault: true,
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
            DefinesOc: { attributes: false, relations: false },
          },
        });

        if (!data) {
          setElementName("Unknown Element");
          setElementProperties({ Error: "No data found for element" });
          return;
        }

        // Extract name
        const name = data.Name?.value || "Unnamed Element";
        setElementName(name);

        // Build properties
        const properties = {
          "Express ID": localId || "N/A",
          "IFC Type": data.type || "N/A",
          "Global ID": data.GlobalId?.value || "N/A",
          Name: data.Name?.value || "N/A",
          Description: data.Description?.value || "N/A",
          "Object Type": data.ObjectType || "N/A",
          Tag: data.Tag?.value || "N/A",
        };

        // Add property sets
        const psets = data.IsDefinedBy || [];
        const formattedPsets = formatItemPsets(psets);
        Object.entries(formattedPsets).forEach(([psetName, props], index) => {
          properties[`Property Set ${index + 1}: ${psetName}`] = JSON.stringify(
            props,
            null,
            2
          );
        });

        setElementProperties(properties);
      } catch (error) {
        console.error("Error getting element data:", error);
        setElementName("Error loading element");
        setElementProperties({ error: error.message });
      } finally {
        setIsLoading(false);
      }
    };

    const handleClick = async (event) => {
      try {
        const container = world.renderer.domElement;
        const mouse = new THREE.Vector2(
          (event.clientX / container.clientWidth) * 2 - 1,
          -((event.clientY / container.clientHeight) * 2 - 1)
        );

        // Reset previous highlight
        if (localId) {
          await resetHighlight(localId);
        }
        setSelectedElement(null);
        setElementName("");
        setElementProperties({});

        // Perform raycast
        const result = await model.raycast({
          camera: world.camera.three,
          mouse,
          dom: container,
        });

        if (result) {
          localId = result.localId;
          setSelectedElement({
            localId,
            expressID: result.expressID,
            mesh: result.object,
          });
          await highlightElement(localId);
          await getElementData(localId);
        } else {
          localId = null;
        }
      } catch (error) {
        console.error("Error in handleClick:", error);
      }
    };

    const container = world.renderer.domElement;
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
      if (localId) {
        resetHighlight(localId);
      }
      if (highlightMaterialRef.current) {
        highlightMaterialRef.current.dispose();
      }
    };
  }, [model, world, fragments]);

  return (
    <div className="model-info-panel">
      <div className="panel-header">
        <h3>Model Information</h3>
        <button onClick={onExit} className="close-button">
          ×
        </button>
      </div>

      <div className="panel-content">
        <div className="info-section">
          <p>💡 Click any element to see its information.</p>
        </div>

        <div className="selected-element-section">
          <h4>Selected Element</h4>

          {isLoading && <p>Loading element data...</p>}

          {!selectedElement && !isLoading && <p>No element selected</p>}

          {selectedElement && !isLoading && (
            <div className="element-details">
              <div className="element-name">
                <strong>Name:</strong> {elementName}
              </div>

              <div className="element-properties">
                <h5>Properties:</h5>
                {Object.entries(elementProperties).map(([key, value]) => (
                  <div key={key} className="property-row">
                    <span className="property-key">{key}:</span>
                    <span className="property-value">{String(value)}</span>
                  </div>
                ))}
              </div>

              <div className="action-buttons">
                <button
                  onClick={async () => {
                    try {
                      const [data] = await model.getItemsData(
                        [selectedElement.localId],
                        { attributesDefault: true }
                      );
                      console.log("Attributes:", data);
                    } catch (error) {
                      console.error("Error logging attributes:", error);
                    }
                  }}
                  className="log-button"
                >
                  Log Attributes
                </button>
                <button
                  onClick={async () => {
                    try {
                      const [data] = await model.getItemsData(
                        [selectedElement.localId],
                        {
                          attributesDefault: false,
                          relations: {
                            IsDefinedBy: { attributes: true, relations: true },
                            DefinesOc: { attributes: false, relations: false },
                          },
                        }
                      );
                      console.log(
                        "Property Sets:",
                        formatItemPsets(data.attributes.IsDefinedBy || [])
                      );
                    } catch (error) {
                      console.error("Error logging property sets:", error);
                    }
                  }}
                  className="log-button"
                >
                  Log Property Sets
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelInfo;
