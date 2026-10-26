// Colour themes: white, black and red only. The tokens live in app/globals.css under :root[data-theme="<id>"];
// bed / pane / plate here only draw the swatch in the picker.
export const THEMES = [
  { id: "paper", name: "White", note: "Default", bed: "#ededed", pane: "#ffffff", plate: "#111111" },
  { id: "carbon", name: "Black", note: "Dark", bed: "#0b0b0b", pane: "#191919", plate: "#f5f5f5" },
  { id: "vermilion", name: "Red", note: "", bed: "#c8001a", pane: "#ffffff", plate: "#111111" },
];

export const THEME_KEY = "crm-theme";

// Runs before first paint so the page never flashes the wrong colours.
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");var ok=${JSON.stringify(["paper", "carbon", "vermilion"])};if(!t||ok.indexOf(t)<0){t=matchMedia("(prefers-color-scheme: dark)").matches?"carbon":"paper"}document.documentElement.dataset.theme=t}catch(e){}`;
