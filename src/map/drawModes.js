export function setupModes({ map, Draw, panBtn, drawBtn, freeDrawBtn, segmentModeBtn }) {
  let mode = "pan";

  function setActive(button) {
    [panBtn, drawBtn, freeDrawBtn, segmentModeBtn].forEach(b => b.classList.remove("active"));
    button.classList.add("active");
  }

  panBtn.onclick = () => {
    mode = "pan";
    map.dragPan.enable();
    map.getCanvas().style.cursor = "grab";
    Draw.changeMode("simple_select");
    setActive(panBtn);
  };

  drawBtn.onclick = () => {
    mode = "draw";
    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";
    Draw.changeMode("draw_line_string");
    setActive(drawBtn);
  };

  freeDrawBtn.onclick = () => {
    mode = "free";
    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";
    Draw.changeMode("simple_select");
    setActive(freeDrawBtn);
  };

  segmentModeBtn.onclick = () => {
    // Reset free-draw state and clear any temporary free-draw lines
    if (Draw.clearFreeDraw) {
      Draw.clearFreeDraw();
    }
    mode = "segment";
    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";
    Draw.changeMode("segment");
    setActive(segmentModeBtn);
  };

  return { getMode: () => mode, setActive };
}