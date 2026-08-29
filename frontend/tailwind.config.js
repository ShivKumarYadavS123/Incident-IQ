export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        console: {
          bg: "#0B0E12",
          panel: "#12161C",
          border: "#1F2530",
          text: "#E8EAED",
          muted: "#8B93A1",
          amber: "#FFB020",
          teal: "#5EEAD4"
        }
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
