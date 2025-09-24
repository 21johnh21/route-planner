// src/map/undo.js
export function setupUndo(map, Draw, undoBtn) {
  const history = [];
  const redoStack = [];
  let isUndoing = false;
  let isRedoing = false;

  function snapshot() {
    if (Draw.getMode && Draw.getMode() === "free") return;
    if (isUndoing || isRedoing) return; // prevent recursive snapshots during undo/redo
    const allFeatures = Draw.getAll();
    history.push(JSON.parse(JSON.stringify(allFeatures)));
    // Clear redo stack on new action
    redoStack.length = 0;
    // Limit history size if desired
    if (history.length > 50) history.shift();
  }

  // Initialize history with the initial state of Draw
  history.push(JSON.parse(JSON.stringify(Draw.getAll())));

  // Hook into map events
  map.on("draw.create", snapshot);
  map.on("draw.update", snapshot);
  map.on("draw.delete", snapshot);

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (history.length < 2) return; // Need at least two states to undo
      isUndoing = true;
      const currentState = history.pop();
      redoStack.push(currentState);
      const lastState = history[history.length - 1];
      Draw.deleteAll();
      if (lastState && lastState.features) {
        lastState.features.forEach(f => Draw.add(f));
      }
      isUndoing = false;
    });
  } else {
    console.log("No undo button provided");
  }
}