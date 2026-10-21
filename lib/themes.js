// Colour themes. The tokens live in app/globals.css under :root[data-theme="<id>"];
// bed / pane / plate here only draw the swatch in the picker.
export const THEMES = [
  { id: "goldenrod", name: "Goldenrod", note: "Default", bed: "#e0a526", pane: "#f6f0dc", plate: "#1b1b1b" },
  { id: "paper", name: "Paper", note: "Light", bed: "#e4e7ee", pane: "#ffffff", plate: "#14171f" },
  { id: "carbon", name: "Carbon", note: "Dark", bed: "#121212", pane: "#1f1f1f", plate: "#f6f0dc" },
  { id: "slate", name: "Slate", note: "Cool dark", bed: "#34414d", pane: "#e4e9ee", plate: "#17202a" },
  { id: "green", name: "Bottle green", note: "", bed: "#1f6b46", pane: "#f6f0dc", plate: "#14231b" },
  { id: "vermilion", name: "Vermilion", note: "", bed: "#c9321a", pane: "#f8f1e0", plate: "#1d1613" },
  { id: "indigo", name: "Indigo", note: "", bed: "#1d2b63", pane: "#f4f1e6", plate: "#0c1230" },
];

export const THEME_KEY = "crm-theme";

// Runs before first paint so the page never flashes the wrong colours.
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");var ok=${JSON.stringify(THEMES.map((x) => x.id))};if(!t||ok.indexOf(t)<0){t=matchMedia("(prefers-color-scheme: dark)").matches?"carbon":"goldenrod"}document.documentElement.dataset.theme=t}catch(e){}`;
