// Colour themes: red, black and white only. The tokens live in app/globals.css under :root[data-theme="<id>"];
// bed / pane / plate here only draw the swatch in the picker.
export const THEMES = [
  { id: "safelight", name: "Safelight", note: "", bed: "#c8000f", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "paper", name: "White", note: "", bed: "#ececec", pane: "#ffffff", plate: "#0a0a0a" },
  { id: "carbon", name: "Black", note: "", bed: "#0a0a0a", pane: "#161616", plate: "#f5f5f5" },
];

export const THEME_KEY = "crm-theme";

// Runs before first paint so the page never flashes the wrong colours. Safelight unless the person chose another.
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");var ok=${JSON.stringify(THEMES.map((x) => x.id))};if(!t||ok.indexOf(t)<0){t="safelight"}document.documentElement.dataset.theme=t}catch(e){}`;
