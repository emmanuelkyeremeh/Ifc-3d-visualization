import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import * as BUI from "@thatopen/ui";
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
          <bim-panel-section name="floorPlans" label="Plan List" collapsed>
          </bim-panel-section>
        </bim-panel>
      `;
    });

    panelRef.current = panel;
    document.body.appendChild(panel);

    const panelSection = panel.querySelector(
      "bim-panel-section[name='floorPlans']"
    );
    const modelItems = classifier.find({ models: [model.uuid] });
    const minGloss = world.renderer.postproduction.customEffects.minGloss;
    const whiteColor = new THREE.Color("white");
    const defaultBackground = world.scene.three.background;

    for (const plan of plans.list) {
      const planButton = BUI.Component.create(() => {
        return BUI.html`
          <bim-button label="${plan.name}"
            @click="${() => {
              world.renderer.postproduction.customEffects.minGloss = 0.1;
              highlighter.backupColor = whiteColor;
              classifier.setColor(modelItems, whiteColor);
              world.scene.three.background = whiteColor;
              plans.goTo(plan.id);
              culler.needsUpdate = true;
            }}">
          </bim-button>
        `;
      });
      panelSection.append(planButton);
    }

    const exitButton = BUI.Component.create(() => {
      return BUI.html`
        <bim-button label="Exit Floor Plan"
          @click="${() => {
            highlighter.backupColor = null;
            highlighter.clear();
            world.renderer.postproduction.customEffects.minGloss = minGloss;
            classifier.resetColor(modelItems);
            world.scene.three.background = defaultBackground;
            plans.exitPlanView();
            culler.needsUpdate = true;
            onExit();
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
