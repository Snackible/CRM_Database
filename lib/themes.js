// Colour themes: the room colour around the white sheets. Red always marks state. The tokens live in app/globals.css under :root[data-theme="<id>"];
// bed / pane / plate here only draw the swatch in the picker.
export const THEMES = [
  { id: "safelight", name: "Safelight", note: "", bed: "#c8000f", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "amber", name: "Amber", note: "", bed: "#e0a526", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "green", name: "Green", note: "", bed: "#1f6b46", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "indigo", name: "Indigo", note: "", bed: "#1d2b63", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "slate", name: "Slate", note: "", bed: "#34414d", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "paper", name: "White", note: "", bed: "#ececec", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "carbon", name: "Black", note: "", bed: "#0a0a0a", pane: "#161616", plate: "#f5f5f5" },
];

export const THEME_KEY = "crm-theme";

// Runs before first paint so the page never flashes the wrong colours. Safelight unless the person chose another.
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");var ok=${JSON.stringify(THEMES.map((x) => x.id))};if(!t||ok.indexOf(t)<0){t="safelight"}document.documentElement.dataset.theme=t}catch(e){}`;
