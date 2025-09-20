export function setupModes({ map, Draw, panBtn, drawBtn, freeDrawBtn }) {
  let mode = "pan";

  function setActive(button) {
    [panBtn, drawBtn, freeDrawBtn].forEach(b => b.classList.remove("active"));
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

  return { getMode: () => mode, setActive };
}