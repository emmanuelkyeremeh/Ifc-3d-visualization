import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import * as BUI from "@thatopen/ui";
import * as OBCF from "@thatopen/components-front";
import "../styles/FloorPlanControls.css";

const FloorPlanControls = ({
  plans,
  world,
  model,
  classifier,
  highlighter,
  culler,
  onExit,
}) => {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!plans || !world || !model || !classifier || !culler) return;

    BUI.Manager.init();

    const panel = BUI.Component.create(() => {
      return BUI.html`
        <bim-panel active label="Floor Plans" class="floor-plan-panel">
          <bim-panel-section name="floorPlans" label="Plan List">
            <bim-label>💡 Select a floor plan to view it from above.</bim-label>
          </bim-panel-section>
        </bim-panel>
      `;
    });

    panelRef.current = panel;
    document.body.appendChild(panel);

    const panelSection = panel.querySelector(
      "bim-panel-section[name='floorPlans']"
    );

    // Store original settings
    const minGloss = world.renderer.postproduction.customEffects.minGloss;
    const whiteColor = new THREE.Color("white");
    const defaultBackground = world.scene.three.background;

    // Generate plans if not already generated
    const generatePlans = async () => {
      try {
        if (plans.list.length === 0) {
          // Ensure the model is properly classified
          classifier.byModel(model.uuid, model);
          classifier.byEntity(model);

          // Generate plans
          await plans.generate(model);

          // Set up edges for better visualization
          const edges = world.components.get(OBCF.ClipEdges);
          const modelItems = classifier.find({ models: [model.uuid] });
          const thickItems = classifier.find({
            entities: ["IFCWALLSTANDARDCASE", "IFCWALL"],
          });
          const thinItems = classifier.find({
            entities: ["IFCDOOR", "IFCWINDOW", "IFCPLATE", "IFCMEMBER"],
          });

          const grayFill = new THREE.MeshBasicMaterial({
            color: "gray",
            side: THREE.DoubleSide,
          });
          const blackLine = new THREE.LineBasicMaterial({ color: "black" });
          const blackOutline = new THREE.MeshBasicMaterial({
            color: "black",
            opacity: 0.5,
            side: THREE.DoubleSide,
            transparent: true,
          });

          if (!edges.styles.list.thick) {
            edges.styles.create(
              "thick",
              new Set(),
              world,
              blackLine,
              grayFill,
              blackOutline
            );
          }

          // Add thick items to edges
          for (const fragID in thickItems) {
            const foundFrag = model.items.find((item) => item.uuid === fragID);
            if (!foundFrag) continue;
            edges.styles.list.thick.fragments[fragID] = new Set(
              thickItems[fragID]
            );
            edges.styles.list.thick.meshes.add(foundFrag.mesh);
          }

          if (!edges.styles.list.thin) {
            edges.styles.create("thin", new Set(), world);
          }

          // Add thin items to edges
          for (const fragID of thinItems) {
            const foundFrag = model.items.find((item) => item.uuid === fragID);
            if (!foundFrag) continue;
            edges.styles.list.thin.fragments[fragID] = new Set(
              thinItems[fragID]
            );
            edges.styles.list.thin.meshes.add(foundFrag.mesh);
          }

          // Update edges
          await edges.update(true);

          // Add model items to culler
          for (const fragment of model.items) {
            culler.add(fragment.mesh);
          }
          culler.needsUpdate = true;
        }
      } catch (error) {
        console.error("Error generating plans:", error);
      }
    };

    generatePlans();

    // Add plan buttons
    for (const plan of plans.list) {
      const planButton = BUI.Component.create(() => {
        return BUI.html`
          <bim-button label="${plan.name}"
            @click="${async () => {
              try {
                // Set up plan view
                world.renderer.postproduction.customEffects.minGloss = 0.1;
                highlighter.backupColor = whiteColor;
                classifier.setColor(model, whiteColor);
                world.scene.three.background = whiteColor;

                // Go to plan view
                await plans.goTo(plan.id);
                culler.needsUpdate = true;

                // Update camera position for better plan view
                const camera = world.camera.three;
                const planPosition = plan.position;
                camera.position.set(
                  planPosition.x,
                  planPosition.y + 10,
                  planPosition.z
                );
                camera.lookAt(planPosition.x, planPosition.y, planPosition.z);
                camera.updateProjectionMatrix();
              } catch (error) {
                console.error("Error switching to plan view:", error);
              }
            }}">
          </bim-button>
        `;
      });
      panelSection.append(planButton);
    }

    // Add exit button
    const exitButton = BUI.Component.create(() => {
      return BUI.html`
        <bim-button label="Exit Floor Plan"
          @click="${() => {
            try {
              // Reset view
              highlighter.backupColor = null;
              highlighter.clear();
              world.renderer.postproduction.customEffects.minGloss = minGloss;
              classifier.resetColor(model);
              world.scene.three.background = defaultBackground;
              plans.exitPlanView();
              culler.needsUpdate = true;
              onExit();
            } catch (error) {
              console.error("Error exiting plan view:", error);
            }
          }}">
        </bim-button>
      `;
    });

    panelSection.append(exitButton);

    return () => {
      if (panelRef.current) {
        document.body.removeChild(panelRef.current);
        panelRef.current = null;
      }
    };
  }, [plans, world, model, classifier, highlighter, culler, onExit]);

  return null;
};

export default FloorPlanControls;
